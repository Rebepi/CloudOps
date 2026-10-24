import assert from 'node:assert/strict';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { scanRepositorySecrets } from '../src/security/repositorySecrets.js';
import { executeDockerTool, GITLEAKS_IMAGE } from '../src/security/toolProcess.js';

// Ephemeral test material: no real account tokens and no source/secret logging.
const value = randomBytes(24).toString('base64url');
const privateKey = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } }).privateKey;
const result = await scanRepositorySecrets([
  { path: 'backend/config.env', text: `CLOUDOPS_API_KEY="${value}"\n` },
  { path: 'backend/database.conf', text: `DATABASE_URL=postgresql://user:${value}@database/app\n` },
  { path: 'tests/fixtures/config.env', text: `CLOUDOPS_API_KEY="${value}"\n` },
  { path: 'tests/fixtures/id_rsa', text: privateKey },
], { enabled: true, mode: 'docker', run: async (args, context) => {
  const report = await executeDockerTool(GITLEAKS_IMAGE, args, context.timeoutMs, { kind: 'gitleaks', mounts: [
    { source: context.stageDirectory, target: '/src' }, { source: context.rulesDirectory, target: '/rules' },
  ] });
  assert.equal(report.includes(value), false, 'The engine report must be redacted.');
  assert.equal(report.includes(privateKey.split('\n')[1]!), false, 'Private material must be redacted upstream.');
  return report;
} });
console.log(JSON.stringify({ analyzer: 'gitleaks', state: result.state, files: result.filesAnalyzed, detections: result.detections,
  findings: result.findings.map((finding) => ({ source: finding.source, rule: finding.evidence.ruleId, severity: finding.severity, context: finding.evidence.context,
    excluded: finding.evidence.scoreExcluded, location: finding.resource })), reason: result.reason }));
assert.equal(result.state, 'completed');
assert.ok(result.findings.some((finding) => finding.resource === 'backend/config.env' && finding.severity === 'HIGH'));
assert.ok(result.findings.some((finding) => finding.resource === 'backend/database.conf' && finding.severity === 'HIGH'));
assert.ok(result.findings.some((finding) => finding.resource === 'tests/fixtures/config.env' && finding.evidence.scoreExcluded === true));
assert.ok(result.findings.some((finding) => finding.resource === 'tests/fixtures/id_rsa' && finding.severity === 'CRITICAL'));
assert.equal(JSON.stringify(result).includes(value), false);
assert.equal(JSON.stringify(result).includes(privateKey.split('\n')[1]!), false);
const safe = await scanRepositorySecrets([{ path: 'backend/safe.env', text: 'API_KEY=changeme\nSECRET_KEY=${SECRET_KEY}\nPASSWORD=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n' }], { enabled: true, mode: 'docker' });
console.log(JSON.stringify({ analyzer: 'gitleaks-safe', state: safe.state, findings: safe.findings.length }));
assert.equal(safe.state, 'completed');
assert.equal(safe.findings.length, 0);
const encodedValue = Buffer.from(`CLOUDOPS_API_KEY="${value}"`).toString('base64');
const encoded = await scanRepositorySecrets([{ path: 'backend/encoded.txt', text: encodedValue }], { enabled: true, mode: 'docker' });
console.log(JSON.stringify({ analyzer: 'gitleaks-encoded', state: encoded.state, findings: encoded.findings.length }));
assert.equal(encoded.state, 'completed');
assert.ok(encoded.findings.some((finding) => finding.severity === 'HIGH'));
assert.equal(JSON.stringify(encoded).includes(value), false);
assert.equal(JSON.stringify(encoded).includes(encodedValue), false);
