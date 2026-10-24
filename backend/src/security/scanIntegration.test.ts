import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scanZipSecurity } from '../zipSecurityScanner.js';
import { buildAnalyzerRuns } from './dimensions.js';

function crc32(data: Buffer) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

async function archive(t: TestContext, files: Record<string, string>) {
  const parent = join(tmpdir(), 'opencode');
  await mkdir(parent, { recursive: true });
  const directory = await mkdtemp(join(parent, 'cloudops-scan-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [path, text] of Object.entries(files)) {
    const name = Buffer.from(path);
    const data = Buffer.from(text);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50);
    header.writeUInt16LE(20, 4);
    header.writeUInt32LE(crc32(data), 14);
    header.writeUInt32LE(data.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(name.length, 26);
    locals.push(header, name, data);
    const index = Buffer.alloc(46);
    index.writeUInt32LE(0x02014b50);
    index.writeUInt16LE(20, 4);
    index.writeUInt16LE(20, 6);
    index.writeUInt32LE(crc32(data), 16);
    index.writeUInt32LE(data.length, 20);
    index.writeUInt32LE(data.length, 24);
    index.writeUInt16LE(name.length, 28);
    index.writeUInt32LE(offset, 42);
    central.push(index, name);
    offset += header.length + name.length + data.length;
  }
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(Buffer.concat(central).length, 12);
  end.writeUInt32LE(offset, 16);
  const path = join(directory, 'source.zip');
  await writeFile(path, Buffer.concat([...locals, ...central, end]));
  return path;
}

test('ZIP con archivos omitidos por texto no declara cobertura completa', async (t) => {
  const path = await archive(t, { 'backend/app.py': 'eval(userInput)' });
  const evaluation = await scanZipSecurity(path, { maxTextBytes: 0, lookupVulnerabilities: false });
  assert.equal(evaluation.summary.filesAnalyzed, 0);
  assert.equal(evaluation.summary.filesSkippedByTextLimit, 1);
  assert.equal(evaluation.coverage, 0);
  assert.ok(evaluation.summary.scanLimits.includes('zip-text-limit'));
  assert.equal(evaluation.summary.coverageMatrix.find((domain) => domain.id === 'source-code')!.status, 'partial');
  const runs = buildAnalyzerRuns({ assessmentType: 'code', ...evaluation });
  assert.equal(runs.find((run) => run.analyzerId === 'builtin:source-code')!.state, 'skipped');
});

test('escaneo real conserva coincidencias OSV sin detalle y registra tiempos de reglas', async (t) => {
  const path = await archive(t, { 'backend/requirements.txt': 'package==1.0.0', 'backend/app.py': 'eval(userInput)' });
  t.mock.method(globalThis, 'fetch', async (url: string) => String(url).includes('/vulns/') ? new Response('{}', { status: 404 })
    : new Response(JSON.stringify({ results: [{ vulns: [{ id: 'GHSA-observed' }] }] })));
  const evaluation = await scanZipSecurity(path);
  assert.equal(evaluation.summary.osvState, 'partial');
  assert.equal(evaluation.summary.vulnerabilitiesChecked, 1);
  assert.equal(evaluation.findings.find((finding) => finding.source === 'osv')!.evidence.severityEstimated, true);
  const runs = buildAnalyzerRuns({ assessmentType: 'code', ...evaluation });
  assert.equal(runs.find((run) => run.analyzerId === 'osv')!.state, 'partial');
  assert.equal(typeof runs.find((run) => run.analyzerId === 'osv')!.durationMs, 'number');
  assert.equal(typeof runs.find((run) => run.analyzerId === 'builtin:source-code')!.durationMs, 'number');
});

test('el límite de hallazgos estáticos reduce cobertura aunque continúe el inventario ZIP', async (t) => {
  const text = 'password = "root-credential-value"\neval(userInput)\nos.system(userInput)\npickle.loads(data)\nverify = False';
  const files = Object.fromEntries(Array.from({ length: 101 }, (_, index) => [`backend/module-${index}.py`, text]));
  const path = await archive(t, files);
  const evaluation = await scanZipSecurity(path, { lookupVulnerabilities: false });
  assert.equal(evaluation.summary.filesAnalyzed, 101);
  assert.equal(evaluation.findings.length, 500);
  assert.ok(evaluation.summary.scanLimits.includes('static-finding-limit'));
  assert.equal(evaluation.summary.coverageMatrix.find((domain) => domain.id === 'source-code')!.status, 'partial');
});
