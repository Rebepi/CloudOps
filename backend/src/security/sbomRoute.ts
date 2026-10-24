import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { serializeSbom, type CycloneDxBom } from './supplyChain.js';

/** Uses the same authentication hooks as the parent project's assessment routes. */
export function registerSbomRoute(app: FastifyInstance, db: Pick<Pool, 'query'>, uuidPattern: RegExp) {
  app.get<{ Params: { id: string; assessmentId: string } }>('/api/v1/projects/:id/security/assessments/:assessmentId/sbom', async ({ params }, reply) => {
    if (!uuidPattern.test(params.id) || !uuidPattern.test(params.assessmentId)) return reply.code(400).send({ message: 'ID inválido' });
    const result = await db.query<{ content: CycloneDxBom; sha256: string }>(`SELECT sb.content,sb.sha256 FROM assessment_sboms sb
      JOIN security_assessments sa ON sa.id=sb.assessment_id WHERE sa.project_id=$1 AND sa.id=$2 AND sa.status='completed'`, [params.id, params.assessmentId]);
    const sbom = result.rows[0];
    if (!sbom) return reply.code(404).send({ message: 'Esta evaluación no contiene un SBOM. Ejecuta un nuevo análisis de código.' });
    return reply.type('application/vnd.cyclonedx+json').header('Content-Disposition', `attachment; filename="cloudops-${params.assessmentId}.cdx.json"`)
      .header('ETag', `"${sbom.sha256}"`).send(serializeSbom(sbom.content));
  });
}
