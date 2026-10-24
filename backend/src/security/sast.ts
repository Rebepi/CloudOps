import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CodeFinding } from '../zipSecurityScanner.js';
import { SAST_CATALOG_VERSION, SAST_RULES, sourceContext, sourceLanguage } from './sastCatalog.js';
import { executeDockerTool, executeTool, SEMGREP_IMAGE } from './toolProcess.js';
import { computeFingerprint } from '../findingFingerprint.js';

export type SastSource = { path: string; text?: string; skipReason?: string };
export type SastOptions = { enabled: boolean; mode?: 'docker' | 'native'; executable?: string; image?: string;
  run?: (args: string[], context: { stageDirectory: string; rulesDirectory: string; timeoutMs: number }) => Promise<string> };
export type SastState = 'completed' | 'partial' | 'failed' | 'skipped' | 'not_supported';
const rulesDirectory = fileURLToPath(new URL('../../security-rules/', import.meta.url));
const supported = new Set<string>(SAST_RULES.flatMap((rule) => [...rule.languages]));

export async function getSastCatalog() {
  const pack = await readFile(join(rulesDirectory, 'sast-v1.yaml'));
  return { version: SAST_CATALOG_VERSION, sha256: createHash('sha256').update(pack).update(JSON.stringify({ version: SAST_CATALOG_VERSION, rules: SAST_RULES })).digest('hex'), rules: SAST_RULES };
}

export function mergeSastFindings(builtin: CodeFinding[], sast: CodeFinding[]) {
  const aliases: Record<string, string> = { 'sql-string-concat': 'CWE-89', 'python-shell': 'CWE-78', 'php-exec': 'CWE-78',
    'node-command-exec': 'CWE-78', 'python-pickle': 'CWE-502', 'python-yaml-load': 'CWE-502', 'jwt-signature-disabled': 'CWE-347' };
  const remaining: CodeFinding[] = [];
  const combined = sast.map((finding) => ({ ...finding, evidence: { ...finding.evidence } }));
  for (const finding of builtin) {
    const id = finding.externalId.split(':')[1] ?? '';
    const match = finding.evidence.scoreExcluded !== true && aliases[id] ? combined.find((candidate) => candidate.resource === finding.resource
      && candidate.evidence.line === finding.evidence.line && candidate.evidence.cwe === aliases[id]) : undefined;
    if (!match) { remaining.push(finding); continue; }
    const observations = Array.isArray(match.evidence.observations) ? match.evidence.observations : [{ source: match.source, externalId: match.externalId,
      fingerprint: computeFingerprint(match), title: match.title, category: match.category, severity: match.severity,
      resource: match.resource, recommendation: match.recommendation, evidence: { ...match.evidence } }];
    observations.push({ source: finding.source, externalId: finding.externalId, fingerprint: computeFingerprint(finding), title: finding.title,
      category: finding.category, severity: finding.severity, resource: finding.resource, recommendation: finding.recommendation, evidence: finding.evidence });
    match.evidence.observations = observations;
  }
  return [...remaining, ...combined];
}

export function parseSastReport(report: unknown, files: Map<string, { path: string; language: string }>) {
  if (!report || typeof report !== 'object' || !('results' in report) || !Array.isArray(report.results)) throw new Error('Semgrep devolvió JSON sin resultados válidos.');
  const document = report as Record<string, unknown>;
  const findings: CodeFinding[] = [];
  let invalid = 0;
  const errors = Array.isArray(document.errors) ? document.errors.length : 1;
  const paths = document.paths && typeof document.paths === 'object' ? document.paths as Record<string, unknown> : {};
  const scanned = new Set<string>();
  for (const path of Array.isArray(paths.scanned) ? paths.scanned : []) {
    if (typeof path !== 'string') continue;
    const name = path.replace(/\\/g, '/').split('/').pop()!;
    if (files.has(name)) scanned.add(name);
  }
  for (const raw of report.results) {
    if (!raw || typeof raw !== 'object') { invalid++; continue; }
    const result = raw as Record<string, unknown>;
    const rule = SAST_RULES.find((candidate) => candidate.id === result.check_id);
    const name = typeof result.path === 'string' ? result.path.replace(/\\/g, '/').split('/').pop()! : '';
    const file = files.get(name);
    const start = result.start && typeof result.start === 'object' ? result.start as Record<string, unknown> : {};
    if (!rule || !file || typeof start.line !== 'number' || !Number.isInteger(start.line) || start.line < 1) { invalid++; continue; }
    if (findings.length >= 500) { invalid++; continue; }
    findings.push({ externalId: `semgrep:${rule.id}:${createHash('sha256').update(`${file.path}:${start.line}`).digest('hex').slice(0, 24)}`,
      source: 'semgrep', category: 'code', title: rule.title, description: 'Hallazgo del catálogo local mediante análisis sintáctico o flujo de datos. Requiere revisión contextual.',
      severity: rule.severity, status: 'open', resource: file.path, recommendation: rule.recommendation,
      framework: `${rule.cwe} / OWASP Top 10`, evidence: { ruleId: rule.id, catalogVersion: SAST_CATALOG_VERSION, dimension: rule.dimension,
        cwe: rule.cwe, file: file.path, line: start.line, language: file.language } });
  }
  return { findings, scanned, errors: errors + invalid, engineVersion: typeof document.version === 'string' ? document.version : null };
}

export async function scanSast(sources: SastSource[], options: SastOptions | null) {
  const started = performance.now();
  const languages = [...new Set(sources.map((source) => sourceLanguage(source.path)).filter((language): language is string => Boolean(language)))].map((language) => ({
    language, state: 'skipped' as SastState, filesCandidate: sources.filter((source) => sourceLanguage(source.path) === language).length,
    filesAnalyzed: 0, filesExcluded: sources.filter((source) => sourceLanguage(source.path) === language && (sourceContext(source.path) !== 'application' || source.text === '')).length,
    rules: SAST_RULES.filter((rule) => (rule.languages as readonly string[]).includes(language)).map((rule) => rule.id),
  }));
  const candidates = sources.filter((source) => sourceContext(source.path) === 'application' && source.text !== '');
  const unsupported = candidates.filter((source) => !supported.has(sourceLanguage(source.path) ?? ''));
  const eligible = candidates.filter((source) => supported.has(sourceLanguage(source.path) ?? ''));
  const selected: SastSource[] = [];
  const skipped: { path: string; reason: string }[] = [];
  let bytes = 0;
  for (const source of eligible) {
    const size = typeof source.text === 'string' ? Buffer.byteLength(source.text) : 0;
    if (!source.text || source.skipReason) skipped.push({ path: source.path, reason: source.skipReason ?? 'Fuente no disponible para análisis.' });
    else if (selected.length >= 2000 || size > 2 * 1024 * 1024 || bytes + size > 40 * 1024 * 1024) skipped.push({ path: source.path, reason: 'Límite SAST de archivos o bytes.' });
    else { selected.push(source); bytes += size; }
  }
  for (const language of languages) if (!supported.has(language.language)) language.state = 'not_supported';
  const base = { catalog: { version: SAST_CATALOG_VERSION, ruleCount: SAST_RULES.length, sha256: null as string | null },
    engine: { name: 'semgrep', mode: options?.mode ?? 'docker', image: (options?.mode ?? 'docker') === 'docker' ? options?.image ?? SEMGREP_IMAGE : null },
    filesCandidate: candidates.length, filesEligible: eligible.length, filesAnalyzed: 0, filesExcluded: sources.length - candidates.length,
    filesSkipped: skipped.length, unsupportedFiles: unsupported.length, languages, skipped: skipped.slice(0, 100), engineVersion: null as string | null,
    identityApplicable: selected.some((source) => sourceLanguage(source.path) === 'python' && /\b(?:jwt|jose)\b/.test(source.text ?? '')) };
  const finish = (state: SastState, reason: string | null, findings: CodeFinding[] = [], executed = false) => ({ ...base, state, reason, findings,
    durationMs: executed ? Math.max(0, Math.round(performance.now() - started)) : null });
  if (!options?.enabled) return finish('skipped', 'SAST Semgrep no está habilitado.');
  if (!eligible.length) return finish(unsupported.length ? 'not_supported' : 'skipped', unsupported.length ? 'Los lenguajes observados no tienen reglas en este catálogo.' : 'No se observaron fuentes de aplicación elegibles.');
  if (!selected.length) return finish('skipped', 'Las fuentes elegibles quedaron omitidas por límites o lectura.');
  const parent = join(tmpdir(), 'opencode');
  let stageDirectory: string | undefined;
  const files = new Map<string, { path: string; language: string }>();
  try {
    await mkdir(parent, { recursive: true });
    stageDirectory = await mkdtemp(join(parent, 'cloudops-sast-'));
    base.catalog.sha256 = (await getSastCatalog()).sha256;
    for (const source of selected) {
      const name = `${createHash('sha256').update(source.path).digest('hex')}.${source.path.split('.').pop()!.toLowerCase()}`;
      files.set(name, { path: source.path, language: sourceLanguage(source.path)! });
      await writeFile(join(stageDirectory, name), source.text!, { flag: 'wx' });
    }
    const docker = (options.mode ?? 'docker') === 'docker';
    const args = ['scan', '--config', docker ? '/rules/sast-v1.yaml' : join(rulesDirectory, 'sast-v1.yaml'), '--json', '--quiet',
      '--metrics', 'off', '--disable-version-check', '--no-git-ignore', '--no-rewrite-rule-ids', '--jobs', '2', '--timeout', '10', '--max-memory', '512',
      '--max-target-bytes', '2097152', docker ? '/src' : stageDirectory];
    const output = options.run ? await options.run(args, { stageDirectory, rulesDirectory: dirname(join(rulesDirectory, 'sast-v1.yaml')), timeoutMs: 120_000 })
      : docker ? await executeDockerTool(options.image ?? SEMGREP_IMAGE, args, 120_000, { kind: 'semgrep', mounts: [
        { source: stageDirectory, target: '/src' }, { source: rulesDirectory, target: '/rules' },
      ] }) : await executeTool(options.executable ?? 'semgrep', args, 120_000, 'Semgrep', {
        SEMGREP_SEND_METRICS: 'off', SEMGREP_ENABLE_VERSION_CHECK: '0', OTEL_SDK_DISABLED: 'true', SEMGREP_APP_TOKEN: undefined,
      });
    const parsed = parseSastReport(JSON.parse(output), files);
    base.engineVersion = parsed.engineVersion;
    base.identityApplicable ||= parsed.findings.some((finding) => finding.evidence.ruleId === 'cloudops.python.jwt-signature');
    base.filesAnalyzed = parsed.scanned.size;
    for (const language of languages) {
      if (!supported.has(language.language)) continue;
      language.filesAnalyzed = [...parsed.scanned].filter((name) => files.get(name)?.language === language.language).length;
      const expected = eligible.filter((source) => sourceLanguage(source.path) === language.language).length;
      language.state = !expected ? 'skipped' : language.filesAnalyzed === expected && !parsed.errors ? 'completed' : 'partial';
    }
    const partial = parsed.errors > 0 || parsed.scanned.size !== eligible.length || unsupported.length > 0;
    return finish(partial ? 'partial' : 'completed', partial ? 'Fuentes, lenguajes o reglas no evaluados completamente; revisar cobertura.' : null, parsed.findings, true);
  } catch {
    return finish('failed', 'No se pudo completar Semgrep; revisar instalación, motor, catálogo y límites.', [], true);
  } finally {
    if (stageDirectory) await rm(stageDirectory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
}
