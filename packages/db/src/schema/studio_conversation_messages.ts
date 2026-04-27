import {
  pgTable,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

/**
 * Historial permanente de mensajes por sesión — append-only, nunca updates.
 * Separado de GatewaySession.activeContextJson para evitar TOAST de Postgres
 * en arrays JSONB crecientes (problema documentado: >2KB → TOAST → degradación).
 *
 * Equivalente al Thread durable de LangGraph:
 * - GatewaySession.activeContextJson = checkpointer activo (compacto, <3KB)
 * - ConversationMessage = historial permanente queryable por sesión/scope/rol
 *
 * NOTA: agentTaskSessions ya tiene historial básico. Esta tabla lo extiende
 * con trazabilidad por scope jerárquico y soporte multi-rol para el gateway.
 */
export const studioConversationMessages = pgTable(
  "studio_conversation_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** FK a agent_task_sessions.id del gateway */
    sessionId: uuid("session_id").notNull(),
    /** 'user' | 'assistant' | 'system' | 'tool' */
    role: text("role").notNull(),
    /** Texto plano para búsqueda full-text */
    contentText: text("content_text"),
    /**
     * Estructura completa del mensaje.
     * JSONB individual (~1KB) — SÍ aplica porque cada mensaje es pequeño.
     * El problema TOAST solo aplica a arrays crecientes en una sola celda.
     */
    contentJson: jsonb("content_json").notNull(),
    /** ID externo del canal (Telegram msg_id, WhatsApp wamid, etc.) */
    channelMessageId: text("channel_message_id"),
    /** Si este mensaje es resultado de un tool call */
    toolCallId: text("tool_call_id"),
    toolName: text("tool_name"),
    /**
     * Scope jerárquico del agente que generó este mensaje.
     * Permite trazabilidad por nivel: ¿qué nivel de la jerarquía respondió?
     * Inspirado en LangGraph checkpoint metadata por thread.
     */
    scopeType: text("scope_type"), // 'agency'|'department'|'workspace'|'agent'
    scopeId: uuid("scope_id"),
    /** Tokens del mensaje (estimado o real del proveedor) */
    tokenCount: integer("token_count"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    sessionCreatedIdx: index("studio_conv_msgs_session_created_idx").on(
      table.sessionId,
      table.createdAt
    ),
    sessionRoleIdx: index("studio_conv_msgs_session_role_idx").on(
      table.sessionId,
      table.role
    ),
    scopeCreatedIdx: index("studio_conv_msgs_scope_created_idx").on(
      table.scopeId,
      table.createdAt
    ),
  })
);
