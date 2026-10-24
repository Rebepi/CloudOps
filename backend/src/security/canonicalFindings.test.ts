import test from 'node:test';
import assert from 'node:assert/strict';
import { deduplicateSecurityFindings } from './canonicalFindings.js';
import { buildAnalyzerRuns, computeDimensionBreakdown } from './dimensions.js';
import { evaluateAwsSecurity, type AwsSecuritySnapshot } from '../securityAssessment.js';
import { mergeAssessments } from '../fullAssessment.js';

const local = { source: 'cloudops', externalId: 'cloudops:root-access-key', category: 'account',
  title: 'La cuenta root tiene una clave de acceso activa', description: 'IAM', severity: 'CRITICAL', status: 'open',
  resource: null, recommendation: 'Eliminar las claves root.', evidence: { accountId: '143924590537' } };
// Shape observed in the baseline; the finding UUID is intentionally synthetic.
const hub = { ...local, source: 'security-hub', externalId: 'arn:aws:securityhub:us-east-1:143924590537:security-control/IAM.4/finding/example',
  category: 'cloud-posture', title: 'IAM root user access key should not exist', severity: 'HIGH',
  resource: '143924590537', recommendation: 'Remediación AWS.' };

test('deduplica root entre fuentes, conserva mayor severidad y ambas evidencias', () => {
  const [finding] = deduplicateSecurityFindings([hub, local]);
  assert.equal(finding!.source, 'cloudops');
  assert.equal(finding!.severity, 'CRITICAL');
  assert.equal(finding!.recommendation, local.recommendation);
  const evidence = finding!.evidence as Record<string, unknown>;
  assert.equal((evidence.observations as unknown[]).length, 2);
  assert.equal(evidence.canonicalScope, 'aws:143924590537:root-access-key');
});

test('identidad canónica es estable por orden e idempotente', () => {
  const result = deduplicateSecurityFindings([hub, local]);
  assert.deepEqual(result, deduplicateSecurityFindings([local, hub]));
  assert.deepEqual(result, deduplicateSecurityFindings(result));
  assert.deepEqual(result, deduplicateSecurityFindings([...deduplicateSecurityFindings([hub]), ...deduplicateSecurityFindings([local])]));
});

test('no mezcla cuentas, usuarios IAM ni controles distintos', () => {
  const otherAccount = { ...hub, evidence: { accountId: '111111111111' }, resource: 'arn:aws:iam::111111111111:root' };
  assert.equal(deduplicateSecurityFindings([local, otherAccount]).length, 2);
  assert.equal(deduplicateSecurityFindings([local, { ...hub, resource: 'arn:aws:iam::143924590537:user/demo' }]).length, 2);
  assert.equal(deduplicateSecurityFindings([local, { ...hub, externalId: 'IAM.6', title: 'Hardware MFA for root' }]).length, 2);
  assert.equal(deduplicateSecurityFindings([local, { ...hub, evidence: {} }]).length, 2);
});

test('analizadores conservan atribución de ambas fuentes tras deduplicar', () => {
  const findings = deduplicateSecurityFindings([hub, local]);
  const runs = buildAnalyzerRuns({ assessmentType: 'aws-account', findings, summary: { users: 1, securityHubAvailable: true } });
  assert.equal(runs.find((run) => run.analyzerId === 'aws:iam')!.findingsCount, 1);
  assert.equal(runs.find((run) => run.analyzerId === 'aws:security-hub')!.findingsCount, 1);
  const dimensions = computeDimensionBreakdown({ assessmentType: 'aws-account', findings, summary: { securityHubAvailable: true } });
  assert.equal(dimensions.find((dimension) => dimension.id === 'detection')!.controls.find((control) => control.id === 'aws:security-hub')!.state, 'fail');
});

test('evaluación AWS y full puntúan root una sola vez', () => {
  const snapshot: AwsSecuritySnapshot = { accountId: '143924590537', accountSummary: { AccountMFAEnabled: 1, AccountAccessKeysPresent: 1 },
    identities: [], roles: [], trails: [{ isLogging: true }], findings: [{ id: hub.externalId, title: hub.title, severity: hub.severity, resource: hub.resource }],
    findingsError: null, config: null, configError: 'Unavailable', inspector: null, inspectorError: 'Unavailable' };
  const aws = evaluateAwsSecurity(snapshot);
  assert.equal(aws.findings.length, 1);
  assert.equal(aws.summary.deduplicatedFindings, 1);
  const full = mergeAssessments(aws, { score: 100, coverage: 100, confidence: 'high', findings: [], summary: {} });
  assert.equal(full.findings.length, 1);
  assert.equal(full.summary.deduplicatedFindings, 1);
});

function resourceFindings(control: 'RDS.2' | 'RDS.3' | 'S3.8', name: string, region = 'us-east-1') {
  const prefix = { 'RDS.2': 'rds-public', 'RDS.3': 'rds-unencrypted', 'S3.8': 's3-public-block' }[control];
  const resource = control === 'S3.8' ? name : `arn:aws:rds:${region}:143924590537:db:${name}`;
  const cloudops = { ...local, externalId: `cloudops:${prefix}:${name}`, category: 'configuration', resource,
    evidence: { accountId: '143924590537', partition: 'aws', region } };
  const securityHub = { ...hub, externalId: `arn:aws:securityhub:${region}:143924590537:security-control/${control}/finding/${name}`,
    title: control, resource: name, evidence: { accountId: '143924590537', partition: 'aws', region } };
  return { cloudops, securityHub };
}

test('RDS.2 y RDS.3 deduplican nombre y ARN del mismo recurso y conservan su dimensión', () => {
  for (const code of ['RDS.2', 'RDS.3'] as const) {
    const { cloudops, securityHub } = resourceFindings(code, 'orders');
    const findings = deduplicateSecurityFindings([cloudops, securityHub]);
    assert.equal(findings.length, 1);
    assert.equal((findings[0]!.evidence as Record<string, unknown>).canonicalControl, code === 'RDS.2' ? 'rds-public' : 'rds-encryption');
    const preferredHub = deduplicateSecurityFindings([{ ...cloudops, severity: 'HIGH' }, { ...securityHub, severity: 'CRITICAL' }]);
    const dimensions = computeDimensionBreakdown({ assessmentType: 'aws-account', findings: preferredHub, summary: {} });
    assert.equal(dimensions.find((dimension) => dimension.id === (code === 'RDS.2' ? 'configuration' : 'data'))!.counts.CRITICAL, 1);
  }
});

test('RDS no mezcla instancias, regiones, controles ni recursos de cuenta sin instancia', () => {
  const { cloudops, securityHub } = resourceFindings('RDS.3', 'orders');
  const other = resourceFindings('RDS.3', 'payments').securityHub;
  const west = resourceFindings('RDS.3', 'orders', 'us-west-2').securityHub;
  const publicAccess = resourceFindings('RDS.2', 'orders').securityHub;
  for (const finding of [other, west, publicAccess, { ...securityHub, resource: '143924590537' },
    { ...securityHub, resource: 'arn:aws:rds:us-east-1:111111111111:db:orders' },
    { ...securityHub, evidence: { accountId: '143924590537', region: 'us-west-2', partition: 'aws' } }]) {
    assert.equal(deduplicateSecurityFindings([cloudops, finding]).length, 2);
  }
});

test('S3.8 deduplica bucket por nombre o ARN sin confundir buckets ni objetos', () => {
  const { cloudops, securityHub } = resourceFindings('S3.8', 'orders-bucket');
  assert.equal(deduplicateSecurityFindings([cloudops, { ...securityHub, resource: 'arn:aws:s3:::orders-bucket' }]).length, 1);
  for (const resource of ['another-bucket', 'arn:aws:s3:::orders-bucket/file.json', '143924590537']) {
    assert.equal(deduplicateSecurityFindings([cloudops, { ...securityHub, resource }]).length, 2);
  }
  const actualPublicPolicy = { ...cloudops, externalId: 'cloudops:s3-public-policy:orders-bucket' };
  assert.equal(deduplicateSecurityFindings([actualPublicPolicy, securityHub]).length, 2);
});

test('IAM.9 se asocia a MFA root pero IAM.6 de MFA hardware permanece separado', () => {
  const mfa = { ...local, externalId: 'cloudops:root-mfa' };
  const hubMfa = { ...hub, externalId: hub.externalId.replace('IAM.4', 'IAM.9') };
  assert.equal(deduplicateSecurityFindings([mfa, hubMfa]).length, 1);
  assert.equal(deduplicateSecurityFindings([mfa, { ...hubMfa, externalId: hubMfa.externalId.replace('IAM.9', 'IAM.6') }]).length, 2);
});

test('informativos, controles ambiguos y metadatos contradictorios no se fusionan', () => {
  for (const finding of [{ ...hub, severity: 'INFORMATIONAL' }, { ...hub, externalId: hub.externalId.replace('IAM.4', 'IAM.40') },
    { ...hub, externalId: hub.externalId.replace('143924590537', '111111111111') },
    { ...hub, evidence: { accountId: '143924590537', partition: 'aws-us-gov' } }]) {
    assert.equal(deduplicateSecurityFindings([local, finding]).length, 2);
  }
});

test('equivalencias de recursos mantienen idempotencia y ambas fuentes al combinar evaluaciones', () => {
  for (const code of ['RDS.2', 'RDS.3', 'S3.8'] as const) {
    const { cloudops, securityHub } = resourceFindings(code, 'orders-bucket');
    const result = deduplicateSecurityFindings([cloudops, securityHub]);
    assert.deepEqual(result, deduplicateSecurityFindings(result));
    assert.deepEqual(result, deduplicateSecurityFindings([securityHub, cloudops]));
    assert.equal(((result[0]!.evidence as Record<string, unknown>).observations as unknown[]).length, 2);
  }
});

test('evaluación completa conserva recursos y atribución al deduplicar RDS y S3', () => {
  const findings = [resourceFindings('RDS.2', 'orders').securityHub,
    resourceFindings('RDS.3', 'orders').securityHub, resourceFindings('S3.8', 'orders-bucket').securityHub];
  const snapshot: AwsSecuritySnapshot = {
    accountId: '143924590537', partition: 'aws', region: 'us-east-1',
    accountSummary: { AccountMFAEnabled: 1, AccountAccessKeysPresent: 0 }, identities: [], roles: [], trails: [{ isLogging: true }],
    findings: findings.map((finding) => ({ id: finding.externalId, title: finding.title, severity: finding.severity, resource: finding.resource })),
    findingsError: null, config: null, configError: 'Unavailable', inspector: null, inspectorError: 'Unavailable',
    s3: { buckets: [{ name: 'orders-bucket', publicPolicy: false, blockPublicAccess: false }], truncated: false },
    rds: { instances: [{ id: 'orders', arn: 'arn:aws:rds:us-east-1:143924590537:db:orders', publiclyAccessible: true,
      storageEncrypted: false, deletionProtection: false, multiAz: false }], truncated: false },
  };
  const evaluation = evaluateAwsSecurity(snapshot);
  assert.equal(evaluation.findings.length, 3);
  assert.equal(evaluation.summary.deduplicatedFindings, 3);
  const runs = buildAnalyzerRuns({ assessmentType: 'aws-account', ...evaluation });
  assert.equal(runs.find((run) => run.analyzerId === 'aws:rds')!.findingsCount, 2);
  assert.equal(runs.find((run) => run.analyzerId === 'aws:s3')!.findingsCount, 1);
  assert.equal(runs.find((run) => run.analyzerId === 'aws:security-hub')!.findingsCount, 3);
  const dimensions = computeDimensionBreakdown({ assessmentType: 'aws-account', ...evaluation });
  const controls = dimensions.flatMap((dimension) => dimension.controls);
  for (const id of ['aws:rds-public', 'aws:rds-encryption', 'aws:s3-public']) {
    assert.equal(controls.find((control) => control.id === id)!.state, 'fail');
  }
});

test('Config, CloudOps y Security Hub convergen por regla administrada y recurso individual', () => {
  const { cloudops, securityHub } = resourceFindings('RDS.3', 'orders');
  const config = { ...cloudops, source: 'aws-config', category: 'compliance', externalId: 'aws-config:custom-name:AWS::RDS::DBInstance:orders',
    resource: 'orders', evidence: { ...cloudops.evidence, sourceIdentifier: 'RDS_STORAGE_ENCRYPTED', resourceType: 'AWS::RDS::DBInstance' } };
  const result = deduplicateSecurityFindings([cloudops, securityHub, config]);
  assert.equal(result.length, 1);
  assert.equal(((result[0]!.evidence as Record<string, unknown>).observations as unknown[]).length, 3);
  for (const altered of [{ ...config, resource: 'db-opaque-resource-id' },
    { ...config, evidence: { ...config.evidence, sourceIdentifier: 'CUSTOM_RULE' } },
    { ...config, evidence: { ...config.evidence, resourceType: 'AWS::RDS::DBCluster' } },
    { ...config, evidence: { ...cloudops.evidence } }]) {
    assert.equal(deduplicateSecurityFindings([cloudops, altered]).length, 2);
  }
});

test('detalle Config emite hallazgos por recurso sin penalizar también su resumen agregado', () => {
  const snapshot: AwsSecuritySnapshot = { accountId: '143924590537', region: 'us-east-1',
    accountSummary: { AccountMFAEnabled: 1, AccountAccessKeysPresent: 0 }, identities: [], roles: [], trails: [{ isLogging: true }],
    findings: [], findingsError: null, inspector: null, inspectorError: 'Unavailable',
    config: { recorders: [{ recording: true }], truncated: true, rules: [{ name: 'company-rds-rule', complianceType: 'NON_COMPLIANT',
      nonCompliantResources: 2, capExceeded: false, sourceIdentifier: 'RDS_STORAGE_ENCRYPTED', detailsTruncated: true,
      resources: [{ id: 'orders', type: 'AWS::RDS::DBInstance' }] }] }, configError: null };
  const evaluation = evaluateAwsSecurity(snapshot);
  assert.equal(evaluation.findings.filter((finding) => finding.category === 'compliance').length, 1);
  assert.equal(evaluation.findings.filter((finding) => finding.category === 'coverage').length, 1);
  assert.equal(evaluation.summary.configObservedResources, 1);
  assert.equal(evaluation.summary.configTruncated, true);
  assert.equal(evaluation.findings.find((finding) => finding.category === 'compliance')!.resource, 'orders');
});

const inspectorArn = 'arn:aws:inspector2:us-east-1:143924590537:finding/12345678-1234-1234-1234-123456789abc';
const inspectorFinding = { ...local, source: 'amazon-inspector', externalId: inspectorArn, category: 'vulnerability',
  title: 'CVE-2022-34918 - kernel', severity: 'HIGH', resource: 'i-0123456789abcdef0',
  evidence: { accountId: '143924590537', partition: 'aws', region: 'us-east-1' } };
const inspectorCopy = { ...inspectorFinding, source: 'security-hub', category: 'cloud-posture', resource: 'arn:aws:ec2:us-east-1:143924590537:instance/i-0123456789abcdef0' };

test('Inspector y su copia ASFF se fusionan por ARN original y recurso, no por CVE o título', () => {
  const result = deduplicateSecurityFindings([inspectorFinding, inspectorCopy]);
  assert.equal(result.length, 1);
  assert.equal((result[0]!.evidence as Record<string, unknown>).canonicalControl, 'inspector-vulnerability');
  assert.deepEqual(result, deduplicateSecurityFindings(result));
  for (const different of [{ ...inspectorCopy, externalId: inspectorArn.replace('123456789abc', '123456789def') },
    { ...inspectorCopy, resource: 'arn:aws:ec2:us-east-1:143924590537:instance/i-11111111111111111' },
    { ...inspectorCopy, resource: 'arn:aws:ec2:us-west-2:143924590537:instance/i-0123456789abcdef0' }]) {
    assert.equal(deduplicateSecurityFindings([inspectorFinding, different]).length, 2);
  }
});

test('Inspector conserva atribución y control fallido aunque Security Hub sea la fuente principal', () => {
  const findings = deduplicateSecurityFindings([inspectorFinding, inspectorCopy]);
  assert.equal(findings[0]!.source, 'security-hub');
  const summary = { inspectorAvailable: true, inspectorCoveredResources: 1, inspectorStatus: 'ENABLED', securityHubAvailable: true };
  const dimensions = computeDimensionBreakdown({ assessmentType: 'aws-account', findings, summary });
  assert.equal(dimensions.find((dimension) => dimension.id === 'dependencies')!.controls.find((control) => control.id === 'aws:inspector')!.state, 'fail');
  const runs = buildAnalyzerRuns({ assessmentType: 'aws-account', findings, summary });
  assert.equal(runs.find((run) => run.analyzerId === 'aws:inspector')!.findingsCount, 1);
  assert.equal(runs.find((run) => run.analyzerId === 'aws:security-hub')!.findingsCount, 1);
});
