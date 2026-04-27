/**
 * topology.controller.ts
 * Endpoints de control de topología runtime — FAIL CLOSED.
 *
 * POST /api/studio/v1/topology/:action
 * Body: { targetId: string, targetType: string }
 *
 * Respuesta siempre incluye controlStatus explícito.
 * Nunca retorna éxito simulado.
 */

import type { TopologyAction, TopologyActionResult } from '@repo/shared';
import type { TopologyService } from './topology.service.js';

const VALID_ACTIONS: TopologyAction[] = [
  'connect',
  'disconnect',
  'pause',
  'reactivate',
  'redirect',
  'continue',
];

export interface TopologyActionRequest {
  targetId: string;
  targetType: 'agency' | 'department' | 'workspace' | 'agent';
}

/**
 * handleTopologyAction
 * Handler genérico para POST /topology/:action
 * Compatible con Hono context pattern de paperclip.
 */
export async function handleTopologyAction(
  action: string,
  body: TopologyActionRequest,
  topologyService: TopologyService,
): Promise<{ status: number; data: TopologyActionResult | { error: string } }> {
  if (!VALID_ACTIONS.includes(action as TopologyAction)) {
    return {
      status: 400,
      data: {
        error: `Acción inválida: "${action}". Acciones soportadas: ${VALID_ACTIONS.join(', ')}`,
      },
    };
  }

  if (!body.targetId || !body.targetType) {
    return {
      status: 400,
      data: { error: 'Se requieren targetId y targetType en el body' },
    };
  }

  const result = await topologyService.executeAction(
    action as TopologyAction,
    body.targetId,
    body.targetType,
  );

  // HTTP 200 siempre — el éxito/fallo está en result.success y result.controlStatus
  // La UI lee result.controlStatus para mostrar estado real (nunca lo infiere del HTTP status)
  return {
    status: 200,
    data: result,
  };
}
