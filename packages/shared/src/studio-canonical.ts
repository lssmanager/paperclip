/**
 * studio-canonical.ts
 * Tipos canónicos del sistema de orquestación Agency→Department→Workspace→Agent→Subagent.
 *
 * Estos tipos son la fuente de verdad para:
 * - Backend: routes, services, adapters
 * - Frontend: store, componentes Studio
 *
 * NO contienen lógica — solo contratos de forma.
 *
 * Referencias de diseño:
 * - Jerarquía: CrewAI Process.hierarchical + AutoGen OrchestratorAgent
 * - Persistencia: LangGraph Thread + Checkpointer pattern
 * - Skills: Semantic Kernel Plugins + Microsoft Agent Framework MCP/OpenAPI
 * - Canvas: Flowise AgentFlow V2 nodo-por-nodo
 * - Transporte: Hermes Transport Layer separation
 */

// ─── Tipos base ─────────────────────────────────────────────────────────────

export type AgentRole = "orchestrator" | "specialist" | "subagent";

/**
 * Tipo de skill — soporta taxonomía de interoperabilidad MAF.
 * 'mcp'       → Model Context Protocol (primer ciudadano)
 * 'n8n_webhook' → workflow n8n via API/webhook
 * 'openapi'   → cualquier API con spec OpenAPI, sin wrapper manual
 * 'builtin'   → skill nativa del runtime
 * 'function'  → función TypeScript registrada localmente
 */
export type SkillType =
  | "mcp"
  | "n8n_webhook"
  | "openapi"
  | "builtin"
  | "function";

/**
 * Acciones de control de topología — todas fail-closed.
 * Si el gateway no confirma la acción → no muta estado runtime.
 */
export type TopologyAction =
  | "connect"
  | "disconnect"
  | "pause"
  | "reactivate"
  | "redirect"
  | "continue";

export type TopologyLinkType = "delegation" | "handoff" | "redirect";
export type TopologyLinkState = "active" | "paused" | "disconnected";

export type ScopeType = "agency" | "department" | "workspace" | "agent";

export type CoreFileDiffStatus = "added" | "modified" | "deleted";

// ─── Skill ──────────────────────────────────────────────────────────────────

/**
 * SkillSpec — equivalente al Plugin de Semantic Kernel.
 * Tiene descripción semántica para que el TaskPlanner (futuro) lo seleccione.
 */
export interface SkillSpec {
  id: string;
  name: string;
  /** Descripción semántica legible por LLM para selección automática */
  description: string;
  type: SkillType;
  inputSchema?: Record<string, unknown>;
  /** Configuración específica del tipo (URL, auth, etc.) */
  config?: Record<string, unknown>;
}

// ─── Agent ──────────────────────────────────────────────────────────────────

/**
 * AgentSpec canónico.
 * - allowDelegation: si true, el agente puede delegar subtareas (CrewAI semántica)
 * - skills: refs a SkillSpec.id del catálogo del nivel o global
 * - profileJson: perfil generado/propagado por ProfilePropagatorService
 */
export interface AgentSpec {
  id: string;
  name: string;
  role: AgentRole;
  /** Equivalente a CrewAI allow_delegation=True */
  allowDelegation: boolean;
  /** IDs de skills del catálogo (local o global) */
  skillIds: string[];
  profileJson?: Record<string, unknown>;
  modelPolicyId?: string;
  budgetPolicyId?: string;
  metadata?: Record<string, unknown>;
}

// ─── Workspace ──────────────────────────────────────────────────────────────

/**
 * WorkspaceSpecCanonical — adaptado desde el workspace legacy de paperclip.
 * Coexiste con execution_workspaces vía studio_workspace_memberships.
 */
export interface WorkspaceSpecCanonical {
  id: string;
  name: string;
  agents: AgentSpec[];
  /** Catálogo local de skills del workspace */
  localSkillCatalog: SkillSpec[];
  /** Flujos del canvas (nodos + edges) — inspirado en Flowise AgentFlow V2 */
  flows?: FlowSpec[];
  profileJson?: Record<string, unknown>;
}

// ─── Department ─────────────────────────────────────────────────────────────

/**
 * DepartmentSpec — agrupa workspaces por dominio funcional.
 * Su orchestratorAgentId apunta a un agente con role='orchestrator'
 * que delega a los workspaces hijos (AutoGen GroupChatManager pattern).
 */
export interface DepartmentSpec {
  id: string;
  name: string;
  slug: string;
  orchestratorAgentId?: string;
  workspaces: WorkspaceSpecCanonical[];
  profileJson?: Record<string, unknown>;
}

// ─── Agency ──────────────────────────────────────────────────────────────────

/**
 * AgencySpec — raíz de la jerarquía.
 * globalSkillCatalog: accesible por todos los niveles hijos.
 * El orchestratorAgent de Agency recibe mensajes y delega a Departments.
 */
export interface AgencySpec {
  id: string;
  name: string;
  slug: string;
  orchestratorAgentId?: string;
  departments: DepartmentSpec[];
  /** Catálogo global de skills compartido por toda la Agency */
  globalSkillCatalog: SkillSpec[];
  profileJson?: Record<string, unknown>;
}

// ─── Topology ────────────────────────────────────────────────────────────────

/**
 * TopologyLink — conexión visual en el canvas macro Agency Topology.
 * El estado SOLO muta via TopologyService.executeAction() (fail-closed).
 * La UI nunca asume éxito — muestra el resultado real del backend.
 */
export interface TopologyLink {
  id: string;
  fromId: string;
  fromType: ScopeType;
  toId: string;
  toType: ScopeType;
  type: TopologyLinkType;
  /** Estado real de runtime — no simulado */
  state: TopologyLinkState;
  /** Razón del estado actual, mostrada en UI sin optimistic fakes */
  stateReason?: string;
}

/**
 * Resultado de una acción de topología (fail-closed).
 * Si success=false → UI muestra stateReason explícito, no simula éxito.
 */
export interface TopologyActionResult {
  success: boolean;
  linkId?: string;
  newState?: TopologyLinkState;
  reason?: string;
}

// ─── CoreFiles ───────────────────────────────────────────────────────────────

/**
 * CoreFileDiffItem — unidad de diff en el façade corefiles.
 * Equivalente al checkpoint de LangGraph por archivo.
 */
export interface CoreFileDiffItem {
  path: string;
  before: string | null;
  after: string;
  status: CoreFileDiffStatus;
}

export interface CoreFilePreviewResult {
  agentId: string;
  versionId?: string;
  items: CoreFileDiffItem[];
  appliedAt?: string;
}

// ─── Canvas / Flow ───────────────────────────────────────────────────────────

/**
 * Tipos de nodo del canvas — taxonomía inspirada en n8n + Flowise.
 *
 * Trigger (inician ejecución): channel_trigger
 * Action (hacen trabajo): agent, tool, n8n_workflow
 * Logic (controlan flujo): condition, approval, handoff, subflow
 */
export type FlowNodeType =
  | "agent"
  | "tool"
  | "condition"
  | "approval"
  | "n8n_workflow"
  | "channel_trigger"
  | "subflow"
  | "handoff";

export interface FlowNode {
  id: string;
  type: FlowNodeType;
  label: string;
  /** Posición en el canvas */
  position: { x: number; y: number };
  /** Datos de configuración específicos del tipo de nodo */
  data: Record<string, unknown>;
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  /** Etiqueta condicional (para nodos condition) */
  label?: string;
  type?: "default" | "conditional" | "handoff";
}

/**
 * FlowSpec — especificación serializable de un flow del canvas.
 * Puede exportarse como endpoint REST (n8n: flows-as-API pattern).
 */
export interface FlowSpec {
  id: string;
  name: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  metadata?: Record<string, unknown>;
}

// ─── Estado canónico completo ────────────────────────────────────────────────

/**
 * CanonicalState — respuesta completa de GET /api/v1/studio/canonical-state.
 * Coexiste con el endpoint legacy /studio/state — no lo reemplaza.
 */
export interface CanonicalState {
  agencies: AgencySpec[];
  topologyLinks: TopologyLink[];
  /** Metadatos de la consulta */
  meta: {
    companyId: string;
    generatedAt: string;
    /** true si algún workspace se adaptó desde el modelo legacy */
    hasLegacyAdaptations: boolean;
  };
}
