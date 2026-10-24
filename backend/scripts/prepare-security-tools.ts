import { executeDockerTool, executeTool, SEMGREP_IMAGE, TRIVY_IMAGE } from '../src/security/toolProcess.js';

await executeTool('docker', ['pull', SEMGREP_IMAGE], 300_000, 'Descarga Semgrep');
await executeTool('docker', ['pull', TRIVY_IMAGE], 300_000, 'Descarga Trivy');
const semgrep = await executeDockerTool(SEMGREP_IMAGE, ['--version'], 60_000, { kind: 'semgrep' });
const trivy = await executeDockerTool(TRIVY_IMAGE, ['--version'], 60_000, { kind: 'trivy' });
await executeDockerTool(TRIVY_IMAGE, ['--cache-dir', '/cache', 'image', '--download-db-only', '--quiet'], 600_000, { kind: 'trivy' });
console.log(JSON.stringify({ semgrep: semgrep.trim(), trivy: trivy.trim(), images: [SEMGREP_IMAGE, TRIVY_IMAGE], cache: 'cloudops-trivy-cache' }));
