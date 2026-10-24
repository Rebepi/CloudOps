import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { scanSast } from '../src/security/sast.js';
import { SAST_RULES } from '../src/security/sastCatalog.js';
import { scanImages } from '../src/security/trivyImages.js';

const sources = await Promise.all(['py', 'js', 'php', 'ts'].map(async (extension) => ({ path: `backend/application.${extension}`,
  text: await readFile(new URL(`../tests/fixtures/sast/application.${extension}`, import.meta.url), 'utf8') })));
const sast = await scanSast(sources, { enabled: true, mode: 'docker' });
console.log(JSON.stringify({ analyzer: 'semgrep', state: sast.state, filesAnalyzed: sast.filesAnalyzed,
  findings: sast.findings.length, rulesDetected: [...new Set(sast.findings.map((finding) => finding.evidence.ruleId))], languages: sast.languages, reason: sast.reason }));
assert.equal(sast.state, 'completed');
assert.equal(sast.filesAnalyzed, 4);
for (const rule of SAST_RULES) assert.ok(sast.findings.some((finding) => finding.evidence.ruleId === rule.id), rule.id);
const fastapiLine = sources[0]!.text.split(/\r?\n/).findIndex((line) => line.includes('cursor.execute(') && line.includes('+ name')) + 1;
assert.ok(sast.findings.some((finding) => finding.resource === 'backend/application.py' && finding.evidence.line === fastapiLine), 'FastAPI parameter taint');
for (const source of sources) {
  const lines = source.text.split(/\r?\n/);
  for (let start = 0; start < lines.length; start++) {
    if (!/^(?:def|function) safe/.test(lines[start]!)) continue;
    const next = lines.findIndex((line, index) => index > start && /^(?:def|function) /.test(line));
    assert.equal(sast.findings.some((finding) => finding.resource === source.path && Number(finding.evidence.line) > start
      && (next < 0 || Number(finding.evidence.line) <= next)), false, `False positive in ${source.path}:${start + 1}`);
  }
}
const trivy = await scanImages([{ reference: 'alpine:3.20.3', manifest: 'Dockerfile', pinned: false }], { enabled: true, mode: 'docker' });
console.log(JSON.stringify({ analyzer: 'trivy', state: trivy.state, components: trivy.components.length,
  findings: trivy.findings.length, durationMs: trivy.durationMs, results: trivy.results }));
assert.ok(trivy.state === 'completed' || trivy.state === 'partial');
assert.ok(trivy.results.some((result) => result.state === 'completed' || result.state === 'partial'));
assert.ok(trivy.components.length > 0);
await import('./verify-repository-secrets.js');
