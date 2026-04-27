/**
 * corefiles.service.ts
 * Façade unificado para preview/diff/apply/rollback de core files del agente.
 *
 * Consolida lo que en agent-visualstudio estaba fragmentado entre:
 * - deploy (apply/preview)
 * - versions (diff/rollback)
 *
 * Reutiliza la lógica existente de agent_config_revisions de paperclip.
 */

import type { CoreFileDiffItem, CoreFileDiffResult } from '@repo/shared';

// ─── Interfaces de dependencias ───────────────────────────────────────────────

export interface IAgentConfigRevision {
  id: string;
  agentId: string;
  version: number;
  configSnapshot: Record<string, unknown>;
  createdAt: Date;
  createdBy?: string;
  changeReason?: string;
}

export interface IConfigRevisionsRepository {
  findByAgentId(agentId: string, limit?: number): Promise<IAgentConfigRevision[]>;
  findById(revisionId: string): Promise<IAgentConfigRevision | null>;
  findLatest(agentId: string): Promise<IAgentConfigRevision | null>;
  create(data: Omit<IAgentConfigRevision, 'id' | 'createdAt'>): Promise<IAgentConfigRevision>;
}

// ─── CoreFilesService ─────────────────────────────────────────────────────────
export class CoreFilesService {
  constructor(
    private readonly revisionsRepo: IConfigRevisionsRepository,
  ) {}

  /**
   * preview — muestra qué cambiaría si se aplicara un set de diffs.
   * NO aplica ningún cambio. Solo lectura.
   */
  async preview(
    agentId: string,
    proposedChanges: CoreFileDiffItem[],
  ): Promise<CoreFileDiffResult> {
    return {
      agentId,
      items: proposedChanges,
      summary: this.summarizeDiff(proposedChanges),
    };
  }

  /**
   * diff — compara dos versiones de la config de un agente.
   * Si no se especifica versionToId, compara con el estado actual.
   */
  async diff(
    agentId: string,
    versionFromId: string,
    versionToId?: string,
  ): Promise<CoreFileDiffResult> {
    const [revFrom, revTo] = await Promise.all([
      this.revisionsRepo.findById(versionFromId),
      versionToId
        ? this.revisionsRepo.findById(versionToId)
        : this.revisionsRepo.findLatest(agentId),
    ]);

    if (!revFrom) throw new Error(`Revisión ${versionFromId} no encontrada`);
    if (!revTo) throw new Error('No se encontró la revisión destino');

    const items = this.computeDiff(
      revFrom.configSnapshot,
      revTo.configSnapshot,
    );

    return {
      agentId,
      versionFrom: revFrom.id,
      versionTo: revTo.id,
      items,
      summary: this.summarizeDiff(items),
    };
  }

  /**
   * apply — aplica un set de diffs creando una nueva revisión.
   * Retorna la nueva revisión creada.
   */
  async apply(
    agentId: string,
    diffItems: CoreFileDiffItem[],
    options?: { createdBy?: string; changeReason?: string },
  ): Promise<IAgentConfigRevision> {
    const latest = await this.revisionsRepo.findLatest(agentId);
    const currentSnapshot = latest?.configSnapshot ?? {};

    // Aplicar diffs al snapshot actual
    const newSnapshot = this.applyDiffItems(currentSnapshot, diffItems);

    return this.revisionsRepo.create({
      agentId,
      version: (latest?.version ?? 0) + 1,
      configSnapshot: newSnapshot,
      createdBy: options?.createdBy,
      changeReason: options?.changeReason ?? 'Applied via corefiles façade',
    });
  }

  /**
   * rollback — revierte al estado de una revisión anterior.
   * Crea una nueva revisión con el snapshot de la versión target (no destructivo).
   */
  async rollback(
    agentId: string,
    targetRevisionId: string,
    options?: { createdBy?: string },
  ): Promise<IAgentConfigRevision> {
    const [targetRev, latest] = await Promise.all([
      this.revisionsRepo.findById(targetRevisionId),
      this.revisionsRepo.findLatest(agentId),
    ]);

    if (!targetRev) throw new Error(`Revisión target ${targetRevisionId} no encontrada`);

    return this.revisionsRepo.create({
      agentId,
      version: (latest?.version ?? 0) + 1,
      configSnapshot: targetRev.configSnapshot,
      createdBy: options?.createdBy,
      changeReason: `Rollback a revisión ${targetRevisionId} (v${targetRev.version})`,
    });
  }

  // ─── Helpers privados ─────────────────────────────────────────────────────

  private computeDiff(
    from: Record<string, unknown>,
    to: Record<string, unknown>,
  ): CoreFileDiffItem[] {
    const items: CoreFileDiffItem[] = [];
    const allKeys = new Set([...Object.keys(from), ...Object.keys(to)]);

    for (const key of allKeys) {
      const before = key in from ? JSON.stringify(from[key], null, 2) : null;
      const after = key in to ? JSON.stringify(to[key], null, 2) : null;

      if (before === after) continue;

      let status: CoreFileDiffItem['status'];
      if (before === null) status = 'added';
      else if (after === null) status = 'deleted';
      else status = 'modified';

      items.push({ path: key, before, after, status });
    }

    return items;
  }

  private applyDiffItems(
    snapshot: Record<string, unknown>,
    items: CoreFileDiffItem[],
  ): Record<string, unknown> {
    const result = { ...snapshot };

    for (const item of items) {
      if (item.status === 'deleted') {
        delete result[item.path];
      } else if (item.after !== null) {
        try {
          result[item.path] = JSON.parse(item.after);
        } catch {
          result[item.path] = item.after;
        }
      }
    }

    return result;
  }

  private summarizeDiff(items: CoreFileDiffItem[]): CoreFileDiffResult['summary'] {
    return {
      added: items.filter((i) => i.status === 'added').length,
      modified: items.filter((i) => i.status === 'modified').length,
      deleted: items.filter((i) => i.status === 'deleted').length,
    };
  }
}
