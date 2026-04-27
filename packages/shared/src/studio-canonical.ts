/**
 * Studio Canonical Types — Agency→Department→Workspace→Agent→Subagent
 * Estrategia: Compat+Adapter. No rompe contratos existentes de paperclip.
 *
 * Referencias:
 *   CrewAI         — allow_delegation, Process.hierarchical
 *   LangGraph      — Checkpointer, thread state, activeContext vs. historial durable
 *   AutoGen        — OrchestratorAgent, Mixture of Agents
 *   Microsoft AF   — MCP + OpenAPI-first interoperability
 *   Flowise        — AgentFlow V2, nodo como unidad independiente
 *   Semantic Kernel— SequentialPlanner, Skill como Plugin registrable
 */

// ─── Enumeraciones ────────────────────────────────────────────────────────────

export type AgentRole = 'orchestrator' | 'specialist' | 'subagent';

/** Tipos de skill — mapean a Microsoft AF interoperability taxonomy */
export type SkillType =
  | 'mcp'          // Model Context Protocol — estándar abierto
  | 'n8n_webhook'  // workflow n8n como skill
  | 'openapi'      // API externa con spec OpenAPI (OpenAPI-first)
  | 'builtin'      // skill incorporado del runtime
  | 'function';    // función TypeScript registrada

/** Acciones de control de topología runtime */
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

/**
 * SkillSpec — equivalente al Plugin de Semantic Kernel.
 * Tiene descripción semántica para que el TaskPlanner la use en selección.
 */
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

// ─── Model Policy ─────────────────────────────────────────────────────────────

/**
 * Referencia a política de modelo por agente.
 * Resolución en cascada: agent → workspace → department → agency → global
 * (inspirado en Kernel configuration de Semantic Kernel)
 */
export interface ModelPolicyRef {
  policyId: string;
  /** Sobreescribe el modelo base solo para este agente */
  modelOverride?: string;
  maxTokens?: number;
  temperature?: number;
}

// ─── Agent ────────────────────────────────────────────────────────────────────

export interface AgentSpec {
  id: string;
  name: string;
  /**
   * Rol del agente — mapea a semántica CrewAI + AutoGen:
   *   orchestrator → manager con allow_delegation=true
   *   specialist   → worker con capacidades específicas
   *   subagent     → executor de tareas atómicas
   */
  role: AgentRole;
  /** CrewAI: allow_delegation — si true, puede delegar subtareas a children */
  allowDelegation: boolean;
  /** IDs de SkillSpec del catálogo global o local del workspace */
  skills: string[];
  systemPrompt?: string;
  /** Perfil generado por ProfilePropagatorService — NO editar manualmente */
  profileJson?: Record<string, unknown>;
  modelPolicy?: ModelPolicyRef;
  budgetPolicyId?: string;
  /** IDs de AgentSpec que puede orquestar (solo role='orchestrator') */
  delegates?: string[];
}

// ─── Flow (canvas nodos+edges — inspirado en Flowise AgentFlow V2) ─────────────

/**
 * Tipos de nodo del canvas — taxonomía inspirada en n8n:
 *   channel_trigger → Trigger (inician ejecución)
 *   agent/tool      → Action (hacen trabajo)
 *   condition/approval → Logic (controlan flujo)
 */
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
  /**
   * ID del Department padre.
   * null = workspace standalone legacy (compat).
   */
  departmentId?: string | null;
  version: number;
  updatedAt: string;
}

// ─── Department ───────────────────────────────────────────────────────────────

export interface DepartmentSpec {
  id: string;
  name: string;
  /**
   * Agente LLM que orquesta las delegaciones a workspaces hijos.
   * Cuando se agrega/elimina un agente en un workspace hijo,
   * ProfilePropagatorService actualiza su systemPrompt automáticamente.
   */
  orchestratorAgentId: string;
  workspaces: WorkspaceSpecCanonical[];
  /** Perfil propagado automáticamente — refleja capacidades de workspaces hijos */
  profileJson?: Record<string, unknown>;
}

// ─── Agency ───────────────────────────────────────────────────────────────────

export interface AgencySpec {
  id: string;
  name: string;
  slug: string;
  /** Agente LLM tope de jerarquía — orquesta departments (CrewAI: Process.hierarchical) */
  orchestratorAgentId: string;
  departments: DepartmentSpec[];
  /**
   * Catálogo global de skills.
   * Referenciable por cualquier agente en cualquier nivel de la jerarquía.
   * Introducido desde Fase 0 para evitar divergencia skills/tools futura.
   */
  globalSkillCatalog: SkillSpec[];
  version: number;
  updatedAt: string;
}

// ─── Topology ─────────────────────────────────────────────────────────────────

export interface TopologyLink {
  id: string;
  from: string;        // ID del nodo fuente
  fromType: ScopeType;
  to: string;
  toType: ScopeType;
  type: TopologyLinkType;
  state: TopologyLinkState;
  metadata?: Record<string, unknown>;
}

/**
 * Resultado de una acción de topología.
 * FAIL-CLOSED: success=false nunca muta estado.
 * errorCode='unsupported_by_runtime' cuando el gateway no implementa la acción.
 * La UI NUNCA debe simular éxito sin success=true aquí.
 */
export interface TopologyControlResult {
  success: boolean;
  action: TopologyAction;
  targetId: string;
  reason?: string;
  errorCode?:
    | 'unsupported_by_runtime'
    | 'target_not_found'
    | 'gateway_error'
    | 'validation_error';
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

// ─── Canonical State ──────────────────────────────────────────────────────────

/**
 * Respuesta del endpoint GET /api/v1/studio/canonical-state.
 * Convive con el endpoint legacy GET /api/v1/studio/state sin romperlo.
 *
 * standaloneWorkspaces: workspaces sin departmentId (legacy compat).
 */
export interface CanonicalState {
  agencies: AgencySpec[];
  standaloneWorkspaces: WorkspaceSpecCanonical[];
  topologyLinks: TopologyLink[];
  globalSkillCatalog: SkillSpec[];
  schemaVersion: '1.0';
  generatedAt: string;
}
