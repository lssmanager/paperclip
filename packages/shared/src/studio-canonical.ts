/**
 * Studio Canonical Types — Agency→Department→Workspace→Agent→Subagent
 * Estrategia: Compat+Adapter. No rompe contratos existentes de paperclip.
 * Referencia: CrewAI (allow_delegation), LangGraph (thread/checkpoint),
 *             AutoGen (OrchestratorAgent), Microsoft Agent Framework (MCP+OpenAPI)
 */

export type AgentRole = 'orchestrator' | 'specialist' | 'subagent';

export type SkillType =
  | 'mcp'          // Model Context Protocol — estándar abierto
  | 'n8n_webhook'  // workflow n8n como skill
  | 'openapi'      // API externa con spec OpenAPI
  | 'builtin'      // skill incorporado del runtime
  | 'function';    // función TypeScript registrada

export type TopologyAction =
  | 'connect'
  | 'disconnect'
  | 'pause'
  | 'reactivate'
  | 'redirect'
  | 'continue';

export type TopologyLinkType = 'delegation' | 'handoff' | 'redirect';
export type TopologyLinkState = 'active' | 'paused' | 'disconnected';

export type CoreFileDiffStatus = 'added' | 'modified' | 'deleted';

export type ScopeType = 'agency' | 'department' | 'workspace' | 'agent';

// ─── Skill ────────────────────────────────────────────────────────────────────

export interface SkillSpec {
  id: string;
  name: string;
  description: string;
  type: SkillType;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  config?: Record<string, unknown>;
  /** URL del endpoint cuando type = 'n8n_webhook' | 'openapi' */
  endpointUrl?: string;
  /** Nombre del servidor MCP cuando type = 'mcp' */
  mcpServer?: string;
}

// ─── Agent ────────────────────────────────────────────────────────────────────

export interface ModelPolicyRef {
  policyId: string;
  /** Sobreescribe el modelo base solo para este agente */
  modelOverride?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface AgentSpec {
  id: string;
  name: string;
  role: AgentRole;
  /** CrewAI: allow_delegation — si true, puede delegar subtareas a children */
  allowDelegation: boolean;
  /** IDs de SkillSpec del catálogo global o local */
  skills: string[];
  systemPrompt?: string;
  /** Perfil generado por ProfilePropagatorService — no editar manualmente */
  profileJson?: Record<string, unknown>;
  modelPolicy?: ModelPolicyRef;
  budgetPolicyId?: string;
  /** IDs de AgentSpec que puede orquestar (solo role='orchestrator') */
  delegates?: string[];
}

// ─── Flow (canvas nodos+edges) ────────────────────────────────────────────────

export type FlowNodeType =
  | 'agent'
  | 'tool'
  | 'condition'
  | 'approval'
  | 'n8n_workflow'
  | 'channel_trigger'
  | 'subflow'
  | 'handoff';

export interface FlowNode {
  id: string;
  type: FlowNodeType;
  label: string;
  config: Record<string, unknown>;
  position: { x: number; y: number };
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  condition?: string;
}

export interface FlowSpec {
  id: string;
  name: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  version: number;
}

// ─── Workspace ────────────────────────────────────────────────────────────────

export interface WorkspaceSpecCanonical {
  id: string;
  name: string;
  agents: AgentSpec[];
  flows: FlowSpec[];
  /** Catálogo de skills local al workspace */
  localSkills: SkillSpec[];
  /** ID del agente orquestador del workspace (role='orchestrator') */
  orchestratorAgentId?: string;
  /** ID del Department padre — null si workspace es standalone legacy */
  departmentId?: string | null;
  version: number;
  updatedAt: string;
}

// ─── Department ───────────────────────────────────────────────────────────────

export interface DepartmentSpec {
  id: string;
  name: string;
  /** Agente LLM que orquesta las delegaciones a workspaces hijos */
  orchestratorAgentId: string;
  workspaces: WorkspaceSpecCanonical[];
  /** Perfil propagado automáticamente por ProfilePropagatorService */
  profileJson?: Record<string, unknown>;
}

// ─── Agency ───────────────────────────────────────────────────────────────────

export interface AgencySpec {
  id: string;
  name: string;
  slug: string;
  /** Agente LLM tope de jerarquía — orquesta departments */
  orchestratorAgentId: string;
  departments: DepartmentSpec[];
  /** Catálogo global de skills — referenciable por cualquier agente de la jerarquía */
  globalSkillCatalog: SkillSpec[];
  version: number;
  updatedAt: string;
}

// ─── Topology ─────────────────────────────────────────────────────────────────

export interface TopologyLink {
  id: string;
  from: string;       // ID de nodo fuente (agency/department/workspace/agent)
  fromType: ScopeType;
  to: string;
  toType: ScopeType;
  type: TopologyLinkType;
  state: TopologyLinkState;
  metadata?: Record<string, unknown>;
}

export interface TopologyControlResult {
  success: boolean;
  action: TopologyAction;
  targetId: string;
  /** Si false: razón explícita sin mutación de estado */
  reason?: string;
  /** 'unsupported_by_runtime' cuando el gateway no implementa la acción */
  errorCode?: 'unsupported_by_runtime' | 'target_not_found' | 'gateway_error' | 'validation_error';
  appliedAt?: string;
}

// ─── CoreFiles Diff ───────────────────────────────────────────────────────────

export interface CoreFileDiffItem {
  path: string;
  before: string | null;
  after: string;
  status: CoreFileDiffStatus;
  /** Diff unificado legible para preview en UI */
  unifiedDiff?: string;
}

export interface CoreFilesPreview {
  agentId: string;
  baseVersionId: string;
  proposedVersionId?: string;
  items: CoreFileDiffItem[];
  canApply: boolean;
  warnings: string[];
}

// ─── Canonical State (respuesta de GET /canonical-state) ─────────────────────

export interface CanonicalState {
  agencies: AgencySpec[];
  /** Workspaces sin department (legacy compat) */
  standaloneWorkspaces: WorkspaceSpecCanonical[];
  topologyLinks: TopologyLink[];
  globalSkillCatalog: SkillSpec[];
  schemaVersion: '1.0';
  generatedAt: string;
}
