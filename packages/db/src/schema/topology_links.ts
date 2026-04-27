/**
 * topology_links.ts — Drizzle schema
 * Registro de links de topología entre nodos de la jerarquía.
 * Permite controles runtime (connect/disconnect/pause/reactivate/redirect/continue)
 * con estado explícito fail-closed: si el gateway no confirma, estado='disconnected'.
 *
 * NO se usa para guardar configuración estática — eso va en departments/agents.
 * SÍ se usa para el estado runtime del canvas macro Agency Topology UI.
 */
import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';

export const topologyLinks = pgTable(
  'topology_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Nodo origen
    fromId: uuid('from_id').notNull(),
    fromType: text('from_type').notNull(), // 'agency' | 'department' | 'workspace' | 'agent'
    // Nodo destino
    toId: uuid('to_id').notNull(),
    toType: text('to_type').notNull(),
    // Tipo de relación
    linkType: text('link_type').notNull().default('delegation'), // 'delegation' | 'handoff' | 'redirect'
    // Estado de control runtime (fail-closed)
    // 'active' | 'paused' | 'disconnected' | 'unsupported_by_runtime'
    controlStatus: text('control_status').notNull().default('active'),
    // Última acción aplicada y su resultado
    lastAction: text('last_action'),         // 'connect' | 'disconnect' | 'pause' | etc.
    lastActionResult: text('last_action_result'), // 'success' | 'failed' | 'unsupported'
    lastActionReason: text('last_action_reason'),
    lastActionAt: timestamp('last_action_at', { withTimezone: true }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    fromIdx: index('topology_links_from_idx').on(table.fromId, table.fromType),
    toIdx: index('topology_links_to_idx').on(table.toId, table.toType),
    statusIdx: index('topology_links_status_idx').on(table.controlStatus),
  }),
);
