import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAnalyzerRuns, computeDimensionBreakdown, dimensionForFinding } from './dimensions.js';

const codeSummary = {
  coverageMatrix: [{ id: 'sast', label: 'SAST', status: 'measured', files: 120, detail: 'Archivos de aplicación' }],
};

test('asigna hallazgos AWS y de código a la dimensión correcta', () => {
  assert.equal(dimensionForFinding({ source: 'cloudops', category: 'account', title: 'MFA root', externalId: 'cloudops:root-mfa' }), 'identity');
  assert.equal(dimensionForFinding({ source: 'cloudops', category: 'configuration', title: 'Bucket público', externalId: 'cloudops:s3-public-policy:demo' }), 'data');
  assert.equal(dimensionForFinding({ source: 'cloudops', category: 'configuration', title: 'Security Group', externalId: 'cloudops:security-group-public-admin:sg-1' }), 'configuration');
  assert.equal(dimensionForFinding({ source: 'osv', category: 'dependency', title: 'CVE-2024-0001 en pillow' }), 'dependencies');
  assert.equal(dimensionForFinding({ source: 'security-hub', category: 'cloud-posture', title: 'CloudTrail logging disabled' }), 'detection');
  assert.equal(dimensionForFinding({ source: 'cloudops', category: 'code', title: 'Consulta SQL construida dinámicamente', externalId: 'cloudops:sql-string-concat:abc' }), 'application');
  assert.equal(dimensionForFinding({ source: 'cloudops', category: 'secret', title: 'Posible secreto escrito directamente', externalId: 'cloudops:hardcoded-secret:abc' }), 'data');
  assert.equal(dimensionForFinding({ source: 'cloudops', category: 'database-url', title: 'Cadena de conexión con credenciales', externalId: 'cloudops:database-url:abc' }), 'data');
  assert.equal(dimensionForFinding({ source: 'cloudops', category: 'database-migration', title: 'SQL concatenado' }), 'application');
});

test('una dimensión sin controles medidos devuelve score null', () => {
  const result = computeDimensionBreakdown({ assessmentType: 'code', findings: [], summary: {} });
  const application = result.find((dimension) => dimension.id === 'application')!;
  const data = result.find((dimension) => dimension.id === 'data')!;
  assert.equal(application.score, null);
  assert.equal(application.coverage, 0);
  assert.equal(application.state, 'not_measured');
  assert.equal(data.score, null);
});

test('SAST sin hallazgos puntuables no se presenta como aprobado', () => {
  const result = computeDimensionBreakdown({
    assessmentType: 'code',
    findings: [{ source: 'cloudops', category: 'database-migration', title: 'SQL concatenado', severity: 'CRITICAL', evidence: { scoreExcluded: true } }],
    summary: codeSummary,
  });
  const application = result.find((dimension) => dimension.id === 'application')!;
  assert.equal(application.score, null);
  assert.equal(application.coverage, 100);
  assert.equal(application.state, 'partial');
  assert.equal(application.scoreExcludedFindings, 1);
  assert.equal(application.counts.CRITICAL, 1);
});

test('dependencias parciales por OSV fallido no se presentan como aprobadas', () => {
  const result = computeDimensionBreakdown({
    assessmentType: 'code',
    findings: [{ source: 'osv', category: 'dependency', title: 'CVE-2024-0001 en pillow', severity: 'CRITICAL', externalId: 'CVE-2024-0001' }],
    summary: {
      coverageMatrix: [{ id: 'dependencies', label: 'Dependencias', status: 'partial', files: 3, detail: 'OSV no respondió' }],
      dependencyCount: 339,
      osvAvailable: false,
      osvError: 'fetch failed',
    },
  });
  const dependencies = result.find((dimension) => dimension.id === 'dependencies')!;
  assert.equal(dependencies.coverage, 50);
  assert.equal(dependencies.state, 'partial');
  assert.equal(dependencies.score, 45);
  assert.equal(dependencies.controls[0]?.state, 'partial');
});

test('full combina controles de código y AWS y conserva estados fallidos', () => {
  const result = computeDimensionBreakdown({
    assessmentType: 'full',
    findings: [],
    summary: {
      ...codeSummary,
      securityHubAvailable: false,
      securityHubError: 'AccessDenied',
      s3Available: true,
      s3Buckets: 0,
      networkAvailable: true,
      securityGroups: 0,
      rdsAvailable: true,
      rdsInstances: 0,
      configAvailable: true,
      configRecorders: 1,
      configRules: 0,
      inspectorAvailable: false,
      inspectorStatus: 'DISABLED',
    },
  });
  const detection = result.find((dimension) => dimension.id === 'detection')!;
  const data = result.find((dimension) => dimension.id === 'data')!;
  assert.equal(detection.controls.find((control) => control.id === 'aws:security-hub')?.state, 'failed');
  assert.equal(data.controls.find((control) => control.id === 'aws:s3-public')?.state, 'not_applicable');
  assert.ok(result.find((dimension) => dimension.id === 'application')!.controls.some((control) => control.id === 'code:sast'));
});

test('registra analizadores con estado y elementos revisados', () => {
  const runs = buildAnalyzerRuns({
    assessmentType: 'code',
    findings: [],
    summary: {
      ...codeSummary,
      dependencyCount: 339,
      vulnerabilitiesChecked: 339,
      osvAvailable: true,
    },
  });
  assert.equal(runs.length, 2);
  assert.equal(runs.find((run) => run.analyzerId === 'builtin:sast')?.state, 'completed');
  assert.equal(runs.find((run) => run.analyzerId === 'osv')?.itemsAnalyzed, 339);
});
