import {
  pgTable,
  uuid,
  text,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

/**
 * Representa una conexión activa en el canvas de topología Agency.
 * Cada link tiene estado de runtime controlado por TopologyService (fail-closed).
 *
 * Control de topología inspirado en: Hermes Transport Layer — la capa de
 * transporte es agnóstica al canal y gestiona estado de conexión explícitamente.
 *
 * IMPORTANTE: el estado solo muta si el gateway confirma la acción.
 * Si no confirma → se registra error sin mutar estado (fail-closed).
 */
export const studioTopologyLinks = pgTable(
  "studio_topology_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    /** ID del nodo de origen (agency/department/workspace/agent) */
    fromId: text("from_id").notNull(),
    fromType: text("from_type").notNull(), // 'agency'|'department'|'workspace'|'agent'
    /** ID del nodo de destino */
    toId: text("to_id").notNull(),
    toType: text("to_type").notNull(),
    /** Tipo de relación de topología */
    linkType: text("link_type").notNull().default("delegation"), // 'delegation'|'handoff'|'redirect'
    /** Estado de runtime — solo mutable via TopologyService fail-closed */
    state: text("state").notNull().default("active"), // 'active'|'paused'|'disconnected'
    /** Razón del estado actual (para mostrar en UI sin simulación) */
    stateReason: text("state_reason"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    companyIdx: index("studio_topology_links_company_idx").on(table.companyId),
    fromIdx: index("studio_topology_links_from_idx").on(
      table.companyId,
      table.fromId,
      table.fromType
    ),
    toIdx: index("studio_topology_links_to_idx").on(
      table.companyId,
      table.toId,
      table.toType
    ),
  })
);
