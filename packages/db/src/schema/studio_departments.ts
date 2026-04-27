import {
  pgTable,
  uuid,
  text,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { studioAgencies } from "./studio_agencies.js";
import { agents } from "./agents.js";

/**
 * Department — segundo nivel de la jerarquía.
 * Un department agrupa workspaces por dominio funcional (ej: Marketing, Engineering).
 *
 * Basado en: AutoGen GroupChatManager pattern — el orchestratorAgent actúa
 * como manager que delega a workspaces subordinados.
 */
export const studioDepartments = pgTable(
  "studio_departments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => studioAgencies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    orchestratorAgentId: uuid("orchestrator_agent_id").references(
      () => agents.id,
      { onDelete: "set null" }
    ),
    /** Perfil propagado desde workspaces hijos */
    profileJson: jsonb("profile_json")
      .$type<Record<string, unknown>>()
      .default({}),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    companyIdx: index("studio_departments_company_idx").on(table.companyId),
    agencyIdx: index("studio_departments_agency_idx").on(table.agencyId),
    agencySlugIdx: index("studio_departments_agency_slug_idx").on(
      table.agencyId,
      table.slug
    ),
  })
);
