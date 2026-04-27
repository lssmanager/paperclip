import {
  pgTable,
  uuid,
  text,
  boolean,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { agents } from "./agents.js";

/**
 * Versiones de core-files por agente — base del façade corefiles.
 * Unifica lo que en agent-visualstudio estaba fragmentado entre
 * módulos `deploy` y `versions`.
 *
 * CoreFilesService expone: preview / diff / apply / rollback
 * Basado en: LangGraph time-travel debugging — cada versión es un checkpoint
 * al que se puede navegar y restaurar.
 */
export const studioCoreFileVersions = pgTable(
  "studio_core_file_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    /** Ruta relativa del archivo dentro del agente */
    filePath: text("file_path").notNull(),
    /** Contenido completo en esta versión */
    content: text("content").notNull(),
    /** Hash SHA-256 del contenido para detección de diff */
    contentHash: text("content_hash").notNull(),
    /** true si esta es la versión actualmente aplicada */
    isActive: boolean("is_active").notNull().default(false),
    /** Descripción del cambio (ej: "Agregado skill Spotify Ads") */
    changeDescription: text("change_description"),
    /** Items de diff respecto a la versión anterior */
    diffItems: jsonb("diff_items")
      .$type<CoreFileDiffItem[]>()
      .default([]),
    /** Quién originó el cambio: 'user'|'agent'|'builder' */
    originatorType: text("originator_type").notNull().default("user"),
    originatorId: text("originator_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    agentFileIdx: index("studio_core_file_versions_agent_file_idx").on(
      table.agentId,
      table.filePath
    ),
    agentActiveIdx: index("studio_core_file_versions_agent_active_idx").on(
      table.agentId,
      table.isActive
    ),
    companyIdx: index("studio_core_file_versions_company_idx").on(
      table.companyId
    ),
  })
);

export type CoreFileDiffItem = {
  path: string;
  before: string | null;
  after: string;
  status: "added" | "modified" | "deleted";
};
