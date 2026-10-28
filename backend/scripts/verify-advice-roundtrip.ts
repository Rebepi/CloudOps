import 'dotenv/config';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { db } from '../src/db.js';
import { createToken } from '../src/auth.js';

const [projectId, assessmentId, baselineFile] = process.argv.slice(2);
if (![projectId, assessmentId].every((id) => /^[a-f0-9-]{36}$/.test(id ?? ''))) throw new Error('Uso: verify-advice-roundtrip.ts <project-id> <assessment-id> [baseline-json]');
try {
  const user = (await db.query("SELECT id,email,rol FROM users WHERE is_active=true AND rol='super_admin' ORDER BY created_at LIMIT 1")).rows[0];
  const token = createToken(user);
  const base = `http://127.0.0.1:27902/api/v1/projects/${projectId}/security/assessments/${assessmentId}`;
  async function call(path: string, method = 'GET', authenticated = true) {
    const response = await fetch(base + path, { method, headers: { ...(authenticated ? { authorization: `Bearer ${token}` } : {}), ...(method === 'POST' ? { 'content-type': 'application/json' } : {}) }, ...(method === 'POST' ? { body: '{}' } : {}), signal: AbortSignal.timeout(60_000) });
    return { status: response.status, body: await response.json() as any };
  }
  assert.equal((await call('/report', 'GET', false)).status, 401);
  const before = (await call('')).body.data;
  const generated = await call('/advice', 'POST');
  if (generated.status !== 201 && generated.status !== 200) throw new Error(`HTTP ${generated.status}: ${generated.body.message}`);
  const advice = (await call('/advice')).body.data;
  assert.equal(advice.state, 'draft'); assert.equal(advice.stale, false);
  const report = (await call('/report')).body;
  assert.equal(report.advisory, null);
  const after = (await call('')).body.data;
  for (const field of ['score', 'coverage', 'findings', 'dimensionScores']) assert.deepEqual(after[field], before[field]);
  const result = { assessmentId, state: advice.state, model: advice.model, priorities: advice.content.priorities.length, draftExcludedFromExport: true, anonymousExportStatus: 401, securityResultsUnchanged: true };
  console.log(JSON.stringify(result));
  if (baselineFile) {
    const path = resolve(baselineFile);
    if (!path.startsWith(resolve('..', 'docs', 'baselines') + '\\')) throw new Error('Solo se permite actualizar el artefacto de baseline en docs/baselines.');
    const baseline = JSON.parse(await readFile(path, 'utf8'));
    if (baseline.checks.groq?.error) baseline.checks.groqInitialAttempt = baseline.checks.groq;
    baseline.checks.groq = result; await writeFile(path, JSON.stringify(baseline, null, 2) + '\n');
  }
} finally { await db.end(); }
