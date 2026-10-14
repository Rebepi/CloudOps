import yauzl, { type Entry, type ZipFile } from 'yauzl';
import { createHash } from 'node:crypto';

export type CodeSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFORMATIONAL';

export type CodeFinding = {
  externalId: string;
  source: 'cloudops' | 'osv';
  category: 'archive' | 'secret' | 'code' | 'iac' | 'dependency';
  title: string;
  description: string;
  severity: CodeSeverity;
  status: 'open';
  resource: string | null;
  recommendation: string;
  evidence: Record<string, unknown>;
};

type Dependency = { ecosystem: 'npm' | 'PyPI' | 'Packagist'; name: string; version: string; manifest: string };

export type ZipScanOptions = {
  maxEntries?: number;
  maxUncompressedBytes?: number;
  maxEntryBytes?: number;
  maxTextBytes?: number;
  lookupVulnerabilities?: boolean;
};

const DEFAULTS: Required<ZipScanOptions> = {
  maxEntries: 10_000,
  maxUncompressedBytes: 250 * 1024 * 1024,
  maxEntryBytes: 8 * 1024 * 1024,
  maxTextBytes: 60 * 1024 * 1024,
  lookupVulnerabilities: true,
};

const TEXT_EXTENSIONS = new Set([
  '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.py', '.php', '.java', '.go', '.rb', '.cs', '.sh', '.ps1',
  '.json', '.yaml', '.yml', '.toml', '.ini', '.conf', '.xml', '.properties', '.env', '.tf', '.tfvars', '.sql', '.md', '.txt',
]);

const basename = (value: string) => value.replace(/\\/g, '/').split('/').pop() ?? value;
const extension = (value: string) => {
  const name = basename(value).toLowerCase();
  const index = name.lastIndexOf('.');
  return index >= 0 ? name.slice(index) : '';
};

export function validateArchivePath(fileName: string) {
  const normalized = fileName.replace(/\\/g, '/');
  if (!normalized || normalized.includes('\0') || normalized.startsWith('/') || /^[a-z]:\//i.test(normalized)) return false;
  return !normalized.split('/').some((part) => part === '..');
}

function isTextCandidate(fileName: string) {
  const lower = basename(fileName).toLowerCase();
  return TEXT_EXTENSIONS.has(extension(fileName)) || lower === 'dockerfile' || lower === 'composer.lock' || lower === 'pipfile.lock';
}

function safeLine(value: string) {
  return value.slice(0, 180).replace(/([=:]\s*)[^\s,'"}]{4,}/g, '$1[REDACTADO]');
}

function finding(rule: string, category: CodeFinding['category'], severity: CodeSeverity, title: string, description: string,
  resource: string, line: number | null, recommendation: string): CodeFinding {
  return {
    externalId: `cloudops:${rule}:${createHash('sha1').update(resource).update(String(line ?? 0)).digest('hex').slice(0, 12)}`,
    source: 'cloudops', category, title, description, severity, status: 'open', resource, recommendation,
    evidence: line ? { file: resource, line } : { file: resource },
  };
}

type Rule = {
  id: string;
  category: CodeFinding['category'];
  severity: CodeSeverity;
  title: string;
  pattern: RegExp;
  description: string;
  recommendation: string;
  extensions?: string[];
};

const RULES: Rule[] = [
  { id: 'private-key', category: 'secret', severity: 'CRITICAL', title: 'Clave privada incluida en el ZIP', pattern: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/, description: 'El archivo parece contener material de una clave privada.', recommendation: 'Revocar y rotar la clave; eliminarla del código y usar un gestor de secretos.' },
  { id: 'aws-access-key', category: 'secret', severity: 'CRITICAL', title: 'Identificador de acceso AWS incluido en el código', pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/, description: 'Se detectó el formato de un Access Key ID de AWS.', recommendation: 'Desactivar y rotar la credencial; usar roles IAM y credenciales temporales.' },
  { id: 'database-url', category: 'secret', severity: 'HIGH', title: 'Cadena de conexión con credenciales', pattern: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^\s:@/]+:[^\s@/]+@/i, description: 'Se detectó una URL de base de datos que parece incluir usuario y contraseña.', recommendation: 'Rotar la contraseña y obtener la conexión desde Secrets Manager o variables protegidas.' },
  { id: 'hardcoded-secret', category: 'secret', severity: 'HIGH', title: 'Posible secreto escrito directamente', pattern: /\b(?:password|passwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token)\b\s*[:=]\s*["'][^"'\n]{12,}["']/i, description: 'Se detectó una asignación que parece contener un secreto persistente.', recommendation: 'Validar el hallazgo, rotar el valor real y usar un almacén de secretos.' },
  { id: 'python-eval', category: 'code', severity: 'HIGH', title: 'Ejecución dinámica en Python', pattern: /\b(?:eval|exec)\s*\(/, description: 'eval/exec puede ejecutar entrada no confiable como código.', recommendation: 'Eliminar la ejecución dinámica o aplicar una lista cerrada de operaciones.', extensions: ['.py'] },
  { id: 'python-shell', category: 'code', severity: 'HIGH', title: 'Comando de sistema potencialmente inseguro', pattern: /(?:os\.system\s*\(|shell\s*=\s*True)/, description: 'La construcción de comandos puede permitir inyección del sistema operativo.', recommendation: 'Usar argumentos separados, shell=False y validar entradas.', extensions: ['.py'] },
  { id: 'python-pickle', category: 'code', severity: 'HIGH', title: 'Deserialización insegura con pickle', pattern: /\bpickle\.(?:load|loads)\s*\(/, description: 'pickle puede ejecutar código al deserializar datos manipulados.', recommendation: 'No deserializar pickle no confiable; usar un formato seguro y validado.', extensions: ['.py'] },
  { id: 'tls-disabled', category: 'code', severity: 'HIGH', title: 'Validación TLS deshabilitada', pattern: /(?:verify\s*=\s*False|rejectUnauthorized\s*:\s*false)/i, description: 'La conexión permite certificados no validados.', recommendation: 'Habilitar la verificación TLS y configurar una CA confiable.' },
  { id: 'js-eval', category: 'code', severity: 'HIGH', title: 'Ejecución dinámica en JavaScript', pattern: /\beval\s*\(/, description: 'eval puede ejecutar datos no confiables como código.', recommendation: 'Sustituir eval por parsing y operaciones explícitas.', extensions: ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'] },
  { id: 'react-html', category: 'code', severity: 'MEDIUM', title: 'HTML insertado directamente en React', pattern: /dangerouslySetInnerHTML/, description: 'El componente usa una API que puede habilitar XSS si el contenido no está saneado.', recommendation: 'Sanear el HTML con una biblioteca mantenida o renderizar contenido estructurado.', extensions: ['.jsx', '.tsx'] },
  { id: 'php-exec', category: 'code', severity: 'HIGH', title: 'Ejecución de comandos en PHP', pattern: /\b(?:shell_exec|system|passthru|proc_open|popen)\s*\(/i, description: 'La aplicación invoca comandos del sistema desde PHP.', recommendation: 'Evitar comandos; si son inevitables, usar parámetros cerrados y escapes seguros.', extensions: ['.php'] },
  { id: 'php-eval', category: 'code', severity: 'HIGH', title: 'Ejecución dinámica en PHP', pattern: /\beval\s*\(/i, description: 'eval puede ejecutar datos manipulados como código PHP.', recommendation: 'Eliminar eval y utilizar una implementación explícita.', extensions: ['.php'] },
  { id: 'public-cidr', category: 'iac', severity: 'HIGH', title: 'Acceso de red abierto a Internet', pattern: /(?:cidr_blocks?|CidrIp)\s*[:=]\s*(?:\[\s*)?["']0\.0\.0\.0\/0["']/i, description: 'La infraestructura declara un rango IPv4 abierto a todo Internet.', recommendation: 'Restringir el CIDR a orígenes necesarios y revisar puertos expuestos.', extensions: ['.tf', '.yaml', '.yml', '.json'] },
  { id: 'public-s3', category: 'iac', severity: 'HIGH', title: 'ACL pública de almacenamiento', pattern: /(?:acl\s*=\s*["']public-|AccessControl\s*:\s*Public)/i, description: 'La configuración parece hacer público un bucket u objeto.', recommendation: 'Aplicar S3 Block Public Access y políticas de mínimo privilegio.', extensions: ['.tf', '.yaml', '.yml', '.json'] },
  { id: 'privileged-container', category: 'iac', severity: 'HIGH', title: 'Contenedor en modo privilegiado', pattern: /privileged\s*:\s*true/i, description: 'El contenedor obtiene capacidades amplias sobre el host.', recommendation: 'Eliminar privileged y asignar solo las capacidades indispensables.', extensions: ['.yaml', '.yml'] },
  { id: 'latest-image', category: 'iac', severity: 'LOW', title: 'Imagen de contenedor no fijada', pattern: /^\s*FROM\s+\S+:latest\b/im, description: 'La imagen usa la etiqueta mutable latest.', recommendation: 'Fijar una versión o digest y actualizarla mediante un proceso controlado.' },
];

export function analyzeTextFile(fileName: string, text: string): CodeFinding[] {
  const results: CodeFinding[] = [];
  const ext = extension(fileName);
  const lowerBase = basename(fileName).toLowerCase();
  if (lowerBase === '.env' || /^\.env\./.test(lowerBase) || /(?:^|\/)(?:id_rsa|id_ed25519|credentials)$/i.test(fileName)) {
    results.push(finding('sensitive-file', 'secret', 'HIGH', 'Archivo sensible incluido en el ZIP',
      'El paquete contiene un archivo cuyo nombre suele utilizarse para credenciales.', fileName, null,
      'Excluir el archivo del paquete, rotar cualquier secreto real y mantener solo una plantilla sin valores.'));
  }
  const lines = text.split(/\r?\n/);
  const isTestFixture = /(?:^|\/)(?:tests?|__tests__|fixtures?|mocks?)(?:\/|$)|(?:^|\/)[^/]*(?:test|spec)\.[^/]+$/i.test(fileName.replace(/\\/g, '/'));
  for (const rule of RULES) {
    if (rule.extensions && !rule.extensions.includes(ext)) continue;
    const lineIndex = lines.findIndex((line) => {
      rule.pattern.lastIndex = 0;
      return rule.pattern.test(line) && !/(?:example|sample|dummy|changeme|your[_-]|\$\{|process\.env|os\.environ)/i.test(line);
    });
    if (lineIndex >= 0) {
      const fixtureSecret = isTestFixture && rule.category === 'secret' && ['hardcoded-secret', 'database-url'].includes(rule.id);
      results.push(finding(rule.id, rule.category, fixtureSecret ? 'MEDIUM' : rule.severity, rule.title,
        fixtureSecret ? `${rule.description} Está en un archivo de pruebas y requiere validación manual antes de tratarlo como credencial real.` : rule.description,
        fileName, lineIndex + 1, rule.recommendation));
    }
  }
  return results;
}

function normalizeVersion(value: unknown) {
  if (typeof value !== 'string') return null;
  const version = value.trim().replace(/^(?:==|v)/, '');
  return /^\d+(?:\.\d+)+(?:[-+][0-9A-Za-z.-]+)?$/.test(version) ? version : null;
}

export function parseDependencies(fileName: string, text: string): Dependency[] {
  const lower = basename(fileName).toLowerCase();
  const dependencies: Dependency[] = [];
  try {
    if (lower === 'package-lock.json') {
      const lock = JSON.parse(text) as { packages?: Record<string, { name?: string; version?: string }>; dependencies?: Record<string, { version?: string }> };
      if (lock.packages) {
        for (const [path, pkg] of Object.entries(lock.packages)) {
          if (!path || !path.includes('node_modules/')) continue;
          const name = pkg.name ?? path.slice(path.lastIndexOf('node_modules/') + 13);
          const version = normalizeVersion(pkg.version);
          if (name && version) dependencies.push({ ecosystem: 'npm', name, version, manifest: fileName });
        }
      } else {
        for (const [name, pkg] of Object.entries(lock.dependencies ?? {})) {
          const version = normalizeVersion(pkg.version);
          if (version) dependencies.push({ ecosystem: 'npm', name, version, manifest: fileName });
        }
      }
    } else if (lower === 'composer.lock') {
      const lock = JSON.parse(text) as { packages?: { name?: string; version?: string }[]; 'packages-dev'?: { name?: string; version?: string }[] };
      for (const pkg of [...(lock.packages ?? []), ...(lock['packages-dev'] ?? [])]) {
        const version = normalizeVersion(pkg.version);
        if (pkg.name && version) dependencies.push({ ecosystem: 'Packagist', name: pkg.name, version, manifest: fileName });
      }
    } else if (/^requirements.*\.txt$/.test(lower)) {
      for (const line of text.split(/\r?\n/)) {
        const match = line.trim().match(/^([A-Za-z0-9_.-]+)==([^\s;#]+)/);
        const version = normalizeVersion(match?.[2]);
        if (match?.[1] && version) dependencies.push({ ecosystem: 'PyPI', name: match[1], version, manifest: fileName });
      }
    } else if (lower === 'poetry.lock') {
      let name = '';
      for (const line of text.split(/\r?\n/)) {
        if (/^\[\[package\]\]/.test(line)) name = '';
        const nameMatch = line.match(/^name\s*=\s*["']([^"']+)/);
        if (nameMatch) name = nameMatch[1]!;
        const versionMatch = line.match(/^version\s*=\s*["']([^"']+)/);
        const version = normalizeVersion(versionMatch?.[1]);
        if (name && version) dependencies.push({ ecosystem: 'PyPI', name, version, manifest: fileName });
      }
    } else if (lower === 'pipfile.lock') {
      const lock = JSON.parse(text) as Record<string, Record<string, { version?: string }>>;
      for (const section of ['default', 'develop']) for (const [name, pkg] of Object.entries(lock[section] ?? {})) {
        const version = normalizeVersion(pkg.version);
        if (version) dependencies.push({ ecosystem: 'PyPI', name, version, manifest: fileName });
      }
    }
  } catch {
    // Un manifiesto inválido se conserva como evidencia de cobertura, sin interrumpir los demás análisis.
  }
  return dependencies;
}

function openZip(path: string) {
  return new Promise<ZipFile>((resolve, reject) => yauzl.open(path, { lazyEntries: true, autoClose: true }, (error, zip) => error || !zip ? reject(error ?? new Error('ZIP inválido')) : resolve(zip)));
}

function readEntry(zip: ZipFile, entry: Entry) {
  return new Promise<Buffer>((resolve, reject) => zip.openReadStream(entry, (error, stream) => {
    if (error || !stream) return reject(error ?? new Error('No se pudo leer una entrada'));
    const chunks: Buffer[] = [];
    stream.on('data', (chunk: Buffer) => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  }));
}

async function scanEntries(path: string, options: Required<ZipScanOptions>) {
  const zip = await openZip(path);
  const findings: CodeFinding[] = [];
  const dependencies: Dependency[] = [];
  const extensions: Record<string, number> = {};
  let entryCount = 0;
  let uncompressedBytes = 0;
  let textBytes = 0;
  let filesAnalyzed = 0;
  return new Promise<{ findings: CodeFinding[]; dependencies: Dependency[]; entryCount: number; uncompressedBytes: number; filesAnalyzed: number; extensions: Record<string, number> }>((resolve, reject) => {
    let settled = false;
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      zip.close();
      reject(error);
    };
    zip.on('error', fail);
    zip.on('end', () => {
      if (!settled) {
        settled = true;
        resolve({ findings, dependencies, entryCount, uncompressedBytes, filesAnalyzed, extensions });
      }
    });
    zip.on('entry', (entry) => {
      void (async () => {
        entryCount += 1;
        if (entryCount > options.maxEntries) throw new Error(`El ZIP supera el límite de ${options.maxEntries} entradas.`);
        if (!validateArchivePath(entry.fileName)) throw new Error(`El ZIP contiene una ruta no segura: ${safeLine(entry.fileName)}`);
        if ((entry.generalPurposeBitFlag & 1) !== 0) throw new Error(`El ZIP contiene una entrada cifrada y no analizable: ${safeLine(entry.fileName)}`);
        uncompressedBytes += entry.uncompressedSize;
        if (uncompressedBytes > options.maxUncompressedBytes) throw new Error('El ZIP supera el límite de tamaño descomprimido (250 MB).');
        if (entry.uncompressedSize > options.maxEntryBytes) throw new Error(`Una entrada supera el límite individual de 8 MB: ${safeLine(entry.fileName)}`);
        if (entry.compressedSize > 0 && entry.uncompressedSize / entry.compressedSize > 150) throw new Error(`Relación de compresión sospechosa en: ${safeLine(entry.fileName)}`);
        const unixMode = (entry.externalFileAttributes >>> 16) & 0xffff;
        if ((unixMode & 0o170000) === 0o120000) throw new Error(`El ZIP contiene un enlace simbólico no admitido: ${safeLine(entry.fileName)}`);
        if (/\/$/.test(entry.fileName)) return zip.readEntry();
        const ext = extension(entry.fileName) || '[sin extensión]';
        extensions[ext] = (extensions[ext] ?? 0) + 1;
        if (isTextCandidate(entry.fileName) && textBytes + entry.uncompressedSize <= options.maxTextBytes) {
          const buffer = await readEntry(zip, entry);
          if (!buffer.subarray(0, 4096).includes(0)) {
            textBytes += buffer.length;
            filesAnalyzed += 1;
            const text = buffer.toString('utf8');
            if (findings.length < 500) findings.push(...analyzeTextFile(entry.fileName, text).slice(0, 500 - findings.length));
            dependencies.push(...parseDependencies(entry.fileName, text));
          }
        }
        zip.readEntry();
      })().catch(fail);
    });
    zip.readEntry();
  });
}

type OsvResult = { vulns?: { id: string; modified?: string }[] };

type OsvDetail = {
  id: string;
  summary?: string;
  database_specific?: { severity?: string };
  affected?: { package?: { ecosystem?: string; name?: string }; ranges?: { events?: { fixed?: string }[] }[]; ecosystem_specific?: { severity?: string } }[];
};

function osvSeverity(detail: OsvDetail | undefined): CodeSeverity {
  const raw = detail?.database_specific?.severity ?? detail?.affected?.find((item) => item.ecosystem_specific?.severity)?.ecosystem_specific?.severity;
  const normalized = raw?.toUpperCase();
  return normalized === 'CRITICAL' || normalized === 'HIGH' || normalized === 'MEDIUM' || normalized === 'LOW' ? normalized : 'MEDIUM';
}

function fixedVersion(detail: OsvDetail | undefined, dependency: Dependency) {
  const affected = detail?.affected?.find((item) => item.package?.ecosystem === dependency.ecosystem && item.package?.name?.toLowerCase() === dependency.name.toLowerCase());
  return affected?.ranges?.flatMap((range) => range.events ?? []).find((event) => event.fixed)?.fixed ?? null;
}

async function lookupOsv(dependencies: Dependency[]) {
  const unique = [...new Map(dependencies.map((dependency) => [`${dependency.ecosystem}:${dependency.name}:${dependency.version}`, dependency])).values()];
  const matches: { dependency: Dependency; id: string }[] = [];
  for (let index = 0; index < unique.length; index += 100) {
    const batch = unique.slice(index, index + 100);
    const response = await fetch('https://api.osv.dev/v1/querybatch', {
      method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(20_000),
      body: JSON.stringify({ queries: batch.map((dependency) => ({ package: { name: dependency.name, ecosystem: dependency.ecosystem }, version: dependency.version })) }),
    });
    if (!response.ok) throw new Error(`OSV respondió HTTP ${response.status}`);
    const payload = await response.json() as { results?: OsvResult[] };
    (payload.results ?? []).forEach((result, offset) => {
      for (const vulnerability of result.vulns ?? []) if (matches.length < 300) matches.push({ dependency: batch[offset]!, id: vulnerability.id });
    });
  }
  const details = new Map<string, OsvDetail>();
  const ids = [...new Set(matches.map((match) => match.id))].slice(0, 100);
  for (let index = 0; index < ids.length; index += 10) {
    const responses = await Promise.all(ids.slice(index, index + 10).map(async (id) => {
      const response = await fetch(`https://api.osv.dev/v1/vulns/${encodeURIComponent(id)}`, { signal: AbortSignal.timeout(15_000) });
      if (!response.ok) return null;
      return response.json() as Promise<OsvDetail>;
    }));
    for (const detail of responses) if (detail?.id) details.set(detail.id, detail);
  }
  return { unique, matches, details };
}

export async function scanZipSecurity(path: string, inputOptions: ZipScanOptions = {}) {
  const options = { ...DEFAULTS, ...inputOptions };
  const archive = await scanEntries(path, options);
  const deduplicatedDependencies = [...new Map(archive.dependencies.map((item) => [`${item.ecosystem}:${item.name}:${item.version}`, item])).values()];
  let osvAvailable = false;
  let osvError: string | null = null;
  let vulnerabilitiesChecked = 0;
  if (options.lookupVulnerabilities && deduplicatedDependencies.length) {
    try {
      const osv = await lookupOsv(deduplicatedDependencies);
      osvAvailable = true;
      vulnerabilitiesChecked = osv.unique.length;
      for (const match of osv.matches) {
        const detail = osv.details.get(match.id);
        const fixed = fixedVersion(detail, match.dependency);
        archive.findings.push({
          externalId: `${match.id}:${match.dependency.ecosystem}:${match.dependency.name}`, source: 'osv', category: 'dependency', title: `${match.id} afecta ${match.dependency.name}`,
          description: detail?.summary ?? `La versión ${match.dependency.version} figura como afectada en OSV.`, severity: osvSeverity(detail), status: 'open',
          resource: match.dependency.manifest, recommendation: fixed ? `Actualizar a la versión ${fixed} o posterior y validar el cambio con pruebas de regresión.` : 'Actualizar a una versión corregida indicada por el aviso y validar el cambio con pruebas de regresión.',
          evidence: { advisory: match.id, ecosystem: match.dependency.ecosystem, package: match.dependency.name, version: match.dependency.version },
        });
      }
    } catch (error) {
      osvError = error instanceof Error ? error.message : String(error);
    }
  }
  const findings = [...new Map(archive.findings.map((item) => [item.externalId, item])).values()];
  const counts = findings.reduce<Record<CodeSeverity, number>>((acc, item) => { acc[item.severity] += 1; return acc; }, { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFORMATIONAL: 0 });
  const diminishingPenalty = (count: number, weight: number) => count ? weight * Math.log2(count + 1) : 0;
  const rawPenalty = diminishingPenalty(counts.CRITICAL, 22) + diminishingPenalty(counts.HIGH, 12)
    + diminishingPenalty(counts.MEDIUM, 5) + diminishingPenalty(counts.LOW, 2);
  const score = Math.max(0, Math.round(100 - Math.min(100, rawPenalty)));
  const observedControls = 4 + (osvAvailable || !deduplicatedDependencies.length ? 1 : 0);
  const totalControls = 5;
  const coverage = Math.round(observedControls / totalControls * 100);
  return {
    score, coverage, confidence: coverage === 100 ? 'high' as const : coverage >= 75 ? 'medium' as const : 'low' as const,
    findings,
    summary: {
      counts, observedControls, totalControls, entryCount: archive.entryCount, uncompressedBytes: archive.uncompressedBytes,
      filesAnalyzed: archive.filesAnalyzed, dependencyCount: deduplicatedDependencies.length, vulnerabilitiesChecked,
      osvAvailable, osvError, extensions: archive.extensions,
      methodology: 'Análisis estático por patrones, secretos, configuración/IaC e inventario de dependencias; no se ejecutó código.',
    },
  };
}
