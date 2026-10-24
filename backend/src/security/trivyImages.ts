import type { CodeFinding } from '../zipSecurityScanner.js';
import { componentRef, type ImageReference, type SbomComponent } from './supplyChain.js';
import { executeDockerTool, executeTool, TRIVY_IMAGE } from './toolProcess.js';

export type ImageCommandRunner = (executable: string, args: string[], timeoutMs: number) => Promise<string>;
export type TrivyOptions = { enabled: boolean; executable?: string; mode?: 'native' | 'docker'; image?: string; run?: ImageCommandRunner; now?: () => number };

const execute: ImageCommandRunner = (executable, args, timeoutMs) => executeTool(executable, args, timeoutMs, 'Trivy');

const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown) => typeof value === 'string' ? value : '';
const list = (value: unknown) => Array.isArray(value) ? value : [];
const knownSeverity = (value: unknown) => ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFORMATIONAL'].includes(text(value).toUpperCase());
const severity = (value: unknown): CodeFinding['severity'] => knownSeverity(value) ? text(value).toUpperCase() as CodeFinding['severity'] : 'MEDIUM';

export function parseTrivyReport(report: unknown, image: string) {
  const document = object(report);
  if (!Array.isArray(document.Results)) throw new Error('Trivy no devolvió una lista de resultados válida.');
  const findings: CodeFinding[] = [];
  const components = new Map<string, SbomComponent>();
  const digest = list(object(document.Metadata).RepoDigests).map(text).find((value) => /@sha256:[a-f0-9]{64}$/.test(value));
  if (digest) components.set(componentRef(image), { type: 'container', 'bom-ref': componentRef(image), name: image,
    hashes: [{ alg: 'SHA-256', content: digest.slice(-64) }], properties: [{ name: 'cloudops:observed-image-digest', value: digest }] });
  let truncated = false;
  let incomplete = document.Results.length === 0;
  const diagnostics = { missingPackageIdentity: 0, unknownSeverity: 0, missingAdvisoryId: 0, emptyResults: document.Results.length === 0 };
  const add = (finding: CodeFinding) => { if (findings.length < 1000) findings.push(finding); else truncated = true; };
  for (const raw of document.Results) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Trivy devolvió un resultado de imagen inválido.');
    const result = object(raw);
    if (!text(result.Target)) throw new Error('Trivy devolvió un resultado sin objetivo identificable.');
    for (const field of ['Packages', 'Vulnerabilities', 'Secrets', 'Licenses']) {
      if (field in result && !Array.isArray(result[field])) throw new Error('Trivy devolvió una colección inválida.');
    }
    const target = text(result.Target);
    const packageComponent = (pkg: Record<string, unknown>) => {
      const name = text(pkg.Name) || text(pkg.PkgName);
      const version = text(pkg.Version) || text(pkg.InstalledVersion);
      if (!name || !version) { incomplete = true; diagnostics.missingPackageIdentity++; return undefined; }
      const rawPurl = text(object(pkg.Identifier).PURL) || text(object(pkg.PkgIdentifier).PURL);
      const purl = /^pkg:[^\s]+$/.test(rawPurl) ? rawPurl : undefined;
      const ref = purl ?? componentRef(`${image}:${target}:${name}:${version}`);
      if (!components.has(ref) && components.size >= 10_000) { truncated = true; return undefined; }
      const licenses = list(pkg.Licenses).filter((license): license is string => typeof license === 'string' && license.trim().length > 0);
      components.set(ref, { ...components.get(ref), type: 'library', 'bom-ref': ref, name, version, ...(purl ? { purl } : {}),
        properties: [{ name: 'cloudops:image', value: image }, { name: 'cloudops:target', value: target }],
        ...(licenses.length ? { licenses: licenses.map((license) => ({ license: { name: license.trim() } })) } : {}) });
      return ref;
    };
    for (const pkg of list(result.Packages)) packageComponent(object(pkg));
    for (const raw of list(result.Vulnerabilities)) {
      const vulnerability = object(raw);
      const id = text(vulnerability.VulnerabilityID);
      if (!id) { incomplete = true; diagnostics.missingAdvisoryId++; continue; }
      if (!knownSeverity(vulnerability.Severity)) { incomplete = true; diagnostics.unknownSeverity++; }
      const ref = packageComponent(vulnerability);
      const fixed = text(vulnerability.FixedVersion);
      add({ externalId: `trivy:vulnerability:${componentRef(`${image}:${target}:${id}:${text(vulnerability.PkgName)}:${text(vulnerability.InstalledVersion)}`)}`,
        source: 'trivy', category: 'dependency', title: `${id} afecta ${text(vulnerability.PkgName)}`, description: text(vulnerability.Description) || text(vulnerability.Title) || 'Vulnerabilidad de imagen detectada por Trivy.',
        severity: severity(vulnerability.Severity), status: 'open', resource: image,
        recommendation: fixed ? `Actualizar el paquete o imagen a una versión corregida: ${fixed}.` : 'Revisar la versión corregida indicada por el proveedor y reconstruir la imagen.',
        evidence: { advisory: id, advisoryUrl: /^CVE-\d{4}-\d+$/.test(id) ? `https://nvd.nist.gov/vuln/detail/${id}` : 'https://trivy.dev/',
          package: text(vulnerability.PkgName), version: text(vulnerability.InstalledVersion), fixedVersion: fixed || null, severityEstimated: !knownSeverity(vulnerability.Severity), componentRef: ref ?? null, target } });
    }
    for (const raw of list(result.Secrets)) {
      const secret = object(raw);
      const id = text(secret.RuleID) || 'unknown-rule';
      if (!knownSeverity(secret.Severity)) { incomplete = true; diagnostics.unknownSeverity++; }
      add({ externalId: `trivy:secret:${componentRef(`${image}:${target}:${id}:${secret.StartLine ?? 0}`)}`, source: 'trivy', category: 'secret',
        title: `Posible secreto en imagen: ${text(secret.Title) || id}`, description: 'Trivy detectó una firma de secreto en la imagen. El valor y el fragmento se descartan.',
        severity: severity(secret.Severity), status: 'open', resource: image, recommendation: 'Validar y rotar el secreto; reconstruir la imagen sin credenciales.',
        evidence: { ruleId: id, target, line: typeof secret.StartLine === 'number' ? secret.StartLine : null, severityEstimated: !knownSeverity(secret.Severity) } });
    }
    for (const raw of list(result.Licenses)) {
      const license = object(raw);
      const name = text(license.Name);
      if (!name) continue;
      for (const component of components.values()) {
        if (component.name === text(license.PkgName)) component.licenses = [...new Map([...(component.licenses ?? []), { license: { name } }].map((entry) => [entry.license.name, entry])).values()];
      }
      add({ externalId: `trivy:license:${componentRef(`${image}:${target}:${text(license.PkgName)}:${name}`)}`, source: 'trivy', category: 'license',
        title: `Licencia detectada: ${name}`, description: 'Inventario informativo de licencias; no determina compatibilidad legal.', severity: 'INFORMATIONAL', status: 'open', resource: image,
        recommendation: 'Revisar la licencia y las obligaciones aplicables al uso del componente.', evidence: { license: name, package: text(license.PkgName), target } });
    }
  }
  return { findings, components: [...components.values()], truncated, incomplete, diagnostics };
}

export async function scanImages(images: ImageReference[], options: TrivyOptions | null) {
  const findings: CodeFinding[] = [];
  const components: SbomComponent[] = [];
  const results: { reference: string; state: 'completed' | 'partial' | 'failed' | 'skipped'; detail: string }[] = [];
  const now = options?.now ?? (() => performance.now());
  const started = now();
  const tool = { name: 'Trivy', mode: options?.mode ?? 'native', image: options?.mode === 'docker' ? options.image ?? TRIVY_IMAGE : null };
  const unique = [...new Set(images.map((image) => image.reference))];
  if (!options?.enabled || !unique.length) return { findings, components, results, tool, state: 'skipped' as const, durationMs: null,
    reason: !unique.length ? 'No se detectaron imágenes.' : 'Trivy no está habilitado.' };
  let attempted = 0;
  for (const reference of unique) {
    const remaining = 120_000 - (now() - started);
    if (!/^[a-z0-9][a-z0-9._:/-]*(?:@sha256:[a-f0-9]{64})?$/.test(reference) || reference.includes('://')) {
      results.push({ reference, state: 'skipped', detail: 'Referencia no válida o con variables sin resolver.' }); continue;
    }
    if (attempted >= 3 || remaining <= 0) { results.push({ reference, state: 'skipped', detail: 'Límite de tres imágenes o presupuesto de 120 s alcanzado.' }); continue; }
    attempted++;
    try {
      const run: ImageCommandRunner = options.run ?? (options.mode === 'docker'
        ? (_executable, args, timeout) => executeDockerTool(options.image ?? TRIVY_IMAGE, ['--cache-dir', '/cache', ...args], timeout, { kind: 'trivy' }) : execute);
      const output = await run(options.executable ?? 'trivy', ['image', '--image-src', 'remote', '--scanners', 'vuln,secret,license',
        '--format', 'json', '--exit-code', '0', '--list-all-pkgs', '--license-full', '--quiet', '--timeout', `${Math.max(1, Math.floor(remaining / 1000))}s`, '--', reference], remaining);
      const report = parseTrivyReport(JSON.parse(output), reference);
      findings.push(...report.findings);
      components.push(...report.components);
      results.push({ reference, state: report.truncated || report.incomplete ? 'partial' : 'completed', detail: report.truncated ? 'Se alcanzó el límite de mil hallazgos o diez mil componentes por imagen.' : report.incomplete
        ? `Metadatos incompletos: ${report.diagnostics.missingPackageIdentity} identidades de paquete, ${report.diagnostics.unknownSeverity} severidades y ${report.diagnostics.missingAdvisoryId} identificadores de aviso; resultados vacíos: ${report.diagnostics.emptyResults}.` : 'Imagen analizada.' });
    } catch (error) { results.push({ reference, state: 'failed', detail: error instanceof SyntaxError ? 'Trivy devolvió JSON inválido.' : error instanceof Error ? error.message : 'Error de Trivy.' }); }
  }
  return { findings, components, results, tool, state: results.every((result) => result.state === 'completed') ? 'completed' as const
    : results.some((result) => result.state === 'completed' || result.state === 'partial') ? 'partial' as const
      : results.some((result) => result.state === 'failed') ? 'failed' as const : 'skipped' as const,
    durationMs: Math.max(0, Math.round(now() - started)), reason: null };
}
