import yauzl, { type Entry, type ZipFile } from 'yauzl';
import { createHash } from 'node:crypto';
import { computeFingerprint, deduplicateByFingerprint } from './findingFingerprint.js';
import { frameworkFor } from './findingFramework.js';
import { lookupOsv, type OsvDetail } from './security/osvClient.js';
import { recordAnalyzerTiming, type AnalyzerTimings } from './security/analyzerTiming.js';
import { buildSbom, inspectImages, inspectManifest, inventoryIssues as resolveInventoryIssues, resolvedVersion, sbomChecksum, type ImageReference, type InventoryIssue } from './security/supplyChain.js';
import { scanImages, type TrivyOptions } from './security/trivyImages.js';
import { scanSast, mergeSastFindings, type SastOptions, type SastSource } from './security/sast.js';
import { SAST_RULES, sourceContext, sourceLanguage } from './security/sastCatalog.js';

export type CodeSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFORMATIONAL';
export const BUILTIN_RULE_CATALOG_VERSION = '2026.10.regex1';

export type CodeFinding = {
  externalId: string;
  source: 'cloudops' | 'osv' | 'trivy' | 'semgrep';
  category: 'archive' | 'secret' | 'code' | 'iac' | 'dependency' | 'license' | 'coverage';
  title: string;
  description: string;
  severity: CodeSeverity;
  status: 'open';
  resource: string | null;
  recommendation: string;
  evidence: Record<string, unknown>;
  fingerprint?: string;
  framework?: string | null;
};

export type Dependency = { ecosystem: 'npm' | 'PyPI' | 'Packagist'; name: string; version: string; manifest: string; licenses?: string[]; integrity?: string };

export type DetectedArchitectureComponent = {
  id: string;
  name: string;
  category: 'client' | 'api' | 'data' | 'runtime' | 'delivery' | 'security' | 'observability' | 'integration';
  confidence: 'high' | 'medium';
  evidence: string[];
};

export type StaticCoverageDomain = {
  id: 'secrets' | 'source-code' | 'dependencies' | 'iac' | 'containers' | 'configuration';
  label: string;
  status: 'measured' | 'partial' | 'not-detected';
  files: number;
  detail: string;
};

export type RepositoryLayer = 'backend' | 'frontend' | 'infrastructure' | 'dependencies' | 'shared';

export type RepositoryEntry = {
  path: string;
  kind: 'file' | 'directory';
  sizeBytes: number;
  analysisStatus: 'analyzed' | 'unsupported' | 'text-limit' | 'binary' | 'directory';
};

export type LayerBreakdown = {
  id: RepositoryLayer;
  label: string;
  candidateFiles: number;
  analyzedFiles: number;
  readCoverage: number;
  findings: number;
  counts: Record<CodeSeverity, number>;
};

export type ZipScanOptions = {
  maxEntries?: number;
  maxUncompressedBytes?: number;
  maxEntryBytes?: number;
  maxTextBytes?: number;
  lookupVulnerabilities?: boolean;
  imageScan?: TrivyOptions | null;
  sastScan?: SastOptions | null;
};

const DEFAULTS: Required<ZipScanOptions> = {
  maxEntries: 10_000,
  maxUncompressedBytes: 250 * 1024 * 1024,
  maxEntryBytes: 8 * 1024 * 1024,
  maxTextBytes: 60 * 1024 * 1024,
  lookupVulnerabilities: true,
  imageScan: null,
  sastScan: null,
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
  return TEXT_EXTENSIONS.has(extension(fileName)) || lower === 'dockerfile' || ['composer.lock', 'pipfile.lock', 'poetry.lock', 'uv.lock'].includes(lower);
}

function domainsForPath(fileName: string): StaticCoverageDomain['id'][] {
  const normalized = fileName.replace(/\\/g, '/').toLowerCase();
  const base = basename(normalized);
  const ext = extension(fileName);
  const domains: StaticCoverageDomain['id'][] = ['secrets'];
  if (['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.py', '.php', '.java', '.go', '.rb', '.cs'].includes(ext)) domains.push('source-code');
  if (dependencyManifestPattern.test(base)) domains.push('dependencies');
  if (['.tf', '.tfvars'].includes(ext) || /(?:cloudformation|template)\.ya?ml$/.test(base)) domains.push('iac');
  if (base === 'dockerfile' || /(?:docker-)?compose.*\.ya?ml$/.test(base)) domains.push('containers');
  if (['.yaml', '.yml', '.toml', '.ini', '.conf', '.properties', '.env'].includes(ext) || normalized.includes('/config/')) domains.push('configuration');
  return domains;
}

const dependencyManifestPattern = /^(?:package(?:-lock)?\.json|composer\.(?:json|lock)|pyproject\.toml|poetry\.lock|uv\.lock|pipfile\.lock|requirements.*\.txt)$/;

export function classifyRepositoryPath(fileName: string, category?: CodeFinding['category']): RepositoryLayer {
  const normalized = fileName.replace(/\\/g, '/').toLowerCase();
  const lowerBase = basename(normalized).toLowerCase();
  if (category === 'dependency' || category === 'license' || dependencyManifestPattern.test(lowerBase)) return 'dependencies';
  if (category === 'iac' || ['.tf', '.tfvars'].includes(extension(normalized)) || lowerBase === 'dockerfile'
    || /(?:docker-)?compose.*\.ya?ml$/.test(lowerBase) || /(?:cloudformation|template)\.ya?ml$/.test(lowerBase)
    || normalized.includes('/.github/workflows/')) return 'infrastructure';
  if (/(?:^|\/)backend(?:\/|$)/.test(normalized)) return 'backend';
  if (/(?:^|\/)frontend(?:\/|$)/.test(normalized)) return 'frontend';
  return 'shared';
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
  { id: 'node-command-exec', category: 'code', severity: 'HIGH', title: 'Ejecución de comandos desde Node.js', pattern: /(?:child_process\.|\bexecSync\s*\(|\bspawnSync\s*\()/i, description: 'El código ejecuta procesos del sistema y puede permitir inyección si incorpora entrada no confiable.', recommendation: 'Usar argumentos separados, listas permitidas y evitar shells; valida toda entrada antes de ejecutar procesos.', extensions: ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'] },
  { id: 'weak-password-hash', category: 'code', severity: 'HIGH', title: 'Hash débil aplicado a credenciales', pattern: /(?:createHash\s*\(\s*['"](?:md5|sha1)['"]|hashlib\.(?:md5|sha1)\s*\()/i, description: 'MD5 y SHA-1 no son funciones adecuadas para almacenar contraseñas.', recommendation: 'Usar Argon2id, scrypt o bcrypt con parámetros de costo apropiados y salt único.' },
  { id: 'cors-wildcard', category: 'code', severity: 'MEDIUM', title: 'CORS permite cualquier origen', pattern: /(?:allow_origins\s*=\s*\[\s*['"]\*['"]|origin\s*:\s*['"]\*['"]|Access-Control-Allow-Origin.{0,20}\*)/i, description: 'La aplicación permite solicitudes desde cualquier origen.', recommendation: 'Mantener una lista explícita de orígenes confiables por ambiente y revisar el uso de credenciales.' },
  { id: 'jwt-signature-disabled', category: 'code', severity: 'CRITICAL', title: 'Validación de firma JWT deshabilitada', pattern: /(?:verify_signature['"]?\s*:\s*false|algorithms?\s*[:=]\s*\[?['"]none['"])/i, description: 'La configuración permite aceptar tokens sin verificar su firma.', recommendation: 'Exigir algoritmos permitidos explícitamente y validar firma, emisor, audiencia y expiración.' },
  { id: 'python-yaml-load', category: 'code', severity: 'HIGH', title: 'Deserialización YAML insegura', pattern: /\byaml\.load\s*\([^\n]*(?!SafeLoader)/i, description: 'yaml.load puede construir objetos peligrosos cuando procesa contenido no confiable.', recommendation: 'Usar yaml.safe_load o SafeLoader y validar el esquema resultante.', extensions: ['.py'] },
  { id: 'debug-production', category: 'code', severity: 'HIGH', title: 'Modo debug habilitado', pattern: /(?:debug\s*=\s*True|FLASK_DEBUG\s*[:=]\s*['"]?1|NODE_ENV\s*[:=]\s*['"]development['"])/i, description: 'El modo de depuración puede exponer trazas, configuración o consolas administrativas.', recommendation: 'Deshabilitar debug fuera del entorno local y controlar el ambiente desde configuración segura.' },
  { id: 'sql-string-concat', category: 'code', severity: 'HIGH', title: 'Consulta SQL construida dinámicamente', pattern: /(?:execute|query)\s*\(\s*(?:f['"]|['"`][^\n]*(?:\+|\$\{))/i, description: 'La consulta parece incorporar valores mediante concatenación o interpolación.', recommendation: 'Usar consultas parametrizadas y validar identificadores que no puedan parametrizarse.' },
  { id: 'iam-wildcard', category: 'iac', severity: 'HIGH', title: 'Permiso IAM global', pattern: /(?:Action|Resource)\s*[:=]\s*(?:\[\s*)?['"]\*['"]/i, description: 'La política de infraestructura concede acciones o recursos globales.', recommendation: 'Reducir acciones y recursos a los ARN estrictamente necesarios y añadir condiciones.' , extensions: ['.tf', '.yaml', '.yml', '.json'] },
  { id: 'unencrypted-storage', category: 'iac', severity: 'MEDIUM', title: 'Cifrado de almacenamiento deshabilitado', pattern: /(?:storage_encrypted|encrypted|enable_storage_encryption)\s*[:=]\s*false/i, description: 'La infraestructura declara almacenamiento sin cifrado.', recommendation: 'Habilitar cifrado con KMS y definir una política de rotación y acceso a claves.', extensions: ['.tf', '.yaml', '.yml', '.json'] },
  { id: 'docker-root-user', category: 'iac', severity: 'MEDIUM', title: 'Contenedor declara usuario root', pattern: /^\s*USER\s+(?:root|0)\s*$/im, description: 'La imagen configura explícitamente la ejecución como root.', recommendation: 'Crear un usuario sin privilegios, copiar solo los artefactos necesarios y ejecutar con ese usuario.' },
  { id: 'docker-socket', category: 'iac', severity: 'CRITICAL', title: 'Socket de Docker montado en un contenedor', pattern: /\/var\/run\/docker\.sock\s*:/i, description: 'El contenedor puede controlar el daemon Docker y potencialmente el host.', recommendation: 'Eliminar el montaje del socket o usar un proxy con permisos mínimos y aislamiento adicional.', extensions: ['.yaml', '.yml'] },
];

export const BUILTIN_RULE_CATALOG = {
  version: BUILTIN_RULE_CATALOG_VERSION,
  sha256: createHash('sha256').update(JSON.stringify(RULES.map((rule) => ({ ...rule, pattern: rule.pattern.source, flags: rule.pattern.flags })))).digest('hex'),
  rules: RULES.map((rule) => ({ id: `cloudops:${rule.id}`, category: rule.category, severity: rule.severity, title: rule.title,
    recommendation: rule.recommendation, extensions: rule.extensions ?? null })),
};

type ComponentMatch = Omit<DetectedArchitectureComponent, 'evidence'>;

const COMPONENT_SIGNATURES: { match: RegExp; component: ComponentMatch }[] = [
  { match: /["']react["']|from\s+["']react["']/i, component: { id: 'react', name: 'React', category: 'client', confidence: 'high' } },
  { match: /["'](?:vue|@vue\/core)["']/i, component: { id: 'vue', name: 'Vue', category: 'client', confidence: 'high' } },
  { match: /["']@angular\/core["']/i, component: { id: 'angular', name: 'Angular', category: 'client', confidence: 'high' } },
  { match: /\bfastapi\b|from\s+fastapi\s+import/i, component: { id: 'fastapi', name: 'FastAPI', category: 'api', confidence: 'high' } },
  { match: /["']fastify["']|from\s+["']fastify["']/i, component: { id: 'fastify', name: 'Fastify', category: 'api', confidence: 'high' } },
  { match: /["']express["']|require\s*\(\s*["']express["']/i, component: { id: 'express', name: 'Express', category: 'api', confidence: 'high' } },
  { match: /\bdjango\b|from\s+django\b/i, component: { id: 'django', name: 'Django', category: 'api', confidence: 'high' } },
  { match: /postgres(?:ql)?(?:\+asyncpg)?\s*:\/\/|\basyncpg\b|\bpsycopg\b/i, component: { id: 'postgresql', name: 'PostgreSQL', category: 'data', confidence: 'high' } },
  { match: /mongodb(?:\+srv)?\s*:\/\/|["']mongoose["']/i, component: { id: 'mongodb', name: 'MongoDB', category: 'data', confidence: 'high' } },
  { match: /redis\s*:\/\/|["'](?:ioredis|redis)["']/i, component: { id: 'redis', name: 'Redis', category: 'data', confidence: 'high' } },
  { match: /\b(?:jwt|jose|pyjwt|oauth2?|openid|oidc)\b/i, component: { id: 'token-auth', name: 'Autenticación por tokens/OAuth', category: 'security', confidence: 'medium' } },
  { match: /\b(?:opentelemetry|cloudwatch|sentry|prometheus_client)\b/i, component: { id: 'telemetry', name: 'Telemetría de aplicación', category: 'observability', confidence: 'high' } },
  { match: /\b(?:smtp|sendgrid|ses|mailgun)\b/i, component: { id: 'email', name: 'Entrega de correo', category: 'integration', confidence: 'medium' } },
  { match: /\b(?:celery|rq|bullmq|sidekiq)\b/i, component: { id: 'worker', name: 'Procesamiento en segundo plano', category: 'runtime', confidence: 'high' } },
];

function architectureComponents(fileName: string, text: string): ComponentMatch[] {
  const normalized = fileName.replace(/\\/g, '/').toLowerCase();
  const lowerBase = basename(fileName).toLowerCase();
  const components = COMPONENT_SIGNATURES.filter((signature) => signature.match.test(text)).map((signature) => signature.component);
  if (lowerBase === 'dockerfile') components.push({ id: 'docker', name: 'Contenedores Docker', category: 'runtime', confidence: 'high' });
  if (/compose(?:\.[^.]+)?\.ya?ml$|docker-compose.*\.ya?ml$/.test(lowerBase)) {
    components.push({ id: 'compose', name: 'Docker Compose', category: 'runtime', confidence: 'high' });
    let insideServices = false;
    for (const line of text.split(/\r?\n/)) {
      if (/^services:\s*(?:#.*)?$/.test(line)) { insideServices = true; continue; }
      if (insideServices && /^\S/.test(line) && line.trim()) break;
      const service = insideServices ? line.match(/^ {2}([A-Za-z0-9_.-]+):\s*(?:#.*)?$/)?.[1] : null;
      if (service) components.push({ id: `compose-service-${service}`, name: `Servicio Compose: ${service}`, category: 'runtime', confidence: 'high' });
    }
  }
  if (extension(fileName) === '.tf') components.push({ id: 'terraform', name: 'Terraform', category: 'delivery', confidence: 'high' });
  if (/\.github\/workflows\/.*\.ya?ml$/.test(normalized)) components.push({ id: 'github-actions', name: 'GitHub Actions', category: 'delivery', confidence: 'high' });
  if (lowerBase === '.gitlab-ci.yml') components.push({ id: 'gitlab-ci', name: 'GitLab CI', category: 'delivery', confidence: 'high' });
  if (/nginx.*\.conf$/.test(lowerBase)) components.push({ id: 'nginx', name: 'Nginx', category: 'runtime', confidence: 'high' });
  return components;
}

export function analyzeTextFile(fileName: string, text: string, timings?: AnalyzerTimings, executions?: Record<string, number>): CodeFinding[] {
  const results: CodeFinding[] = [];
  const ext = extension(fileName);
  const lowerBase = basename(fileName).toLowerCase();
  const lines = text.split(/\r?\n/);
  const secretStarted = performance.now();
  if (lowerBase === '.env' || /^\.env\./.test(lowerBase) || /(?:^|\/)(?:id_rsa|id_ed25519|credentials)$/i.test(fileName)) {
    const populatedSecretKeys = lines.flatMap((line) => {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (!match || !/(?:PASSWORD|PASSWD|SECRET(?:_KEY)?|TOKEN|API_KEY|ACCESS_KEY|PRIVATE_KEY|DATABASE_URL|ENCRYPTION_KEY)$/i.test(match[1]!)) return [];
      const value = match[2]!.replace(/^['"]|['"]$/g, '').trim();
      if (!value || /^(?:changeme|change-me|example|sample|dummy|replace|your[_-]|<.*>|\$\{.*\})/i.test(value)) return [];
      return [match[1]!];
    });
    const activeSecrets = [...new Set(populatedSecretKeys)];
    const sensitiveFinding = finding(activeSecrets.length ? 'populated-sensitive-file' : 'sensitive-file', 'secret', activeSecrets.length ? 'CRITICAL' : 'HIGH',
      activeSecrets.length ? 'Archivo .env con credenciales configuradas' : 'Archivo sensible incluido en el ZIP',
      activeSecrets.length ? `El repositorio contiene un archivo de entorno con ${activeSecrets.length} variable(s) sensible(s) que tienen valores no reconocidos como plantilla.` : 'El paquete contiene un archivo cuyo nombre suele utilizarse para credenciales.',
      fileName, null, 'Retirar el archivo del repositorio, rotar inmediatamente cada credencial expuesta y conservar solamente una plantilla .env.example sin valores.');
    sensitiveFinding.evidence = { file: fileName, populatedSensitiveKeys: activeSecrets };
    results.push(sensitiveFinding);
  }
  if (timings) recordAnalyzerTiming(timings, 'builtin:secrets', secretStarted, 'cumulative-rule');
  const isTestFixture = sourceContext(fileName) === 'test';
  const isDatabaseMigration = sourceContext(fileName) === 'migration';
  for (const rule of RULES) {
    if (rule.extensions && !rule.extensions.includes(ext)) continue;
    if (executions) executions[`cloudops:${rule.id}`] = (executions[`cloudops:${rule.id}`] ?? 0) + 1;
    const started = performance.now();
    const lineIndex = lines.findIndex((line) => {
      rule.pattern.lastIndex = 0;
      return rule.pattern.test(line) && !/(?:example|sample|dummy|changeme|your[_-]|\$\{|process\.env|os\.environ)/i.test(line);
    });
    if (lineIndex >= 0) {
      const fixtureSecret = isTestFixture && rule.category === 'secret' && ['hardcoded-secret', 'database-url'].includes(rule.id);
      const fixtureCode = isTestFixture && (rule.category === 'code' || rule.category === 'iac');
      const migrationSql = isDatabaseMigration && rule.id === 'sql-string-concat';
      const contextual = fixtureSecret || fixtureCode || migrationSql;
      const detected = finding(rule.id, rule.category, contextual ? 'INFORMATIONAL' : rule.severity, rule.title,
        fixtureSecret ? `${rule.description} El valor aparece en una prueba y se conserva como evidencia sin afectar el puntaje.`
          : fixtureCode ? `${rule.description} El patrón aparece en una prueba o fixture y se conserva sin afectar el puntaje de la aplicación.`
          : migrationSql ? `${rule.description} Aparece en una migración de base de datos; requiere revisión manual y no afecta el puntaje automático.` : rule.description,
        fileName, lineIndex + 1, rule.recommendation);
      if (contextual) detected.evidence = { ...detected.evidence, context: fixtureSecret || fixtureCode ? 'test' : 'database-migration', scoreExcluded: true };
      results.push(detected);
    }
    if (timings) {
      const domain = rule.category === 'secret' ? 'secrets' : rule.category === 'code' ? 'source-code'
        : ['privileged-container', 'latest-image', 'docker-root-user', 'docker-socket'].includes(rule.id) ? 'containers' : 'iac';
      recordAnalyzerTiming(timings, `builtin:${domain}`, started, 'cumulative-rule');
    }
  }
  return results;
}

function normalizeVersion(value: unknown) {
  return resolvedVersion(value);
}

export function parseDependencies(fileName: string, text: string): Dependency[] {
  const lower = basename(fileName).toLowerCase();
  const dependencies: Dependency[] = [];
  try {
    if (lower === 'package-lock.json') {
      type LockedPackage = { version?: string; license?: string; integrity?: string; dependencies?: Record<string, LockedPackage> };
      const lock = JSON.parse(text) as { packages?: Record<string, { name?: string; version?: string; license?: string; integrity?: string }>; dependencies?: Record<string, LockedPackage> };
      if (lock.packages) {
        for (const [path, pkg] of Object.entries(lock.packages)) {
          if (!path || !path.includes('node_modules/')) continue;
          if (!pkg || typeof pkg !== 'object') continue;
          const name = pkg.name ?? path.slice(path.lastIndexOf('node_modules/') + 13);
          const version = normalizeVersion(pkg.version);
          if (name && version) dependencies.push({ ecosystem: 'npm', name, version, manifest: fileName,
            ...(typeof pkg.license === 'string' ? { licenses: [pkg.license] } : {}), ...(typeof pkg.integrity === 'string' ? { integrity: pkg.integrity } : {}) });
        }
      } else {
        const pending = Object.entries(lock.dependencies ?? {});
        while (pending.length) {
          const [name, pkg] = pending.pop()!;
          if (!pkg || typeof pkg !== 'object') continue;
          const version = normalizeVersion(pkg.version);
          if (version) dependencies.push({ ecosystem: 'npm', name, version, manifest: fileName,
            ...(typeof pkg.license === 'string' ? { licenses: [pkg.license] } : {}), ...(typeof pkg.integrity === 'string' ? { integrity: pkg.integrity } : {}) });
          if (pkg.dependencies && typeof pkg.dependencies === 'object') for (const entry of Object.entries(pkg.dependencies)) pending.push(entry);
        }
      }
    } else if (lower === 'composer.lock') {
      const lock = JSON.parse(text) as { packages?: { name?: string; version?: string; license?: string[] }[]; 'packages-dev'?: { name?: string; version?: string; license?: string[] }[] };
      for (const pkg of [...(Array.isArray(lock.packages) ? lock.packages : []), ...(Array.isArray(lock['packages-dev']) ? lock['packages-dev'] : [])]) {
        if (!pkg || typeof pkg !== 'object') continue;
        const version = normalizeVersion(pkg.version);
        if (pkg.name && version) dependencies.push({ ecosystem: 'Packagist', name: pkg.name, version, manifest: fileName,
          ...(Array.isArray(pkg.license) ? { licenses: pkg.license.filter((license) => typeof license === 'string') } : {}) });
      }
    } else if (/^requirements.*\.txt$/.test(lower)) {
      for (const line of text.split(/\r?\n/)) {
        const match = line.trim().match(/^([A-Za-z0-9_.-]+)(?:\[[\w,.-]+\])?==([^\s;#\\]+)/);
        const version = normalizeVersion(match?.[2]);
        if (match?.[1] && version) dependencies.push({ ecosystem: 'PyPI', name: match[1], version, manifest: fileName });
      }
    } else if (lower === 'poetry.lock' || lower === 'uv.lock') {
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
        if (!pkg || typeof pkg !== 'object') continue;
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

async function scanEntries(path: string, options: Required<ZipScanOptions>, timings: AnalyzerTimings, executions: Record<string, number>) {
  const zip = await openZip(path);
  const findings: CodeFinding[] = [];
  const dependencies: Dependency[] = [];
  const extensions: Record<string, number> = {};
  const repositoryEntries: RepositoryEntry[] = [];
  const manifestIssues: InventoryIssue[] = [];
  const manifests: string[] = [];
  const images: ImageReference[] = [];
  const sources: SastSource[] = [];
  let sastBytes = 0;
  let sastFiles = 0;
  const components = new Map<string, DetectedArchitectureComponent>();
  const layerFiles = Object.fromEntries((['backend', 'frontend', 'infrastructure', 'dependencies', 'shared'] as RepositoryLayer[])
    .map((layer) => [layer, { candidateFiles: 0, analyzedFiles: 0 }])) as Record<RepositoryLayer, { candidateFiles: number; analyzedFiles: number }>;
  const domainFiles: Record<StaticCoverageDomain['id'], Set<string>> = {
    secrets: new Set(),
    'source-code': new Set(),
    dependencies: new Set(),
    iac: new Set(),
    containers: new Set(),
    configuration: new Set(),
  };
  let entryCount = 0;
  let uncompressedBytes = 0;
  let textBytes = 0;
  let filesAnalyzed = 0;
  return new Promise<{ findings: CodeFinding[]; dependencies: Dependency[]; entryCount: number; uncompressedBytes: number; filesAnalyzed: number; extensions: Record<string, number>; components: DetectedArchitectureComponent[]; domainFileCounts: Record<StaticCoverageDomain['id'], number>; layerFiles: Record<RepositoryLayer, { candidateFiles: number; analyzedFiles: number }>; repositoryEntries: RepositoryEntry[]; manifestIssues: InventoryIssue[]; manifests: string[]; images: ImageReference[]; sources: SastSource[] }>((resolve, reject) => {
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
        resolve({
          findings, dependencies, entryCount, uncompressedBytes, filesAnalyzed, extensions, manifestIssues, manifests, images, sources,
          components: [...components.values()],
          domainFileCounts: Object.fromEntries(Object.entries(domainFiles).map(([id, files]) => [id, files.size])) as Record<StaticCoverageDomain['id'], number>,
          layerFiles,
          repositoryEntries,
        });
      }
    });
    zip.on('entry', (entry) => {
      void (async () => {
        entryCount += 1;
        if (entryCount > options.maxEntries) throw new Error(`El ZIP supera el límite de ${options.maxEntries} entradas.`);
        if (!validateArchivePath(entry.fileName)) throw new Error(`El ZIP contiene una ruta no segura: ${safeLine(entry.fileName)}`);
        if ((entry.generalPurposeBitFlag & 1) !== 0) throw new Error(`El ZIP contiene una entrada cifrada y no analizable: ${safeLine(entry.fileName)}`);
        uncompressedBytes += entry.uncompressedSize;
        if (uncompressedBytes > options.maxUncompressedBytes) throw new Error(`El ZIP supera el límite de tamaño descomprimido (${options.maxUncompressedBytes} bytes).`);
        if (entry.uncompressedSize > options.maxEntryBytes) throw new Error(`Una entrada supera el límite individual de ${options.maxEntryBytes} bytes: ${safeLine(entry.fileName)}`);
        if (entry.compressedSize > 0 && entry.uncompressedSize / entry.compressedSize > 150) throw new Error(`Relación de compresión sospechosa en: ${safeLine(entry.fileName)}`);
        const unixMode = (entry.externalFileAttributes >>> 16) & 0xffff;
        if ((unixMode & 0o170000) === 0o120000) throw new Error(`El ZIP contiene un enlace simbólico no admitido: ${safeLine(entry.fileName)}`);
        const directory = /\/$/.test(entry.fileName);
        const inventoryEntry: RepositoryEntry = {
          path: entry.fileName.replace(/\\/g, '/'), kind: directory ? 'directory' : 'file', sizeBytes: entry.uncompressedSize,
          analysisStatus: directory ? 'directory' : 'unsupported',
        };
        repositoryEntries.push(inventoryEntry);
        if (directory) return zip.readEntry();
        const language = sourceLanguage(entry.fileName);
        const source: SastSource | undefined = language ? { path: entry.fileName, skipReason: options.sastScan?.enabled ? 'Fuente no analizada.' : 'SAST deshabilitado.' } : undefined;
        if (source) sources.push(source);
        const ext = extension(entry.fileName) || '[sin extensión]';
        extensions[ext] = (extensions[ext] ?? 0) + 1;
        if (isTextCandidate(entry.fileName)) {
          const layer = classifyRepositoryPath(entry.fileName);
          layerFiles[layer].candidateFiles += 1;
          if (textBytes + entry.uncompressedSize > options.maxTextBytes) {
            inventoryEntry.analysisStatus = 'text-limit';
            if (source) source.skipReason = 'Límite de texto ZIP.';
            return zip.readEntry();
          }
          const buffer = await readEntry(zip, entry);
          inventoryEntry.analysisStatus = 'binary';
          if (!buffer.subarray(0, 4096).includes(0)) {
            inventoryEntry.analysisStatus = 'analyzed';
            textBytes += buffer.length;
            filesAnalyzed += 1;
            layerFiles[layer].analyzedFiles += 1;
            const text = buffer.toString('utf8');
            if (source && options.sastScan?.enabled) {
              const context = sourceContext(source.path);
              if (context !== 'application') source.skipReason = context;
              else if (!SAST_RULES.some((rule) => (rule.languages as readonly string[]).includes(language!))) source.skipReason = 'Lenguaje sin reglas en el catálogo.';
              else if (sastFiles >= 2000 || buffer.length > 2 * 1024 * 1024 || sastBytes + buffer.length > 40 * 1024 * 1024) source.skipReason = 'Límite SAST de archivos o bytes.';
              else { source.text = text; delete source.skipReason; sastFiles++; sastBytes += buffer.length; }
            }
            const normalized = entry.fileName.replace(/\\/g, '/').toLowerCase();
            for (const domain of domainsForPath(entry.fileName)) domainFiles[domain].add(entry.fileName);
            const isEvidenceFixture = /(?:^|\/)(?:tests?|__tests__|fixtures?|mocks?|interaction-tests)(?:\/|$)|(?:^|\/)[^/]*(?:test|spec)\.[^/]+$/i.test(normalized);
            for (const detected of isEvidenceFixture ? [] : architectureComponents(entry.fileName, text)) {
              const existing = components.get(detected.id);
              if (existing) {
                if (!existing.evidence.includes(entry.fileName) && existing.evidence.length < 5) existing.evidence.push(entry.fileName);
              } else {
                components.set(detected.id, { ...detected, evidence: [entry.fileName] });
              }
            }
            if (findings.length < 500) findings.push(...analyzeTextFile(entry.fileName, text, timings, executions).slice(0, 500 - findings.length));
            const dependenciesStarted = performance.now();
            const parsedDependencies = parseDependencies(entry.fileName, text);
            const available = Math.max(0, 10_000 - dependencies.length);
            dependencies.push(...parsedDependencies.slice(0, available));
            if (parsedDependencies.length > available && manifestIssues.length < 200) manifestIssues.push({ manifest: entry.fileName, kind: 'inventory-limit', detail: 'Se alcanzó el límite de diez mil entradas de dependencias.' });
            if (dependencyManifestPattern.test(basename(entry.fileName).toLowerCase())) {
              manifests.push(entry.fileName);
              manifestIssues.push(...inspectManifest(entry.fileName, text).slice(0, Math.max(0, 200 - manifestIssues.length)));
            }
            if (images.length < 100) images.push(...inspectImages(entry.fileName, text).slice(0, 100 - images.length));
            recordAnalyzerTiming(timings, 'builtin:dependencies', dependenciesStarted, 'cumulative-rule');
          }
        }
        zip.readEntry();
      })().catch(fail);
    });
    zip.readEntry();
  });
}

function osvSeverity(detail: OsvDetail | undefined): { value: CodeSeverity; estimated: boolean } {
  const affected = Array.isArray(detail?.affected) ? detail.affected : [];
  const raw = detail?.database_specific?.severity ?? affected.find((item) => item?.ecosystem_specific?.severity)?.ecosystem_specific?.severity;
  const normalized = typeof raw === 'string' ? raw.toUpperCase() : '';
  return normalized === 'CRITICAL' || normalized === 'HIGH' || normalized === 'MEDIUM' || normalized === 'LOW'
    ? { value: normalized, estimated: false } : { value: 'MEDIUM', estimated: true };
}

function fixedVersion(detail: OsvDetail | undefined, dependency: Dependency) {
  const affected = (Array.isArray(detail?.affected) ? detail.affected : []).find((item) => item?.package?.ecosystem === dependency.ecosystem
    && typeof item.package.name === 'string' && item.package.name.toLowerCase() === dependency.name.toLowerCase());
  return (Array.isArray(affected?.ranges) ? affected.ranges : []).flatMap((range) => Array.isArray(range?.events) ? range.events : [])
    .find((event) => typeof event?.fixed === 'string')?.fixed ?? null;
}

export async function scanZipSecurity(path: string, inputOptions: ZipScanOptions = {}) {
  const options = { ...DEFAULTS, ...inputOptions };
  const analyzerTimings: AnalyzerTimings = {};
  const ruleExecutions: Record<string, number> = {};
  const archiveStarted = performance.now();
  const archive = await scanEntries(path, options, analyzerTimings, ruleExecutions);
  const archiveDurationMs = Math.round(performance.now() - archiveStarted);
  const staticFindingLimitReached = archive.findings.length >= 500;
  const sastResult = await scanSast(archive.sources, options.sastScan);
  const { findings: sastFindings, ...sast } = sastResult;
  archive.findings = mergeSastFindings(archive.findings, sastFindings);
  if (sast.durationMs !== null) analyzerTimings['semgrep:sast'] = { durationMs: sast.durationMs, scope: 'elapsed-service' };
  const deduplicatedDependencies = [...new Map(archive.dependencies.map((item) => [`${item.ecosystem}:${item.name}:${item.version}`, item])).values()];
  let osvAvailable = false;
  let osvError: string | null = null;
  let vulnerabilitiesChecked = 0;
  let osvState: 'completed' | 'partial' | 'failed' | 'skipped' = 'skipped';
  let osvMetrics = { requests: 0, retries: 0, durationMs: 0 };
  let osvLimits: string[] = [];
  if (options.lookupVulnerabilities && deduplicatedDependencies.length) {
    try {
      const osv = await lookupOsv(deduplicatedDependencies);
      osvAvailable = osv.checked > 0;
      vulnerabilitiesChecked = osv.checked;
      osvState = osv.state;
      osvMetrics = osv.metrics;
      osvLimits = osv.limits;
      osvError = [...osv.errors, ...osv.limits].join(' · ') || null;
      analyzerTimings.osv = { durationMs: osv.metrics.durationMs, scope: 'elapsed-service' };
      for (const match of osv.matches) {
        const detail = osv.details.get(match.id);
        const fixed = fixedVersion(detail, match.dependency);
        const severity = osvSeverity(detail);
        archive.findings.push({
          externalId: `${match.id}:${match.dependency.ecosystem}:${match.dependency.name}:${match.dependency.version}`, source: 'osv', category: 'dependency', title: `${match.id} afecta ${match.dependency.name}`,
          description: typeof detail?.summary === 'string' ? detail.summary : `La versión ${match.dependency.version} figura como afectada en OSV.`, severity: severity.value, status: 'open',
          resource: match.dependency.manifest, recommendation: fixed ? `Actualizar a la versión ${fixed} o posterior y validar el cambio con pruebas de regresión.` : 'Actualizar a una versión corregida indicada por el aviso y validar el cambio con pruebas de regresión.',
          evidence: { advisory: match.id, advisoryUrl: `https://osv.dev/vulnerability/${encodeURIComponent(match.id)}`, fixedVersion: fixed,
            ecosystem: match.dependency.ecosystem, package: match.dependency.name, version: match.dependency.version, severityEstimated: severity.estimated },
        });
      }
    } catch (error) {
      osvError = error instanceof Error ? error.message : String(error);
      osvState = 'failed';
    }
  }
  const inventory = resolveInventoryIssues(archive.manifests, archive.manifestIssues);
  const issueGroups = [...new Map(inventory.map((issue) => [`${issue.manifest}:${issue.kind}`, issue])).values()];
  for (const issue of issueGroups.slice(0, 100)) {
    const excluded = issue.kind === 'invalid-manifest' || issue.kind === 'inventory-limit' || issue.kind === 'unresolved-component';
    const detected = finding(`dependency-${issue.kind}`, excluded ? 'coverage' : 'dependency', excluded ? 'INFORMATIONAL' : 'LOW',
      `Inventario de dependencias: ${issue.kind}`, issue.detail, issue.manifest, null, 'Fijar versiones y conservar un lockfile compatible, válido y actualizado.');
    if (excluded) detected.evidence.scoreExcluded = true;
    archive.findings.push(detected);
  }
  const trivy = await scanImages(archive.images, options.imageScan);
  archive.findings.push(...trivy.findings);
  if (trivy.durationMs !== null) analyzerTimings['trivy:images'] = { durationMs: trivy.durationMs, scope: 'elapsed-service' };
  const withMetadata = archive.findings.map((item) => ({
    ...item,
    evidence: item.source === 'cloudops' && BUILTIN_RULE_CATALOG.rules.some((rule) => item.externalId.startsWith(`${rule.id}:`))
      ? { ...item.evidence, ruleId: item.externalId.split(':').slice(0, 2).join(':'), catalogVersion: BUILTIN_RULE_CATALOG_VERSION } : item.evidence,
    fingerprint: computeFingerprint(item),
    framework: item.framework ?? frameworkFor(item.source, item.category),
  }));
  const findings = deduplicateByFingerprint(withMetadata);
  const inventoryComplete = inventory.length === 0 && archive.manifestIssues.length < 200 && archive.images.length < 100 && archive.dependencies.length < 10_000
    && !archive.repositoryEntries.some((entry) => entry.analysisStatus === 'text-limit')
    && (!archive.images.length || trivy.state === 'completed');
  const sbomStarted = performance.now();
  const sbom = buildSbom(archive.dependencies, archive.images, trivy.components, findings, inventoryComplete);
  const sbomSha256 = sbomChecksum(sbom);
  recordAnalyzerTiming(analyzerTimings, 'cyclonedx:sbom', sbomStarted, 'elapsed-service');
  const counts = findings.reduce<Record<CodeSeverity, number>>((acc, item) => { acc[item.severity] += 1; return acc; }, { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFORMATIONAL: 0 });
  const scoreableFindings = findings.filter((item) => item.evidence.scoreExcluded !== true);
  const scoreableCounts = scoreableFindings.reduce<Record<CodeSeverity, number>>((acc, item) => { acc[item.severity] += 1; return acc; }, { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFORMATIONAL: 0 });
  const diminishingPenalty = (count: number, weight: number) => count ? weight * Math.log2(count + 1) : 0;
  const rawPenalty = diminishingPenalty(scoreableCounts.CRITICAL, 22) + diminishingPenalty(scoreableCounts.HIGH, 12)
    + diminishingPenalty(scoreableCounts.MEDIUM, 5) + diminishingPenalty(scoreableCounts.LOW, 2);
  const calculatedScore = Math.max(0, Math.round(100 - Math.min(100, rawPenalty)));
  const criticalSecretExposure = scoreableFindings.some((item) => item.category === 'secret' && item.severity === 'CRITICAL');
  const score = criticalSecretExposure ? Math.min(45, calculatedScore) : calculatedScore;
  const coverageMatrix: StaticCoverageDomain[] = [
    { id: 'secrets', label: 'Secretos y credenciales', status: archive.domainFileCounts.secrets ? 'measured' : 'not-detected', files: archive.domainFileCounts.secrets, detail: archive.domainFileCounts.secrets ? 'Archivos de texto inspeccionados mediante firmas de credenciales y archivos sensibles.' : 'No se encontraron archivos de texto analizables.' },
    { id: 'source-code', label: 'Código fuente (reglas internas)', status: archive.domainFileCounts['source-code'] ? 'measured' : 'not-detected', files: archive.domainFileCounts['source-code'], detail: archive.domainFileCounts['source-code'] ? `Reglas internas aplicadas a ${archive.domainFileCounts['source-code']} archivo(s). El análisis de flujo Semgrep se informa por separado.` : 'No se detectaron extensiones de código admitidas.' },
    { id: 'dependencies', label: 'Dependencias conocidas', status: archive.domainFileCounts.dependencies ? (osvState === 'completed' ? 'measured' : 'partial') : 'not-detected', files: archive.domainFileCounts.dependencies, detail: archive.domainFileCounts.dependencies ? `${vulnerabilitiesChecked} de ${deduplicatedDependencies.length} versiones consultadas en OSV. ${osvState === 'completed' ? 'Consulta completa.' : osvError ?? (osvState === 'skipped' ? 'Consulta omitida o sin versiones compatibles.' : 'Consulta incompleta.')}` : 'No se encontró un lockfile compatible; no se calificaron vulnerabilidades de dependencias.' },
    { id: 'iac', label: 'Infraestructura como código', status: archive.domainFileCounts.iac ? 'measured' : 'not-detected', files: archive.domainFileCounts.iac, detail: archive.domainFileCounts.iac ? 'Terraform/CloudFormation inspeccionado con reglas de exposición, IAM y cifrado.' : 'No se detectó Terraform o CloudFormation; este dominio no fue medido.' },
    { id: 'containers', label: 'Contenedores', status: archive.domainFileCounts.containers ? 'measured' : 'not-detected', files: archive.domainFileCounts.containers, detail: archive.domainFileCounts.containers ? 'Dockerfiles y/o archivos Compose inspeccionados.' : 'No se detectaron definiciones Docker; este dominio no fue medido.' },
    { id: 'configuration', label: 'Configuración desplegable', status: archive.domainFileCounts.configuration ? 'measured' : 'not-detected', files: archive.domainFileCounts.configuration, detail: archive.domainFileCounts.configuration ? 'Archivos de configuración inspeccionados para exposición y valores inseguros.' : 'No se detectaron archivos de configuración compatibles.' },
  ];
  const textLimited = archive.repositoryEntries.filter((entry) => entry.analysisStatus === 'text-limit');
  for (const domain of coverageMatrix) {
    const skipped = textLimited.filter((entry) => domainsForPath(entry.path).includes(domain.id)).length;
    if (skipped || staticFindingLimitReached && domain.id !== 'dependencies' && domain.status !== 'not-detected') {
      domain.status = 'partial';
      domain.detail += skipped ? ` ${skipped} archivo(s) omitido(s) por límite de texto.` : ' Se alcanzó el límite de 500 hallazgos estáticos.';
    }
  }
  if (inventory.length || archive.dependencies.length >= 10_000 || archive.manifestIssues.length >= 200) {
    const domain = coverageMatrix.find((domain) => domain.id === 'dependencies')!;
    domain.status = 'partial';
    domain.detail += ` ${inventory.length} observación(es) de inventario o versiones no resueltas.`;
  }
  let observedControls = coverageMatrix.reduce((total, domain) => total + (domain.status === 'measured' ? 1 : domain.status === 'partial' && domain.files > 0 ? 0.5 : 0), 0);
  let totalControls = coverageMatrix.length;
  if (sast.filesCandidate > 0) {
    totalControls++;
    observedControls += sast.state === 'completed' ? 1 : sast.state === 'partial' && sast.filesAnalyzed > 0 ? 0.5 : 0;
  }
  if (archive.images.length) {
    totalControls++;
    observedControls += trivy.state === 'completed' ? 1 : trivy.state === 'partial' && (trivy.components.length > 0 || trivy.findings.length > 0) ? 0.5 : 0;
  }
  const coverage = Math.round(observedControls / totalControls * 100);
  const layerLabels: Record<RepositoryLayer, string> = {
    backend: 'Backend', frontend: 'Frontend', infrastructure: 'Infraestructura / Compose', dependencies: 'Dependencias', shared: 'Compartido / raíz',
  };
  const layerBreakdown: LayerBreakdown[] = (Object.keys(layerLabels) as RepositoryLayer[]).map((id) => {
    const layerFindings = findings.filter((item) => classifyRepositoryPath(item.resource ?? '', item.category) === id);
    const layerCounts = layerFindings.reduce<Record<CodeSeverity, number>>((acc, item) => { acc[item.severity] += 1; return acc; }, { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFORMATIONAL: 0 });
    const files = archive.layerFiles[id];
    return {
      id, label: layerLabels[id], candidateFiles: files.candidateFiles, analyzedFiles: files.analyzedFiles,
      readCoverage: files.candidateFiles ? Math.round(files.analyzedFiles / files.candidateFiles * 100) : 0,
      findings: layerFindings.length, counts: layerCounts,
    };
  });
  return {
    score, coverage, confidence: coverage === 100 ? 'high' as const : coverage >= 75 ? 'medium' as const : 'low' as const,
    findings, sbom,
    summary: {
      counts, observedControls, totalControls, entryCount: archive.entryCount, uncompressedBytes: archive.uncompressedBytes,
      scoreableCounts, excludedFromScore: findings.length - scoreableFindings.length,
      scoreCapsApplied: criticalSecretExposure ? ['critical-secret-exposure:45'] : [],
      filesAnalyzed: archive.filesAnalyzed, dependencyCount: deduplicatedDependencies.length, vulnerabilitiesChecked,
      osvAvailable, osvError, osvState, osvMetrics, analyzerTimings, archiveDurationMs, sast,
      scanLimits: [...osvLimits, ...(textLimited.length ? ['zip-text-limit'] : []), ...(staticFindingLimitReached ? ['static-finding-limit'] : []),
        ...(archive.images.length >= 100 ? ['image-inventory-limit'] : []), ...(archive.manifestIssues.length >= 200 ? ['manifest-issue-limit'] : []),
        ...(archive.dependencies.length >= 10_000 ? ['dependency-inventory-limit'] : [])],
      filesSkippedByTextLimit: textLimited.length,
      supplyChain: { format: sbom.bomFormat, specVersion: sbom.specVersion, sha256: sbomSha256, componentCount: sbom.components.length,
        manifestCount: archive.manifests.length, licenseCount: sbom.components.filter((component) => component.licenses?.length).length,
        inventoryComplete, issues: inventory.slice(0, 200), images: archive.images, trivy: { state: trivy.state, reason: trivy.reason, results: trivy.results, tool: trivy.tool } },
      extensions: archive.extensions,
      detectedArchitecture: {
        source: 'repository-static-evidence',
        components: archive.components,
        componentCount: archive.components.length,
      },
      layerBreakdown,
      repositoryInventory: { entries: archive.repositoryEntries, complete: true },
      coverageMatrix,
      rulesExecuted: Object.keys(ruleExecutions).length,
      ruleCatalog: { version: BUILTIN_RULE_CATALOG.version, sha256: BUILTIN_RULE_CATALOG.sha256, declaredRules: RULES.length, executions: ruleExecutions },
      scoreScope: 'Riesgo estático observado en los archivos cubiertos; no representa por sí solo la seguridad total del sistema desplegado.',
      limitations: [
        'No se ejecutó el código ni se enviaron solicitudes a una aplicación en funcionamiento.',
        'No se probaron controles del proveedor cloud salvo en una evaluación combinada con la cuenta AWS.',
        'La ausencia de un hallazgo no demuestra ausencia de una vulnerabilidad.',
      ],
      methodology: 'Análisis estático basado en evidencias del repositorio: secretos, patrones de código, configuración/IaC, contenedores e inventario de dependencias contrastado con OSV.',
      methodologyVersion: '2026.17',
    },
  };
}
