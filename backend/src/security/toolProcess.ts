import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { StringDecoder } from 'node:string_decoder';

export const SEMGREP_IMAGE = 'semgrep/semgrep@sha256:4a34048c04fef049f71665047f074cffb00cc3d89482f965a5cd151d589237af';
export const TRIVY_IMAGE = 'aquasec/trivy@sha256:790fd66d1697395d8693d1acaa1ea702406a20f109b6fc7bac8db623eca6c06c';

export function executeTool(executable: string, args: string[], timeoutMs: number, label: string, environment?: Record<string, string | undefined>): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], ...(environment ? { env: { ...process.env, ...environment } } : {}) });
    const decoder = new StringDecoder('utf8');
    let output = '';
    let bytes = 0;
    let reason = '';
    const timer = setTimeout(() => { reason = `${label}: presupuesto de ejecución agotado.`; child.kill('SIGKILL'); reject(new Error(reason)); }, timeoutMs);
    child.stdout.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > 20 * 1024 * 1024) {
        reason = `${label}: salida superior a 20 MB.`;
        clearTimeout(timer); child.kill('SIGKILL'); reject(new Error(reason));
      } else output += decoder.write(chunk);
    });
    // Tool stderr can contain source fragments or registry credentials.
    child.stderr.resume();
    child.on('error', (error: NodeJS.ErrnoException) => { clearTimeout(timer); reject(new Error(`${label}: no se pudo ejecutar (${error.code ?? 'error'}).`)); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (reason || code !== 0) reject(new Error(reason || `${label}: proceso terminó con código ${code}.`));
      else resolve(output + decoder.end());
    });
  });
}

export async function executeDockerTool(image: string, args: string[], timeoutMs: number, options: {
  kind: 'semgrep' | 'trivy'; mounts?: { source: string; target: string }[];
}) {
  const name = `cloudops-${options.kind}-${randomUUID()}`;
  const invocation = ['run', '--rm', '--pull', 'never', '--name', name, '--read-only', '--cap-drop', 'ALL',
    '--security-opt', 'no-new-privileges', '--memory', '2g', '--cpus', '2', '--tmpfs', '/tmp:rw,nosuid,size=512m', '-e', 'HOME=/tmp'];
  if (options.kind === 'semgrep') invocation.push('--network', 'none', '-e', 'SEMGREP_SEND_METRICS=off', '-e', 'SEMGREP_ENABLE_VERSION_CHECK=0',
    '-e', 'OTEL_SDK_DISABLED=true', '-e', 'SEMGREP_SETTINGS_FILE=/tmp/semgrep-settings.yml', '-e', 'PYTHONDONTWRITEBYTECODE=1', '--entrypoint', 'semgrep');
  else invocation.push('--mount', 'type=volume,source=cloudops-trivy-cache,target=/cache');
  for (const mount of options.mounts ?? []) {
    if (mount.source.includes(',')) throw new Error('La ruta del analizador contiene un separador no compatible con Docker.');
    invocation.push('--mount', `type=bind,source=${mount.source},target=${mount.target},readonly`);
  }
  try {
    return await executeTool('docker', [...invocation, image, ...args], timeoutMs, options.kind);
  } finally {
    // Killing docker.exe alone does not stop its container. Remove only this job.
    await executeTool('docker', ['rm', '-f', name], 10_000, 'Limpieza del analizador').catch(() => undefined);
  }
}
