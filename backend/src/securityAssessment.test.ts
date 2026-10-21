import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateAwsSecurity, type AwsSecuritySnapshot } from './securityAssessment.js';

const secureSnapshot: AwsSecuritySnapshot = {
  accountSummary: { AccountMFAEnabled: 1, AccountAccessKeysPresent: 0 },
  identities: [{ name: 'auditor', mfa: true }],
  roles: [{ name: 'CloudOpsSecurityAudit' }],
  trails: [{ name: 'organization-trail', isLogging: true }],
  findings: [],
  findingsError: null,
  config: {
    recorders: [{ name: 'default', recording: true, lastStatus: 'SUCCESS' }],
    rules: [{ name: 'encrypted-volumes', complianceType: 'COMPLIANT', nonCompliantResources: 0, capExceeded: false }],
    truncated: false,
  },
  configError: null,
  inspector: {
    coverage: [{ resourceId: 'i-123', resourceType: 'AWS_EC2_INSTANCE', scanType: 'PACKAGE', statusCode: 'ACTIVE' }],
    findings: [],
    truncated: false,
  },
  inspectorError: null,
  s3: { buckets: [{ name: 'private-assets', blockPublicAccess: true, publicPolicy: false }], truncated: false },
  s3Error: null,
  network: { securityGroups: [{ id: 'sg-private', name: 'private', publicIngress: [] }] },
  networkError: null,
  rds: { instances: [{ id: 'db-private', publiclyAccessible: false, storageEncrypted: true, deletionProtection: true, multiAz: true }], truncated: false },
  rdsError: null,
};

test('returns full coverage and a clean score when observed controls pass', () => {
  const result = evaluateAwsSecurity(secureSnapshot);
  assert.equal(result.score, 100);
  assert.equal(result.coverage, 100);
  assert.equal(result.confidence, 'high');
  assert.deepEqual(result.findings, []);
});

test('normalizes account, IAM, logging and Security Hub findings', () => {
  const result = evaluateAwsSecurity({
    ...secureSnapshot,
    accountSummary: { AccountMFAEnabled: 0 },
    identities: [{ name: 'legacy-user', mfa: false }],
    trails: [],
    findings: [{ id: 'finding-1', title: 'Bucket público', severity: 'CRITICAL', status: 'NEW' }],
  });
  assert.equal(result.coverage, 100);
  assert.equal(result.findings.length, 4);
  assert.equal(result.summary.counts.CRITICAL, 1);
  assert.equal(result.summary.counts.HIGH, 2);
  assert.equal(result.summary.counts.MEDIUM, 1);
  assert.equal(result.score, 45);
});

test('reports partial coverage when Security Hub is unavailable', () => {
  const result = evaluateAwsSecurity({ ...secureSnapshot, findingsError: 'not enabled' });
  assert.equal(result.coverage, 91);
  assert.equal(result.confidence, 'medium');
  assert.equal(result.summary.securityHubAvailable, false);
});

test('normalizes AWS Config and Amazon Inspector findings', () => {
  const result = evaluateAwsSecurity({
    ...secureSnapshot,
    config: {
      recorders: [],
      rules: [{ name: 's3-public-read-prohibited', complianceType: 'NON_COMPLIANT', nonCompliantResources: 2, capExceeded: false }],
      truncated: false,
    },
    inspector: {
      coverage: [{ resourceId: 'i-risk', resourceType: 'AWS_EC2_INSTANCE', scanType: 'PACKAGE', statusCode: 'INACTIVE', statusReason: 'NO_INVENTORY' }],
      findings: [{ id: 'finding-2', title: 'CVE de prueba', description: 'Paquete afectado', severity: 'CRITICAL', status: 'ACTIVE', resource: 'i-risk', inspectorScore: 9.8, fixAvailable: 'YES' }],
      truncated: false,
    },
  });
  assert.equal(result.coverage, 100);
  assert.equal(result.findings.length, 4);
  assert.equal(result.findings.some((finding) => finding.source === 'aws-config'), true);
  assert.equal(result.findings.some((finding) => finding.source === 'amazon-inspector'), true);
  assert.equal(result.summary.inspectorCoveredResources, 1);
});

test('treats a root access key as a critical account finding', () => {
  const result = evaluateAwsSecurity({
    ...secureSnapshot,
    accountSummary: { AccountMFAEnabled: 1, AccountAccessKeysPresent: 1 },
  });
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0]?.externalId, 'cloudops:root-access-key');
  assert.equal(result.findings[0]?.severity, 'CRITICAL');
  assert.equal(result.score, 45);
});

test('evalúa exposición real de S3, Security Groups y RDS', () => {
  const result = evaluateAwsSecurity({
    ...secureSnapshot,
    s3: { buckets: [{ name: 'public-data', blockPublicAccess: false, publicPolicy: true }], truncated: false },
    network: { securityGroups: [{ id: 'sg-open', name: 'open-admin', publicIngress: [{ cidr: '0.0.0.0/0', protocol: 'tcp', fromPort: 22, toPort: 22 }] }] },
    rds: { instances: [{ id: 'db-risk', publiclyAccessible: true, storageEncrypted: false, deletionProtection: false, multiAz: false }], truncated: false },
  });
  assert.equal(result.coverage, 100);
  assert.equal(result.findings.some((finding) => finding.externalId.startsWith('cloudops:s3-public-policy')), true);
  assert.equal(result.findings.some((finding) => finding.externalId.startsWith('cloudops:security-group-public-admin')), true);
  assert.equal(result.findings.some((finding) => finding.externalId.startsWith('cloudops:rds-public')), true);
  assert.equal(result.findings.some((finding) => finding.externalId.startsWith('cloudops:rds-unencrypted')), true);
  assert.equal(result.score, 45);
});
