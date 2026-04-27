/**
 * studio-canonical.controller.ts
 * Endpoint: GET /api/studio/v1/canonical-state
 *
 * IMPORTANTE: No rompe /studio/state existente.
 * Expone el estado canónico en paralelo como endpoint adicional.
 */

import type { CanonicalStudioState } from '@repo/shared';
import { legacyStateToCanonical } from './studio-canonical.adapter.js';

// ─── Handler compatible con Hono/Express/Fastify ──────────────────────────────
// Paperclip usa Hono — el handler recibe (c: Context) pero se define genérico
// para no crear dependencia directa en este módulo.

export interface IStudioRepository {
  getAgents(companyId: string): Promise<unknown[]>;
  getWorkspaces?(companyId: string): Promise<unknown[]>;
  getSkills?(companyId: string): Promise<unknown[]>;
}

export async function getCanonicalStateHandler(
  companyId: string,
  studioRepo: IStudioRepository,
): Promise<CanonicalStudioState> {
  const [agents, workspaces, skills] = await Promise.all([
    studioRepo.getAgents(companyId),
    studioRepo.getWorkspaces?.(companyId) ?? Promise.resolve([]),
    studioRepo.getSkills?.(companyId) ?? Promise.resolve([]),
  ]);

  // Transformar con el adapter legacy→canonical
  return legacyStateToCanonical({
    agents: agents as any[],
    workspaces: workspaces as any[],
    skills: skills as any[],
  });
}
