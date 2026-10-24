import { createHash } from 'node:crypto';
import { parseDocument } from 'yaml';
import type { CodeFinding } from '../zipSecurityScanner.js';
import type { IacSource } from './iac.js';
import { IAC_CATALOG, iacFrameworkReferences } from './iacCatalog.js';

const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const entries = (value: unknown) => Array.isArray(value) ? value : value ? [value] : [];

/** Literal IAM documents only. Intrinsic tags and computed values remain unresolved. */
export function inspectIamDeclarations(sources: IacSource[]) {
  const findings: CodeFinding[] = [];
  const unresolved: { path: string; reason: string }[] = [];
  const inspectedFiles = new Set<string>();
  const conclusiveStandaloneFiles = new Set<string>();
  let successes = 0;
  for (const source of sources) {
    if (source.kind === 'terraform' && /\.tf$/.test(source.path) && /(?:resource|data)\s+"aws_iam_/.test(source.text ?? '')) {
      unresolved.push({ path: source.path, reason: 'La semántica IAM calculada en HCL no se acredita como un documento literal verificado.' });
    }
    if (!/\.(?:json|yaml|yml)$/i.test(source.path) || source.kind !== 'iam-policy' && !/Statement|PolicyDocument|AWS::IAM::/.test(source.text ?? '')) continue;
    const priorUnresolved = unresolved.length;
    let document: Record<string, unknown>;
    try {
      if (source.path.toLowerCase().endsWith('.json')) document = object(JSON.parse(source.text ?? ''));
      else {
        const parsed = parseDocument(source.text ?? '', { uniqueKeys: true, schema: 'core' });
        if (parsed.errors.length || parsed.warnings.length) throw new Error('Unresolved YAML');
        document = object(parsed.toJS({ maxAliasCount: 20 }));
      }
    } catch {
      unresolved.push({ path: source.path, reason: 'Documento IAM no interpretable como JSON/YAML literal sin tags ni errores.' });
      continue;
    }
    const policies: { name: string; document: Record<string, unknown> }[] = [];
    if (document.Statement) policies.push({ name: 'policy', document });
    for (const [name, raw] of Object.entries(object(document.Resources))) {
      const resource = object(raw);
      if (!String(resource.Type ?? '').startsWith('AWS::IAM::')) continue;
      const properties = object(resource.Properties);
      if (properties.PolicyDocument) policies.push({ name, document: object(properties.PolicyDocument) });
      if (properties.AssumeRolePolicyDocument) policies.push({ name: `${name}:trust`, document: object(properties.AssumeRolePolicyDocument) });
      for (const policy of entries(properties.Policies)) policies.push({ name, document: object(object(policy).PolicyDocument) });
    }
    for (const policy of policies) {
      inspectedFiles.add(source.path);
      const before = unresolved.length;
      const wildcard = new Set<string>();
      const statements = entries(policy.document.Statement);
      if (!statements.length) unresolved.push({ path: source.path, reason: 'El documento IAM no contiene declaraciones verificables.' });
      for (const raw of statements) {
        const statement = object(raw);
        if (typeof statement.Effect !== 'string') { unresolved.push({ path: source.path, reason: 'El efecto de una declaración IAM no es literal.' }); continue; }
        if (statement.Effect === 'Deny') continue;
        if (statement.Effect !== 'Allow') { unresolved.push({ path: source.path, reason: 'El efecto IAM no es un valor válido Allow/Deny.' }); continue; }
        for (const field of ['Action', 'Resource', 'Principal']) {
          const principal = object(statement.Principal);
          const values = field === 'Principal' && Object.keys(principal).length && Object.keys(principal).every((key) => ['AWS', 'Service', 'Federated', 'CanonicalUser'].includes(key))
            ? Object.values(principal).flatMap(entries) : entries(statement[field]);
          if (values.some((value) => typeof value !== 'string')) unresolved.push({ path: source.path, reason: 'Acción, recurso o principal IAM calculado no resuelto como valor literal.' });
          if (values.some((value) => typeof value === 'string' && (field === 'Action' ? value.includes('*') : value === '*'))) wildcard.add(field);
        }
        if (statement.NotAction || statement.NotResource) unresolved.push({ path: source.path, reason: 'NotAction/NotResource requiere revisión contextual fuera de esta regla.' });
        if (statement.Condition) unresolved.push({ path: source.path, reason: 'Las condiciones IAM requieren revisión contextual y no se certifican mediante esta regla.' });
      }
      if (!wildcard.size) { if (unresolved.length === before) successes++; continue; }
      const fixture = /(?:^|\/)(?:tests?|__tests__|fixtures?|mocks?)(?:\/|$)/i.test(source.path);
      const id = 'CLOUDOPS-IAM-0001';
      findings.push({ externalId: `cloudops-iac:${id}:${createHash('sha256').update(`${source.path}:${policy.name}`).digest('hex').slice(0, 24)}`,
        source: 'cloudops', category: 'iac', title: 'Política IAM literal con comodines de permisos', description: 'Se observan comodines Allow en una declaración. No prueba privilegios efectivos ni que el documento esté desplegado.',
        severity: fixture ? 'INFORMATIONAL' : wildcard.has('Action') || wildcard.has('Principal') ? 'HIGH' : 'MEDIUM', status: 'open', resource: source.path,
        recommendation: 'Revisar acciones, recursos, principales y condiciones; limitar permisos según las operaciones realmente necesarias.',
        framework: 'Referencias relacionadas AWS FSBP / CIS AWS', evidence: { policyId: id, catalogVersion: IAC_CATALOG.version, kind: source.kind, file: source.path,
          line: null, endLine: null, locationKind: 'file', resource: policy.name, dimension: 'identity', wildcardFields: [...wildcard],
          policyOrigin: 'cloudops-literal-iam', deployment: 'not-verified', context: fixture ? 'test' : 'application', scoreExcluded: fixture,
          frameworkReferences: iacFrameworkReferences(id, []), policyUrl: 'https://docs.aws.amazon.com/securityhub/latest/userguide/iam-controls.html#iam-1' } });
    }
    if (document.Statement && policies.length && unresolved.length === priorUnresolved) conclusiveStandaloneFiles.add(source.path);
  }
  return { findings, unresolved, inspectedFiles: [...inspectedFiles], conclusiveStandaloneFiles: [...conclusiveStandaloneFiles], successes };
}
