import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyAwsPrincipal, connectionStatusFor, normalizeSecurityHubV2Finding } from './aws.js';

test('classifyAwsPrincipal reconoce root, usuarios y sesiones asumidas', () => {
  assert.equal(classifyAwsPrincipal('arn:aws:iam::123456789012:root'), 'root');
  assert.equal(classifyAwsPrincipal('arn:aws:iam::123456789012:user/auditor'), 'iam-user');
  assert.equal(classifyAwsPrincipal('arn:aws:iam::123456789012:role/CloudOpsAuditRole'), 'iam-role');
  assert.equal(classifyAwsPrincipal('arn:aws:sts::123456789012:assumed-role/CloudOpsAuditRole/cloudops-audit'), 'assumed-role');
  assert.equal(classifyAwsPrincipal('invalid'), 'unknown');
});

test('connectionStatusFor bloquea root por defecto', () => {
  const status = connectionStatusFor({
    account: '123456789012',
    arn: 'arn:aws:iam::123456789012:root',
    userId: '123456789012',
    profile: 'legacy-root',
    roleArn: null,
  });

  assert.equal(status.principalType, 'root');
  assert.equal(status.readyForAssessment, false);
  assert.equal(status.checks.find((check) => check.id === 'non-root')?.status, 'failed');
});

test('connectionStatusFor acepta una sesión de rol temporal', () => {
  const status = connectionStatusFor({
    account: '123456789012',
    arn: 'arn:aws:sts::123456789012:assumed-role/CloudOpsAuditRole/cloudops-audit',
    userId: 'AROAXAMPLE:cloudops-audit',
    profile: 'cloudops-source',
    roleArn: 'arn:aws:iam::123456789012:role/CloudOpsAuditRole',
  });

  assert.equal(status.principalType, 'assumed-role');
  assert.equal(status.roleActive, true);
  assert.equal(status.readyForAssessment, true);
  assert.equal(status.checks.find((check) => check.id === 'assume-role')?.status, 'passed');
});

test('connectionStatusFor no permite credenciales permanentes de un usuario IAM', () => {
  const status = connectionStatusFor({
    account: '123456789012',
    arn: 'arn:aws:iam::123456789012:user/cloudops-source',
    userId: 'AIDAEXAMPLE',
    profile: 'cloudops-source',
    roleArn: null,
  });

  assert.equal(status.principalType, 'iam-user');
  assert.equal(status.readyForAssessment, false);
  assert.equal(status.checks.find((check) => check.id === 'assume-role')?.status, 'failed');
});

test('normalizeSecurityHubV2Finding convierte un documento OCSF al formato interno', () => {
  assert.deepEqual(normalizeSecurityHubV2Finding({
    finding_info: { uid: 'finding-1', title: 'Acceso público', desc: 'El recurso permite acceso público.' },
    severity: 'High',
    status: 'New',
    resources: [{ uid: 'arn:aws:s3:::example' }],
  }), {
    id: 'finding-1',
    title: 'Acceso público',
    description: 'El recurso permite acceso público.',
    severity: 'HIGH',
    status: 'NEW',
    resource: 'arn:aws:s3:::example',
  });
});
