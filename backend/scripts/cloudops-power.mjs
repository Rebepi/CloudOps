import { spawn, spawnSync } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(scriptDir, '..');
const repoRoot = path.resolve(backendDir, '..');
const frontendDir = path.join(repoRoot, 'frontend');
const logsDir = path.join(backendDir, 'logs');
const pidFile = path.join(logsDir, 'cloudops-pids.json');
const tokenFile = path.join(repoRoot, '.cloudflare-token');

const API_PORT = 27902;
const WEB_PORT = 29000;
const TUNNEL_PORT = 29001;

const isWindows = process.platform === 'win32';

function log(message) {
  console.log(`[cloudops] ${message}`);
}

function ensureLogs() {
  mkdirSync(logsDir, { recursive: true });
}

function readPids() {
  if (!existsSync(pidFile)) return {};
  try {
    return JSON.parse(readFileSync(pidFile, 'utf8'));
  } catch {
    return {};
  }
}

function writePids(pids) {
  ensureLogs();
  writeFileSync(pidFile, `${JSON.stringify(pids, null, 2)}\n`);
}

function run(command, args, options = {}) {
  return spawnSync(command, args, { encoding: 'utf8', ...options });
}

function compose(args) {
  return run('docker', ['compose', ...args], { cwd: repoRoot, stdio: 'inherit' });
}

function portOpen(port, host = '127.0.0.1', timeout = 800) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const done = (value) => {
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(timeout);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
    socket.connect(port, host);
  });
}

async function waitFor(check, { timeoutMs = 60000, intervalMs = 700, label = 'servicio' } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return true;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  log(`tiempo agotado esperando ${label}`);
  return false;
}

async function httpOk(url, timeoutMs = 3000) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    return response.ok;
  } catch {
    return false;
  }
}

function postgresHostPort() {
  const result = run('docker', ['compose', 'port', 'postgres', '5432'], { cwd: repoRoot });
  if (result.status !== 0) return null;
  const line = `${result.stdout ?? ''}`.trim().split(/\r?\n/).pop();
  if (!line) return null;
  const match = line.match(/:(\d+)$/);
  return match ? Number(match[1]) : null;
}

function spawnDetached(command, args, cwd, logFile) {
  const out = openSync(logFile, 'a');
  const err = openSync(logFile, 'a');
  const child = spawn(command, args, {
    cwd,
    detached: !isWindows,
    windowsHide: true,
    stdio: ['ignore', out, err],
    shell: isWindows,
  });
  closeSync(out);
  closeSync(err);
  child.unref();
  return child.pid;
}

function killTree(pid) {
  if (!pid) return false;
  if (isWindows) {
    const result = run('taskkill', ['/PID', String(pid), '/T', '/F']);
    return result.status === 0;
  }
  try {
    process.kill(-pid, 'SIGTERM');
    return true;
  } catch {
    return false;
  }
}

function listenerPids(port) {
  if (!isWindows) {
    const result = run('lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN']);
    return `${result.stdout ?? ''}`.split(/\s+/).filter(Boolean).map(Number);
  }
  const result = run('netstat', ['-ano', '-p', 'TCP']);
  const pids = new Set();
  for (const line of `${result.stdout ?? ''}`.split(/\r?\n/)) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 5 || parts[3] !== 'LISTENING') continue;
    if (!parts[1].endsWith(`:${port}`)) continue;
    const pid = Number(parts[4]);
    if (pid > 0) pids.add(pid);
  }
  return [...pids];
}

function findCloudflared() {
  const result = run('cloudflared', ['--version'], { stdio: 'ignore' });
  if (result.status === 0) return 'cloudflared';
  const candidates = [
    'C:\\Program Files\\cloudflared\\cloudflared.exe',
    'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe',
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function missingEnv() {
  const missing = [];
  if (!existsSync(path.join(repoRoot, '.env'))) missing.push(path.join(repoRoot, '.env'));
  if (!existsSync(path.join(backendDir, '.env'))) missing.push(path.join(backendDir, '.env'));
  return missing;
}

async function start() {
  ensureLogs();

  const missing = missingEnv();
  if (missing.length > 0) {
    log('archivos de entorno ausentes:');
    for (const file of missing) log(`  ${file}`);
    log('copia los ejemplos y define POSTGRES_PASSWORD, DATABASE_URL, AWS_PROFILE y JWT_SECRET');
    process.exitCode = 1;
    return;
  }

  const pids = readPids();

  compose(['up', '-d', 'postgres']);
  const pgPort = postgresHostPort();
  if (pgPort) {
    const ready = await waitFor(() => portOpen(pgPort), { timeoutMs: 60000, label: 'PostgreSQL' });
    log(ready ? `PostgreSQL listo en 127.0.0.1:${pgPort}` : `PostgreSQL no responde en 127.0.0.1:${pgPort}`);
  } else {
    log('no se pudo determinar el puerto publicado de PostgreSQL');
  }

  if (await httpOk(`http://127.0.0.1:${API_PORT}/api/v1/health`)) {
    log(`API ya activa en ${API_PORT}`);
  } else {
    pids.backend = spawnDetached('npm', ['run', 'dev'], backendDir, path.join(logsDir, 'cloudops-backend.log'));
    log(`API iniciada (pid ${pids.backend}), log: backend/logs/cloudops-backend.log`);
  }

  const apiReady = await waitFor(() => httpOk(`http://127.0.0.1:${API_PORT}/api/v1/health`), {
    timeoutMs: 60000,
    label: 'API',
  });

  if (await portOpen(WEB_PORT)) {
    log(`interfaz ya activa en ${WEB_PORT}`);
  } else {
    pids.frontend = spawnDetached('npm', ['run', 'dev'], frontendDir, path.join(logsDir, 'cloudops-frontend.log'));
    log(`interfaz iniciada (pid ${pids.frontend}), log: backend/logs/cloudops-frontend.log`);
  }

  const webReady = await waitFor(() => portOpen(WEB_PORT), { timeoutMs: 60000, label: 'interfaz' });

  if (existsSync(tokenFile)) {
    const binary = findCloudflared();
    if (!binary) {
      log('tunnel omitido: cloudflared no esta instalado');
    } else if (await portOpen(TUNNEL_PORT)) {
      log(`tunnel ya activo en ${TUNNEL_PORT}`);
    } else {
      const token = readFileSync(tokenFile, 'utf8').trim();
      pids.tunnel = spawnDetached(binary, ['tunnel', 'run', '--token', token], repoRoot, path.join(logsDir, 'cloudops-tunnel.log'));
      log(`tunnel iniciado (pid ${pids.tunnel}), log: backend/logs/cloudops-tunnel.log`);
      await waitFor(() => portOpen(TUNNEL_PORT), { timeoutMs: 30000, label: 'tunnel' });
    }
  } else {
    log('tunnel omitido: falta .cloudflare-token en la raiz del repositorio');
  }

  writePids(pids);

  log('');
  log(`interfaz: http://127.0.0.1:${WEB_PORT} ${webReady ? 'ok' : 'sin respuesta'}`);
  log(`API:     http://127.0.0.1:${API_PORT}/api/v1/health ${apiReady ? 'ok' : 'sin respuesta'}`);
  if (!apiReady || !webReady) process.exitCode = 1;
}

async function stop() {
  const pids = readPids();
  const stopped = new Set();
  for (const name of ['tunnel', 'frontend', 'backend']) {
    if (pids[name]) {
      const ok = killTree(pids[name]);
      stopped.add(pids[name]);
      log(`${name}: ${ok ? 'detenido' : 'no se encontro el proceso'} (pid ${pids[name]})`);
    } else {
      log(`${name}: sin proceso registrado`);
    }
  }
  for (const port of [TUNNEL_PORT, WEB_PORT, API_PORT]) {
    for (const pid of listenerPids(port)) {
      if (stopped.has(pid)) continue;
      if (killTree(pid)) {
        stopped.add(pid);
        log(`puerto ${port}: proceso ${pid} detenido`);
      }
    }
  }
  if (existsSync(pidFile)) rmSync(pidFile);
  log('PostgreSQL sigue disponible');
}

async function status() {
  const apiOk = await httpOk(`http://127.0.0.1:${API_PORT}/api/v1/health`);
  const webOk = await portOpen(WEB_PORT);
  const tunnelOk = await portOpen(TUNNEL_PORT);
  const pgPort = postgresHostPort();
  const pgOk = pgPort ? await portOpen(pgPort) : false;
  log(`API: ${apiOk ? 'ok' : 'caida'} (${API_PORT})`);
  log(`interfaz: ${webOk ? 'ok' : 'caida'} (${WEB_PORT})`);
  log(`PostgreSQL: ${pgOk ? 'ok' : 'caido'} ${pgPort ? `(${pgPort})` : ''}`);
  log(`tunnel: ${tunnelOk ? 'ok' : 'inactivo'} (${TUNNEL_PORT})`);
  if (!apiOk || !webOk) process.exitCode = 1;
}

const action = process.argv[2] ?? 'status';
const actions = { start, stop, status };
if (!actions[action]) {
  log(`uso: cloudops-power.mjs [start|stop|status]`);
  process.exitCode = 2;
} else {
  await actions[action]();
}
