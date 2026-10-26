import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { detectIacKind, mergeIacFindings, parseIacReport, safeIacPath, scanIac, type IacSource } from './iac.js';
import { analyzeTextFile } from '../zipSecurityScanner.js';

const source: IacSource = { path: 'infra/main.tf', kind: 'terraform', text: 'resource "aws_security_group" "open" {}' };
const failed = { ID: 'AVD-AWS-0107', Status: 'FAIL', Severity: 'HIGH', Title: 'Unrestricted ingress', Message: 'sensitive-message-discarded',
  PrimaryURL: 'https://avd.aquasec.com/misconfig/aws-0107', References: ['https://docs.aws.amazon.com/securityhub/latest/userguide/ec2-controls.html#ec2-13'],
  CauseMetadata: { Resource: 'aws_security_group.open', StartLine: 1, EndLine: 3, Code: { Lines: [{ Filename: 'infra/main.tf', Content: 'sensitive-code-discarded' }] } } };
const report = { Results: [{ Target: '/src/infra', Type: 'terraform', MisconfSummary: { Successes: 1, Failures: 1, Exceptions: 0 },
  Misconfigurations: [failed, { ID: 'AWS-0026', Status: 'PASS' }] }] };

test('clasifica Terraform, CloudFormation, Kubernetes, Docker e IAM sin ejecutar contenido', () => {
  assert.equal(detectIacKind('main.tf'), 'terraform');
  assert.equal(detectIacKind('variables.auto.tfvars.json'), 'terraform');
  assert.equal(detectIacKind('bucket.yaml', 'Resources:\n  Bucket:\n    Type: AWS::S3::Bucket'), 'cloudformation');
  assert.equal(detectIacKind('pod.yaml', 'apiVersion: v1\nkind: Pod'), 'kubernetes');
  assert.equal(detectIacKind('Dockerfile.production'), 'dockerfile');
  assert.equal(detectIacKind('policy.json', '{"Statement":[]}'), 'iam-policy');
  assert.equal(detectIacKind('compose.yaml'), 'compose');
  assert.equal(detectIacKind('Chart.yaml'), 'helm');
  assert.equal(detectIacKind('package.json', '{"dependencies":{}}'), null);
});

test('materialización rechaza traversal, ADS, nombres reservados y rutas ambiguas', async () => {
  for (const path of ['../main.tf', '/main.tf', 'C:/main.tf', 'folder/name:stream.tf', 'CON.tf', 'folder./main.tf']) assert.equal(safeIacPath(path), false, path);
  assert.equal(safeIacPath('infra/modules/storage/main.tf'), true);
  const result = await scanIac([source, { ...source, path: 'INFRA/main.tf' }], { enabled: true, run: async () => { throw new Error('Must not execute'); } });
  assert.equal(result.state, 'skipped');
  assert.equal(result.filesSubmitted, 0);
});

test('normalización omite código/mensajes y distingue referencias de cumplimiento', () => {
  const parsed = parseIacReport(report, [source], 'C:/temporary/input');
  assert.equal(parsed.findings.length, 1);
  const finding = parsed.findings[0]!;
  assert.equal(finding.resource, 'infra/main.tf');
  assert.equal(finding.evidence.policyId, 'AWS-0107');
  assert.equal(finding.evidence.deployment, 'not-verified');
  assert.equal((finding.evidence.frameworkReferences as { control: string }[])[0]!.control, 'EC2.13');
  assert.equal(JSON.stringify(parsed).includes('sensitive-message-discarded'), false);
  assert.equal(JSON.stringify(parsed).includes('sensitive-code-discarded'), false);
});

test('preserva árbol local de módulos, deshabilita updates y limpia staging', async () => {
  let stage = '';
  const sources: IacSource[] = [{ ...source, text: 'module "storage" { source = "./modules/storage" }' },
    { path: 'infra/modules/storage/main.tf', kind: 'terraform', text: 'resource "aws_ebs_volume" "data" { encrypted = true }' }];
  const result = await scanIac(sources, { enabled: true, run: async (args, context) => {
    stage = context.stageDirectory;
    assert.ok(args.includes('--skip-check-update'));
    assert.ok(args.includes('--disable-telemetry'));
    assert.equal(args[args.indexOf('--ignorefile') + 1], '');
    assert.equal(args[args.indexOf('--config') + 1], '');
    assert.equal((await readFile(join(stage, 'infra/modules/storage/main.tf'), 'utf8')).includes('encrypted = true'), true);
    return JSON.stringify(report);
  } });
  assert.equal(result.state, 'completed');
  assert.equal(result.filesSubmitted, 2);
  assert.equal(result.unresolved.length, 0);
  await assert.rejects(access(stage));
});

test('módulos externos y supresiones conservan estado parcial sin almacenar URL sensible', async () => {
  const text = 'module "external" { source = "git::https://user:private-value@example.org/module" }\n# trivy:ignore:AWS-0107';
  const result = await scanIac([{ ...source, text }], { enabled: true, run: async () => JSON.stringify(report) });
  assert.equal(result.state, 'partial');
  assert.ok(result.unresolved.length >= 2);
  assert.equal(JSON.stringify(result).includes('user:private-value'), false);
});

test('Compose/Helm no soportados, motor omitido y fallos no se interpretan como limpio', async () => {
  assert.equal((await scanIac([{ path: 'compose.yaml', kind: 'compose', text: 'services: {}' }], { enabled: true })).state, 'not_supported');
  assert.equal((await scanIac([source], null)).state, 'skipped');
  let stage = '';
  const failed = await scanIac([source], { enabled: true, run: async (_args, context) => { stage = context.stageDirectory; throw new Error('raw-value-hidden'); } });
  assert.equal(failed.state, 'failed');
  assert.equal(JSON.stringify(failed).includes('raw-value-hidden'), false);
  await assert.rejects(access(stage));
  const retained = await scanIac([source, { path: 'infra/policy.json', kind: 'iam-policy', text: '{"Statement":[{"Effect":"Allow","Action":"*","Resource":"*"}]}' }],
    { enabled: true, run: async () => { throw new Error('Vendor failed'); } });
  assert.equal(retained.state, 'partial');
  assert.equal(retained.findings[0]!.evidence.policyOrigin, 'cloudops-literal-iam');
});

test('resultados sin evaluación, rutas desconocidas y excepciones no dan un completo ficticio', async () => {
  const empty = await scanIac([source], { enabled: true, run: async () => '{"Results":[]}' });
  assert.equal(empty.state, 'partial');
  const parsed = parseIacReport({ Results: [{ ...report.Results[0], Target: '/outside/unknown' }] }, [source], 'C:/temporary/input');
  assert.equal(parsed.invalid, 1);
  const exceptions = await scanIac([source], { enabled: true, run: async () => JSON.stringify({ Results: [{ ...report.Results[0], MisconfSummary: { Successes: 1, Failures: 0, Exceptions: 1 }, Misconfigurations: [] }] }) });
  assert.equal(exceptions.state, 'partial');
});

test('corrobora solo política/ubicación demostrable y conserva fixtures informativos', () => {
  const native = analyzeTextFile('infra/main.tf', 'cidr_blocks = ["0.0.0.0/0"]');
  const detailed = parseIacReport(report, [source], 'C:/temporary/input').findings;
  const merged = mergeIacFindings(native, detailed, []);
  assert.equal(merged.length, 1);
  assert.equal((merged[0]!.evidence.observations as unknown[]).length, 2);
  const fixture = parseIacReport({ Results: [{ ...report.Results[0], Target: '/src/tests/fixtures/main.tf', Misconfigurations: [{ ...failed, CauseMetadata: { StartLine: 1, EndLine: 1 } }] }] },
    [{ ...source, path: 'tests/fixtures/main.tf' }], 'C:/temporary/input');
  assert.equal(fixture.findings[0]!.evidence.scoreExcluded, true);
});
