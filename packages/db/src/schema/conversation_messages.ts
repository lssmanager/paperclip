/**
 * conversation_messages.ts — Drizzle schema
 * Historial durable de conversación — tabla separada (NO JSONB acumulativo en sesión).
 *
 * Decisión arquitectural (ver docs plan maestro):
 * Acumular messageHistory como JSONB en GatewaySession degrada Postgres via TOAST
 * cuando supera ~2KB. Cada mensaje requiere leer+reescribir el array completo.
 *
 * Solución:
 *   - GatewaySession.activeContextJson = ventana compacta (<3KB) para el LLM
 *   - ConversationMessage = append-only, queryable, auditable
 *
 * Referencia: LangGraph Thread durable + Hermes Session & Memory pattern
 */
import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';

export const conversationMessages = pgTable(
  'conversation_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // sessionId referencia a la tabla de sesiones existente en paperclip
    // (agent_task_sessions o la tabla de gateway que se use)
    sessionId: uuid('session_id').notNull(),
    // Rol del mensaje en la conversación LLM
    role: text('role').notNull(), // 'user' | 'assistant' | 'system' | 'tool'
    // Texto plano para búsqueda full-text (columna separada del JSON)
    contentText: text('content_text'),
    // Estructura completa del mensaje: [{type, text}] o tool_calls
    // JSONB a nivel de mensaje individual (~1KB) — NO aplica problema TOAST
    contentJson: jsonb('content_json').notNull().$type<Record<string, unknown>>(),
    // ID externo del canal (Telegram msg_id, WhatsApp wamid, etc.)
    channelMessageId: text('channel_message_id'),
    // Para mensajes de resultado de tool call
    toolCallId: text('tool_call_id'),
    toolName: text('tool_name'),
    // Scope jerárquico del agente que produjo o recibió el mensaje
    // Permite trazabilidad: "este mensaje fue generado por el agente X del workspace Y"
    scopeType: text('scope_type'), // 'agency' | 'department' | 'workspace' | 'agent'
    scopeId: uuid('scope_id'),
    // Tokens del mensaje (estimado o real para cost tracking)
    tokenCount: integer('token_count'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    // Índices críticos para carga de historial por sesión (LangGraph thread pattern)
    sessionCreatedIdx: index('conv_messages_session_created_idx').on(table.sessionId, table.createdAt),
    sessionRoleIdx: index('conv_messages_session_role_idx').on(table.sessionId, table.role),
    // Para trazabilidad de topología y observability
    scopeCreatedIdx: index('conv_messages_scope_created_idx').on(table.scopeId, table.createdAt),
  }),
);
