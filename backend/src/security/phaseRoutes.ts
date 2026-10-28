import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { advisoryInput, generateAdvice, type AdviceAssessment } from './advisory.js';
import { buildRiskOverview } from './riskOverview.js';

type Assessment = AdviceAssessment & { status: string; region: string; [key: string]: unknown };
export function registerPhaseRoutes(app: FastifyInstance, deps: {
  db: Pick<Pool, 'query'>; uuid: RegExp; load: (projectId: string, assessmentId: string) => Promise<Assessment | null>;
  actor: (request: FastifyRequest) => Promise<string | null>;
  groq: { apiKey: string; model: string }; generate?: typeof generateAdvice;
}) {
  const inFlight = new Set<string>();
  const base = '/api/v1/projects/:id/security/assessments/:assessmentId';
  type Params = { id: string; assessmentId: string; adviceId?: string };
  async function context(request: FastifyRequest<{ Params: Params }>, reply: import('fastify').FastifyReply) {
    const actor = await deps.actor(request);
    if (!actor) { reply.code(401).send({ message: 'Sesión válida requerida.' }); return null; }
    const { id, assessmentId } = request.params;
    if (!deps.uuid.test(id) || !deps.uuid.test(assessmentId)) { reply.code(400).send({ message: 'ID inválido.' }); return null; }
    const assessment = await deps.load(id, assessmentId);
    if (!assessment) { reply.code(404).send({ message: 'Evaluación no encontrada para este proyecto.' }); return null; }
    if (assessment.status !== 'completed') { reply.code(409).send({ message: 'Espera a que la evaluación termine.' }); return null; }
    return { actor, assessment };
  }

  app.get<{ Params: Params }>(`${base}/report`, async (request, reply) => {
    const ctx = await context(request, reply); if (!ctx) return;
    const advice = await deps.db.query(`SELECT id,provider,model,prompt_version AS "promptVersion",input_sha256 AS "inputHash",content,state,reviewed_by AS "reviewedBy",review_note AS "reviewNote",reviewed_at AS "reviewedAt" FROM assessment_advice WHERE assessment_id=$1 AND state='approved' ORDER BY reviewed_at DESC LIMIT 1`, [ctx.assessment.id]);
    const approved = advice.rows[0];
    const valid = approved?.inputHash === advisoryInput(ctx.assessment).inputHash;
    return reply.type('application/json').header('Content-Disposition', `attachment; filename="cloudops-${ctx.assessment.id}-technical.json"`).send({
      format: 'cloudops-technical-report', version: '1.0', generatedAt: new Date().toISOString(),
      assessment: ctx.assessment, riskOverview: buildRiskOverview(ctx.assessment.findings ?? [], ctx.assessment.region),
      advisory: valid ? approved : null,
      limitations: ['Solo evidencia observada; no certifica ausencia de vulnerabilidades.', 'Puntajes de motores o metodologías distintos no son comparables.', 'La IA es consultiva y solo se publica después de revisión humana.'],
    });
  });

  app.get<{ Params: Params }>(`${base}/advice`, async (request, reply) => {
    const ctx = await context(request, reply); if (!ctx) return;
    const result = await deps.db.query(`SELECT id,provider,model,prompt_version AS "promptVersion",input_sha256 AS "inputHash",content,state,created_at AS "createdAt",reviewed_at AS "reviewedAt",review_note AS "reviewNote",reviewed_by AS "reviewedBy" FROM assessment_advice WHERE assessment_id=$1 ORDER BY created_at DESC LIMIT 1`, [ctx.assessment.id]);
    const advice = result.rows[0];
    return { configured: Boolean(deps.groq.apiKey), data: advice ? { ...advice, stale: advice.inputHash !== advisoryInput(ctx.assessment).inputHash } : null };
  });

  app.post<{ Params: Params }>(`${base}/advice`, async (request, reply) => {
    const ctx = await context(request, reply); if (!ctx) return;
    if (inFlight.has(ctx.assessment.id)) return reply.code(409).send({ message: 'La explicación ya se está generando.' });
    inFlight.add(ctx.assessment.id);
    try {
      const input = advisoryInput(ctx.assessment);
      const existing = await deps.db.query(`SELECT id FROM assessment_advice WHERE assessment_id=$1 AND input_sha256=$2 AND model=$3 AND state!='rejected' ORDER BY created_at DESC LIMIT 1`, [ctx.assessment.id, input.inputHash, deps.groq.model]);
      if (existing.rows[0]) return { data: { id: existing.rows[0].id, reused: true } };
      const advice = await (deps.generate ?? generateAdvice)(ctx.assessment, deps.groq);
      const id = randomUUID();
      await deps.db.query(`INSERT INTO assessment_advice(id,assessment_id,model,prompt_version,input_sha256,content,created_by) VALUES($1,$2,$3,$4,$5,$6,$7)`,
        [id, ctx.assessment.id, advice.model, advice.promptVersion, advice.inputHash, JSON.stringify({ ...advice.content, references: advice.referenceMap }), ctx.actor]);
      return reply.code(201).send({ data: { id, state: 'draft' } });
    } finally { inFlight.delete(ctx.assessment.id); }
  });

  app.patch<{ Params: Params; Body: { state: 'approved' | 'rejected'; note: string } }>(`${base}/advice/:adviceId`, {
    schema: { body: { type: 'object', additionalProperties: false, required: ['state', 'note'], properties: { state: { enum: ['approved', 'rejected'] }, note: { type: 'string', minLength: 10, maxLength: 2000 } } } },
  }, async (request, reply) => {
    const ctx = await context(request, reply); if (!ctx) return;
    if (!deps.uuid.test(request.params.adviceId ?? '') || request.body.note.trim().length < 10) return reply.code(400).send({ message: 'Revisión o identificador inválidos.' });
    const updated = await deps.db.query(`UPDATE assessment_advice SET state=$4,reviewed_by=$5,review_note=$6,reviewed_at=now() WHERE id=$1 AND assessment_id=$2 AND input_sha256=$3 AND state='draft' RETURNING id,state`,
      [request.params.adviceId, ctx.assessment.id, advisoryInput(ctx.assessment).inputHash, request.body.state, ctx.actor, request.body.note.trim()]);
    if (!updated.rows[0]) return reply.code(409).send({ message: 'El borrador cambió, ya fue revisado o su evidencia quedó desactualizada. Recarga la evaluación.' });
    return { data: updated.rows[0] };
  });
}
