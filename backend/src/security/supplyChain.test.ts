import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSbom, inspectImages, inspectManifest, inventoryIssues, packageUrl, sbomChecksum, serializeSbom } from './supplyChain.js';
import { parseDependencies, type CodeFinding } from '../zipSecurityScanner.js';
import { mergeAssessments } from '../fullAssessment.js';

test('CycloneDX conserva versiones distintas, PURL y ocurrencias de manifiestos', () => {
  const dependencies = [
    { ecosystem: 'npm' as const, name: '@scope/package', version: '1.0.0', manifest: 'backend/package-lock.json' },
    { ecosystem: 'npm' as const, name: '@scope/package', version: '1.0.0', manifest: 'frontend/package-lock.json' },
    { ecosystem: 'npm' as const, name: '@scope/package', version: '2.0.0', manifest: 'frontend/package-lock.json' },
  ];
  const bom = buildSbom(dependencies, [], [], [], true);
  assert.equal(bom.bomFormat, 'CycloneDX');
  assert.equal(bom.specVersion, '1.6');
  assert.match(bom.serialNumber, /^urn:uuid:/);
  assert.equal(bom.components.length, 2);
  assert.equal(bom.components[0]!['bom-ref'], 'pkg:npm/%40scope/package@1.0.0');
  assert.equal(bom.components[0]!.properties!.length, 2);
  assert.equal(packageUrl({ ecosystem: 'PyPI', name: 'Some_Package.Name', version: '1.0.0' }), 'pkg:pypi/some-package-name@1.0.0');
});

test('licencias e integridad provienen del lockfile; no se inventan metadatos ausentes', () => {
  const integrity = `sha512-${Buffer.alloc(64, 1).toString('base64')}`;
  const dependencies = parseDependencies('package-lock.json', JSON.stringify({ packages: { '': {}, 'node_modules/example': { version: '1.2.3', license: 'MIT', integrity } } }));
  const bom = buildSbom(dependencies, [], [], [], true);
  assert.equal(bom.components[0]!.licenses![0]!.license.name, 'MIT');
  assert.equal(bom.components[0]!.hashes![0]!.content, Buffer.alloc(64, 1).toString('hex'));
  assert.equal(bom.components[0]!.hashes![0]!.alg, 'SHA-512');
  const unknown = buildSbom([{ ...dependencies[0]!, licenses: undefined, integrity: 'sha512-invalid' }], [], [], [], true);
  assert.equal(unknown.components[0]!.licenses, undefined);
  assert.equal(unknown.components[0]!.hashes, undefined);
});

test('un aviso conserva todas las versiones afectadas con referencias válidas', () => {
  const dependencies = ['1.0.0', '2.0.0'].map((version) => ({ ecosystem: 'npm' as const, name: 'example', version, manifest: 'package-lock.json' }));
  const findings: CodeFinding[] = dependencies.map((dependency) => ({ externalId: `GHSA-test:${dependency.version}`, source: 'osv', category: 'dependency', title: 'GHSA-test',
    description: 'Vulnerabilidad observada', severity: 'HIGH', status: 'open', resource: dependency.manifest, recommendation: 'Actualizar.',
    evidence: { advisory: 'GHSA-test', advisoryUrl: 'https://osv.dev/vulnerability/GHSA-test', ecosystem: dependency.ecosystem, package: dependency.name, version: dependency.version } }));
  const bom = buildSbom(dependencies, [], [], findings, true);
  assert.equal(bom.vulnerabilities.length, 1);
  assert.equal(bom.vulnerabilities[0]!.affects.length, 2);
  for (const affected of bom.vulnerabilities[0]!.affects) assert.ok(bom.components.some((component) => component['bom-ref'] === affected.ref));
  assert.equal('dependencies' in bom, false); // No fabricated dependency graph.
});

test('checksum canónico resiste el reordenamiento de claves de JSONB', () => {
  const bom = buildSbom([], [], [], [], false);
  const reordered = { vulnerabilities: bom.vulnerabilities, components: bom.components, metadata: bom.metadata,
    version: bom.version, serialNumber: bom.serialNumber, specVersion: bom.specVersion, bomFormat: bom.bomFormat };
  assert.equal(serializeSbom(bom), serializeSbom(reordered));
  assert.equal(sbomChecksum(bom).length, 64);
  const base = { score: 100, coverage: 100, confidence: 'high', findings: [], summary: {} };
  assert.equal(mergeAssessments(base, { ...base, sbom: bom }).sbom, bom);
});

test('rangos declarados con lockfile válido no se confunden con versiones resueltas flotantes', () => {
  const manifest = 'frontend/package.json';
  const issues = inspectManifest(manifest, JSON.stringify({ dependencies: { react: '^19.0.0' } }));
  assert.ok(issues.some((issue) => issue.kind === 'unpinned-version'));
  assert.equal(inventoryIssues([manifest, 'frontend/package-lock.json'], issues).length, 0);
  assert.equal(inventoryIssues([manifest], issues).length, 2);
  assert.equal(inspectManifest(manifest, '{}').length, 0);
});

test('manifiestos inválidos y requirements sin versión fija quedan explícitos', () => {
  const invalid = inspectManifest('package-lock.json', '{invalid');
  assert.equal(invalid[0]!.kind, 'invalid-manifest');
  const issues = inspectManifest('requirements.txt', 'Django>=5\nrequests==2.0.0\nexample[extra]==1.2.3\n');
  assert.equal(issues.length, 1);
  assert.equal(parseDependencies('requirements.txt', 'example[extra]==1.2.3')[0]!.name, 'example');
  const partiallyInvalid = '{"packages":{"node_modules/broken":null,"node_modules/valid":{"version":"1.0.0"}}}';
  assert.equal(parseDependencies('package-lock.json', partiallyInvalid).length, 1);
  assert.ok(inspectManifest('package-lock.json', partiallyInvalid).some((issue) => issue.kind === 'unresolved-component'));
});

test('npm lock v1 conserva dependencias anidadas y versiones simultáneas', () => {
  const dependencies = parseDependencies('package-lock.json', JSON.stringify({ dependencies: { example: { version: '2.0.0',
    dependencies: { example: { version: '1.0.0' } } } } }));
  assert.deepEqual(dependencies.map((dependency) => dependency.version).sort(), ['1.0.0', '2.0.0']);
});

test('imágenes Docker no ejecutan instrucciones y distinguen etapas, variables y digest', () => {
  const digest = 'a'.repeat(64);
  const images = inspectImages('Dockerfile', `FROM node:22 AS build\nRUN echo never-executed\nFROM build AS test\nFROM registry/app@sha256:${digest}\n`);
  assert.equal(images.length, 2);
  assert.equal(images[0]!.pinned, false);
  assert.equal(images[1]!.pinned, true);
  assert.equal(inspectImages('compose.yml', 'services:\n  api:\n    image: ${REGISTRY}/app:latest')[0]!.reference, '${REGISTRY}/app:latest');
});
