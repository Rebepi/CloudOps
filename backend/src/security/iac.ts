import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, posix } from 'node:path';
import type { CodeFinding } from '../zipSecurityScanner.js';
import { computeFingerprint } from '../findingFingerprint.js';
import { executeDockerTool, executeTool, TRIVY_IMAGE } from './toolProcess.js';
import { IAC_CATALOG, iacDimension, iacFrameworkReferences } from './iacCatalog.js';
import { inspectIamDeclarations } from './iamPolicyDeclarations.js';
export { IAC_CATALOG } from './iacCatalog.js';

export type IacKind = 'terraform' | 'cloudformation' | 'kubernetes' | 'dockerfile' | 'iam-policy' | 'compose' | 'helm' | 'unknown';
export type IacSource = { path: string; kind: IacKind; text?: string; skipReason?: string };
export type IacOptions = { enabled: boolean; mode?: 'docker' | 'native'; executable?: string;
  run?: (args: string[], context: { stageDirectory: string; timeoutMs: number }) => Promise<string> };
const supported = new Set<IacKind>(['terraform', 'cloudformation', 'kubernetes', 'dockerfile', 'iam-policy']);

export function detectIacKind(path: string, text?: string): IacKind | null {
  const normalized = path.replace(/\\/g, '/').toLowerCase();
  const base = normalized.split('/').pop()!;
  if (/\.(?:tf|tfvars)(?:\.json)?$/.test(base) || /\.(?:tftpl|tpl)$/.test(base)) return 'terraform';
  if (base === 'terragrunt.hcl' || base.endsWith('.tftest.hcl')) return 'unknown';
  if (/^dockerfile(?:[._-].*)?$/.test(base)) return 'dockerfile';
  if (/^(?:docker-)?compose.*\.ya?ml$/.test(base)) return 'compose';
  if (base === 'chart.yaml' || base === 'chart.yml' || base === 'values.yaml' || base === 'values.yml') return 'helm';
  if (/\.(?:yaml|yml|json)$/.test(base)) {
    if (text && /{{[-\s]*\.(?:Values|Release|Chart|Capabilities)/.test(text)) return 'helm';
    if (text && (/AWSTemplateFormatVersion/.test(text) || /(?:^|\n)\s*Resources\s*:/.test(text) && /\bType\s*:\s*["']?AWS::/.test(text))) return 'cloudformation';
    if (text && /(?:^|\n)\s*apiVersion\s*:/.test(text) && /(?:^|\n)\s*kind\s*:/.test(text)) return 'kubernetes';
    if (text && base.endsWith('.json')) {
      try {
        const document = JSON.parse(text);
        if (document?.apiVersion && document?.kind) return 'kubernetes';
        if (document?.Resources && Object.values(document.Resources).some((value) => value && typeof value === 'object' && 'Type' in value && String(value.Type).startsWith('AWS::'))) return 'cloudformation';
        if (document?.Statement) return 'iam-policy';
        if (document?.resource_changes || /deploymenttemplate/i.test(String(document?.$schema ?? ''))) return 'unknown';
      } catch { /* Recognized filenames still get a partial tool outcome. */ }
    }
    if (text && /^Statement\s*:/m.test(text)) return 'iam-policy';
    if (/(?:cloudformation|template).*\.(?:yaml|yml|json)$/.test(base)) return 'cloudformation';
    if (/(?:iam[-_]?policy|policy-document)\.(?:yaml|yml|json)$/.test(base)) return 'iam-policy';
  }
  return null;
}

export function safeIacPath(path: string) {
  const normalized = path.replace(/\\/g, '/');
  if (!normalized || normalized.startsWith('/') || /[\x00-\x1f<>:"|?*]/.test(normalized)) return false;
  return normalized.split('/').every((part) => part && part !== '.' && part !== '..' && part.length <= 180 && !/[ .]$/.test(part)
    && !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part));
}

const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown) => typeof value === 'string' ? value : '';
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const count = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;

export function mergeIacFindings(internal: CodeFinding[], detailed: CodeFinding[], conclusiveIamFiles: string[]) {
  const known: Record<string, string[]> = { 'public-cidr': ['AWS-0107'], 'public-s3': ['AWS-0092'],
    'privileged-container': ['KSV-0017'], 'latest-image': ['DS-0001'], 'docker-root-user': ['DS-0002'], 'unencrypted-storage': ['AWS-0026'] };
  const result = detailed.map((finding) => ({ ...finding, evidence: { ...finding.evidence } }));
  const remaining: CodeFinding[] = [];
  const observation = (finding: CodeFinding) => ({ source: finding.source, externalId: finding.externalId, fingerprint: computeFingerprint(finding),
    title: finding.title, category: finding.category, severity: finding.severity, resource: finding.resource, recommendation: finding.recommendation, evidence: { ...finding.evidence } });
  for (const finding of internal) {
    const id = finding.externalId.split(':')[1] ?? '';
    const path = (finding.resource ?? '').replace(/\\/g, '/');
    if (finding.source === 'cloudops' && id === 'iam-wildcard' && conclusiveIamFiles.includes(path)) {
      remaining.push({ ...finding, severity: 'INFORMATIONAL', description: 'La heurística de comodines se conserva como contexto; el documento IAM literal fue revisado por la política semántica propia.',
        evidence: { ...finding.evidence, scoreExcluded: true, supersededBy: 'CLOUDOPS-IAM-0001' } });
      continue;
    }
    const matches = finding.source === 'cloudops' && known[id] && typeof finding.evidence.line === 'number' ? result.filter((candidate) =>
      candidate.evidence.scoreExcluded !== true && candidate.resource === path && known[id]!.includes(String(candidate.evidence.policyId))
      && typeof candidate.evidence.line === 'number' && typeof candidate.evidence.endLine === 'number'
      && Number(finding.evidence.line) >= candidate.evidence.line && Number(finding.evidence.line) <= candidate.evidence.endLine) : [];
    if (matches.length !== 1) { remaining.push(finding); continue; }
    const target = matches[0]!;
    target.evidence.observations = [...(Array.isArray(target.evidence.observations) ? target.evidence.observations : [observation(target)]), observation(finding)];
  }
  return [...remaining, ...result];
}

function reportPath(value: string, stage: string) {
  let path = value.replace(/\\/g, '/');
  const prefix = stage.replace(/\\/g, '/').replace(/\/$/, '');
  if (path.toLowerCase().startsWith(`${prefix.toLowerCase()}/`)) path = path.slice(prefix.length + 1);
  else if (path === prefix || path === '/src') return '';
  else if (path.startsWith('/src/')) path = path.slice(5);
  path = path.replace(/^\.\//, '');
  return !path || safeIacPath(path) ? path : null;
}

export function parseIacReport(report: unknown, files: IacSource[], stage: string) {
  const document = record(report);
  if (!Array.isArray(document.Results)) throw new Error('Trivy config no devolvió resultados válidos.');
  const known = new Map(files.map((file) => [file.path.replace(/\\/g, '/'), file]));
  const findings: CodeFinding[] = [];
  const reportedKinds = new Set<string>();
  const evaluatedDimensions = new Set<string>();
  let targets = 0;
  let successes = 0;
  let failures = 0;
  let exceptions = 0;
  let invalid = 0;
  let estimated = 0;
  let limited = false;
  for (const raw of document.Results) {
    const result = record(raw);
    const kind = text(result.Type);
    if (!supported.has(kind as IacKind)) { invalid++; continue; }
    const target = reportPath(text(result.Target), stage);
    if (target === null) { invalid++; continue; }
    const group = files.filter((file) => file.path === target || posix.dirname(file.path) === target || !target && posix.dirname(file.path) === '.');
    if (!group.length) { invalid++; continue; }
    if (result.Misconfigurations !== undefined && !Array.isArray(result.Misconfigurations)) { invalid++; continue; }
    const summary = record(result.MisconfSummary);
    if (count(summary.Successes) + count(summary.Failures) + count(summary.Exceptions) === 0 && !list(result.Misconfigurations).length) continue;
    targets++;
    reportedKinds.add(kind);
    successes += count(summary.Successes);
    failures += count(summary.Failures);
    exceptions += count(summary.Exceptions);
    let detailedFailures = 0;
    for (const raw of list(result.Misconfigurations)) {
      const check = record(raw);
      const checkedId = (text(check.AVDID) || text(check.ID)).replace(/^AVD-/, '');
      if (/^[A-Za-z0-9._-]{1,120}$/.test(checkedId)) evaluatedDimensions.add(iacDimension(checkedId));
      const status = text(check.Status).toUpperCase();
      if (status === 'PASS' || status === 'EXCEPTION') continue;
      if (status !== 'FAIL') { invalid++; continue; }
      detailedFailures++;
      const id = (text(check.AVDID) || text(check.ID)).replace(/^AVD-/, '');
      if (!/^[A-Za-z0-9._-]{1,120}$/.test(id)) { invalid++; continue; }
      if (findings.length >= 1000) { limited = true; continue; }
      const cause = record(check.CauseMetadata);
      let source: IacSource | undefined;
      const sourcePaths = [text(cause.Filename), ...list(record(cause.Code).Lines).map((line) => text(record(line).Filename)), target];
      for (const value of sourcePaths) {
        const candidate = reportPath(value, stage);
        if (candidate === null) continue;
        source = known.get(candidate) ?? known.get(posix.join(target, candidate));
        if (source) break;
      }
      if (!source && group.length === 1) source = group[0];
      const path = source?.path ?? target;
      const line = source && Number.isInteger(cause.StartLine) && Number(cause.StartLine) > 0 ? Number(cause.StartLine) : null;
      const endLine = line !== null && Number.isInteger(cause.EndLine) && Number(cause.EndLine) >= line ? Number(cause.EndLine) : line;
      const resource = text(cause.Resource);
      const reference = resource.length <= 500 && !/[\r\n]/.test(resource) ? resource : '';
      const rawSeverity = text(check.Severity).toUpperCase();
      const severity: CodeFinding['severity'] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].includes(rawSeverity) ? rawSeverity as CodeFinding['severity'] : 'MEDIUM';
      const severityEstimated = !['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].includes(rawSeverity);
      if (severityEstimated) estimated++;
      const fixture = /(?:^|\/)(?:tests?|__tests__|fixtures?|mocks?)(?:\/|$)/i.test(path);
      const references = list(check.References).filter((value): value is string => typeof value === 'string' && /^https:\/\//.test(value) && value.length <= 1500);
      const primary = text(check.PrimaryURL);
      findings.push({ externalId: `trivy-config:${id}:${createHash('sha256').update(`${path}:${reference}:${line ?? 0}`).digest('hex').slice(0, 24)}`,
        source: 'trivy-config', category: 'iac', title: text(check.Title).slice(0, 250) || `Configuración no conforme: ${id}`,
        description: fixture ? 'Declaración en un fixture o prueba; se conserva como contexto informativo.' : 'La política detectó una declaración insegura en el snapshot IaC. No demuestra que el recurso esté desplegado.',
        severity: fixture ? 'INFORMATIONAL' : severity, status: 'open', resource: path,
        recommendation: 'Revisar la política y corregir la declaración, validar sus dependencias y evaluar el impacto antes del despliegue.',
        framework: 'Políticas de configuración Trivy / referencias relacionadas', evidence: { policyId: id, catalogVersion: IAC_CATALOG.version, kind, dimension: iacDimension(id),
          file: source?.path ?? null, line, endLine, locationKind: source ? 'file' : 'module', resource: reference || null,
          policyUrl: /^https:\/\/(?:avd\.aquasec\.com|trivy\.dev)\//.test(primary) ? primary : null,
          references, frameworkReferences: iacFrameworkReferences(id, references), deployment: 'not-verified', severityEstimated, context: fixture ? 'test' : 'application', scoreExcluded: fixture } });
    }
    if (count(summary.Failures) > detailedFailures) invalid++;
  }
  return { findings, reportedKinds: [...reportedKinds], evaluatedDimensions: [...evaluatedDimensions], targets, successes, failures, exceptions, invalid, estimated, limited };
}

export async function scanIac(sources: IacSource[], options: IacOptions | null) {
  const started = performance.now();
  const selected: IacSource[] = [];
  const skipped: { path: string; reason: string }[] = [];
  const unresolved: { path: string; reason: string }[] = [];
  const counts = new Map<string, number>();
  for (const source of sources) counts.set(source.path.replace(/\\/g, '/').toLowerCase(), (counts.get(source.path.replace(/\\/g, '/').toLowerCase()) ?? 0) + 1);
  let bytes = 0;
  for (const source of sources) {
    const path = source.path.replace(/\\/g, '/');
    const size = typeof source.text === 'string' ? Buffer.byteLength(source.text) : 0;
    const reason = !supported.has(source.kind) ? 'Tipo sin escáner en este perfil.' : !safeIacPath(path) || counts.get(path.toLowerCase()) !== 1 ? 'Ruta insegura, duplicada o ambigua.'
      : /(?:^|\/)(?:\.terraform|\.terragrunt-cache|node_modules|vendor|\.git)(?:\/|$)/i.test(path) ? 'Dependencia o caché generada fuera del alcance.'
        : source.skipReason ?? (typeof source.text !== 'string' ? 'Fuente de texto no disponible.' : selected.length >= 1000 || size > 2 * 1024 * 1024 || bytes + size > 20 * 1024 * 1024 ? 'Límite IaC de archivos o bytes.' : null);
    if (reason) skipped.push({ path, reason });
    else { selected.push({ ...source, path }); bytes += size; }
  }
  for (const source of selected.filter((source) => source.kind === 'terraform')) {
    for (const match of source.text!.matchAll(/\bmodule\s+"[^"\r\n]+"\s*\{[^}]*\bsource\s*=\s*"([^"\r\n]+)"/g)) {
      const reference = match[1]!;
      const resolved = posix.normalize(posix.join(posix.dirname(source.path), reference));
      if (!reference.startsWith('./') && !reference.startsWith('../')) unresolved.push({ path: source.path, reason: 'Módulo externo no descargado ni ejecutado.' });
      else if (!safeIacPath(resolved) || !selected.some((file) => file.path.startsWith(`${resolved}/`))) unresolved.push({ path: source.path, reason: 'Módulo local fuera del snapshot materializado o no disponible.' });
    }
    for (const match of source.text!.matchAll(/\b(file|templatefile)\s*\(\s*"([^"\r\n]+)"/g)) {
      const reference = match[2]!.replace(/^\$\{path\.module\}\//, '');
      const resolved = posix.normalize(posix.join(posix.dirname(source.path), reference));
      if (match[1] === 'templatefile' || /\$\{|^\//.test(reference) || !safeIacPath(resolved) || !selected.some((file) => file.path === resolved)) {
        unresolved.push({ path: source.path, reason: 'Archivo o plantilla auxiliar no resuelto completamente dentro del snapshot.' });
      }
    }
  }
  for (const source of selected.filter((source) => source.kind === 'cloudformation')) {
    if (/Fn::ImportValue|!ImportValue|AWS::Include/.test(source.text ?? '')) unresolved.push({ path: source.path, reason: 'Referencia externa de CloudFormation no verificada.' });
  }
  for (const source of selected) if (/(?:trivy|tfsec):ignore:/i.test(source.text ?? '')) unresolved.push({ path: source.path, reason: 'El snapshot contiene una directiva de supresión; no se acredita un resultado limpio por ella.' });
  const iam = inspectIamDeclarations(selected);
  unresolved.push(...iam.unresolved);
  const base = { catalog: IAC_CATALOG, filesCandidate: sources.length, filesSubmitted: 0, filesSkipped: skipped.length, skipped: skipped.slice(0, 100),
    unresolved: unresolved.slice(0, 100), conclusiveIamFiles: iam.conclusiveStandaloneFiles,
    targetsAnalyzed: iam.inspectedFiles.length, checks: { successes: iam.successes, failures: iam.findings.length, exceptions: 0 },
    reportedKinds: iam.inspectedFiles.length ? ['iam-policy'] : [] as string[], evaluatedDimensions: iam.inspectedFiles.length ? ['identity'] : [] as string[],
    kinds: [...new Set(sources.map((source) => source.kind))], engine: { mode: options?.mode ?? 'docker', image: (options?.mode ?? 'docker') === 'docker' ? TRIVY_IMAGE : null, vendorInvoked: false } };
  const finish = (state: 'completed' | 'partial' | 'failed' | 'skipped' | 'not_supported', reason: string | null, findings: CodeFinding[] = [], executed = false) => ({
    ...base, state, reason, findings, durationMs: executed ? Math.max(0, Math.round(performance.now() - started)) : null,
  });
  if (!options?.enabled) return finish('skipped', 'Trivy config no está habilitado.');
  if (!selected.length) return finish(sources.length && sources.every((source) => !supported.has(source.kind)) ? 'not_supported' : 'skipped', 'No hay definiciones compatibles disponibles dentro del alcance y límites.');
  if (selected.every((source) => source.kind === 'iam-policy')) {
    base.filesSubmitted = selected.length;
    base.targetsAnalyzed = iam.inspectedFiles.length;
    base.reportedKinds = iam.inspectedFiles.length ? ['iam-policy'] : [];
    base.evaluatedDimensions = iam.inspectedFiles.length ? ['identity'] : [];
    base.checks = { successes: iam.successes, failures: iam.findings.length, exceptions: 0 };
    return finish(skipped.length || unresolved.length || !iam.inspectedFiles.length ? 'partial' : 'completed',
      'Perfil de documentos IAM literales; no se invocó el escáner Trivy.', iam.findings, true);
  }
  if (options.mode === 'native') return finish(iam.inspectedFiles.length ? 'partial' : 'not_supported', 'El análisis IaC con referencias de archivos requiere la modalidad Docker aislada.', iam.findings, iam.inspectedFiles.length > 0);
  let stage: string | undefined;
  try {
    const parent = join(tmpdir(), 'opencode');
    await mkdir(parent, { recursive: true });
    stage = await mkdtemp(join(parent, 'cloudops-iac-'));
    const input = join(stage, 'input');
    await mkdir(input);
    for (const source of selected) {
      const path = join(input, ...source.path.split('/'));
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, source.text!, { flag: 'wx' });
      base.filesSubmitted++;
    }
    const docker = (options.mode ?? 'docker') === 'docker';
    base.engine.vendorInvoked = true;
    const args = ['--cache-dir', docker ? '/tmp/trivy-iac' : join(stage, 'cache'), '--config', '', 'config', '--format', 'json', '--exit-code', '0',
      '--skip-check-update', '--disable-telemetry', '--skip-version-check', '--ignorefile', '', '--include-non-failures',
      '--misconfig-scanners', 'terraform,cloudformation,kubernetes,dockerfile', '--tf-exclude-downloaded-modules',
      '--file-patterns', 'dockerfile:(^|/)Dockerfile([._-].*)?$', '--quiet', '--timeout', '110s', docker ? '/src' : input];
    const output = options.run ? await options.run(args, { stageDirectory: input, timeoutMs: 120_000 })
      : docker ? await executeDockerTool(TRIVY_IMAGE, args, 120_000, { kind: 'trivy-config', mounts: [{ source: input, target: '/src' }] })
        : await executeTool(options.executable ?? 'trivy', args, 120_000, 'Trivy config');
    const parsed = parseIacReport(JSON.parse(output), selected, input);
    base.filesSubmitted = selected.length;
    base.targetsAnalyzed = parsed.targets + iam.inspectedFiles.length;
    base.checks = { successes: parsed.successes + iam.successes, failures: parsed.failures + iam.findings.length, exceptions: parsed.exceptions };
    base.reportedKinds = [...new Set([...parsed.reportedKinds, ...(iam.inspectedFiles.length ? ['iam-policy'] : [])])];
    base.evaluatedDimensions = [...new Set([...parsed.evaluatedDimensions, ...(iam.inspectedFiles.length ? ['identity'] : [])])];
    const missingKind = selected.some((source) => !base.reportedKinds.includes(source.kind));
    const partial = skipped.length > 0 || unresolved.length > 0 || parsed.invalid > 0 || parsed.estimated > 0 || parsed.limited || parsed.exceptions > 0
      || missingKind || base.targetsAnalyzed === 0 || base.checks.successes + base.checks.failures + base.checks.exceptions === 0;
    return finish(partial ? 'partial' : 'completed', partial ? 'Existen omisiones, referencias no resueltas, excepciones o resultados incompletos; revisar cobertura.' : null, [...parsed.findings, ...iam.findings], true);
  } catch {
    return finish(iam.inspectedFiles.length ? 'partial' : 'failed', 'No se pudo completar Trivy config; se conservan las observaciones IAM literales disponibles.', iam.findings, true);
  } finally {
    if (stage) await rm(stage, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
}
