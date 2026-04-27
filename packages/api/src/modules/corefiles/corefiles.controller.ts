/**
 * corefiles.controller.ts
 * Endpoints del façade unificado de core files.
 *
 * GET  /api/studio/v1/corefiles/diff?agentId=&from=&to=
 * POST /api/studio/v1/corefiles/preview
 * POST /api/studio/v1/corefiles/apply
 * POST /api/studio/v1/corefiles/rollback
 */

import type { CoreFileDiffItem } from '@repo/shared';
import type { CoreFilesService } from './corefiles.service.js';

export async function handleCoreFilesDiff(
  agentId: string,
  versionFromId: string,
  versionToId: string | undefined,
  corefilesService: CoreFilesService,
) {
  if (!agentId || !versionFromId) {
    return { status: 400, data: { error: 'Se requieren agentId y from (versionFromId)' } };
  }
  const result = await corefilesService.diff(agentId, versionFromId, versionToId);
  return { status: 200, data: result };
}

export async function handleCoreFilesPreview(
  body: { agentId: string; proposedChanges: CoreFileDiffItem[] },
  corefilesService: CoreFilesService,
) {
  if (!body.agentId || !Array.isArray(body.proposedChanges)) {
    return { status: 400, data: { error: 'Se requieren agentId y proposedChanges[]' } };
  }
  const result = await corefilesService.preview(body.agentId, body.proposedChanges);
  return { status: 200, data: result };
}

export async function handleCoreFilesApply(
  body: {
    agentId: string;
    diffItems: CoreFileDiffItem[];
    createdBy?: string;
    changeReason?: string;
  },
  corefilesService: CoreFilesService,
) {
  if (!body.agentId || !Array.isArray(body.diffItems)) {
    return { status: 400, data: { error: 'Se requieren agentId y diffItems[]' } };
  }
  const result = await corefilesService.apply(body.agentId, body.diffItems, {
    createdBy: body.createdBy,
    changeReason: body.changeReason,
  });
  return { status: 200, data: result };
}

export async function handleCoreFilesRollback(
  body: { agentId: string; targetRevisionId: string; createdBy?: string },
  corefilesService: CoreFilesService,
) {
  if (!body.agentId || !body.targetRevisionId) {
    return { status: 400, data: { error: 'Se requieren agentId y targetRevisionId' } };
  }
  const result = await corefilesService.rollback(
    body.agentId,
    body.targetRevisionId,
    { createdBy: body.createdBy },
  );
  return { status: 200, data: result };
}
