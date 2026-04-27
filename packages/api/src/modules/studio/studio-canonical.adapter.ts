/**
 * studio-canonical.adapter.ts
 * Adapter: estado legacy de paperclip → CanonicalStudioState
 *
 * Decisión: Compat + Adapter (sin hard switch, sin migración YAML-first)
 * Los endpoints existentes (/studio/state, /agents, etc.) NO se modifican.
 * Este adapter expone un estado canónico paralelo vía GET /studio/canonical-state.
 *
 * Riesgo mitigado: drift workspace legacy ↔ canónico durante transición.
 * Solución: adapter como única fuente de transformación, versionado explícito.
 */

import type {
  CanonicalStudioState,
  AgencySpec,
  WorkspaceSpecCanonical,
  AgentSpec,
  SkillSpec,
  TopologyLink,
  AgentRole,
  SkillType,
} from '@repo/shared';

// ─── Tipos de entrada del modelo legacy de paperclip ─────────────────────────

interface LegacyAgent {
  id: string;
  name: string;
  role: string;
  reportsTo: string | null;
  capabilities: string | null;
  adapterType: string;
  adapterConfig: Record<string, unknown>;
  runtimeConfig: Record<string, unknown>;
  permissions: Record<string, unknown>;
  status: string;
  metadata?: Record<string, unknown>;
}

interface LegacySkill {
  id: string;
  name: string;
  description?: string;
  type?: string;
  config?: Record<string, unknown>;
}

interface LegacyWorkspace {
  id: string;
  name: string;
  agents?: LegacyAgent[];
  skills?: LegacySkill[];
}

interface LegacyStudioState {
  agents: LegacyAgent[];
  workspaces?: LegacyWorkspace[];
  skills?: LegacySkill[];
  metadata?: Record<string, unknown>;
}

// ─── Funciones de mapeo ───────────────────────────────────────────────────────

function mapAgentRole(legacyRole: string): AgentRole {
  if (legacyRole === 'orchestrator' || legacyRole === 'manager') return 'orchestrator';
  if (legacyRole === 'subagent' || legacyRole === 'sub') return 'subagent';
  return 'specialist';
}

function mapSkillType(legacyType?: string): SkillType {
  if (!legacyType) return 'builtin';
  if (['mcp', 'n8n_webhook', 'openapi', 'builtin', 'function'].includes(legacyType)) {
    return legacyType as SkillType;
  }
  return 'builtin';
}

function mapLegacySkill(skill: LegacySkill): SkillSpec {
  return {
    id: skill.id,
    name: skill.name,
    description: skill.description ?? '',
    type: mapSkillType(skill.type),
    config: skill.config,
  };
}

function mapLegacyAgent(agent: LegacyAgent, availableSkillIds: string[]): AgentSpec {
  const role = mapAgentRole(agent.role);
  return {
    id: agent.id,
    name: agent.name,
    role,
    // En legacy, orchestrators con reportsTo=null pueden delegar
    allowDelegation: role === 'orchestrator',
    skillIds: availableSkillIds,
    profileJson: {
      adapterType: agent.adapterType,
      adapterConfig: agent.adapterConfig,
      runtimeConfig: agent.runtimeConfig,
      capabilities: agent.capabilities,
      legacyRole: agent.role,
    },
    reportsToId: agent.reportsTo ?? undefined,
  };
}

function mapLegacyWorkspace(
  workspace: LegacyWorkspace,
  allAgents: LegacyAgent[],
): WorkspaceSpecCanonical {
  const wsAgents = workspace.agents ?? allAgents;
  const wsSkills = (workspace.skills ?? []).map(mapLegacySkill);
  const skillIds = wsSkills.map((s) => s.id);

  return {
    id: workspace.id,
    name: workspace.name,
    departmentId: undefined, // standalone — sin department canónico aún
    agents: wsAgents.map((a) => mapLegacyAgent(a, skillIds)),
    flows: [], // Los flows existentes se cargarán en un lote posterior
    localSkillCatalog: wsSkills,
    profileJson: {
      legacyWorkspace: true,
      adapterVersion: '1.0',
    },
  };
}

// ─── Función principal del adapter ───────────────────────────────────────────

/**
 * legacyStateToCanonical
 * Transforma el estado actual de paperclip en un CanonicalStudioState.
 * NO muta nada — solo lectura + transformación.
 *
 * @param legacy - Estado legacy obtenido de la DB de paperclip
 * @returns CanonicalStudioState compatible con los tipos canónicos
 */
export function legacyStateToCanonical(
  legacy: LegacyStudioState,
): CanonicalStudioState {
  const globalSkills = (legacy.skills ?? []).map(mapLegacySkill);

  // Si no hay workspaces definidos, crear uno sintético con todos los agentes
  const workspaces: WorkspaceSpecCanonical[] =
    legacy.workspaces && legacy.workspaces.length > 0
      ? legacy.workspaces.map((ws) => mapLegacyWorkspace(ws, legacy.agents))
      : [
          {
            id: 'legacy-default-workspace',
            name: 'Default Workspace (legacy)',
            departmentId: undefined,
            agents: legacy.agents.map((a) =>
              mapLegacyAgent(a, globalSkills.map((s) => s.id)),
            ),
            flows: [],
            localSkillCatalog: globalSkills,
            profileJson: { legacyWorkspace: true, adapterVersion: '1.0', synthetic: true },
          },
        ];

  return {
    agencies: [], // Agencies canónicas se agregan cuando se usen las nuevas tablas
    standaloneWorkspaces: workspaces,
    topologyLinks: [], // Se poblarán desde topology_links cuando existan
    generatedAt: new Date().toISOString(),
    adapterVersion: '1.0',
  };
}

/**
 * isLegacyState
 * Tipo guard para detectar si el estado tiene workspaces canónicos o es solo legacy.
 */
export function isLegacyState(state: LegacyStudioState): boolean {
  return !state.workspaces || state.workspaces.length === 0;
}
