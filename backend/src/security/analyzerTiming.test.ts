import test from 'node:test';
import assert from 'node:assert/strict';
import { measureAnalyzer, type AnalyzerTimings } from './analyzerTiming.js';
import { buildAnalyzerRuns } from './dimensions.js';
import { mergeAssessments } from '../fullAssessment.js';

test('el tiempo se conserva también cuando el servicio falla', async () => {
  const timings: AnalyzerTimings = {};
  await assert.rejects(measureAnalyzer(timings, 'aws:s3', 'elapsed-service', async () => { throw new Error('AccessDenied'); }));
  assert.ok(timings['aws:s3']!.durationMs >= 0);
  const runs = buildAnalyzerRuns({ assessmentType: 'aws-account', findings: [], summary: { s3Available: false, analyzerTimings: timings } });
  assert.equal(runs.find((run) => run.analyzerId === 'aws:s3')!.state, 'failed');
  assert.equal(typeof runs.find((run) => run.analyzerId === 'aws:s3')!.durationMs, 'number');
});

test('full conserva medidas de código y AWS; históricos sin medida devuelven null', () => {
  const base = { score: 100, coverage: 100, confidence: 'high', findings: [] };
  const full = mergeAssessments({ ...base, summary: { users: 1, analyzerTimings: { 'aws:iam': { durationMs: 24, scope: 'cumulative-request' } } } },
    { ...base, summary: { dependencyCount: 1, vulnerabilitiesChecked: 1, osvState: 'completed', analyzerTimings: { osv: { durationMs: 0, scope: 'elapsed-service' } } } });
  const runs = buildAnalyzerRuns({ assessmentType: 'full', ...full });
  assert.equal(runs.find((run) => run.analyzerId === 'osv')!.durationMs, 0);
  assert.equal(runs.find((run) => run.analyzerId === 'aws:iam')!.durationMs, 24);
  assert.equal(runs.find((run) => run.analyzerId === 'aws:s3')!.durationMs, null);
});
