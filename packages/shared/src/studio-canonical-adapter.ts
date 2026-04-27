/**
 * studio-canonical-adapter.ts
 * Adaptador: ExecutionWorkspace legacy → WorkspaceSpecCanonical
 *
 * Estrategia Compat+Adapter: los workspaces existentes de paperclip siguen
 * funcionando. Este adapter los proyecta al modelo canónico sin migración
 * destructiva.
 *
 * Riesgo gestionado: evitar drift entre modelo legacy y canónico durante
 * la transición — el adapter es la fuente única de conversión.
 */

import type {
  WorkspaceSpecCanonical,
  AgentSpec,
  AgentRole,
  SkillSpec,
  SkillType,
  DepartmentSpec,
  AgencySpec,
} from "./studio-canonical.js";

// ─── Tipos de entrada (legacy paperclip) ────────────────────────────────────

/** Forma mínima del workspace legacy de execution_workspaces */
export interface LegacyWorkspace {
  id: string;
  name: string;
  agentId?: string | null;
  metadata?: Record<string, unknown> | null;
}

/** Forma mínima del agente legacy */
export interface LegacyAgent {
  id: string;
  name: string;
  role?: string | null;
  capabilities?: string | null;
  adapterConfig?: Record<string, unknown> | null;
  runtimeConfig?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}

/** Forma mínima de company_skills del catálogo legacy */
export interface LegacySkill {
  id: string;
  name: string;
  description?: string | null;
  type?: string | null;
  config?: Record<string, unknown> | null;
}

// ─── Funciones de adaptación ─────────────────────────────────────────────────

/**
 * Mapea un rol legacy (texto libre) al rol canónico.
 * Valores conocidos de paperclip: 'general', 'manager', 'worker', etc.
 */
function mapLegacyRole(legacyRole?: string | null): AgentRole {
  if (!legacyRole) return "specialist";
  const r = legacyRole.toLowerCase();
  if (r === "manager" || r === "orchestrator" || r === "supervisor")
    return "orchestrator";
  if (r === "subagent" || r === "sub_agent" || r === "worker")
    return "subagent";
  return "specialist";
}

/**
 * Mapea un tipo de skill legacy al tipo canónico.
 */
function mapLegacySkillType(legacyType?: string | null): SkillType {
  if (!legacyType) return "builtin";
  const t = legacyType.toLowerCase();
  if (t === "mcp") return "mcp";
  if (t === "n8n" || t === "n8n_webhook") return "n8n_webhook";
  if (t === "openapi" || t === "api") return "openapi";
  if (t === "function" || t === "fn") return "function";
  return "builtin";
}

/**
 * Adapta un agente legacy al AgentSpec canónico.
 */
export function adaptLegacyAgent(agent: LegacyAgent): AgentSpec {
  const role = mapLegacyRole(agent.role);
  return {
    id: agent.id,
    name: agent.name,
    role,
    /** Los agentes manager/orchestrator tienen delegación por defecto */
    allowDelegation: role === "orchestrator",
    skillIds: [],
    profileJson: agent.metadata ?? undefined,
    metadata: {
      _legacyAdapterType: (agent.adapterConfig as any)?.type,
      _legacyRole: agent.role,
    },
  };
}

/**
 * Adapta un workspace legacy al WorkspaceSpecCanonical.
 */
export function adaptLegacyWorkspace(
  workspace: LegacyWorkspace,
  agents: LegacyAgent[] = []
): WorkspaceSpecCanonical {
  return {
    id: workspace.id,
    name: workspace.name,
    agents: agents.map(adaptLegacyAgent),
    localSkillCatalog: [],
    flows: [],
    profileJson: workspace.metadata ?? undefined,
  };
}

/**
 * Adapta una skill legacy al SkillSpec canónico.
 */
export function adaptLegacySkill(skill: LegacySkill): SkillSpec {
  return {
    id: skill.id,
    name: skill.name,
    description: skill.description ?? `Skill: ${skill.name}`,
    type: mapLegacySkillType(skill.type),
    config: skill.config ?? undefined,
  };
}

/**
 * Construye un AgencySpec "default" a partir de workspaces legacy.
 * Útil para el endpoint GET /api/v1/studio/canonical-state cuando no
 * existen agencies creadas explícitamente todavía.
 *
 * @param companyId - ID de la empresa
 * @param workspaces - Workspaces legacy de execution_workspaces
 * @param agents - Agentes de agents table
 * @param skills - Skills de company_skills
 */
export function buildDefaultAgencyFromLegacy(
  companyId: string,
  workspaces: LegacyWorkspace[],
  agents: LegacyAgent[],
  skills: LegacySkill[]
): AgencySpec {
  const agentsByWorkspace = new Map<string, LegacyAgent[]>();
  for (const agent of agents) {
    // En legacy, agents se asocian a workspaces via adapterConfig o metadata
    const wsId = (agent.adapterConfig as any)?.workspaceId
      || (agent.metadata as any)?.workspaceId;
    if (wsId) {
      if (!agentsByWorkspace.has(wsId)) agentsByWorkspace.set(wsId, []);
      agentsByWorkspace.get(wsId)!.push(agent);
    }
  }

  const canonicalWorkspaces = workspaces.map((ws) =>
    adaptLegacyWorkspace(ws, agentsByWorkspace.get(ws.id) ?? [])
  );

  const defaultDepartment: DepartmentSpec = {
    id: `${companyId}-default-dept`,
    name: "Default",
    slug: "default",
    workspaces: canonicalWorkspaces,
    profileJson: { _legacyAdapted: true },
  };

  return {
    id: `${companyId}-default-agency`,
    name: "Agency",
    slug: "agency",
    departments: [defaultDepartment],
    globalSkillCatalog: skills.map(adaptLegacySkill),
    profileJson: { _legacyAdapted: true },
  };
}
