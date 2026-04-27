/**
 * workspace_canonical_config.ts — Drizzle schema
 * Extiende execution_workspaces/project_workspaces existentes con FK opcional
 * al modelo canónico Department.
 *
 * Estrategia Compat + Adapter:
 * NO se modifica execution_workspaces directamente para no romper contratos.
 * Esta tabla es una extensión lateral que agrega el binding canónico.
 */
import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';
import { departments } from './departments.js';

export const workspaceCanonicalConfig = pgTable(
  'workspace_canonical_config',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // workspaceId referencia al workspace existente de paperclip
    // (execution_workspaces.id o project_workspaces.id según el contexto)
    workspaceId: uuid('workspace_id').notNull(),
    workspaceType: text('workspace_type').notNull().default('execution'), // 'execution' | 'project'
    // FK al Department canónico — null = workspace standalone (legacy)
    departmentId: uuid('department_id').references(() => departments.id, { onDelete: 'set null' }),
    // profileJson calculado por ProfilePropagatorService
    profileJson: jsonb('profile_json').$type<Record<string, unknown>>(),
    // Versión del adapter que generó este perfil
    adapterVersion: text('adapter_version').notNull().default('1.0'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    workspaceIdx: index('workspace_canonical_config_workspace_idx').on(table.workspaceId),
    departmentIdx: index('workspace_canonical_config_dept_idx').on(table.departmentId),
  }),
);
