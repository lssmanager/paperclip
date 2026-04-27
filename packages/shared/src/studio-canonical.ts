/**
 * studio-canonical.ts
 * Tipos canónicos Agency→Department→Workspace→Agent→Subagent
 * Lote 1 — Fundacional. Todo lo demás depende de estos contratos.
 *
 * Estrategia: Compat + Adapter (no hard switch, no migración YAML-first)
 * Referencia conceptual: CrewAI hierarchy + LangGraph thread + AutoGen MoA
 */

export type AgentRole = 'orchestrator' | 'specialist' | 'subagent';

export type SkillType =
  | 'mcp'         // Model Context Protocol — estándar abierto (Microsoft Agent Framework)
  | 'n8n_webhook' // Workflow n8n expuesto como skill
  | 'openapi'     // Cualquier API con spec OpenAPI importada sin wrapper manual
  | 'builtin'     // Skill nativo del runtime (paperclip built-in)
  | 'function';   // Función TypeScript registrada directamente

export type TopologyAction =
  | 'connect'
  | 'disconnect'
  | 'pause'
  | 'reactivate'
  | 'redirect'
  | 'continue';

export type TopologyControlStatus =
  | 'active'
  | 'paused'
  | 'disconnected'
  | 'unsupported_by_runtime'; // Fail-closed explícito — nunca simular éxito

export type ScopeType = 'agency' | 'department' | 'workspace' | 'agent';

// ─── Skill ───────────────────────────────────────────────────────────────────
// Equivalente al Plugin de Semantic Kernel: unidad de capacidad registrable
export interface SkillSpec {
  id: string;
  name: string;
  description: string; // Descripción semántica para TaskPlanner (Semantic Kernel pattern)
  type: SkillType;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  config?: Record<string, unknown>;
  // Para type='n8n_webhook': webhookUrl, workflowId
  // Para type='openapi': specUrl, operationId
  // Para type='mcp': serverUrl, toolName
}

// ─── Agent ───────────────────────────────────────────────────────────────────
// allowDelegation mapea directamente a CrewAI allow_delegation=True
// role='orchestrator' → puede descomponer + delegar (CrewAI manager LLM)
// role='specialist'   → ejecuta trabajo directo en su dominio
// role='subagent'     → ejecuta subtareas delegadas por un specialist
export interface AgentSpec {
  id: string;
  name: string;
  role: AgentRole;
  allowDelegation: boolean;
  skillIds: string[];         // refs a SkillSpec.id del catálogo del workspace o global
  profileJson?: Record<string, unknown>; // Prompt orquestador calculado por ProfilePropagator
  modelPolicyId?: string;    // Cascada: agent → workspace → department → agency → global
  budgetPolicyId?: string;
  reportsToId?: string;       // Self-referential: Subagent reporta a Specialist
}

// ─── Flow (canvas tipo n8n/Flowise) ──────────────────────────────────────────
// Taxonomía de nodos inspirada en n8n: Trigger / Action / Logic
export type NodeType =
  | 'channel_trigger'  // Trigger: inicia ejecución desde canal
  | 'agent'            // Action: orquestado por LLM
  | 'tool'             // Action: determinista
  | 'condition'        // Logic: branching
  | 'approval'         // Logic: human-in-the-loop
  | 'n8n_workflow'     // Action: workflow n8n como nodo del canvas
  | 'subflow'          // Action: flow anidado
  | 'handoff';         // Logic: transferencia entre niveles jerárquicos

export interface FlowNode {
  id: string;
  type: NodeType;
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

// ─── Workspace canónico ───────────────────────────────────────────────────────
export interface WorkspaceSpecCanonical {
  id: string;
  name: string;
  departmentId?: string;   // null = workspace standalone (legacy paperclip)
  agents: AgentSpec[];
  flows: FlowSpec[];
  localSkillCatalog: SkillSpec[]; // Skills del workspace (hereda del Department/Agency)
  profileJson?: Record<string, unknown>; // Calculado por ProfilePropagator
}

// ─── Department ──────────────────────────────────────────────────────────────
// Delega a Workspaces. Tiene orchestratorAgent propio.
export interface DepartmentSpec {
  id: string;
  name: string;
  agencyId: string;
  orchestratorAgentId?: string;
  workspaces: WorkspaceSpecCanonical[];
  profileJson?: Record<string, unknown>; // Propagado bottom-up desde workspaces
}

// ─── Agency ──────────────────────────────────────────────────────────────────
// Nivel raíz. Tiene catálogo global de skills compartido por todos los niveles.
export interface AgencySpec {
  id: string;
  name: string;
  slug: string;
  orchestratorAgentId?: string;
  departments: DepartmentSpec[];
  globalSkillCatalog: SkillSpec[]; // Skills disponibles a todos los departamentos/workspaces
  profileJson?: Record<string, unknown>;
}

// ─── Topology ─────────────────────────────────────────────────────────────────
// Canvas macro: links entre nodos de la jerarquía con estado de control runtime
export interface TopologyLink {
  id: string;
  fromId: string;
  fromType: ScopeType;
  toId: string;
  toType: ScopeType;
  linkType: 'delegation' | 'handoff' | 'redirect';
  controlStatus: TopologyControlStatus;
  metadata?: Record<string, unknown>;
}

// Resultado de un control de topología (fail-closed contract)
export interface TopologyActionResult {
  success: boolean;
  action: TopologyAction;
  targetId: string;
  controlStatus: TopologyControlStatus;
  reason?: string; // Siempre presente cuando success=false
  appliedAt?: string; // ISO timestamp, solo cuando success=true
}

// ─── CoreFile Diff ───────────────────────────────────────────────────────────
// Para preview/diff/apply/rollback de archivos de configuración del agente
export interface CoreFileDiffItem {
  path: string;
  before: string | null; // null = archivo nuevo
  after: string | null;  // null = archivo eliminado
  status: 'added' | 'modified' | 'deleted';
  linesAdded?: number;
  linesRemoved?: number;
}

export interface CoreFileDiffResult {
  agentId: string;
  versionFrom?: string;
  versionTo?: string;
  items: CoreFileDiffItem[];
  summary: {
    added: number;
    modified: number;
    deleted: number;
  };
}

// ─── Estado canónico completo (respuesta de GET /studio/canonical-state) ──────
export interface CanonicalStudioState {
  agencies: AgencySpec[];
  // Workspaces standalone (legacy paperclip sin department)
  standaloneWorkspaces: WorkspaceSpecCanonical[];
  topologyLinks: TopologyLink[];
  generatedAt: string; // ISO timestamp
  adapterVersion: '1.0'; // Incrementar si cambia el contrato del adapter
}
