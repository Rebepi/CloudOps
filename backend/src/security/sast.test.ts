import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { getSastCatalog, mergeSastFindings, parseSastReport, scanSast } from './sast.js';
import { SAST_CATALOG_VERSION, SAST_RULES, sourceContext } from './sastCatalog.js';
import { buildAnalyzerRuns, computeDimensionBreakdown } from './dimensions.js';
import { analyzeTextFile } from '../zipSecurityScanner.js';

test('catálogo y pack local tienen los mismos identificadores y checksum', async () => {
  const pack = await readFile(new URL('../../security-rules/sast-v1.yaml', import.meta.url), 'utf8');
  const ids = [...pack.matchAll(/^\s+- id: (.+)$/gm)].map((match) => match[1]!.trim()).sort();
  assert.deepEqual(ids, SAST_RULES.map((rule) => rule.id).sort());
  const catalog = await getSastCatalog();
  assert.equal(catalog.version, SAST_CATALOG_VERSION);
  assert.match(catalog.sha256, /^[a-f0-9]{64}$/);
});

test('normalización SAST solo acepta reglas y archivos conocidos y descarta código', () => {
  const files = new Map([['hashed.py', { path: 'backend/app.py', language: 'python' }]]);
  const parsed = parseSastReport({ version: '1.182.0', paths: { scanned: ['/src/hashed.py'] }, errors: [], results: [
    { check_id: 'cloudops.python.sql-taint', path: '/src/hashed.py', start: { line: 3 }, extra: { lines: 'source-secret-should-not-persist', metavars: { source: 'source-secret-should-not-persist' } } },
    { check_id: 'untrusted-rule', path: '/src/hashed.py', start: { line: 4 } },
    { check_id: 'cloudops.python.sql-taint', path: '/outside/not-staged.py', start: { line: 3 } },
  ] }, files);
  assert.equal(parsed.findings.length, 1);
  assert.equal(parsed.errors, 2);
  assert.equal(parsed.findings[0]!.resource, 'backend/app.py');
  assert.equal(parsed.findings[0]!.evidence.cwe, 'CWE-89');
  assert.equal(JSON.stringify(parsed.findings).includes('source-secret-should-not-persist'), false);
});

test('staging plano mantiene rutas originales y se elimina al terminar', async () => {
  let staged = '';
  const result = await scanSast([{ path: 'backend/../../untrusted-name.py', text: 'print(1)' }], { enabled: true, run: async (_args, context) => {
    staged = context.stageDirectory;
    const files = await readdir(staged);
    assert.equal(files.length, 1);
    assert.match(files[0]!, /^[a-f0-9]{64}\.py$/);
    assert.equal(await readFile(join(staged, files[0]!), 'utf8'), 'print(1)');
    return JSON.stringify({ paths: { scanned: [`/src/${files[0]}`] }, results: [], errors: [] });
  } });
  assert.equal(result.state, 'completed');
  assert.equal(result.filesAnalyzed, 1);
  const dimensions = computeDimensionBreakdown({ assessmentType: 'code', findings: [], summary: { sast: result } });
  assert.equal(dimensions.find((dimension) => dimension.id === 'identity')!.score, null);
  await assert.rejects(access(staged));
});

test('pruebas y migraciones se excluyen sin ejecutar la herramienta', async () => {
  const result = await scanSast([{ path: 'backend/tests/test_api.py', text: 'eval(x)' }, { path: 'backend/alembic/versions/001.py', text: 'query(x)' }],
    { enabled: true, run: async () => { throw new Error('No debe ejecutarse'); } });
  assert.equal(result.state, 'skipped');
  assert.equal(result.filesExcluded, 2);
  assert.equal(sourceContext('interaction-tests/example.ts'), 'test');
  const empty = await scanSast([{ path: 'backend/__init__.py', text: '' }], { enabled: true, run: async () => { throw new Error('No debe ejecutarse'); } });
  assert.equal(empty.filesExcluded, 1);
  assert.equal(empty.state, 'skipped');
});

test('lenguajes no soportados y fuentes fuera de límite no se aprueban', async () => {
  const unsupported = await scanSast([{ path: 'backend/app.java', text: 'class App {}' }], { enabled: true });
  assert.equal(unsupported.state, 'not_supported');
  const large = await scanSast([{ path: 'backend/app.py', text: 'x'.repeat(2 * 1024 * 1024 + 1) }], { enabled: true });
  assert.equal(large.state, 'skipped');
  assert.equal(large.filesSkipped, 1);
  const dimensions = computeDimensionBreakdown({ assessmentType: 'code', findings: [], summary: { sast: unsupported } });
  assert.equal(dimensions.find((dimension) => dimension.id === 'application')!.score, null);
});

test('fallos del analizador conservan estado fallido y limpian staging', async () => {
  let staged = '';
  const result = await scanSast([{ path: 'backend/app.py', text: 'print(1)' }], { enabled: true, run: async (_args, context) => {
    staged = context.stageDirectory;
    throw new Error('raw-source-secret');
  } });
  assert.equal(result.state, 'failed');
  assert.equal(JSON.stringify(result).includes('raw-source-secret'), false);
  await assert.rejects(access(staged));
});

test('errores de parsing y cobertura incompleta quedan parciales', async () => {
  const result = await scanSast([{ path: 'backend/app.py', text: 'broken syntax' }], { enabled: true,
    run: async () => JSON.stringify({ paths: { scanned: [] }, results: [], errors: [{ type: 'ParseError', message: 'source-not-retained' }] }) });
  assert.equal(result.state, 'partial');
  assert.equal(result.filesAnalyzed, 0);
  assert.equal(JSON.stringify(result).includes('source-not-retained'), false);
});

test('corroboración Semgrep conserva procedencia y no penaliza dos veces la misma consulta', () => {
  const builtin = analyzeTextFile('backend/app.py', 'cursor.execute(f"SELECT * FROM users WHERE name={name}")');
  const parsed = parseSastReport({ paths: { scanned: ['hash.py'] }, errors: [], results: [
    { check_id: 'cloudops.python.sql-taint', path: 'hash.py', start: { line: 1 } },
  ] }, new Map([['hash.py', { path: 'backend/app.py', language: 'python' }]]));
  const merged = mergeSastFindings(builtin, parsed.findings);
  assert.equal(merged.length, 1);
  assert.equal((merged[0]!.evidence.observations as unknown[]).length, 2);
  const summary = { coverageMatrix: [{ id: 'source-code', label: 'Reglas internas', status: 'measured', files: 1, detail: 'Analizado' }],
    sast: { state: 'completed', filesCandidate: 1, filesAnalyzed: 1, languages: [] } };
  const dimensions = computeDimensionBreakdown({ assessmentType: 'code', findings: merged, summary });
  assert.equal(dimensions.find((dimension) => dimension.id === 'application')!.counts.HIGH, 1);
  const runs = buildAnalyzerRuns({ assessmentType: 'code', findings: merged, summary });
  assert.equal(runs.find((run) => run.analyzerId === 'builtin:source-code')!.findingsCount, 1);
  assert.equal(runs.find((run) => run.analyzerId === 'semgrep:sast')!.findingsCount, 1);
});
