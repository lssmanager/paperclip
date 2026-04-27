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
 * Agency — nivel más alto de la jerarquía de orquestación.
 * Agency → Department → Workspace → Agent → Subagent
 *
 * Basado en: CrewAI Process.hierarchical + Microsoft Agent Framework standards.
 */
export const studioAgencies = pgTable(
  "studio_agencies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    orchestratorAgentId: uuid("orchestrator_agent_id").references(
      () => agents.id,
      { onDelete: "set null" }
    ),
    /** Perfil canónico generado por ProfilePropagatorService (propaga bottom-up) */
    profileJson: jsonb("profile_json")
      .$type<Record<string, unknown>>()
      .default({}),
    /** Catálogo global de skills accesible por todos los niveles */
    globalSkillCatalog: jsonb("global_skill_catalog")
      .$type<GlobalSkillCatalogEntry[]>()
      .default([]),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    companyIdx: index("studio_agencies_company_idx").on(table.companyId),
    companySlugIdx: index("studio_agencies_company_slug_idx").on(
      table.companyId,
      table.slug
    ),
  })
);

/** Entrada del catálogo global de skills */
export type GlobalSkillCatalogEntry = {
  id: string;
  name: string;
  description: string;
  type: "mcp" | "n8n_webhook" | "openapi" | "builtin" | "function";
  inputSchema?: Record<string, unknown>;
  config?: Record<string, unknown>;
};
