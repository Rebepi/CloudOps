import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeAssessments, type MergeFinding } from './fullAssessment.js';

function finding(overrides: Partial<MergeFinding>): MergeFinding {
  return {
    externalId: 'x', source: 'cloudops', category: 'code', title: 't', description: 'd',
    severity: 'HIGH', status: 'open', resource: null, recommendation: 'r', evidence: {}, ...overrides,
  };
}

test('mergeAssessments combina hallazgos de AWS y código y deduplica por huella', () => {
  const aws = {
    score: 88, coverage: 100, confidence: 'high',
    findings: [finding({ externalId: 'aws:1', category: 'account', title: 'MFA', fingerprint: 'fp_same' })],
    summary: { counts: {}, methodologyVersion: '2026.10' },
  };
  const code = {
    score: 60, coverage: 50, confidence: 'low',
    findings: [
      finding({ externalId: 'code:1', title: 'eval', fingerprint: 'fp_same' }),
      finding({ externalId: 'osv:2', title: 'CVE', severity: 'CRITICAL', category: 'dependency', fingerprint: 'fp_unique' }),
    ],
    summary: { counts: {}, methodologyVersion: '2026.10', entryCount: 10, dependencyCount: 3 },
  };

  const merged = mergeAssessments(aws, code);
  assert.equal(merged.findings.length, 2);
  assert.equal(merged.coverage, 75);
  assert.equal(merged.summary.combined, true);
  assert.equal(merged.summary.entryCount, 10);
  assert.deepEqual(merged.summary.counts, { CRITICAL: 1, HIGH: 1, MEDIUM: 0, LOW: 0, INFORMATIONAL: 0 });
  assert.equal(merged.score, 68);
  assert.equal(merged.confidence, 'medium');
  assert.ok(merged.summary.components);
});

test('mergeAssessments excluye hallazgos de cobertura del puntaje', () => {
  const empty = { score: 100, coverage: 100, confidence: 'high', findings: [], summary: { counts: {}, methodologyVersion: '2026.10' } };
  const code = {
    score: 0, coverage: 0, confidence: 'low',
    findings: [finding({ externalId: 'cov', category: 'coverage', severity: 'CRITICAL', fingerprint: 'fp_cov' })],
    summary: { counts: {}, methodologyVersion: '2026.10' },
  };
  const merged = mergeAssessments(empty, code);
  assert.equal(merged.score, 100);
});
