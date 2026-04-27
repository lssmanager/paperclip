/**
 * agencies.ts — Drizzle schema
 * Tabla raíz de la jerarquía canónica Agency→Department→Workspace→Agent
 * Referencia: companies.ts existente como patrón de estructura
 */
import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';
import { companies } from './companies.js';

export const agencies = pgTable(
  'agencies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // FK opcional a companies para compat multi-tenant con paperclip
    companyId: uuid('company_id').references(() => companies.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    // orchestratorAgentId: se popula después de crear el primer agente orquestador
    orchestratorAgentId: uuid('orchestrator_agent_id'),
    // profileJson: calculado por ProfilePropagatorService (bottom-up desde departments)
    profileJson: jsonb('profile_json').$type<Record<string, unknown>>(),
    status: text('status').notNull().default('active'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIdx: index('agencies_company_idx').on(table.companyId),
    slugIdx: index('agencies_slug_idx').on(table.slug),
  }),
);
