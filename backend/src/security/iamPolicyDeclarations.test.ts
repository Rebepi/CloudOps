import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectIamDeclarations } from './iamPolicyDeclarations.js';
import { mergeIacFindings, scanIac, type IacSource } from './iac.js';
import { analyzeTextFile } from '../zipSecurityScanner.js';

const source = (statement: unknown): IacSource => ({ path: 'infra/policy.json', kind: 'iam-policy', text: JSON.stringify({ Version: '2012-10-17', Statement: statement }) });

test('IAM literal Allow global se reporta sin copiar valores de configuración', () => {
  const result = inspectIamDeclarations([source([{ Effect: 'Allow', Action: ['*'], Resource: ['*'] }])]);
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0]!.evidence.policyOrigin, 'cloudops-literal-iam');
  assert.equal(result.findings[0]!.evidence.deployment, 'not-verified');
  assert.equal(result.conclusiveStandaloneFiles.length, 1);
});

test('Deny y recursos acotados no se confunden con una concesión global Allow', () => {
  for (const statement of [[{ Effect: 'Deny', Action: ['*'], Resource: ['*'] }],
    [{ Effect: 'Allow', Action: ['s3:GetObject'], Resource: ['arn:aws:s3:::example/private/*'] }]]) {
    const result = inspectIamDeclarations([source(statement)]);
    assert.equal(result.findings.length, 0);
    assert.equal(result.successes, 1);
  }
});

test('condiciones, complementos y efectos calculados mantienen alcance no resuelto', () => {
  const result = inspectIamDeclarations([source([{ Effect: 'Allow', NotAction: ['iam:*'], Resource: '*', Condition: { StringEquals: { token: 'sensitive-condition-not-stored' } } }])]);
  assert.ok(result.unresolved.length > 0);
  assert.equal(JSON.stringify(result).includes('sensitive-condition-not-stored'), false);
  assert.equal(inspectIamDeclarations([source([{ Effect: { Ref: 'Unknown' }, Action: '*' }])]).findings.length, 0);
});

test('YAML literal y políticas de confianza se reconocen sin ejecutar tags', () => {
  const yaml: IacSource = { path: 'infra/template.yaml', kind: 'cloudformation', text: 'Resources:\n  Role:\n    Type: AWS::IAM::Role\n    Properties:\n      AssumeRolePolicyDocument:\n        Statement:\n          - Effect: Allow\n            Action: sts:AssumeRole\n            Principal:\n              AWS: "*"' };
  assert.equal(inspectIamDeclarations([yaml]).findings.length, 1);
  const unresolved = inspectIamDeclarations([{ ...yaml, text: yaml.text!.replace('sts:AssumeRole', '!Ref Action') }]);
  assert.ok(unresolved.unresolved.length > 0);
  assert.equal(unresolved.findings.length, 0);
});

test('perfiles de documentos IAM no invocan Trivy para fabricar una medición', async () => {
  const result = await scanIac([source([{ Effect: 'Allow', Action: '*', Resource: '*' }])], { enabled: true, run: async () => { throw new Error('Must not execute'); } });
  assert.equal(result.state, 'completed');
  assert.equal(result.engine.vendorInvoked, false);
  assert.equal(result.targetsAnalyzed, 1);
  assert.equal(result.findings[0]!.source, 'cloudops');
});

test('IAM calculado en HCL no se acredita como semántica completamente verificada', () => {
  const result = inspectIamDeclarations([{ path: 'infra/main.tf', kind: 'terraform', text: 'resource "aws_iam_policy" "example" { policy = jsonencode({}) }' }]);
  assert.equal(result.unresolved.length, 1);
});

test('heurística IAM queda contextual cuando el documento literal concluyente la sustituye', () => {
  const doc: IacSource = { path: 'infra/policy.yaml', kind: 'iam-policy', text: 'Statement:\n  - Effect: Deny\n    Action: "*"\n    Resource: "*"' };
  const native = analyzeTextFile(doc.path, doc.text!);
  assert.ok(native.length > 0);
  const semantic = inspectIamDeclarations([doc]);
  const merged = mergeIacFindings(native, semantic.findings, semantic.conclusiveStandaloneFiles);
  assert.ok(merged.every((finding) => finding.evidence.scoreExcluded === true));
  assert.ok(merged.every((finding) => finding.severity === 'INFORMATIONAL'));
});
