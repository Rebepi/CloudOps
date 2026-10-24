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
}
