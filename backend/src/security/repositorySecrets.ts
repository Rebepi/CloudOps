import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CodeFinding } from '../zipSecurityScanner.js';
import { computeFingerprint } from '../findingFingerprint.js';
import { sourceContext } from './sastCatalog.js';
import { executeDockerTool, executeTool, GITLEAKS_IMAGE } from './toolProcess.js';

export type SecretSource = { path: string; text?: string; skipReason?: string };
export type SecretScanOptions = { enabled: boolean; mode?: 'docker' | 'native'; executable?: string;
  run?: (args: string[], context: { stageDirectory: string; rulesDirectory: string; timeoutMs: number }) => Promise<string> };
export const SECRET_CATALOG_VERSION = '2026.10.1';
const rulesDirectory = fileURLToPath(new URL('../../security-rules/', import.meta.url));
const genericRule = (id: string) => id === 'generic-api-key' || id.startsWith('cloudops-') || /(?:postgres|mysql|mongodb).*(?:password|connection)/.test(id);
const privateKeyRule = (id: string) => /private-key|openssh-key/.test(id);
const templatePath = (path: string) => /(?:^|\/)(?:examples?|samples?|templates?)(?:\/|$)|(?:^|\/)\.env\.(?:example|sample|template)(?:\.|$)|\.(?:example|sample|template)$/i.test(path.replace(/\\/g, '/'));
const weights: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFORMATIONAL: 4 };

function secretContext(path: string) {
  const normalized = path.replace(/\\/g, '/');
  if (templatePath(path)) return 'template';
  if (/(?:^|\/)(?:tests?|__tests__|fixtures?|mocks?|interaction-tests)(?:\/|$)/i.test(normalized)) return 'test';
  if (/(?:^|\/)\.github\/(?:workflows|actions)\//i.test(normalized)) return 'application';
  const context = sourceContext(path);
  if (context === 'migration') return context;
  return context === 'test' && /\.(?:py|js|jsx|ts|tsx|php|java|go|rb|cs)$/i.test(normalized) ? 'test' : 'application';
}

export async function getSecretCatalog() {
  const pack = await readFile(join(rulesDirectory, 'gitleaks-v1.toml'));
  return { version: SECRET_CATALOG_VERSION, sha256: createHash('sha256').update(pack).digest('hex'), extendsDefault: true,
    defaultEngineVersion: '8.30.1', defaultEngineImage: GITLEAKS_IMAGE,
    customRules: ['cloudops-assigned-secret', 'cloudops-db-credentials'], redaction: '100%', maxDecodeDepth: 1, maxArchiveDepth: 0 };
}

function observation(finding: CodeFinding) {
  if (Array.isArray(finding.evidence.observations)) return finding.evidence.observations;
  return [{ source: finding.source, externalId: finding.externalId, fingerprint: computeFingerprint(finding), title: finding.title, category: finding.category,
    severity: finding.severity, resource: finding.resource, recommendation: finding.recommendation, evidence: { ...finding.evidence } }];
}

function corroborate(primary: CodeFinding, other: CodeFinding): CodeFinding {
  const excluded = primary.evidence.scoreExcluded === true && other.evidence.scoreExcluded === true;
  return { ...primary, severity: (weights[other.severity] ?? 9) < (weights[primary.severity] ?? 9) ? other.severity : primary.severity,
    evidence: { ...primary.evidence, ownerSuggested: primary.evidence.ownerSuggested ?? other.evidence.ownerSuggested,
      scoreExcluded: excluded, observations: [...observation(primary), ...observation(other)] } };
}

export function parseSecretReport(report: unknown, files: Map<string, string>) {
  if (!Array.isArray(report)) throw new Error('Gitleaks no devolvió una lista JSON válida.');
  const findings: CodeFinding[] = [];
  let invalid = 0;
  let limited = false;
  for (const raw of report) {
    if (!raw || typeof raw !== 'object') { invalid++; continue; }
    const result = raw as Record<string, unknown>;
    const rule = typeof result.RuleID === 'string' ? result.RuleID : '';
    const file = typeof result.File === 'string' ? files.get(result.File.replace(/\\/g, '/').split('/').pop()!) : undefined;
    if (!file || !/^[a-zA-Z0-9._-]{1,120}$/.test(rule) || typeof result.StartLine !== 'number' || !Number.isInteger(result.StartLine) || result.StartLine < 1) { invalid++; continue; }
    if (findings.length >= 500) { invalid++; limited = true; continue; }
    const context = secretContext(file);
    const generic = genericRule(rule) && !privateKeyRule(rule);
    const excluded = generic && (context === 'test' || context === 'template');
    const column = typeof result.StartColumn === 'number' && Number.isInteger(result.StartColumn) && result.StartColumn > 0 ? result.StartColumn : null;
    const endColumn = typeof result.EndColumn === 'number' && Number.isInteger(result.EndColumn) && result.EndColumn > 0 ? result.EndColumn : null;
    const endLine = typeof result.EndLine === 'number' && Number.isInteger(result.EndLine) && result.EndLine >= result.StartLine ? result.EndLine : result.StartLine;
    findings.push({ externalId: `gitleaks:${rule}:${createHash('sha256').update(`${file}:${result.StartLine}:${column ?? 0}`).digest('hex').slice(0, 24)}`,
      source: 'gitleaks', category: 'secret', title: privateKeyRule(rule) ? 'Posible clave privada en el repositorio' : 'Posible credencial detectada por Gitleaks',
      description: excluded ? 'Coincidencia genérica en prueba o plantilla; se conserva como contexto sin penalizar.' : 'El motor identificó una firma o patrón de credencial. El valor, el match y el fragmento se descartan.',
      severity: excluded ? 'INFORMATIONAL' : privateKeyRule(rule) ? 'CRITICAL' : 'HIGH', status: 'open', resource: file,
      recommendation: privateKeyRule(rule) ? 'Validar, revocar y reemplazar la clave en su origen; retirar el material privado y usar un gestor de secretos.'
        : 'Validar la credencial, rotarla o revocarla en su proveedor y sustituirla por una referencia a un gestor de secretos. No se rota automáticamente.',
      framework: 'CWE-798 / OWASP Top 10 A02 y A07',
      evidence: { ruleId: rule, catalogVersion: SECRET_CATALOG_VERSION, file, line: result.StartLine, endLine, column, endColumn,
        context, confidence: generic ? 'generic-entropy' : 'provider-pattern', scoreExcluded: excluded,
        entropy: typeof result.Entropy === 'number' && Number.isFinite(result.Entropy) ? result.Entropy : null,
        ownerSuggested: /(?:^|\/)backend\//i.test(file.replace(/\\/g, '/')) ? 'Equipo backend' : /(?:^|\/)frontend\//i.test(file.replace(/\\/g, '/')) ? 'Equipo frontend'
          : /(?:^|\/)(?:infra|terraform|\.github)\//i.test(file.replace(/\\/g, '/')) ? 'Equipo de infraestructura' : 'Mantenedores del proyecto' } });
  }
  const combined: CodeFinding[] = [];
  // Corroborate generic/provider matches only when their single-line spans overlap.
  for (const finding of findings.sort((a, b) => Number(a.evidence.confidence === 'generic-entropy') - Number(b.evidence.confidence === 'generic-entropy'))) {
    const matches = combined.map((other, index) => ({ other, index })).filter(({ other }) => other.resource === finding.resource && other.evidence.line === finding.evidence.line
      && other.evidence.endLine === other.evidence.line && finding.evidence.endLine === finding.evidence.line
      && (other.evidence.confidence === 'generic-entropy' || finding.evidence.confidence === 'generic-entropy')
      && typeof other.evidence.column === 'number' && typeof other.evidence.endColumn === 'number'
      && typeof finding.evidence.column === 'number' && typeof finding.evidence.endColumn === 'number'
      && other.evidence.column <= finding.evidence.endColumn && finding.evidence.column <= other.evidence.endColumn);
    const index = matches.length === 1 ? matches[0]!.index : -1;
    if (index < 0) combined.push(finding);
    else combined[index] = corroborate(combined[index]!, finding);
  }
  return { findings: combined, invalid, limited, detections: findings.length };
}

export function mergeSecretFindings(builtin: CodeFinding[], detected: CodeFinding[]) {
  const findings = [...detected];
  const remaining: CodeFinding[] = [];
  for (const finding of builtin) {
    const id = finding.externalId.split(':')[1];
    const keyFile = /(?:^|\/)(?:id_rsa|id_ed25519|id_ecdsa)$/i.test((finding.resource ?? '').replace(/\\/g, '/'));
    const matches = finding.source === 'cloudops' && ['hardcoded-secret', 'database-url', 'private-key', 'aws-access-key', ...(keyFile ? ['sensitive-file'] : [])].includes(id ?? '')
      ? findings.map((candidate, index) => ({ candidate, index })).filter(({ candidate }) => candidate.resource === finding.resource && (candidate.evidence.line === finding.evidence.line || id === 'sensitive-file' && privateKeyRule(String(candidate.evidence.ruleId)))
        && (id !== 'private-key' || privateKeyRule(String(candidate.evidence.ruleId)))
        && (id !== 'aws-access-key' || /aws/.test(String(candidate.evidence.ruleId)))) : [];
    const index = matches.length === 1 ? matches[0]!.index : -1;
    if (index < 0) { remaining.push(finding); continue; }
    const primary = findings[index]!;
    findings[index] = primary.evidence.scoreExcluded === true && finding.evidence.scoreExcluded !== true
      ? corroborate(finding, primary) : corroborate(primary, finding);
  }
  return [...remaining, ...findings];
}

export async function scanRepositorySecrets(sources: SecretSource[], options: SecretScanOptions | null) {
  const started = performance.now();
  const selected: SecretSource[] = [];
  const skipped: { path: string; reason: string }[] = [];
  let bytes = 0;
  for (const source of sources) {
    const size = typeof source.text === 'string' ? Buffer.byteLength(source.text) : 0;
    if (typeof source.text !== 'string' || source.skipReason) skipped.push({ path: source.path, reason: source.skipReason ?? 'Texto no disponible.' });
    else if (selected.length >= 2000 || size > 2 * 1024 * 1024 || bytes + size > 40 * 1024 * 1024) skipped.push({ path: source.path, reason: 'Límite Gitleaks de archivos o bytes.' });
    else { selected.push(source); bytes += size; }
  }
  const base = { catalog: { version: SECRET_CATALOG_VERSION, sha256: null as string | null, extendsDefault: true },
    engine: { name: 'gitleaks', mode: options?.mode ?? 'docker', image: (options?.mode ?? 'docker') === 'docker' ? GITLEAKS_IMAGE : null,
      version: (options?.mode ?? 'docker') === 'docker' ? '8.30.1' : null },
    filesCandidate: sources.length, filesAnalyzed: 0, filesSkipped: skipped.length, skipped: skipped.slice(0, 100), detections: 0,
    limits: skipped.some((source) => /límite|bytes/i.test(source.reason)) ? ['gitleaks-input-limit'] : [] as string[], invalidResults: 0 };
  const finish = (state: 'completed' | 'partial' | 'failed' | 'skipped', reason: string | null, findings: CodeFinding[] = [], executed = false) => ({
    ...base, state, reason, findings, durationMs: executed ? Math.max(0, Math.round(performance.now() - started)) : null,
  });
  if (!options?.enabled) return finish('skipped', 'Gitleaks no está habilitado.');
  if (!selected.length) return finish('skipped', 'No hay archivos de texto disponibles dentro de los límites.');
  const parent = join(tmpdir(), 'opencode');
  let stageDirectory: string | undefined;
  const files = new Map<string, string>();
  try {
    await mkdir(parent, { recursive: true });
    stageDirectory = await mkdtemp(join(parent, 'cloudops-secrets-'));
    base.catalog.sha256 = (await getSecretCatalog()).sha256;
    const input = join(stageDirectory, 'input');
    await mkdir(input);
    for (const source of selected) {
      const extension = /\.([A-Za-z0-9]{1,12})$/.exec(source.path)?.[1]?.toLowerCase() ?? 'txt';
      const name = `${createHash('sha256').update(source.path).digest('hex')}.${extension}`;
      files.set(name, source.path);
      await writeFile(join(input, name), source.text!, { flag: 'wx' });
    }
    const docker = (options.mode ?? 'docker') === 'docker';
    const args = ['dir', docker ? '/src' : input, '--config', docker ? '/rules/gitleaks-v1.toml' : join(rulesDirectory, 'gitleaks-v1.toml'),
      '--report-format', 'json', '--report-path', '-', '--redact=100', '--exit-code', '0', '--no-banner', '--no-color', '--log-level', 'error',
      '--ignore-gitleaks-allow', '--gitleaks-ignore-path', docker ? '/tmp' : stageDirectory,
      '--max-target-megabytes', '2', '--max-decode-depth', '1', '--max-archive-depth', '0'];
    const output = options.run ? await options.run(args, { stageDirectory: input, rulesDirectory, timeoutMs: 120_000 })
      : docker ? await executeDockerTool(GITLEAKS_IMAGE, args, 120_000, { kind: 'gitleaks', mounts: [
        { source: input, target: '/src' }, { source: rulesDirectory, target: '/rules' },
      ] }) : await executeTool(options.executable ?? 'gitleaks', args, 120_000, 'Gitleaks');
    const parsed = parseSecretReport(JSON.parse(output), files);
    base.filesAnalyzed = selected.length;
    base.detections = parsed.detections;
    base.invalidResults = parsed.invalid;
    if (parsed.limited) base.limits.push('gitleaks-finding-limit');
    const partial = parsed.invalid > 0 || skipped.length > 0;
    return finish(partial ? 'partial' : 'completed', parsed.limited ? 'Se alcanzó el límite de quinientos hallazgos Gitleaks.'
      : partial ? 'Hubo fuentes omitidas o resultados no normalizables.' : null, parsed.findings, true);
  } catch (error) {
    if (error instanceof Error && /presupuesto/i.test(error.message)) base.limits.push('gitleaks-time-budget');
    if (error instanceof Error && /salida superior/i.test(error.message)) base.limits.push('gitleaks-output-limit');
    return finish('failed', 'No se pudo completar Gitleaks; revisar motor, configuración y límites.', [], true);
  } finally {
    if (stageDirectory) await rm(stageDirectory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
}
