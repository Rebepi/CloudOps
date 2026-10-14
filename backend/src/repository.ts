import { createWriteStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export type RepoProvider = 'github' | 'gitlab';

export type RepositorySource = {
  provider: string;
  owner: string;
  name: string;
  ref?: string | null;
};

type DownloadResult = { commit: string | null; resolvedRef: string; bytes: number; sha256: string };

const REDIRECTS = new Set([301, 302, 303, 307, 308]);
const MAX_ARCHIVE_BYTES = 500 * 1024 * 1024;

function projectPath(source: RepositorySource) {
  return `${source.owner}/${source.name}`.replace(/^\/+|\/+$/g, '');
}

function authHeaders(provider: string, token: string): Record<string, string> {
  if (provider === 'gitlab') return token ? { 'PRIVATE-TOKEN': token } : {};
  return token ? { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'CloudOps-Security' } : { 'User-Agent': 'CloudOps-Security' };
}

async function resolveCommit(source: RepositorySource, token: string) {
  if (source.provider === 'gitlab') {
    const url = `https://gitlab.com/api/v4/projects/${encodeURIComponent(projectPath(source))}/repository/commits/${encodeURIComponent(source.ref || 'HEAD')}`;
    const response = await fetch(url, { headers: authHeaders('gitlab', token), signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw new Error(`GitLab respondió HTTP ${response.status} al resolver el commit.`);
    const payload = await response.json() as { id?: string };
    return payload.id ?? null;
  }
  const url = `https://api.github.com/repos/${projectPath(source)}/commits/${encodeURIComponent(source.ref || 'HEAD')}`;
  const response = await fetch(url, { headers: authHeaders('github', token), signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`GitHub respondió HTTP ${response.status} al resolver el commit.`);
  const payload = await response.json() as { sha?: string };
  return payload.sha ?? null;
}

function archiveUrl(source: RepositorySource, ref: string) {
  if (source.provider === 'gitlab') {
    return `https://gitlab.com/api/v4/projects/${encodeURIComponent(projectPath(source))}/repository/archive.zip?sha=${encodeURIComponent(ref)}`;
  }
  return `https://api.github.com/repos/${projectPath(source)}/zipball/${encodeURIComponent(ref)}`;
}

export async function downloadRepositoryArchive(source: RepositorySource, token: string, targetPath: string): Promise<DownloadResult> {
  if (source.provider !== 'github' && source.provider !== 'gitlab') throw new Error('Proveedor de repositorio no admitido.');
  if (!/^[A-Za-z0-9_.-]+$/.test(source.owner) || !/^[A-Za-z0-9_.-]+$/.test(source.name)) throw new Error('Propietario o nombre de repositorio inválido.');
  const commit = await resolveCommit(source, token);
  const ref = commit ?? source.ref ?? 'HEAD';
  let url = archiveUrl(source, ref);
  let response: Response | null = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    response = await fetch(url, { headers: authHeaders(source.provider, token), redirect: 'manual', signal: AbortSignal.timeout(60_000) });
    if (REDIRECTS.has(response.status)) {
      const location = response.headers.get('location');
      if (!location) break;
      url = new URL(location, url).toString();
      continue;
    }
    break;
  }
  if (!response || !response.ok || !response.body) throw new Error(`No se pudo descargar el repositorio (HTTP ${response?.status ?? 'sin respuesta'}).`);
  const hash = createHash('sha256');
  let bytes = 0;
  const meter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      bytes += chunk.length;
      if (bytes > MAX_ARCHIVE_BYTES) {
        callback(new Error(`El repositorio supera el límite de ${Math.round(MAX_ARCHIVE_BYTES / (1024 * 1024))} MB.`));
        return;
      }
      hash.update(chunk);
      callback(null, chunk);
    },
  });
  await pipeline(Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]), meter, createWriteStream(targetPath, { flags: 'wx' }));
  return { commit, resolvedRef: ref, bytes, sha256: hash.digest('hex') };
}

export async function verifyRepository(source: { provider: string; owner: string; name: string; ref?: string | null }, token: string) {
  if (source.provider !== 'github' && source.provider !== 'gitlab') throw new Error('Proveedor de repositorio no admitido.');
  if (!/^[A-Za-z0-9_.-]+$/.test(source.owner) || !/^[A-Za-z0-9_.-]+$/.test(source.name)) throw new Error('Propietario o nombre de repositorio inválido.');

  const path = `${source.owner}/${source.name}`.replace(/^\/+|\/+$/g, '');

  if (source.provider === 'github') {
    const url = `https://api.github.com/repos/${path}`;
    const response = await fetch(url, { headers: authHeaders('github', token), signal: AbortSignal.timeout(15_000) });
    if (!response.ok) {
      if (response.status === 404) throw new Error(`El repositorio "${path}" no fue encontrado en GitHub o es privado.`);
      if (response.status === 401 || response.status === 403) throw new Error(`GitHub denegó el acceso (HTTP ${response.status}). Verifica el token o el límite de solicitudes.`);
      throw new Error(`GitHub respondió con código HTTP ${response.status}.`);
    }
    const data = await response.json() as {
      full_name: string;
      description: string | null;
      default_branch: string;
      private: boolean;
      visibility?: string;
      language?: string;
      updated_at?: string;
    };
    return {
      fullName: data.full_name,
      description: data.description,
      defaultBranch: data.default_branch,
      isPrivate: data.private,
      visibility: data.visibility || (data.private ? 'private' : 'public'),
      language: data.language,
      updatedAt: data.updated_at,
    };
  }

  // GitLab
  const url = `https://gitlab.com/api/v4/projects/${encodeURIComponent(path)}`;
  const response = await fetch(url, { headers: authHeaders('gitlab', token), signal: AbortSignal.timeout(15_000) });
  if (!response.ok) {
    if (response.status === 404) throw new Error(`El repositorio "${path}" no fue encontrado en GitLab.`);
    throw new Error(`GitLab respondió con código HTTP ${response.status}.`);
  }
  const data = await response.json() as {
    path_with_namespace: string;
    description: string | null;
    default_branch: string;
    visibility: string;
    last_activity_at?: string;
  };
  return {
    fullName: data.path_with_namespace,
    description: data.description,
    defaultBranch: data.default_branch,
    isPrivate: data.visibility !== 'public',
    visibility: data.visibility,
    updatedAt: data.last_activity_at,
  };
}

