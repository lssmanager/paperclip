/**
 * departments.ts — Drizzle schema
 * Nivel 2 de jerarquía: Agency → Department → Workspace
 * Un Department tiene un orchestratorAgent que delega a sus Workspaces.
 */
import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';
import { agencies } from './agencies.js';

export const departments = pgTable(
  'departments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agencyId: uuid('agency_id').notNull().references(() => agencies.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    // orchestratorAgentId: agente que recibe tareas del Agency y delega a workspaces
    // Nullable porque se asigna después de crear el agente
    orchestratorAgentId: uuid('orchestrator_agent_id'),
    // profileJson: sintetizado por ProfilePropagator desde los workspaces del dept.
    // Incluye capabilities delegables = union de skills de todos sus agents
    profileJson: jsonb('profile_json').$type<Record<string, unknown>>(),
    status: text('status').notNull().default('active'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    agencyIdx: index('departments_agency_idx').on(table.agencyId),
    agencyStatusIdx: index('departments_agency_status_idx').on(table.agencyId, table.status),
  }),
);
