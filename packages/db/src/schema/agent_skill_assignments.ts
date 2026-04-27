/**
 * agent_skill_assignments.ts — Drizzle schema
 * Tabla de relación many-to-many entre agents y company_skills.
 * Materializa qué skills tiene asignadas cada agente.
 *
 * El catálogo global vive en company_skills (ya existente en paperclip).
 * Esta tabla registra la asignación por agente con contexto de scope jerárquico.
 */
import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  jsonb,
  index,
  primaryKey,
} from 'drizzle-orm/pg-core';
import { agents } from './agents.js';

export const agentSkillAssignments = pgTable(
  'agent_skill_assignments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agentId: uuid('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
    // skillId referencia a company_skills.id (catálogo existente de paperclip)
    skillId: uuid('skill_id').notNull(),
    // Nivel en la jerarquía donde se aplica esta asignación
    // 'agency' = skill global propagada top-down
    // 'department' = skill del departamento
    // 'workspace' = skill local del workspace
    // 'agent' = asignación directa al agente
    assignedAtScope: text('assigned_at_scope').notNull().default('agent'),
    // Si es false, el agente tiene la skill pero no puede delegarla a subagentes
    isDelegatable: boolean('is_delegatable').notNull().default(false),
    // Config de override por agente (ej: modelo específico para esta skill)
    overrideConfig: jsonb('override_config').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    agentIdx: index('agent_skill_assignments_agent_idx').on(table.agentId),
    skillIdx: index('agent_skill_assignments_skill_idx').on(table.skillId),
    agentSkillUniq: index('agent_skill_assignments_uniq').on(table.agentId, table.skillId),
  }),
);
