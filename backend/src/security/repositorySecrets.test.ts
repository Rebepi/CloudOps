import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { getSecretCatalog, mergeSecretFindings, parseSecretReport, scanRepositorySecrets } from './repositorySecrets.js';
import { analyzeTextFile } from '../zipSecurityScanner.js';
import { computeDimensionBreakdown } from './dimensions.js';

const detection = { RuleID: 'cloudops-assigned-secret', File: 'hash.env', StartLine: 1, EndLine: 1, StartColumn: 1, EndColumn: 60,
  Entropy: 4.8, Secret: 'raw-secret-must-not-persist', Match: 'raw-match-must-not-persist', Description: 'untrusted-description', Author: 'private-author' };

test('catálogo Gitleaks extiende reglas por defecto y declara sus reglas propias', async () => {
  const catalog = await getSecretCatalog();
  const pack = await readFile(new URL('../../security-rules/gitleaks-v1.toml', import.meta.url), 'utf8');
  assert.equal(catalog.extendsDefault, true);
  assert.match(catalog.sha256, /^[a-f0-9]{64}$/);
  for (const id of catalog.customRules) assert.ok(pack.includes(`id = "${id}"`));
  assert.equal(catalog.redaction, '100%');
});

test('normalización conserva ubicación y entropía, nunca Match, Secret ni metadatos personales', () => {
  const result = parseSecretReport([detection], new Map([['hash.env', 'backend/config.env']]));
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0]!.resource, 'backend/config.env');
  assert.equal(result.findings[0]!.evidence.entropy, 4.8);
  assert.equal(result.findings[0]!.evidence.ownerSuggested, 'Equipo backend');
  for (const secret of [detection.Secret, detection.Match, detection.Description, detection.Author]) assert.equal(JSON.stringify(result).includes(secret), false);
});

test('contexto genérico de pruebas/plantillas no oculta claves privadas ni credenciales en migraciones', () => {
  const files = new Map([['fixture.env', 'tests/fixtures/config.env'], ['template.env', '.env.example'], ['key.txt', 'tests/fixtures/id_rsa'], ['migration.env', 'backend/migrations/config.env'],
    ['pipeline.yml', '.github/workflows/security_test.yml'], ['environment.env', 'backend/config.test.env']]);
  const result = parseSecretReport([
    { ...detection, File: 'fixture.env' }, { ...detection, File: 'template.env' },
    { ...detection, File: 'key.txt', RuleID: 'private-key' }, { ...detection, File: 'migration.env' },
    { ...detection, File: 'pipeline.yml' }, { ...detection, File: 'environment.env' },
  ], files);
  assert.equal(result.findings.find((finding) => finding.resource === 'tests/fixtures/config.env')!.evidence.scoreExcluded, true);
  assert.equal(result.findings.find((finding) => finding.resource === '.env.example')!.severity, 'INFORMATIONAL');
  assert.equal(result.findings.find((finding) => finding.resource === 'tests/fixtures/id_rsa')!.severity, 'CRITICAL');
  assert.equal(result.findings.find((finding) => finding.resource === 'backend/migrations/config.env')!.severity, 'HIGH');
  assert.equal(result.findings.find((finding) => finding.resource === '.github/workflows/security_test.yml')!.severity, 'HIGH');
  assert.equal(result.findings.find((finding) => finding.resource === 'backend/config.test.env')!.severity, 'HIGH');
});

test('coincidencias genéricas solapadas se corroboran sin fusionar columnas distintas', () => {
  const result = parseSecretReport([
    { ...detection, RuleID: 'github-pat', StartColumn: 20, EndColumn: 50 },
    detection,
    { ...detection, StartColumn: 80, EndColumn: 120 },
  ], new Map([['hash.env', 'backend/config.env']]));
  assert.equal(result.detections, 3);
  assert.equal(result.findings.length, 2);
  assert.equal((result.findings[0]!.evidence.observations as unknown[]).length, 2);
});

test('reglas/archivos inválidos no se convierten en resultados limpios', () => {
  const result = parseSecretReport([{ ...detection, File: 'unknown.env' }, { ...detection, StartLine: 0 }, { ...detection, RuleID: 'bad:rule' }], new Map([['hash.env', 'backend/config.env']]));
  assert.equal(result.invalid, 3);
  assert.equal(result.findings.length, 0);
  assert.throws(() => parseSecretReport({}, new Map()));
  const capped = parseSecretReport(Array.from({ length: 501 }, (_, index) => ({ ...detection, StartLine: index + 1, EndLine: index + 1 })), new Map([['hash.env', 'backend/config.env']]));
  assert.equal(capped.findings.length, 500);
  assert.equal(capped.limited, true);
});

test('staging plano, argumentos de redacción/allow y limpieza se preservan', async () => {
  let stage = '';
  const result = await scanRepositorySecrets([{ path: 'backend/config.env', text: 'test input' }], { enabled: true, run: async (args, context) => {
    stage = context.stageDirectory;
    assert.ok(args.includes('--redact=100'));
    assert.ok(args.includes('--ignore-gitleaks-allow'));
    assert.equal(args[args.indexOf('--report-path') + 1], '-');
    const files = await readdir(stage);
    assert.match(files[0]!, /^[a-f0-9]{64}\.env$/);
    assert.equal(await readFile(join(stage, files[0]!), 'utf8'), 'test input');
    return JSON.stringify([{ ...detection, File: files[0] }]);
  } });
  assert.equal(result.state, 'completed');
  assert.equal(result.filesAnalyzed, 1);
  await assert.rejects(access(stage));
});

test('fallo de herramienta no filtra mensajes de proceso ni deja staging', async () => {
  let stage = '';
  const result = await scanRepositorySecrets([{ path: 'config.env', text: 'test input' }], { enabled: true, run: async (_args, context) => {
    stage = context.stageDirectory; throw new Error('raw-secret-from-process');
  } });
  assert.equal(result.state, 'failed');
  assert.equal(result.filesAnalyzed, 0);
  assert.equal(JSON.stringify(result).includes('raw-secret-from-process'), false);
  await assert.rejects(access(stage));
});

test('fuentes fuera de límite, motor deshabilitado o JSON inválido no se aprueban', async () => {
  const skipped = await scanRepositorySecrets([{ path: 'large.txt', text: 'x'.repeat(2 * 1024 * 1024 + 1) }], { enabled: true });
  assert.equal(skipped.state, 'skipped');
  const disabled = await scanRepositorySecrets([{ path: 'config.env', text: 'test' }], null);
  assert.equal(disabled.state, 'skipped');
  const failed = await scanRepositorySecrets([{ path: 'config.env', text: 'test' }], { enabled: true, run: async () => 'invalid-json' });
  assert.equal(failed.state, 'failed');
  const dimensions = computeDimensionBreakdown({ assessmentType: 'code', findings: [], summary: { secrets: failed } });
  assert.equal(dimensions.find((dimension) => dimension.id === 'data')!.score, null);
});

test('corroboración con regex conserva una sola penalización y no oculta exposición nativa', () => {
  const builtin = analyzeTextFile('backend/config.ts', 'const api_key = "synthetic-unit-test-value";');
  const parsed = parseSecretReport([detection], new Map([['hash.env', 'backend/config.ts']]));
  const merged = mergeSecretFindings(builtin, parsed.findings);
  assert.equal(merged.length, 1);
  assert.equal((merged[0]!.evidence.observations as unknown[]).length, 2);
  const ambiguous = parseSecretReport([detection, { ...detection, StartColumn: 80, EndColumn: 120 }], new Map([['hash.env', 'backend/config.ts']]));
  assert.equal(mergeSecretFindings(builtin, ambiguous.findings).length, 3);
  const template = analyzeTextFile('.env.example', 'API_KEY="synthetic-unit-test-value"');
  const templateFinding = parseSecretReport([detection], new Map([['hash.env', '.env.example']]));
  const protectedFindings = mergeSecretFindings(template, templateFinding.findings);
  assert.ok(protectedFindings.some((finding) => finding.severity === 'CRITICAL' && finding.evidence.scoreExcluded !== true));
});
