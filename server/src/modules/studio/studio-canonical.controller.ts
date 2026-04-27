import { Router, type Request, type Response } from 'express';
import { StudioCanonicalAdapter } from './studio-canonical.adapter';

/**
 * Studio Canonical Controller
 *
 * GET /api/v1/studio/canonical-state
 *
 * Expone la jerarquía Agency→Department→Workspace y topology links.
 * CONVIVE con el endpoint legacy GET /api/v1/studio/state SIN modificarlo.
 *
 * El endpoint legacy queda intacto — la UI puede migrar gradualmente.
 */
export function createStudioCanonicalRouter(
  db: any,
  adapter: StudioCanonicalAdapter
): Router {
  const router = Router();

  /**
   * GET /canonical-state
   * Retorna CanonicalState completo: agencies + standaloneWorkspaces + links.
   * Query params:
   *   ?agencyId=<id>   — filtrar por agency específica
   *   ?includeFlows=1  — incluir FlowSpec completos (default: sí)
   */
  router.get('/canonical-state', async (req: Request, res: Response) => {
    try {
      const { agencyId } = req.query;

      const agencyFilter = agencyId ? { where: { id: String(agencyId) } } : {};

      const [agencies, standaloneWorkspaces, topologyLinks, globalSkills] =
        await Promise.all([
          db.agency.findMany({
            ...agencyFilter,
            include: {
              departments: {
                include: {
                  workspaces: {
                    include: {
                      agents: true,
                      flows: true,
                      skills: true,
                    },
                  },
                },
              },
              skills: true,
            },
          }),
          db.workspace.findMany({
            where: { departmentId: null },
            include: { agents: true, flows: true, skills: true },
          }),
          db.topologyLink.findMany({
            orderBy: { createdAt: 'desc' },
            take: 200,
          }),
          db.skillCatalogEntry.findMany({
            where: { agencyId: null, workspaceId: null },
          }),
        ]);

      const canonicalState = adapter.buildCanonicalState({
        agencies,
        standaloneWorkspaces,
        topologyLinks,
        globalSkills,
      });

      res.json(canonicalState);
    } catch (err: any) {
      console.error('[StudioCanonical] canonical-state error:', err);
      res.status(500).json({
        error: 'Failed to build canonical state',
        detail: err?.message,
      });
    }
  });

  return router;
}
