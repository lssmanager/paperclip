import type {
  AgencySpec,
  CanonicalState,
  WorkspaceSpecCanonical,
  AgentSpec,
  FlowSpec,
  SkillSpec,
  TopologyLink,
  DepartmentSpec,
} from '../../../packages/shared/src/studio-canonical';

/**
 * StudioCanonicalAdapter
 * Transforma el estado legacy de paperclip al modelo canónico Studio.
 *
 * Estrategia Compat+Adapter:
 *   — No modifica los modelos Prisma existentes.
 *   — Workspaces sin departmentId → standaloneWorkspaces (legacy compat).
 *   — Workspaces con departmentId → agrupados bajo Department/Agency.
 *
 * Los campos opcionales del modelo legacy se mapean con defaults seguros
 * para que el frontend always reciba una estructura válida.
 */
export class StudioCanonicalAdapter {
  // ——— Público ———————————————————————————————————————————

  adaptWorkspace(raw: Record<string, any>): WorkspaceSpecCanonical {
    return {
      id: raw.id,
      name: raw.name ?? 'Unnamed Workspace',
      agents: Array.isArray(raw.agents)
        ? raw.agents.map((a: any) => this.adaptAgent(a))
        : [],
      flows: Array.isArray(raw.flows)
        ? raw.flows.map((f: any) => this.adaptFlow(f))
        : [],
      localSkills: Array.isArray(raw.skills)
        ? raw.skills.map((s: any) => this.adaptSkill(s))
        : [],
      orchestratorAgentId: raw.orchestratorAgentId ?? undefined,
      departmentId: raw.departmentId ?? null,
      version: raw.canonicalVersion ?? 1,
      updatedAt:
        raw.updatedAt instanceof Date
          ? raw.updatedAt.toISOString()
          : raw.updatedAt ?? new Date().toISOString(),
    };
  }

  adaptAgent(raw: Record<string, any>): AgentSpec {
    return {
      id: raw.id,
      name: raw.name ?? 'Unnamed Agent',
      role: raw.role ?? 'specialist',
      allowDelegation: raw.allowDelegation ?? false,
      skills: Array.isArray(raw.skills) ? raw.skills : [],
      systemPrompt: raw.systemPrompt ?? undefined,
      profileJson: raw.profileJson ?? undefined,
    };
  }

  adaptFlow(raw: Record<string, any>): FlowSpec {
    return {
      id: raw.id,
      name: raw.name ?? 'Unnamed Flow',
      nodes: raw.spec?.nodes ?? [],
      edges: raw.spec?.edges ?? [],
      version: raw.version ?? 1,
    };
  }

  adaptSkill(raw: Record<string, any>): SkillSpec {
    return {
      id: raw.id,
      name: raw.name,
      description: raw.description ?? '',
      type: raw.type ?? 'builtin',
      inputSchema: raw.inputSchema ?? undefined,
      outputSchema: raw.outputSchema ?? undefined,
      config: raw.config ?? undefined,
      endpointUrl: raw.endpointUrl ?? undefined,
      mcpServer: raw.mcpServer ?? undefined,
    };
  }

  /**
   * Construye CanonicalState completo desde datos raw del DB.
   * Este es el objeto que retorna GET /api/v1/studio/canonical-state.
   */
  buildCanonicalState(params: {
    agencies: any[];
    standaloneWorkspaces: any[];
    topologyLinks: any[];
    globalSkills: any[];
  }): CanonicalState {
    return {
      agencies: params.agencies.map((a) => this.adaptAgency(a)),
      standaloneWorkspaces: params.standaloneWorkspaces.map((w) =>
        this.adaptWorkspace(w)
      ),
      topologyLinks: params.topologyLinks.map((l) =>
        this.adaptTopologyLink(l)
      ),
      globalSkillCatalog: params.globalSkills.map((s) => this.adaptSkill(s)),
      schemaVersion: '1.0',
      generatedAt: new Date().toISOString(),
    };
  }

  // ——— Privado —————————————————————————————————————————

  private adaptAgency(raw: Record<string, any>): AgencySpec {
    return {
      id: raw.id,
      name: raw.name,
      slug: raw.slug,
      orchestratorAgentId: raw.orchestratorAgentId ?? '',
      departments: Array.isArray(raw.departments)
        ? raw.departments.map((d: any) => this.adaptDepartment(d))
        : [],
      globalSkillCatalog: Array.isArray(raw.skills)
        ? raw.skills.map((s: any) => this.adaptSkill(s))
        : [],
      version: 1,
      updatedAt:
        raw.updatedAt instanceof Date
          ? raw.updatedAt.toISOString()
          : raw.updatedAt ?? new Date().toISOString(),
    };
  }

  private adaptDepartment(raw: Record<string, any>): DepartmentSpec {
    return {
      id: raw.id,
      name: raw.name,
      orchestratorAgentId: raw.orchestratorAgentId ?? '',
      workspaces: Array.isArray(raw.workspaces)
        ? raw.workspaces.map((w: any) => this.adaptWorkspace(w))
        : [],
      profileJson: raw.profileJson ?? undefined,
    };
  }

  private adaptTopologyLink(raw: Record<string, any>): TopologyLink {
    return {
      id: raw.id,
      from: raw.fromId,
      fromType: raw.fromType,
      to: raw.toId,
      toType: raw.toType,
      type: raw.type ?? 'delegation',
      state: raw.state ?? 'active',
      metadata: raw.metadata ?? undefined,
    };
  }
}
