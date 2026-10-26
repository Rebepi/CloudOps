import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { detectIacKind, scanIac, type IacSource } from '../src/security/iac.js';

for (const variant of ['unsafe', 'safe']) {
  const paths = ['main.tf', 'iam-policy.json', 'modules/storage/main.tf', 'bucket.yaml', 'pod.yaml', 'Dockerfile'];
  const sources: IacSource[] = await Promise.all(paths.map(async (path) => {
    const text = await readFile(new URL(`../tests/fixtures/iac/${variant}/${path}`, import.meta.url), 'utf8');
    return { path: `infra/${path}`, kind: detectIacKind(path, text)!, text };
  }));
  const result = await scanIac(sources, { enabled: true, mode: 'docker' });
  console.log(JSON.stringify({ variant, state: result.state, submitted: result.filesSubmitted, targets: result.targetsAnalyzed, kinds: result.reportedKinds,
    checks: result.checks, unresolved: result.unresolved, reason: result.reason,
    findings: result.findings.length, policyIds: [...new Set(result.findings.map((finding) => finding.evidence.policyId))] }));
  assert.ok(result.state === 'completed' || result.state === 'partial');
  assert.ok(result.targetsAnalyzed > 0);
  if (variant === 'unsafe') for (const kind of ['terraform', 'cloudformation', 'kubernetes', 'dockerfile']) assert.ok(result.findings.some((finding) => finding.evidence.kind === kind), kind);
  if (variant === 'unsafe') {
    for (const id of ['AWS-0107', 'AWS-0026', 'AWS-0092', 'KSV-0017', 'DS-0002', 'CLOUDOPS-IAM-0001']) assert.ok(result.findings.some((finding) => finding.evidence.policyId === id), id);
  } else assert.equal(result.findings.length, 0);
}
const docker = await scanIac([{ path: 'Dockerfile', kind: 'dockerfile', text: await readFile(new URL('../tests/fixtures/iac/safe/Dockerfile', import.meta.url), 'utf8') }], { enabled: true, mode: 'docker' });
assert.equal(docker.state, 'completed');
assert.equal(docker.findings.length, 0);
console.log(JSON.stringify({ variant: 'dockerfile-supported-only', state: docker.state, checks: docker.checks }));
const unsupported = await scanIac([{ path: 'compose.yaml', kind: 'compose', text: 'services: {}' }], { enabled: true });
assert.equal(unsupported.state, 'not_supported');
const ignored = await scanIac([{ path: 'Dockerfile', kind: 'dockerfile', text: 'FROM alpine:3.20.3\n# trivy:ignore:AVD-DS-0002\nUSER root' }], { enabled: true, mode: 'docker' });
assert.equal(ignored.state, 'partial');
console.log(JSON.stringify({ variant: 'source-ignore-not-clean', state: ignored.state, conditions: ignored.unresolved.length }));
