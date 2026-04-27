import {
  pgTable,
  uuid,
  timestamp,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { studioDepartments } from "./studio_departments.js";

/**
 * Vincula execution_workspaces existentes a un Department canónico.
 * Estrategia compat: no modifica la tabla execution_workspaces original;
 * la FK opcional vive aquí para no romper contratos existentes.
 *
 * Basado en: estrategia Compat+Adapter — los workspaces legacy siguen
 * funcionando mientras se introduce la jerarquía canónica.
 */
export const studioWorkspaceMemberships = pgTable(
  "studio_workspace_memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    departmentId: uuid("department_id")
      .notNull()
      .references(() => studioDepartments.id, { onDelete: "cascade" }),
    /** UUID de execution_workspaces.id — FK suave para no alterar tabla legacy */
    workspaceId: uuid("workspace_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    departmentIdx: index("studio_workspace_memberships_dept_idx").on(
      table.departmentId
    ),
    workspaceIdx: index("studio_workspace_memberships_ws_idx").on(
      table.workspaceId
    ),
    uniqueMembership: unique("studio_workspace_memberships_unique").on(
      table.departmentId,
      table.workspaceId
    ),
  })
);
