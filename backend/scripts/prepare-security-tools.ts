import { executeDockerTool, executeTool, SEMGREP_IMAGE, TRIVY_IMAGE, GITLEAKS_IMAGE } from '../src/security/toolProcess.js';

await executeTool('docker', ['pull', SEMGREP_IMAGE], 300_000, 'Descarga Semgrep');
await executeTool('docker', ['pull', TRIVY_IMAGE], 300_000, 'Descarga Trivy');
await executeTool('docker', ['pull', GITLEAKS_IMAGE], 300_000, 'Descarga Gitleaks');
const semgrep = await executeDockerTool(SEMGREP_IMAGE, ['--version'], 60_000, { kind: 'semgrep' });
const trivy = await executeDockerTool(TRIVY_IMAGE, ['--version'], 60_000, { kind: 'trivy' });
const gitleaks = await executeDockerTool(GITLEAKS_IMAGE, ['version'], 60_000, { kind: 'gitleaks' });
await executeDockerTool(TRIVY_IMAGE, ['--cache-dir', '/cache', 'image', '--download-db-only', '--quiet'], 600_000, { kind: 'trivy' });
console.log(JSON.stringify({ semgrep: semgrep.trim(), trivy: trivy.trim(), gitleaks: gitleaks.trim(), images: [SEMGREP_IMAGE, TRIVY_IMAGE, GITLEAKS_IMAGE], cache: 'cloudops-trivy-cache' }));
