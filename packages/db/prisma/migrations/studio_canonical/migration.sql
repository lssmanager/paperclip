-- ============================================================
-- Studio Canonical Migration
-- Fase 0 — Additive only, no breaking changes a tablas existentes
-- ============================================================

-- -------------------------------------------------------
-- Agency — nivel tope de la jerarquía
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS "Agency" (
  "id"          TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "name"        TEXT NOT NULL,
  "slug"        TEXT NOT NULL,
  "profileJson" JSONB,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Agency_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Agency_slug_key" ON "Agency"("slug");

-- -------------------------------------------------------
-- Department — nivel intermedio Agency→Department
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS "Department" (
  "id"                   TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "agencyId"             TEXT NOT NULL,
  "name"                 TEXT NOT NULL,
  "orchestratorAgentId"  TEXT,
  "profileJson"          JSONB,
  "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Department_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Department_agencyId_fkey"
    FOREIGN KEY ("agencyId") REFERENCES "Agency"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

-- -------------------------------------------------------
-- SkillCatalogEntry — catálogo global + local de skills
-- agencyId NULL = entrada global; workspaceId NULL = no local
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS "SkillCatalogEntry" (
  "id"           TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "name"         TEXT NOT NULL,
  "description"  TEXT NOT NULL DEFAULT '',
  "type"         TEXT NOT NULL DEFAULT 'builtin',
  "inputSchema"  JSONB,
  "outputSchema" JSONB,
  "config"       JSONB,
  "endpointUrl"  TEXT,
  "mcpServer"    TEXT,
  "agencyId"     TEXT,
  "workspaceId"  TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SkillCatalogEntry_pkey" PRIMARY KEY ("id")
);

-- -------------------------------------------------------
-- ConversationMessage — historial durable, append-only
--
-- Separado de GatewaySession.messageHistory (JSONB acumulativo)
-- para evitar TOAST en Postgres cuando el array crece.
-- Cada mensaje: contentJson pequeño (~1KB) → sin problema de TOAST.
-- activeContextJson en GatewaySession se mantiene < 3KB con summarización.
-- Referencia: LangGraph Thread durable + memoria activa vs. disco.
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS "ConversationMessage" (
  "id"               TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "sessionId"        TEXT NOT NULL,
  "role"             TEXT NOT NULL,   -- 'user'|'assistant'|'system'|'tool'
  "contentText"      TEXT,            -- texto plano para búsqueda full-text
  "contentJson"      JSONB NOT NULL,  -- estructura completa: [{type,text}] o tool_calls
  "channelMessageId" TEXT,            -- ID externo del canal (Telegram msg_id, etc.)
  "toolCallId"       TEXT,            -- si es resultado de un tool call
  "toolName"         TEXT,
  "scopeType"        TEXT,            -- 'agency'|'department'|'workspace'|'agent'
  "scopeId"          TEXT,
  "tokenCount"       INTEGER,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConversationMessage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ConversationMessage_sessionId_createdAt_idx"
  ON "ConversationMessage"("sessionId", "createdAt");
CREATE INDEX IF NOT EXISTS "ConversationMessage_sessionId_role_idx"
  ON "ConversationMessage"("sessionId", "role");
CREATE INDEX IF NOT EXISTS "ConversationMessage_scopeId_createdAt_idx"
  ON "ConversationMessage"("scopeId", "createdAt");

-- -------------------------------------------------------
-- TopologyLink — estado de conexión entre nodos de la jerarquía
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS "TopologyLink" (
  "id"        TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "fromId"    TEXT NOT NULL,
  "fromType"  TEXT NOT NULL,  -- 'agency'|'department'|'workspace'|'agent'
  "toId"      TEXT NOT NULL,
  "toType"    TEXT NOT NULL,
  "type"      TEXT NOT NULL DEFAULT 'delegation', -- 'delegation'|'handoff'|'redirect'
  "state"     TEXT NOT NULL DEFAULT 'active',     -- 'active'|'paused'|'disconnected'
  "metadata"  JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TopologyLink_pkey" PRIMARY KEY ("id")
);

-- -------------------------------------------------------
-- Extender tabla Workspace existente (additive)
-- departmentId      → FK opcional a Department (NULL = legacy standalone)
-- canonicalVersion  → versión del modelo canónico (default 1)
-- orchestratorAgentId → agente que orquesta este workspace
-- -------------------------------------------------------
ALTER TABLE "Workspace"
  ADD COLUMN IF NOT EXISTS "departmentId"          TEXT,
  ADD COLUMN IF NOT EXISTS "canonicalVersion"      INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "orchestratorAgentId"   TEXT;
