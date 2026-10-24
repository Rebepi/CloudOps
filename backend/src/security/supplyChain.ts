import { createHash, randomUUID } from 'node:crypto';
import type { CodeFinding, Dependency } from '../zipSecurityScanner.js';

export type InventoryIssue = { manifest: string; kind: 'invalid-manifest' | 'unpinned-version' | 'missing-lockfile' | 'inventory-limit' | 'unresolved-component'; detail: string };
export type ImageReference = { reference: string; manifest: string; pinned: boolean };
export type SbomComponent = {
  type: 'library' | 'container' | 'application'; 'bom-ref': string; name: string; version?: string; purl?: string;
  licenses?: { license: { name: string } }[];
  hashes?: { alg: 'SHA-512' | 'SHA-256'; content: string }[];
  properties?: { name: string; value: string }[];
};
export type CycloneDxBom = {
  bomFormat: 'CycloneDX'; specVersion: '1.6'; serialNumber: string; version: 1;
  metadata: { timestamp: string; component: SbomComponent; tools: { components: SbomComponent[] }; properties: { name: string; value: string }[] };
  components: SbomComponent[];
  vulnerabilities: { id: string; source: { name: string; url: string }; affects: { ref: string }[]; recommendation: string }[];
};

export function packageUrl(dependency: Pick<Dependency, 'ecosystem' | 'name' | 'version'>) {
  const ecosystem = { npm: 'npm', PyPI: 'pypi', Packagist: 'composer' }[dependency.ecosystem];
  const name = dependency.ecosystem === 'PyPI' ? dependency.name.toLowerCase().replace(/[-_.]+/g, '-') : dependency.name.toLowerCase();
  return `pkg:${ecosystem}/${name.split('/').map(encodeURIComponent).join('/')}@${encodeURIComponent(dependency.version)}`;
}

export function componentRef(value: string) { return `urn:cloudops:component:${createHash('sha256').update(value).digest('hex')}`; }

export function resolvedVersion(value: unknown) {
  if (typeof value !== 'string') return null;
  const version = value.trim().replace(/^(?:==|v)/, '');
  return /^\d+(?:\.\d+)+(?:[-+][0-9A-Za-z.-]+)?$/.test(version) ? version : null;
}

export function inspectManifest(path: string, text: string): InventoryIssue[] {
  const base = path.replace(/\\/g, '/').split('/').pop()!.toLowerCase();
  const issues: InventoryIssue[] = [];
  const issue = (kind: InventoryIssue['kind'], detail: string) => issues.push({ manifest: path, kind, detail });
  if (['package.json', 'package-lock.json', 'composer.json', 'composer.lock', 'pipfile.lock'].includes(base)) {
    let document: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
      document = parsed as Record<string, unknown>;
    } catch { issue('invalid-manifest', 'El manifiesto JSON no se pudo interpretar.'); return issues; }
    if (base === 'package.json' || base === 'composer.json') {
      let declaresDependencies = false;
      for (const section of base === 'package.json' ? ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'] : ['require', 'require-dev']) {
        const dependencies = document[section];
        if (!dependencies || typeof dependencies !== 'object' || Array.isArray(dependencies)) continue;
        if (Object.keys(dependencies).some((name) => name !== 'php' && !name.startsWith('ext-'))) declaresDependencies = true;
        for (const [name, version] of Object.entries(dependencies)) {
          if (name === 'php' || name.startsWith('ext-')) continue;
          if (typeof version !== 'string' || !/^v?\d+(?:\.\d+)+(?:[-+][\w.-]+)?$/.test(version)) {
            issue('unpinned-version', `${name}: la declaración no fija una versión exacta; requiere un lockfile para conocer la versión resuelta.`);
          }
        }
      }
      if (declaresDependencies) issue('missing-lockfile', 'No se observó un lockfile compatible junto al manifiesto; no se infieren versiones instaladas.');
    }
    if (base === 'package-lock.json' && !document.packages && !document.dependencies) issue('invalid-manifest', 'El lockfile no contiene una estructura de paquetes compatible.');
    if (base === 'package-lock.json') {
      for (const field of ['packages', 'dependencies']) {
        if (field in document && (!document[field] || typeof document[field] !== 'object' || Array.isArray(document[field]))) issue('invalid-manifest', 'El lockfile contiene una colección de paquetes inválida.');
      }
      const pending: unknown[] = document.packages && typeof document.packages === 'object'
        ? Object.entries(document.packages).filter(([name]) => name.includes('node_modules/')).map(([, value]) => value)
        : document.dependencies && typeof document.dependencies === 'object' ? Object.values(document.dependencies) : [];
      while (pending.length && issues.length < 100) {
        const value = pending.pop();
        const pkg = value && typeof value === 'object' ? value as Record<string, unknown> : {};
        if (!resolvedVersion(pkg.version)) issue('unresolved-component', 'Una entrada del lockfile no contiene una versión compatible; no se inventa su versión resuelta.');
        if (!document.packages && pkg.dependencies && typeof pkg.dependencies === 'object') for (const nested of Object.values(pkg.dependencies)) pending.push(nested);
      }
    }
    if (base === 'composer.lock') {
      if (!Array.isArray(document.packages) && !Array.isArray(document['packages-dev'])) issue('invalid-manifest', 'El lockfile Composer no contiene colecciones compatibles.');
      for (const section of ['packages', 'packages-dev']) {
        const packages = document[section];
        if (section in document && !Array.isArray(packages)) issue('invalid-manifest', 'El lockfile Composer contiene una colección inválida.');
        if (Array.isArray(packages)) for (const pkg of packages) {
          if (!pkg || typeof pkg !== 'object' || !resolvedVersion(pkg.version)) issue('unresolved-component', 'Un componente Composer usa una versión no compatible con el inventario actual.');
          if (issues.length >= 100) break;
        }
      }
    }
    if (base === 'pipfile.lock') {
      for (const section of ['default', 'develop']) {
        const dependencies = document[section];
        if (section in document && (!dependencies || typeof dependencies !== 'object' || Array.isArray(dependencies))) issue('invalid-manifest', 'Pipfile contiene una colección inválida.');
        if (!dependencies || typeof dependencies !== 'object' || Array.isArray(dependencies)) continue;
        for (const value of Object.values(dependencies)) {
          if (!value || typeof value !== 'object' || !resolvedVersion((value as Record<string, unknown>).version)) issue('unresolved-component', 'Una entrada Pipfile no fija una versión compatible con el inventario.');
          if (issues.length >= 100) break;
        }
      }
    }
  } else if (/^requirements.*\.txt$/.test(base)) {
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#') || line.startsWith('--hash')) continue;
      if (!/^[A-Za-z0-9_.-]+(?:\[[\w,.-]+\])?==\d+(?:\.\d+)+(?:[-+][\w.-]+)?(?:\s+--hash=\S+)*(?:\s*;.*|\s*#.*|\s*\\)?$/.test(line)) {
        issue('unpinned-version', 'Una dependencia o inclusión de requirements no fija una versión compatible con el inventario.');
      }
    }
  } else if (base === 'pyproject.toml' && /dependencies\s*=|dynamic\s*=.*dependencies/.test(text)) {
    issue('missing-lockfile', 'El manifiesto Python declara dependencias; se requiere un lockfile compatible para inventariar versiones resueltas.');
  } else if (base === 'uv.lock' || base === 'poetry.lock') {
    const packages = text.split(/^\[\[package\]\]\s*$/m).slice(1);
    if (!packages.length) issue('invalid-manifest', 'No se reconocieron entradas de paquetes compatibles en el lockfile TOML.');
    for (const pkg of packages) {
      if (!/^name\s*=\s*["'][^"']+/m.test(pkg) || !resolvedVersion(/^version\s*=\s*["']([^"']+)/m.exec(pkg)?.[1])) issue('unresolved-component', 'Una entrada Python no contiene nombre y versión compatibles con el inventario.');
      if (issues.length >= 100) break;
    }
  }
  return issues.slice(0, 100);
}

export function inspectImages(path: string, text: string): ImageReference[] {
  const base = path.replace(/\\/g, '/').split('/').pop()!.toLowerCase();
  const docker = base === 'dockerfile';
  if (!docker && !/(?:docker-)?compose.*\.ya?ml$/.test(base)) return [];
  const stages = new Set<string>();
  const images: ImageReference[] = [];
  for (const line of text.split(/\r?\n/)) {
    const match = docker ? /^\s*FROM\s+(?:--platform=\S+\s+)?(\S+)(?:\s+AS\s+(\S+))?/i.exec(line)
      : /^\s*image\s*:\s*["']?([^\s"'#]+)["']?\s*(?:#.*)?$/.exec(line);
    const reference = match?.[1];
    if (!reference) continue;
    if (reference !== 'scratch' && !stages.has(reference.toLowerCase())) images.push({ reference, manifest: path, pinned: /@sha256:[a-f0-9]{64}$/.test(reference) });
    if (docker && match?.[2]) stages.add(match[2].toLowerCase());
  }
  return images;
}

export function inventoryIssues(manifests: string[], issues: InventoryIssue[]) {
  const known = new Set(manifests.map((path) => path.replace(/\\/g, '/')));
  const invalid = new Set(issues.filter((issue) => issue.kind === 'invalid-manifest').map((issue) => issue.manifest.replace(/\\/g, '/')));
  return issues.filter((issue) => {
    const path = issue.manifest.replace(/\\/g, '/');
    const base = path.split('/').pop()!;
    const parent = path.slice(0, -base.length);
    const locks = base === 'package.json' ? ['package-lock.json'] : base === 'composer.json' ? ['composer.lock'] : ['uv.lock', 'poetry.lock', 'Pipfile.lock'];
    const resolved = locks.some((lock) => known.has(parent + lock) && !invalid.has(parent + lock));
    if (issue.kind === 'unpinned-version' && ['package.json', 'composer.json'].includes(base) && resolved) return false;
    if (issue.kind !== 'missing-lockfile') return true;
    return !resolved;
  });
}

/** Canonical JSON defines the checksum independent of JSONB key ordering. */
export function serializeSbom(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(serializeSbom).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).filter(([, entry]) => entry !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([key, entry]) => `${JSON.stringify(key)}:${serializeSbom(entry)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}

export function sbomChecksum(bom: CycloneDxBom) { return createHash('sha256').update(serializeSbom(bom)).digest('hex'); }

export function buildSbom(dependencies: Dependency[], images: ImageReference[], imageComponents: SbomComponent[], findings: CodeFinding[], complete: boolean): CycloneDxBom {
  const components = new Map<string, SbomComponent>();
  const add = (component: SbomComponent) => {
    if (component.licenses) {
      const licenses = component.licenses.filter((license) => license.license.name.trim().length > 0)
        .map((license) => ({ license: { name: license.license.name.trim() } }));
      if (licenses.length) component.licenses = [...new Map(licenses.map((license) => [license.license.name, license])).values()];
      else delete component.licenses;
    }
    const previous = components.get(component['bom-ref']);
    if (!previous) { components.set(component['bom-ref'], component); return; }
    const properties = [...(previous.properties ?? []), ...(component.properties ?? [])];
    previous.properties = [...new Map(properties.map((property) => [`${property.name}:${property.value}`, property])).values()];
    const licenses = [...(previous.licenses ?? []), ...(component.licenses ?? [])];
    if (licenses.length) previous.licenses = [...new Map(licenses.map((license) => [license.license.name, license])).values()];
    const hashes = [...(previous.hashes ?? []), ...(component.hashes ?? [])];
    if (hashes.length) previous.hashes = [...new Map(hashes.map((hash) => [`${hash.alg}:${hash.content}`, hash])).values()];
  };
  for (const dependency of dependencies) {
    const purl = packageUrl(dependency);
    const component: SbomComponent = { type: 'library', 'bom-ref': purl, purl, name: dependency.name, version: dependency.version,
      properties: [{ name: 'cloudops:manifest', value: dependency.manifest }] };
    if (dependency.licenses?.length) component.licenses = dependency.licenses.map((name) => ({ license: { name } }));
    const integrity = /^(sha512|sha256)-([A-Za-z0-9+/]+=*)$/.exec(dependency.integrity ?? '');
    if (integrity) {
      const digest = Buffer.from(integrity[2]!, 'base64');
      if (digest.length === (integrity[1] === 'sha512' ? 64 : 32)) {
        component.hashes = [{ alg: integrity[1] === 'sha512' ? 'SHA-512' : 'SHA-256', content: digest.toString('hex') }];
        component.properties!.push({ name: 'cloudops:integrity:source', value: 'lockfile-unverified' });
      }
    }
    add(component);
  }
  for (const image of images) add({ type: 'container', 'bom-ref': componentRef(image.reference), name: image.reference,
    properties: [{ name: 'cloudops:manifest', value: image.manifest }, { name: 'cloudops:digest-pinned', value: String(image.pinned) }] });
  for (const component of imageComponents) add(component);
  const observedVulnerabilities = findings.filter((finding) => finding.category === 'dependency' && typeof finding.evidence.advisory === 'string')
    .flatMap((finding) => {
      const ref = typeof finding.evidence.componentRef === 'string' ? finding.evidence.componentRef
        : dependencies.find((dependency) => dependency.name === finding.evidence.package && dependency.version === finding.evidence.version
          && dependency.ecosystem === finding.evidence.ecosystem);
      const resolved = typeof ref === 'string' ? ref : ref ? packageUrl(ref) : undefined;
      if (!resolved || !components.has(resolved)) return [];
      const url = typeof finding.evidence.advisoryUrl === 'string' ? finding.evidence.advisoryUrl : `https://osv.dev/vulnerability/${encodeURIComponent(String(finding.evidence.advisory))}`;
      return [{ id: String(finding.evidence.advisory), source: { name: finding.source, url }, affects: [{ ref: resolved }], recommendation: finding.recommendation }];
    });
  const vulnerabilities = new Map<string, CycloneDxBom['vulnerabilities'][number]>();
  for (const vulnerability of observedVulnerabilities) {
    const key = `${vulnerability.source.name}:${vulnerability.id}`;
    const previous = vulnerabilities.get(key);
    if (!previous) vulnerabilities.set(key, vulnerability);
    else {
      previous.affects = [...new Map([...previous.affects, ...vulnerability.affects].map((affected) => [affected.ref, affected])).values()];
      if (!previous.recommendation.includes(vulnerability.recommendation)) previous.recommendation += ` ${vulnerability.recommendation}`;
    }
  }
  return { bomFormat: 'CycloneDX', specVersion: '1.6', serialNumber: `urn:uuid:${randomUUID()}`, version: 1,
    metadata: { timestamp: new Date().toISOString(), component: { type: 'application', 'bom-ref': 'cloudops:project', name: 'Repositorio evaluado' },
      tools: { components: [{ type: 'application', 'bom-ref': 'cloudops:scanner', name: 'CloudOps', version: '1.6.0' }] },
      properties: [{ name: 'cloudops:inventory:scope', value: 'observed-manifests-and-configured-images' }, { name: 'cloudops:inventory:complete', value: String(complete) }] },
    components: [...components.values()].sort((a, b) => a['bom-ref'].localeCompare(b['bom-ref'])), vulnerabilities: [...vulnerabilities.values()] };
}
