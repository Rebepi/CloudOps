import 'dotenv/config';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import pg from 'pg';
import { createToken } from '../src/auth.js';
import { db as applicationDb } from '../src/db.js';
import { downloadRepositoryArchive } from '../src/repository.js';

// Creates new assessments through the same API as the UI; historical assessments remain intact.
const api = process.env.CLOUDOPS_BASELINE_API ?? 'http://127.0.0.1:27902/api/v1';
if (!/^http:\/\/127\.0\.0\.1:\d+\/api\/v1$/.test(api)) throw new Error('La verificación solo admite API local.');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const directory = await mkdtemp(join(tmpdir(), 'cloudops-phase89-'));
const output = resolve('..', 'docs', 'baselines', `phase89-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
const report: Record<string, any> = { generatedAt: new Date().toISOString(), workflows: {}, checks: {} };
async function checkpoint() { await mkdir(resolve('..', 'docs', 'baselines'), { recursive: true }); await writeFile(output, JSON.stringify(report, null, 2) + '\n'); }
try {
  const user = (await pool.query("SELECT id,email,rol FROM users WHERE is_active=true AND rol='super_admin' ORDER BY created_at LIMIT 1")).rows[0];
  if (!user) throw new Error('Se necesita un administrador activo para verificar exportación e IA.');
  const authorization = `Bearer ${createToken(user)}`;
  async function request(path: string, method = 'GET', body?: unknown) {
    const response = await fetch(`${api}${path}`, { method, headers: { authorization, ...(body && !(body instanceof FormData) ? { 'content-type': 'application/json' } : {}) }, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(300_000) });
    const data = await response.json() as any;
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${String(data.message ?? 'Error de API').slice(0, 300)}`);
    return data;
  }
  const archive = await downloadRepositoryArchive({ provider: 'github', owner: 'Rebepi', name: 'SalesIA', ref: process.env.CLOUDOPS_BASELINE_REF ?? 'main' }, process.env.CLOUDOPS_REPOSITORY_TOKEN ?? '', join(directory, 'source.zip'));
  assert.ok(archive.commit, 'GitHub debe resolver el commit exacto');
  report.source = { repository: 'Rebepi/SalesIA', commit: archive.commit, bytes: archive.bytes, sha256: archive.sha256 };
  const project = process.env.CLOUDOPS_BASELINE_PROJECT ?? (await request('/projects', 'POST', { name: 'SalesIA · validación fases 8 y 9', description: `Línea base real, commit ${archive.commit}. No desplegado por CloudOps.`, applicationType: 'Web', environment: 'Sandbox', region: 'us-east-1', sourceMode: 'repository', repoProvider: 'github', repoOwner: 'Rebepi', repoName: 'SalesIA', repoDefaultBranch: archive.commit })).data.id;
  report.projectId = project;
  await checkpoint();
  async function wait(id: string) {
    const deadline = Date.now() + 30 * 60_000;
    while (Date.now() < deadline) {
      const assessment = (await request(`/projects/${project}/security/assessments/${id}`)).data;
      if (assessment.status === 'completed') return assessment;
      if (assessment.status === 'failed') throw new Error(assessment.errorMessage ?? 'Evaluación fallida');
      await new Promise((done) => setTimeout(done, 3000));
    }
    throw new Error('La evaluación sigue pendiente después de 30 minutos.');
  }
  for (const workflow of ['zip', 'repository', 'aws', 'full']) {
    console.log(JSON.stringify({ workflow, state: 'starting', projectId: project }));
    try {
      let started;
      if (workflow === 'repository') started = await request(`/projects/${project}/security/assessments/repository`, 'POST', { ref: archive.commit, scope: 'code' });
      else if (workflow === 'aws') started = await request(`/projects/${project}/security/assessments/aws`, 'POST');
      else {
        const form = new FormData(); form.append('archive', new Blob([await readFile(join(directory, 'source.zip'))], { type: 'application/zip' }), 'SalesIA-baseline.zip');
        started = await request(`/projects/${project}/security/assessments/${workflow === 'zip' ? 'code' : 'full'}`, 'POST', form);
      }
      const id = started.data.assessmentId ?? started.data.id;
      report.workflows[workflow] = { id, status: 'running' }; await checkpoint();
      const result = await wait(id);
      assert.equal(result.engineVersion, '1.10.0');
      assert.equal(result.dimensionScores.length, 6);
      const comparison = (await request(`/projects/${project}/security/assessments/${id}/comparison`)).data;
      const technical = await request(`/projects/${project}/security/assessments/${id}/report`);
      assert.equal(technical.advisory, null, 'Un borrador no se publica en el informe técnico');
      const counts = result.findings.reduce((acc: Record<string, number>, finding: any) => { acc[finding.severity] = (acc[finding.severity] ?? 0) + 1; return acc; }, {});
      report.workflows[workflow] = { id, status: result.status, score: result.score, coverage: result.coverage, engine: result.engineVersion, methodology: result.methodologyVersion,
        artifactSha256: result.artifactSha256, counts, actionable: result.riskOverview.actionable, informational: result.riskOverview.informational,
        dimensions: result.dimensionScores.map(({ id, score, coverage, state }: any) => ({ id, score, coverage, state })),
        analyzers: result.analyzers.map(({ analyzerId, state, itemsAnalyzed, findingsCount, durationMs, detail }: any) => ({ analyzerId, state, itemsAnalyzed, findingsCount, durationMs, detail })),
        awsServiceCoverage: result.summary.awsServiceCoverage, comparable: comparison.summary.comparable, dimensionComparison: comparison.dimensions,
        technicalReport: 'verified; no unapproved AI', sbom: null };
      if (workflow !== 'aws') {
        const sbom = await request(`/projects/${project}/security/assessments/${id}/sbom`);
        assert.equal(sbom.bomFormat, 'CycloneDX'); report.workflows[workflow].sbom = { format: sbom.bomFormat, components: sbom.components?.length ?? 0 };
      }
      console.log(JSON.stringify({ workflow, state: 'completed', score: result.score, coverage: result.coverage, counts }));
    } catch (error) {
      report.workflows[workflow] = { ...report.workflows[workflow], status: 'verification_failed', error: error instanceof Error ? error.message : 'Fallo' };
      console.log(JSON.stringify({ workflow, state: 'verification_failed', error: report.workflows[workflow].error }));
    }
    await checkpoint();
  }
  const target = report.workflows.full.status === 'completed' ? report.workflows.full : report.workflows.repository;
  if (target.status === 'completed') {
    try {
      await request(`/projects/${project}/security/assessments/${target.id}/advice`, 'POST');
      const advice = (await request(`/projects/${project}/security/assessments/${target.id}/advice`)).data;
      assert.equal(advice.state, 'draft'); assert.equal(advice.stale, false);
      const technical = await request(`/projects/${project}/security/assessments/${target.id}/report`);
      assert.equal(technical.advisory, null);
      report.checks.groq = { assessmentId: target.id, state: advice.state, model: advice.model, priorities: advice.content.priorities.length, draftExcludedFromExport: true };
    } catch (error) { report.checks.groq = { error: error instanceof Error ? error.message : 'Fallo' }; }
  }
  await checkpoint();
  console.log(JSON.stringify({ output, checks: report.checks }));
} finally {
  // directory is created above by mkdtemp under the explicit cloudops-phase89 prefix.
  await rm(directory, { recursive: true, force: true }); await pool.end(); await applicationDb.end();
}
