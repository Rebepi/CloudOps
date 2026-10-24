import type { CodeSeverity } from '../zipSecurityScanner.js';
import { canonicalControlForFinding } from './controlCatalog.js';

export const SECURITY_DIMENSIONS = [
  { id: 'identity', label: 'Identidad y autorización', description: 'Quién puede acceder, con qué credenciales y qué privilegios.' },
  { id: 'data', label: 'Protección de datos y secretos', description: 'Confidencialidad, cifrado, exposición pública y gestión de secretos.' },
  { id: 'application', label: 'Seguridad del código', description: 'Validación, inyección, criptografía y lógica de aplicación.' },
  { id: 'dependencies', label: 'Dependencias y cadena de suministro', description: 'Vulnerabilidades en bibliotecas, imágenes y componentes de terceros.' },
  { id: 'configuration', label: 'Configuración e infraestructura', description: 'Red, almacenamiento, contenedores e infraestructura como código.' },
  { id: 'detection', label: 'Registro y detección', description: 'Auditoría, monitoreo, alertas y capacidad de detección.' },
] as const;

export type SecurityDimensionId = (typeof SECURITY_DIMENSIONS)[number]['id'];
export type ControlState = 'pass' | 'fail' | 'partial' | 'not_applicable' | 'not_supported' | 'failed' | 'skipped';
export type DimensionState = 'measured' | 'partial' | 'not_measured';

export type FindingInput = {
  source: string;
  category: string;
  title: string;
  severity: string;
  externalId?: string | null;
  resource?: string | null;
  evidence?: Record<string, unknown>;
};

export type ControlResult = {
  id: string;
  dimension: SecurityDimensionId;
  label: string;
  state: ControlState;
  detail: string;
};

export type DimensionResult = {
  id: SecurityDimensionId;
  label: string;
  description: string;
  score: number | null;
  coverage: number;
  state: DimensionState;
  controls: ControlResult[];
  counts: Record<CodeSeverity, number>;
  scoreExcludedFindings: number;
};

export type BreakdownInput = {
  assessmentType: string;
  findings: readonly FindingInput[];
  summary: Record<string, unknown>;
};

export type AnalyzerRun = {
  analyzerId: string;
  dimension: SecurityDimensionId;
  state: 'completed' | 'partial' | 'failed' | 'skipped' | 'not_supported';
  itemsAnalyzed: number;
  findingsCount: number;
  durationMs: number | null;
  error: string | null;
  detail: Record<string, unknown>;
};

const SEVERITIES: CodeSeverity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFORMATIONAL'];
const PENALTIES: Record<CodeSeverity, number> = { CRITICAL: 40, HIGH: 20, MEDIUM: 8, LOW: 3, INFORMATIONAL: 0 };

const DOMAIN_DIMENSIONS: Record<string, SecurityDimensionId> = {
  secrets: 'data',
  sast: 'application',
  'source-code': 'application',
  dependencies: 'dependencies',
  iac: 'configuration',
  containers: 'configuration',
  configuration: 'configuration',
  logging: 'detection',
  identity: 'identity',
};

const AWS_ANALYZERS: Array<{
  analyzerId: string;
  dimension: SecurityDimensionId;
  availability?: string;
  error?: string;
  items?: string;
}> = [
  { analyzerId: 'aws:iam', dimension: 'identity', items: 'users' },
  { analyzerId: 'aws:cloudtrail', dimension: 'detection', items: 'trails' },
  { analyzerId: 'aws:security-hub', dimension: 'detection', availability: 'securityHubAvailable', error: 'securityHubError' },
  { analyzerId: 'aws:config', dimension: 'detection', availability: 'configAvailable', error: 'configError', items: 'configRecorders' },
  { analyzerId: 'aws:inspector', dimension: 'dependencies', availability: 'inspectorAvailable', error: 'inspectorError', items: 'inspectorCoveredResources' },
  { analyzerId: 'aws:s3', dimension: 'data', availability: 's3Available', error: 's3Error', items: 's3Buckets' },
  { analyzerId: 'aws:ec2-network', dimension: 'configuration', availability: 'networkAvailable', error: 'networkError', items: 'securityGroups' },
  { analyzerId: 'aws:rds', dimension: 'data', availability: 'rdsAvailable', error: 'rdsError', items: 'rdsInstances' },
];

function severityOf(value: string): CodeSeverity {
  const normalized = value.toUpperCase();
  return SEVERITIES.includes(normalized as CodeSeverity) ? normalized as CodeSeverity : 'INFORMATIONAL';
}

function matches(value: string, pattern: RegExp) {
  return pattern.test(value);
}

export function dimensionForFinding(finding: Pick<FindingInput, 'source' | 'category' | 'title' | 'externalId' | 'evidence'>): SecurityDimensionId {
  if (finding.source === 'trivy') return finding.category === 'secret' ? 'data' : 'dependencies';
  if (finding.category === 'license') return 'dependencies';
  const canonicalControl = canonicalControlForFinding(finding);
  if (canonicalControl) return canonicalControl.dimension;
  const externalId = finding.externalId ?? '';
  const category = finding.category.toLowerCase();
  const title = finding.title.toLowerCase();
  const source = finding.source.toLowerCase();
  const combined = `${category} ${title} ${externalId.toLowerCase()}`;

  if (source === 'osv' || category === 'vulnerability' || matches(combined, /cve-|vulnerab|dependency|package|library|sbom|\becr\b|image scan|supply chain/)) return 'dependencies';
  if (matches(externalId, /cloudops:hardcoded-secret|cloudops:database-url/)) return 'data';
  if (matches(externalId, /cloudops:sql-string-concat/)) return 'application';
  if (matches(externalId, /cloudops:root-mfa|cloudops:root-access-key|cloudops:iam-users-without-mfa|cloudops:cloudtrail-not-logging/)) {
    return externalId.includes('cloudtrail') ? 'detection' : 'identity';
  }
  if (matches(externalId, /cloudops:s3-public|cloudops:rds-unencrypted/)) return 'data';
  if (matches(externalId, /cloudops:security-group|cloudops:rds-public/)) return 'configuration';
  if (source === 'aws-config') return matches(combined, /recorder|no-rules|compliance/) ? 'detection' : 'configuration';
  if (source === 'amazon-inspector') return 'dependencies';
  if (source === 'security-hub') {
    if (matches(combined, /iam|mfa|root|access key|access-key|policy|role|identity|user|password|cognito|credential/)) return 'identity';
    if (matches(combined, /cloudtrail|guardduty|config|logging|log |monitor|alarm|detect|security hub|event/)) return 'detection';
    if (matches(combined, /s3|rds|kms|encrypt|public|secret|database|storage|backup|snapshot|dynamo|redshift/)) return 'data';
    if (matches(combined, /ec2|security group|network|vpc|ssh|port|firewall|waf|cloudfront|tls|certificate|gateway|subnet/)) return 'configuration';
    return 'configuration';
  }
  if (category === 'database-migration') return 'application';
  if (category === 'database-url' || matches(combined, /secret|credential|password|token|database url|connection string|encrypt|pii|sensitive/)) return 'data';
  if (category === 'test') return 'application';
  if (matches(combined, /auth|jwt|oauth|session|permission|authorization|authorisation|access control|cors|csrf/)) return 'identity';
  if (matches(combined, /logging|audit|telemetry|monitor|trace|observability/)) return 'detection';
  if (matches(combined, /docker|container|kubernetes|terraform|cloudformation|iac|compose|helm|nginx|port|network|tls|ssl/)) return 'configuration';
  if (category === 'code') return 'application';
  if (source === 'cloudops') return 'configuration';
  return 'application';
}

function scoreable(finding: FindingInput) {
  return finding.category !== 'coverage' && finding.evidence?.scoreExcluded !== true;
}

function isNonInformational(finding: FindingInput) {
  return severityOf(finding.severity) !== 'INFORMATIONAL';
}

function emptyCounts(): Record<CodeSeverity, number> {
  return { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFORMATIONAL: 0 };
}

function observedFindings(findings: readonly FindingInput[]): FindingInput[] {
  return findings.flatMap((finding) => Array.isArray(finding.evidence?.observations)
    ? finding.evidence.observations.map((observation) => ({ ...finding, ...observation })) as FindingInput[]
    : [finding]);
}

function controlForDomain(domain: { id: string; label: string; status: string; files: number; detail: string }, findings: readonly FindingInput[]): ControlResult | null {
  const dimension = DOMAIN_DIMENSIONS[domain.id];
  if (!dimension) return null;
  const domainFindings = [...codeAnalyzerFindings(domain.id, findings),
    ...(domain.id === 'dependencies' ? findings.filter((finding) => finding.source === 'osv') : [])];
  const scoreableFindings = domainFindings.filter((finding) => scoreable(finding) && isNonInformational(finding));
  const excluded = domainFindings.filter((finding) => !scoreable(finding)).length;
  const state: ControlState = domain.status === 'not-detected'
    ? 'not_applicable'
    : domain.status === 'partial'
      ? domain.files === 0 ? 'skipped' : 'partial'
      : scoreableFindings.length ? 'fail' : excluded ? 'partial' : 'pass';
  return {
    id: `code:${domain.id}`,
    dimension,
    label: domain.label,
    state,
    detail: `${domain.detail}${scoreableFindings.length ? ` · ${scoreableFindings.length} hallazgo(s) puntuable(s)` : ''}${excluded ? ` · ${excluded} hallazgo(s) excluido(s) del puntaje` : ''}`,
  };
}

function coverageMatrixFrom(summary: Record<string, unknown>) {
  const raw = summary.coverageMatrix;
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is { id: string; label: string; status: string; files: number; detail: string } => {
    if (typeof item !== 'object' || item === null) return false;
    const domain = item as Record<string, unknown>;
    return typeof domain.id === 'string' && typeof domain.label === 'string' && typeof domain.status === 'string'
      && typeof domain.files === 'number' && typeof domain.detail === 'string';
  });
}

function awsControl(
  id: string,
  dimension: SecurityDimensionId,
  label: string,
  state: ControlState,
  detail: string,
): ControlResult {
  return { id, dimension, label, state, detail };
}

function awsControls(summary: Record<string, unknown>, findings: readonly FindingInput[]): ControlResult[] {
  findings = observedFindings(findings);
  const byExternalId = new Set(findings.map((finding) => finding.externalId).filter((id): id is string => Boolean(id)));
  const nonInfoBySource = (source: string) => findings.filter((finding) => finding.source === source && isNonInformational(finding) && scoreable(finding));
  const has = (id: string) => byExternalId.has(id);
  const unavailable = (value: unknown) => value === false;
  const errorOf = (key: string) => typeof summary[key] === 'string' ? String(summary[key]) : 'Fuente no disponible';
  const zero = (value: unknown) => value === 0;
  const controls: ControlResult[] = [];

  const direct = (id: string, dimension: SecurityDimensionId, label: string, observed: boolean, failed: boolean) => {
    controls.push(awsControl(id, dimension, label, !observed ? 'skipped' : failed ? 'fail' : 'pass',
      !observed ? 'Sin evidencia de consulta en esta ejecución.' : failed ? 'El control observado no cumple.' : 'El control observado cumple.'));
  };
  direct('aws:root-mfa', 'identity', 'MFA en la cuenta root', typeof summary.accountMfaEnabled === 'number', summary.accountMfaEnabled !== 1);
  direct('aws:root-access-key', 'identity', 'Sin claves de acceso root', typeof summary.rootAccessKeysPresent === 'number', Number(summary.rootAccessKeysPresent) > 0);
  direct('aws:iam-mfa', 'identity', 'MFA en usuarios IAM', typeof summary.users === 'number', has('cloudops:iam-users-without-mfa'));
  direct('aws:cloudtrail', 'detection', 'Trail activo', typeof summary.trails === 'number', has('cloudops:cloudtrail-not-logging'));

  if (unavailable(summary.securityHubAvailable)) {
    controls.push(awsControl('aws:security-hub', 'detection', 'Security Hub', 'failed', errorOf('securityHubError')));
  } else if (summary.securityHubAvailable === undefined) {
    controls.push(awsControl('aws:security-hub', 'detection', 'Security Hub', 'skipped', 'Fuente no registrada en esta ejecución.'));
  } else {
    const hubFindings = nonInfoBySource('security-hub');
    controls.push(awsControl('aws:security-hub', 'detection', 'Security Hub', hubFindings.length ? 'fail' : 'pass', `${hubFindings.length} hallazgo(s) no informativos observados.`));
  }

  if (unavailable(summary.configAvailable)) {
    controls.push(awsControl('aws:config-recorder', 'detection', 'AWS Config recorder', 'failed', errorOf('configError')));
    controls.push(awsControl('aws:config-rules', 'configuration', 'AWS Config reglas', 'failed', errorOf('configError')));
  } else if (summary.configAvailable === undefined) {
    controls.push(awsControl('aws:config-recorder', 'detection', 'AWS Config recorder', 'skipped', 'Fuente no registrada en esta ejecución.'));
    controls.push(awsControl('aws:config-rules', 'configuration', 'AWS Config reglas', 'skipped', 'Fuente no registrada en esta ejecución.'));
  } else {
    const recorderFailed = has('aws-config:recorder-inactive');
    const rulesFailed = has('aws-config:no-rules') || findings.some((finding) => finding.source === 'aws-config' && finding.category === 'compliance' && isNonInformational(finding));
    controls.push(awsControl('aws:config-recorder', 'detection', 'AWS Config recorder', recorderFailed ? 'fail' : 'pass', recorderFailed ? 'No hay recorder activo y saludable.' : `${Number(summary.configRecorders ?? 0)} recorder(s) observados.`));
    controls.push(awsControl('aws:config-rules', 'configuration', 'AWS Config reglas', rulesFailed ? 'fail' : 'pass', rulesFailed ? 'Reglas ausentes o no conformes.' : `${Number(summary.configRules ?? 0)} regla(s) observadas.`));
  }

  if (unavailable(summary.inspectorAvailable) || summary.inspectorStatus === 'DISABLED') {
    controls.push(awsControl('aws:inspector', 'dependencies', 'Amazon Inspector', 'failed', summary.inspectorStatus === 'DISABLED' ? 'Inspector está deshabilitado.' : errorOf('inspectorError')));
  } else if (summary.inspectorAvailable === undefined) {
    controls.push(awsControl('aws:inspector', 'dependencies', 'Amazon Inspector', 'skipped', 'Fuente no registrada en esta ejecución.'));
  } else {
    const inspectorFindings = nonInfoBySource('amazon-inspector').filter((finding) => finding.category === 'vulnerability');
    const covered = Number(summary.inspectorCoveredResources ?? 0);
    controls.push(awsControl('aws:inspector', 'dependencies', 'Amazon Inspector', inspectorFindings.length ? 'fail' : covered > 0 ? 'pass' : 'partial', `${covered} recurso(s) cubiertos; ${inspectorFindings.length} vulnerabilidad(es).`));
  }

  const resourceControl = (id: string, dimension: SecurityDimensionId, label: string, available: unknown, error: string, items: number, failed: boolean, empty: boolean, emptyDetail: string, okDetail: string, failDetail: string) => {
    if (unavailable(available)) return controls.push(awsControl(id, dimension, label, 'failed', errorOf(error)));
    if (available === undefined) return controls.push(awsControl(id, dimension, label, 'skipped', 'Fuente no registrada en esta ejecución.'));
    if (empty) return controls.push(awsControl(id, dimension, label, 'not_applicable', emptyDetail));
    controls.push(awsControl(id, dimension, label, failed ? 'fail' : 'pass', failed ? failDetail : `${okDetail} (${items} recurso(s)).`));
  };

  resourceControl('aws:s3-public', 'data', 'S3 sin acceso público', summary.s3Available, 's3Error', Number(summary.s3Buckets ?? 0), findings.some((finding) => finding.source === 'cloudops' && finding.externalId?.startsWith('cloudops:s3-')), zero(summary.s3Buckets) && summary.s3Available === true, 'No se observaron buckets S3.', 'Buckets sin exposición pública confirmada.', 'Se observaron buckets públicos o con bloqueo incompleto.');
  resourceControl('aws:security-groups', 'configuration', 'Security Groups sin puertos sensibles públicos', summary.networkAvailable, 'networkError', Number(summary.securityGroups ?? 0), findings.some((finding) => finding.externalId?.startsWith('cloudops:security-group')), zero(summary.securityGroups) && summary.networkAvailable === true, 'No se observaron Security Groups.', 'Sin reglas públicas hacia puertos sensibles.', 'Existen reglas públicas hacia puertos sensibles.');
  resourceControl('aws:rds-public', 'configuration', 'RDS no accesible públicamente', summary.rdsAvailable, 'rdsError', Number(summary.rdsInstances ?? 0), findings.some((finding) => finding.externalId?.startsWith('cloudops:rds-public')), zero(summary.rdsInstances) && summary.rdsAvailable === true, 'No se observaron instancias RDS.', 'Instancias sin acceso público.', 'Existen instancias RDS públicamente accesibles.');
  resourceControl('aws:rds-encryption', 'data', 'Cifrado de almacenamiento RDS', summary.rdsAvailable, 'rdsError', Number(summary.rdsInstances ?? 0), findings.some((finding) => finding.externalId?.startsWith('cloudops:rds-unencrypted')), zero(summary.rdsInstances) && summary.rdsAvailable === true, 'No se observaron instancias RDS.', 'Almacenamiento cifrado en las instancias observadas.', 'Existen instancias RDS sin cifrado.');

  const incomplete: Record<string, boolean> = {
    'aws:iam-mfa': summary.iamTruncated === true,
    'aws:cloudtrail': Number(summary.cloudtrailInspectionErrors ?? 0) > 0,
    'aws:security-hub': summary.securityHubTruncated === true,
    'aws:config-rules': summary.configTruncated === true,
    'aws:inspector': summary.inspectorTruncated === true,
    'aws:s3-public': summary.s3Truncated === true || Number(summary.s3InspectionErrors ?? 0) > 0,
    'aws:rds-public': summary.rdsTruncated === true,
    'aws:rds-encryption': summary.rdsTruncated === true,
  };
  for (const control of controls) {
    if (incomplete[control.id] && ['pass', 'fail', 'not_applicable'].includes(control.state)) {
      control.state = 'partial';
      control.detail += ' Consulta incompleta o con errores de inspección.';
    }
  }

  return controls;
}

function dimensionResult(id: SecurityDimensionId, controls: ControlResult[], findings: readonly FindingInput[]): DimensionResult {
  const catalog = SECURITY_DIMENSIONS.find((dimension) => dimension.id === id)!;
  const counts = emptyCounts();
  let excluded = 0;
  let scoreableNonInformational = 0;
  let penalty = 0;
  let critical = false;
  for (const finding of findings) {
    if (dimensionForFinding(finding) !== id) continue;
    counts[severityOf(finding.severity)] += 1;
    if (!scoreable(finding)) { excluded += 1; continue; }
    const severity = severityOf(finding.severity);
    if (severity !== 'INFORMATIONAL') scoreableNonInformational += 1;
    penalty += PENALTIES[severity];
    if (severity === 'CRITICAL') critical = true;
  }

  const applicable = controls.filter((control) => control.state !== 'not_applicable');
  const observed = applicable.reduce((total, control) => total + (control.state === 'pass' || control.state === 'fail' ? 1 : control.state === 'partial' ? 0.5 : 0), 0);
  const coverage = applicable.length ? Math.round(observed / applicable.length * 100) : 0;
  const limitedToExcluded = excluded > 0 && scoreableNonInformational === 0;
  const state: DimensionState = coverage === 0 ? 'not_measured' : limitedToExcluded ? 'partial' : coverage === 100 ? 'measured' : 'partial';
  let score: number | null = null;
  const hasMeasuredControl = controls.some((control) => control.state === 'pass' || control.state === 'fail');
  if (hasMeasuredControl && !limitedToExcluded) {
    score = Math.max(0, 100 - penalty);
    if (critical) score = Math.min(score, 45);
    if (state === 'partial') score = Math.min(score, 85);
  }

  return {
    id,
    label: catalog.label,
    description: catalog.description,
    score,
    coverage,
    state,
    controls,
    counts,
    scoreExcludedFindings: excluded,
  };
}

export function computeDimensionBreakdown({ assessmentType, findings, summary }: BreakdownInput): DimensionResult[] {
  const controls: ControlResult[] = [];
  if (assessmentType !== 'aws-account') {
    for (const domain of coverageMatrixFrom(summary)) {
      const control = controlForDomain(domain, findings);
      if (control) controls.push(control);
    }
  }
  if (assessmentType !== 'code') controls.push(...awsControls(summary, findings));
  const supply = summary.supplyChain && typeof summary.supplyChain === 'object' ? summary.supplyChain as Record<string, unknown> : {};
  const trivy = supply.trivy && typeof supply.trivy === 'object' ? supply.trivy as Record<string, unknown> : {};
  if (Array.isArray(supply.images) && supply.images.length) {
    for (const [id, dimension, label, category] of [
      ['trivy:image-vulnerabilities', 'dependencies', 'Vulnerabilidades de imágenes', 'dependency'],
      ['trivy:image-secrets', 'data', 'Secretos en imágenes', 'secret'],
    ] as const) {
      const detected = findings.filter((finding) => finding.source === 'trivy' && finding.category === category && isNonInformational(finding));
      const state: ControlState = trivy.state === 'completed' ? detected.length ? 'fail' : 'pass'
        : trivy.state === 'partial' ? 'partial' : trivy.state === 'failed' ? 'failed' : 'skipped';
      controls.push({ id, dimension, label, state, detail: typeof trivy.reason === 'string' ? trivy.reason : `${detected.length} hallazgo(s); estado de análisis: ${String(trivy.state ?? 'skipped')}.` });
    }
  }
  return SECURITY_DIMENSIONS.map((dimension) => dimensionResult(dimension.id, controls.filter((control) => control.dimension === dimension.id), findings));
}

function codeAnalyzerFindings(domainId: string, findings: readonly FindingInput[]) {
  return findings.filter((finding) => {
    const externalId = finding.externalId ?? '';
    const awsFinding = /^(cloudops:(root|s3|security-group|rds|cloudtrail|iam)|aws-config:|amazon-inspector:)/.test(externalId)
      || ['security-hub', 'aws-config', 'amazon-inspector'].includes(finding.source.toLowerCase());
    if (awsFinding || finding.source !== 'cloudops') return false;
    const container = /cloudops:(privileged-container|latest-image|docker-root-user|docker-socket):/.test(externalId);
    switch (domainId) {
      case 'secrets': return finding.category === 'secret';
      case 'sast':
      case 'source-code': return finding.category === 'code' || finding.category === 'database-migration';
      case 'dependencies': return finding.category === 'dependency';
      case 'containers': return finding.category === 'iac' && container;
      case 'iac': return finding.category === 'iac' && !container;
      case 'configuration': return finding.category === 'configuration';
      default: return false;
    }
  });
}

function awsAnalyzerFindings(analyzerId: string, findings: readonly FindingInput[]) {
  findings = observedFindings(findings);
  const externalId = (finding: FindingInput) => finding.externalId ?? '';
  switch (analyzerId) {
    case 'aws:iam': return findings.filter((finding) => finding.source === 'cloudops' && /^cloudops:(root-|iam-)/.test(externalId(finding)));
    case 'aws:cloudtrail': return findings.filter((finding) => externalId(finding).startsWith('cloudops:cloudtrail'));
    case 'aws:security-hub': return findings.filter((finding) => finding.source === 'security-hub');
    case 'aws:config': return findings.filter((finding) => finding.source === 'aws-config');
    case 'aws:inspector': return findings.filter((finding) => finding.source === 'amazon-inspector');
    case 'aws:s3': return findings.filter((finding) => externalId(finding).startsWith('cloudops:s3-'));
    case 'aws:ec2-network': return findings.filter((finding) => externalId(finding).startsWith('cloudops:security-group'));
    case 'aws:rds': return findings.filter((finding) => externalId(finding).startsWith('cloudops:rds-'));
    default: return [];
  }
}

export function buildAnalyzerRuns({ assessmentType, findings, summary }: BreakdownInput): AnalyzerRun[] {
  const runs: AnalyzerRun[] = [];
  if (assessmentType !== 'aws-account') {
    for (const domain of coverageMatrixFrom(summary)) {
      const dimension = DOMAIN_DIMENSIONS[domain.id];
      if (!dimension) continue;
      runs.push({
        analyzerId: `builtin:${domain.id}`,
        dimension,
        state: domain.status === 'measured' ? 'completed' : domain.status === 'partial' && domain.files > 0 ? 'partial' : 'skipped',
        itemsAnalyzed: domain.files,
        findingsCount: codeAnalyzerFindings(domain.id, findings).length,
        durationMs: null,
        error: null,
        detail: { status: domain.status, detail: domain.detail },
      });
    }
    if (Number(summary.dependencyCount ?? 0) > 0) {
      runs.push({
        analyzerId: 'osv',
        dimension: 'dependencies',
        state: ['completed', 'partial', 'failed', 'skipped'].includes(String(summary.osvState))
          ? summary.osvState as AnalyzerRun['state'] : summary.osvAvailable === false ? 'failed' : summary.osvAvailable === true ? 'completed' : 'skipped',
        itemsAnalyzed: Number(summary.vulnerabilitiesChecked ?? 0),
        findingsCount: findings.filter((finding) => finding.source === 'osv').length,
        durationMs: null,
        error: typeof summary.osvError === 'string' ? summary.osvError : null,
        detail: { dependencyCount: Number(summary.dependencyCount ?? 0), vulnerabilitiesChecked: Number(summary.vulnerabilitiesChecked ?? 0),
          metrics: summary.osvMetrics ?? null, limits: Array.isArray(summary.scanLimits) ? summary.scanLimits.filter((limit) => typeof limit === 'string' && limit.startsWith('osv-')) : [] },
      });
    }
  }
  if (assessmentType !== 'code') {
    for (const analyzer of AWS_ANALYZERS) {
      const available = analyzer.availability ? summary[analyzer.availability]
        : typeof summary[analyzer.items ?? ''] === 'number' ? true : undefined;
      const itemsKey = analyzer.items;
      const errorKey = analyzer.error;
      const configErrors = analyzer.analyzerId === 'aws:config'
        ? [summary.configMetadataError, ...(Array.isArray(summary.configDetailErrors) ? summary.configDetailErrors : [])]
          .filter((error): error is string => typeof error === 'string' && error.length > 0).join(' · ')
        : '';
      const disabled = analyzer.analyzerId === 'aws:inspector' && summary.inspectorStatus === 'DISABLED';
      const truncated = analyzer.analyzerId === 'aws:security-hub' && summary.securityHubTruncated === true
        || analyzer.analyzerId === 'aws:iam' && summary.iamTruncated === true
        || analyzer.analyzerId === 'aws:cloudtrail' && Number(summary.cloudtrailInspectionErrors ?? 0) > 0
        || analyzer.analyzerId === 'aws:config' && summary.configTruncated === true
        || analyzer.analyzerId === 'aws:inspector' && (summary.inspectorTruncated === true || summary.inspectorCoveredResources === 0)
        || analyzer.analyzerId === 'aws:s3' && (summary.s3Truncated === true || Number(summary.s3InspectionErrors ?? 0) > 0)
        || analyzer.analyzerId === 'aws:rds' && summary.rdsTruncated === true;
      runs.push({
        analyzerId: analyzer.analyzerId,
        dimension: analyzer.dimension,
        state: disabled ? 'skipped' : available === false ? 'failed' : available === undefined ? 'skipped' : truncated ? 'partial' : 'completed',
        itemsAnalyzed: itemsKey ? Number(summary[itemsKey] ?? 0) : 0,
        findingsCount: awsAnalyzerFindings(analyzer.analyzerId, findings).length,
        durationMs: null,
        error: errorKey && typeof summary[errorKey] === 'string' ? String(summary[errorKey]) : configErrors || null,
        detail: { available: available ?? null, disabled, truncated,
          ...(analyzer.analyzerId === 'aws:config' ? { resourceResults: Number(summary.configObservedResources ?? 0), rules: Number(summary.configRules ?? 0) } : {}) },
      });
    }
  }
  const supply = summary.supplyChain && typeof summary.supplyChain === 'object' ? summary.supplyChain as Record<string, unknown> : {};
  if (supply.format === 'CycloneDX') {
    runs.push({ analyzerId: 'cyclonedx:sbom', dimension: 'dependencies', state: supply.inventoryComplete === true ? 'completed' : 'partial',
      itemsAnalyzed: Number(supply.componentCount ?? 0), findingsCount: 0, durationMs: null, error: null,
      detail: { format: 'CycloneDX', specVersion: supply.specVersion, sha256: supply.sha256, inventoryComplete: supply.inventoryComplete } });
    const trivy = supply.trivy && typeof supply.trivy === 'object' ? supply.trivy as Record<string, unknown> : {};
    if (Array.isArray(supply.images) && supply.images.length) {
      const results = Array.isArray(trivy.results) ? trivy.results as Record<string, unknown>[] : [];
      runs.push({ analyzerId: 'trivy:images', dimension: 'dependencies',
        state: ['completed', 'partial', 'failed', 'skipped'].includes(String(trivy.state)) ? trivy.state as AnalyzerRun['state'] : 'skipped',
        itemsAnalyzed: results.filter((result) => result.state === 'completed' || result.state === 'partial').length,
        findingsCount: findings.filter((finding) => finding.source === 'trivy').length, durationMs: null,
        error: results.filter((result) => result.state === 'failed').map((result) => result.detail).join(' · ') || null,
        detail: { reason: trivy.reason, results } });
    }
  }
  const timings = summary.analyzerTimings && typeof summary.analyzerTimings === 'object' ? summary.analyzerTimings as Record<string, unknown> : {};
  return runs.map((run) => {
    const timing = timings[run.analyzerId];
    if (run.state === 'skipped' || !timing || typeof timing !== 'object') return run;
    const { durationMs, scope } = timing as Record<string, unknown>;
    if (typeof durationMs !== 'number' || !Number.isFinite(durationMs) || durationMs < 0) return run;
    return { ...run, durationMs: Math.round(durationMs), detail: { ...run.detail, timingScope: scope ?? null } };
  });
}
