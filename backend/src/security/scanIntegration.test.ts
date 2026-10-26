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

test('un ZIP genera SBOM descargable lógico y conserva imágenes omitidas como cobertura parcial', async (t) => {
  const path = await archive(t, {
    'frontend/package.json': '{"dependencies":{"example":"^1.0.0"}}',
    'frontend/package-lock.json': '{"packages":{"node_modules/example":{"version":"1.2.0","license":"MIT"}}}',
    Dockerfile: 'FROM node:22',
  });
  const evaluation = await scanZipSecurity(path, { lookupVulnerabilities: false });
  assert.equal(evaluation.sbom.bomFormat, 'CycloneDX');
  assert.equal(evaluation.sbom.components.length, 2);
  assert.equal(evaluation.summary.supplyChain.sha256.length, 64);
  assert.equal(evaluation.summary.supplyChain.issues.length, 0);
  assert.equal(evaluation.summary.supplyChain.trivy.state, 'skipped');
  assert.equal(evaluation.summary.supplyChain.inventoryComplete, false);
});

test('lockfile inválido no se convierte en inventario completo ni en versiones inventadas', async (t) => {
  const path = await archive(t, { 'package.json': '{"dependencies":{"example":"*"}}', 'package-lock.json': '{invalid' });
  const evaluation = await scanZipSecurity(path, { lookupVulnerabilities: false });
  assert.equal(evaluation.sbom.components.length, 0);
  assert.equal(evaluation.summary.supplyChain.inventoryComplete, false);
  assert.ok(evaluation.summary.supplyChain.issues.some((issue) => issue.kind === 'invalid-manifest'));
});

test('adaptador Trivy integrado aporta paquetes y avisos al SBOM sin persistir secretos', async (t) => {
  const path = await archive(t, { Dockerfile: 'FROM registry/app:1' });
  const evaluation = await scanZipSecurity(path, { lookupVulnerabilities: false, imageScan: { enabled: true, run: async () => JSON.stringify({ Results: [{
    Target: 'image', Packages: [{ Name: 'example', Version: '1.0.0', Identifier: { PURL: 'pkg:npm/example@1.0.0' } }],
    Vulnerabilities: [{ VulnerabilityID: 'CVE-2026-12345', PkgName: 'example', InstalledVersion: '1.0.0', Severity: 'HIGH', PkgIdentifier: { PURL: 'pkg:npm/example@1.0.0' } }],
    Secrets: [{ RuleID: 'token', Title: 'Token', Severity: 'HIGH', Match: 'value-that-must-be-discarded' }],
  }] }) } });
  assert.equal(evaluation.summary.supplyChain.trivy.state, 'completed');
  assert.equal(evaluation.sbom.vulnerabilities[0]!.id, 'CVE-2026-12345');
  assert.equal(evaluation.sbom.components.length, 2);
  assert.equal(JSON.stringify(evaluation).includes('value-that-must-be-discarded'), false);
});

test('un inventario excesivo se limita sin declarar el SBOM completo', async (t) => {
  const packages = Object.fromEntries(Array.from({ length: 10_001 }, (_, index) => [`node_modules/package-${index}`, { version: '1.0.0' }]));
  const path = await archive(t, { 'package-lock.json': JSON.stringify({ packages }) });
  const evaluation = await scanZipSecurity(path, { lookupVulnerabilities: false });
  assert.equal(evaluation.summary.dependencyCount, 10_000);
  assert.equal(evaluation.sbom.components.length, 10_000);
  assert.equal(evaluation.summary.supplyChain.inventoryComplete, false);
  assert.ok(evaluation.summary.scanLimits.includes('dependency-inventory-limit'));
});

test('Gitleaks integrado recibe archivos sensibles sin extensión y conserva solo evidencia redactada', async (t) => {
  const path = await archive(t, { 'backend/id_rsa': 'unit test key content', 'backend/server.pem': 'unit test PEM content', 'backend/config.env': 'API_KEY=changeme' });
  const evaluation = await scanZipSecurity(path, { lookupVulnerabilities: false, secretScan: { enabled: true, run: async (_args, context) => {
    const { readdir } = await import('node:fs/promises');
    const files = await readdir(context.stageDirectory);
    return JSON.stringify([{ RuleID: 'private-key', File: files.find((file) => file.endsWith('.txt')), StartLine: 1, EndLine: 1,
      StartColumn: 1, EndColumn: 20, Secret: 'sensitive-source-value', Match: 'sensitive-source-value', Entropy: 5 }]);
  } } });
  assert.equal(evaluation.summary.secrets.state, 'completed');
  assert.equal(evaluation.summary.secrets.filesCandidate, 3);
  assert.ok(evaluation.findings.some((finding) => finding.source === 'gitleaks' && finding.severity === 'CRITICAL'));
  assert.equal(JSON.stringify(evaluation).includes('sensitive-source-value'), false);
  assert.ok(buildAnalyzerRuns({ assessmentType: 'code', ...evaluation }).some((run) => run.analyzerId === 'gitleaks:repository'));
});

test('una plantilla .env con placeholders no se marca como archivo con credenciales', async (t) => {
  const path = await archive(t, { '.env.example': 'API_KEY=${API_KEY}\nPASSWORD=changeme' });
  const evaluation = await scanZipSecurity(path, { lookupVulnerabilities: false });
  assert.equal(evaluation.summary.filesAnalyzed, 1);
  assert.equal(evaluation.findings.some((finding) => finding.category === 'secret'), false);
  const productionPath = await archive(t, { '.env.production': 'API_KEY="synthetic-production-value"' });
  const production = await scanZipSecurity(productionPath, { lookupVulnerabilities: false });
  assert.equal(production.summary.filesAnalyzed, 1);
  assert.equal(production.summary.secrets.filesCandidate, 1);
  assert.ok(production.findings.some((finding) => finding.severity === 'CRITICAL'));
});

test('IaC integrado conserva ubicación, procedencia y una sola penalización corroborada', async (t) => {
  const path = await archive(t, { 'infra/main.tf': 'resource "aws_security_group" "open" {\n cidr_blocks = ["0.0.0.0/0"]\n}' });
  const evaluation = await scanZipSecurity(path, { lookupVulnerabilities: false, iacScan: { enabled: true, run: async () => JSON.stringify({ Results: [{
    Target: '/src/infra', Type: 'terraform', MisconfSummary: { Successes: 1, Failures: 1, Exceptions: 0 }, Misconfigurations: [{
      ID: 'AVD-AWS-0107', Status: 'FAIL', Severity: 'HIGH', Title: 'Unrestricted ingress', CauseMetadata: { StartLine: 2, EndLine: 2,
        Code: { Lines: [{ Filename: 'infra/main.tf', Content: 'configuration-value-not-persisted' }] } },
    }],
  }] }) } });
  assert.equal(evaluation.summary.iac.state, 'completed');
  const finding = evaluation.findings.find((finding) => finding.source === 'trivy-config')!;
  assert.equal(finding.evidence.deployment, 'not-verified');
  assert.equal(evaluation.findings.filter((finding) => finding.severity === 'HIGH').length, 1);
  assert.equal((finding.evidence.observations as unknown[]).length, 2);
  assert.equal(JSON.stringify(evaluation).includes('configuration-value-not-persisted'), false);
  assert.ok(buildAnalyzerRuns({ assessmentType: 'code', ...evaluation }).some((run) => run.analyzerId === 'trivy:iac'));
});

test('Compose observado no se acredita como control Trivy config evaluado', async (t) => {
  const path = await archive(t, { 'compose.yaml': 'services:\n  app:\n    image: alpine:latest\n    privileged: true' });
  const evaluation = await scanZipSecurity(path, { lookupVulnerabilities: false, iacScan: { enabled: true } });
  assert.equal(evaluation.summary.iac.state, 'not_supported');
  assert.equal(evaluation.summary.iac.targetsAnalyzed, 0);
});
