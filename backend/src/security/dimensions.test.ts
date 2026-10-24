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
  assert.equal(application.coverage, 50);
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
  assert.equal(dependencies.score, null);
  assert.equal(dependencies.controls[0]?.state, 'partial');
});

test('fuentes fallidas o no registradas nunca producen cobertura completa ni puntaje 100', () => {
  const summary = { securityHubAvailable: false, configAvailable: false, inspectorAvailable: false,
    s3Available: false, networkAvailable: false, rdsAvailable: false };
  for (const dimension of computeDimensionBreakdown({ assessmentType: 'aws-account', findings: [], summary })) {
    assert.equal(dimension.coverage, 0, dimension.id);
    assert.equal(dimension.score, null, dimension.id);
    assert.equal(dimension.state, 'not_measured', dimension.id);
  }
});

test('un hallazgo AWS no marca como fallido un control de código en una evaluación full', () => {
  const result = computeDimensionBreakdown({ assessmentType: 'full',
    findings: [{ source: 'security-hub', category: 'cloud-posture', title: 'S3 public bucket', severity: 'HIGH' }],
    summary: { coverageMatrix: [{ id: 'secrets', label: 'Secretos', status: 'measured', files: 1, detail: 'Revisado' }] } });
  assert.equal(result.find((dimension) => dimension.id === 'data')!.controls.find((control) => control.id === 'code:secrets')!.state, 'pass');
});

test('un hallazgo JWT de código no se atribuye al analizador IAM de AWS', () => {
  const runs = buildAnalyzerRuns({ assessmentType: 'full', summary: { users: 1 }, findings: [
    { source: 'cloudops', category: 'code', title: 'JWT inseguro', externalId: 'cloudops:jwt-signature-disabled:example', severity: 'HIGH' },
  ] });
  assert.equal(runs.find((run) => run.analyzerId === 'aws:iam')!.findingsCount, 0);
});

test('Inspector sin cobertura, truncamientos y errores de S3 no se presentan como aprobados', () => {
  const summary = { inspectorAvailable: true, inspectorCoveredResources: 0, s3Available: true, s3Buckets: 2,
    s3InspectionErrors: 1, securityHubAvailable: true, securityHubTruncated: true };
  const result = computeDimensionBreakdown({ assessmentType: 'aws-account', findings: [], summary });
  assert.equal(result.find((dimension) => dimension.id === 'dependencies')!.score, null);
  assert.equal(result.find((dimension) => dimension.id === 'data')!.controls[0]!.state, 'partial');
  assert.equal(result.find((dimension) => dimension.id === 'detection')!.controls.find((control) => control.id === 'aws:security-hub')!.state, 'partial');
  const runs = buildAnalyzerRuns({ assessmentType: 'aws-account', findings: [], summary });
  assert.equal(runs.find((run) => run.analyzerId === 'aws:inspector')!.state, 'partial');
});

test('OSV fallido no declara todas las dependencias como revisadas', () => {
  const runs = buildAnalyzerRuns({ assessmentType: 'code', findings: [], summary: { dependencyCount: 339, vulnerabilitiesChecked: 0, osvAvailable: false } });
  assert.equal(runs.find((run) => run.analyzerId === 'osv')!.itemsAnalyzed, 0);
});

test('vulnerabilidades OSV marcan el control de dependencias como con hallazgos', () => {
  const result = computeDimensionBreakdown({ assessmentType: 'code',
    findings: [{ source: 'osv', category: 'dependency', title: 'CVE en paquete', severity: 'HIGH' }],
    summary: { coverageMatrix: [{ id: 'dependencies', label: 'Dependencias', status: 'measured', files: 1, detail: 'OSV consultado' }] } });
  assert.equal(result.find((dimension) => dimension.id === 'dependencies')!.controls[0]!.state, 'fail');
});

test('contabiliza hallazgos excluidos en el analizador que los detectó', () => {
  const runs = buildAnalyzerRuns({ assessmentType: 'code', summary: codeSummary,
    findings: [{ source: 'cloudops', category: 'code', title: 'SQL concatenado', severity: 'INFORMATIONAL', evidence: { scoreExcluded: true } }] });
  assert.equal(runs[0]!.findingsCount, 1);
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
