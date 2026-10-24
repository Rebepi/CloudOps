import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTrivyReport, scanImages, type ImageCommandRunner } from './trivyImages.js';
import { buildAnalyzerRuns, computeDimensionBreakdown } from './dimensions.js';

const report = { Metadata: { RepoDigests: [`registry/app@sha256:${'a'.repeat(64)}`] }, Results: [{ Target: 'image (debian)',
  Packages: [{ Name: 'example', Version: '1.0.0', Identifier: { PURL: 'pkg:npm/example@1.0.0' }, Licenses: ['MIT'] }],
  Vulnerabilities: [{ VulnerabilityID: 'CVE-2026-12345', PkgName: 'example', InstalledVersion: '1.0.0', FixedVersion: '1.1.0', Severity: 'HIGH', PkgIdentifier: { PURL: 'pkg:npm/example@1.0.0' } }],
  Secrets: [{ RuleID: 'test-secret', Title: 'Token', Severity: 'CRITICAL', StartLine: 2, Match: 'secret-value-never-persisted', Code: { Lines: ['secret-value-never-persisted'] } }],
  Licenses: [{ Name: 'MIT', PkgName: 'example', Category: 'notice' }],
}] };

test('Trivy conserva vulnerabilidades, licencias y digest, descartando valores secretos', () => {
  const parsed = parseTrivyReport(report, 'registry/app:1');
  assert.equal(parsed.findings.length, 3);
  assert.equal(parsed.findings.find((finding) => finding.category === 'dependency')!.evidence.fixedVersion, '1.1.0');
  assert.equal(parsed.findings.find((finding) => finding.category === 'license')!.severity, 'INFORMATIONAL');
  assert.ok(parsed.components.find((component) => component.name === 'example')!.licenses!.length > 0);
  assert.equal(parsed.components.find((component) => component.type === 'container')!.hashes![0]!.content, 'a'.repeat(64));
  assert.equal(JSON.stringify(parsed).includes('secret-value-never-persisted'), false);
});

test('Trivy deshabilitado queda omitido y no ejecuta el binario', async () => {
  const result = await scanImages([{ reference: 'node:22', manifest: 'Dockerfile', pinned: false }], { enabled: false, run: async () => { throw new Error('No debe ejecutarse'); } });
  assert.equal(result.state, 'skipped');
  assert.equal(result.durationMs, null);
});

test('Trivy recibe argumentos separados, escáneres explícitos y origen remoto', async () => {
  const calls: string[][] = [];
  const run: ImageCommandRunner = async (_binary, args, timeout) => { calls.push(args); assert.ok(timeout <= 120_000); return JSON.stringify(report); };
  const result = await scanImages([{ reference: 'registry/app:1', manifest: 'Dockerfile', pinned: false }], { enabled: true, run });
  assert.equal(result.state, 'completed');
  assert.ok(calls[0]!.includes('vuln,secret,license'));
  assert.equal(calls[0]![calls[0]!.indexOf('--image-src') + 1], 'remote');
  assert.equal(calls[0]![calls[0]!.indexOf('--exit-code') + 1], '0');
  assert.deepEqual(calls[0]!.slice(-2), ['--', 'registry/app:1']);
});

test('variables, argumentos y límite de imágenes no originan ejecuciones arbitrarias', async () => {
  let calls = 0;
  const images = ['--help', '${REGISTRY}/app', 'node:22;whoami', 'https://host/app', 'registry/a:1', 'registry/b:1', 'registry/c:1', 'registry/d:1']
    .map((reference) => ({ reference, manifest: 'compose.yaml', pinned: false }));
  const result = await scanImages(images, { enabled: true, run: async () => { calls++; return JSON.stringify(report); } });
  assert.equal(calls, 3);
  assert.equal(result.state, 'partial');
  assert.equal(result.results.filter((item) => item.state === 'skipped').length, 5);
});

test('salida inválida, herramienta fallida o sin resultados no implican ausencia de riesgos', async () => {
  for (const output of ['invalid-json', '{}', '{"Results":[]}']) {
    const result = await scanImages([{ reference: 'node:22', manifest: 'Dockerfile', pinned: false }], { enabled: true, run: async () => output });
    assert.notEqual(result.state, 'completed');
  }
  assert.throws(() => parseTrivyReport({ Results: [null] }, 'node:22'));
  const result = await scanImages([{ reference: 'node:22', manifest: 'Dockerfile', pinned: false }], { enabled: true, run: async () => { throw new Error('Trivy no disponible'); } });
  assert.equal(result.state, 'failed');
});

test('presupuesto global detiene imágenes adicionales y conserva resultados anteriores', async () => {
  let time = 0;
  const result = await scanImages(['registry/a:1', 'registry/b:1'].map((reference) => ({ reference, manifest: 'Dockerfile', pinned: false })),
    { enabled: true, now: () => time, run: async () => { time += 120_000; return JSON.stringify(report); } });
  assert.equal(result.results[0]!.state, 'completed');
  assert.equal(result.results[1]!.state, 'skipped');
  assert.equal(result.findings.length, 3);
});

test('SBOM no equivale a seguridad aprobada; imágenes omitidas reducen cobertura', () => {
  const summary = { supplyChain: { format: 'CycloneDX', componentCount: 1, inventoryComplete: false,
    images: [{ reference: 'node:22' }], trivy: { state: 'skipped', reason: 'No habilitado', results: [] } } };
  const dimensions = computeDimensionBreakdown({ assessmentType: 'code', findings: [], summary });
  assert.equal(dimensions.find((dimension) => dimension.id === 'dependencies')!.score, null);
  const runs = buildAnalyzerRuns({ assessmentType: 'code', findings: [], summary });
  assert.equal(runs.find((run) => run.analyzerId === 'trivy:images')!.state, 'skipped');
});

test('un ejecutable ausente falla sin exponer mensajes de registro o credenciales', async () => {
  const result = await scanImages([{ reference: 'registry/app:1', manifest: 'Dockerfile', pinned: false }],
    { enabled: true, executable: 'cloudops-trivy-nonexistent-test-command' });
  assert.equal(result.state, 'failed');
  assert.match(result.results[0]!.detail, /ENOENT/);
});

test('severidad desconocida conserva el hallazgo como estimado y vuelve parcial el resultado', () => {
  const result = parseTrivyReport({ Results: [{ Target: 'image', Vulnerabilities: [{ VulnerabilityID: 'CVE-2026-12345', PkgName: 'example', InstalledVersion: '1.0.0', Severity: 'UNKNOWN' }] }] }, 'registry/app:1');
  assert.equal(result.incomplete, true);
  assert.equal(result.findings[0]!.severity, 'MEDIUM');
  assert.equal(result.findings[0]!.evidence.severityEstimated, true);
});
