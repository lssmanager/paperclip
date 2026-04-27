/**
 * topology.service.ts
 * Servicio de controles runtime de topología — FAIL CLOSED.
 *
 * Contrato explícito:
 * - Si el gateway no confirma la acción → NO mutar estado runtime
 * - UI nunca recibe éxito simulado
 * - Razón de fallo siempre presente en TopologyActionResult
 *
 * Referencia: IChannelAdapter pattern (Hermes Transport layer)
 */

import type { TopologyAction, TopologyActionResult, TopologyControlStatus } from '@repo/shared';

// ─── Interfaz del gateway adapter ────────────────────────────────────────────
// El gateway concreto implementa esta interfaz (paperclip adapters)
export interface IGatewayRuntimeAdapter {
  supportsTopologyAction(action: TopologyAction): Promise<boolean>;
  applyTopologyAction(
    action: TopologyAction,
    targetId: string,
    targetType: string,
  ): Promise<{ success: boolean; reason?: string }>;
}

// ─── Interfaz del repositorio de topology_links ──────────────────────────────
export interface ITopologyLinksRepository {
  findByTargetId(targetId: string): Promise<Array<{
    id: string;
    controlStatus: string;
    linkType: string;
    fromId: string;
    fromType: string;
  }>>;
  updateControlStatus(
    linkId: string,
    status: TopologyControlStatus,
    action: TopologyAction,
    result: 'success' | 'failed' | 'unsupported',
    reason?: string,
  ): Promise<void>;
}

// ─── TopologyService ──────────────────────────────────────────────────────────
export class TopologyService {
  constructor(
    private readonly gatewayAdapter: IGatewayRuntimeAdapter,
    private readonly linksRepo: ITopologyLinksRepository,
  ) {}

  /**
   * executeAction — punto de entrada principal para controles de topología.
   *
   * Flujo fail-closed:
   * 1. Verificar si el gateway soporta la acción
   * 2. Si NO soporta → retornar unsupported_by_runtime SIN mutar estado
   * 3. Si SÍ soporta → intentar aplicar
   * 4. Si falla → retornar failed SIN mutar estado en DB
   * 5. Solo si éxito → actualizar topology_links en DB
   */
  async executeAction(
    action: TopologyAction,
    targetId: string,
    targetType: string,
  ): Promise<TopologyActionResult> {
    // Paso 1: Verificar soporte del gateway ANTES de cualquier mutación
    const isSupported = await this.gatewayAdapter.supportsTopologyAction(action);

    if (!isSupported) {
      // Fail-closed: acción no soportada → estado explícito, sin mutación
      return {
        success: false,
        action,
        targetId,
        controlStatus: 'unsupported_by_runtime',
        reason: `El gateway runtime no soporta la acción "${action}" para el tipo "${targetType}". No se aplicó ningún cambio de estado.`,
      };
    }

    // Paso 2: Intentar aplicar la acción en el gateway
    const gatewayResult = await this.gatewayAdapter.applyTopologyAction(
      action,
      targetId,
      targetType,
    );

    if (!gatewayResult.success) {
      return {
        success: false,
        action,
        targetId,
        controlStatus: 'disconnected', // Estado seguro cuando falla
        reason: gatewayResult.reason ?? 'El gateway rechazó la acción sin detalles adicionales.',
      };
    }

    // Paso 3: Gateway confirmó éxito → ahora sí mutar estado en DB
    const newStatus = this.actionToStatus(action);
    const links = await this.linksRepo.findByTargetId(targetId);

    await Promise.all(
      links.map((link) =>
        this.linksRepo.updateControlStatus(link.id, newStatus, action, 'success'),
      ),
    );

    return {
      success: true,
      action,
      targetId,
      controlStatus: newStatus,
      appliedAt: new Date().toISOString(),
    };
  }

  private actionToStatus(action: TopologyAction): TopologyControlStatus {
    switch (action) {
      case 'connect':
      case 'reactivate':
      case 'continue':
        return 'active';
      case 'pause':
        return 'paused';
      case 'disconnect':
        return 'disconnected';
      case 'redirect':
        return 'active'; // Redirect mantiene activo pero cambia destino
      default:
        return 'disconnected';
    }
  }
}
