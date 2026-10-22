import type { CodeSeverity } from '../zipSecurityScanner.js';

export const SECURITY_DIMENSIONS = [
  { id: 'identity', label: 'Identidad y autorizaciÃ³n', description: 'QuiÃ©n puede acceder, con quÃ© credenciales y quÃ© privilegios.' },
  { id: 'data', label: 'ProtecciÃ³n de datos y secretos', description: 'Confidencialidad, cifrado, exposiciÃ³n pÃºblica y gestiÃ³n de secretos.' },
  { id: 'application', label: 'Seguridad del cÃ³digo', description: 'ValidaciÃ³n, inyecciÃ³n, criptografÃ­a y lÃ³gica de aplicaciÃ³n.' },
  { id: 'dependencies', label: 'Dependencias y cadena de suministro', description: 'Vulnerabilidades en bibliotecas, imÃ¡genes y componentes de terceros.' },
  { id: 'configuration', label: 'ConfiguraciÃ³n e infraestructura', description: 'Red, almacenamiento, contenedores e infraestructura como cÃ³digo.' },
  { id: 'detection', label: 'Registro y detecciÃ³n', description: 'AuditorÃ­a, monitoreo, alertas y capacidad de detecciÃ³n.' },
] as const;

export type SecurityDimensionId = (typeof SECURITY_DIMENSIONS)[number]['id'];
export type ControlState = 'pass' | 'fail' | 'partial' | 'not_applicable' | 'not_supported' | 'failed' | 'skipped';
export type DimensionState = 'measured' | 'partial' | 'not_measured';
export type DimensionScoreState = 'measured' | 'partial' | 'not_measured';

export type FindingInput = {
  source: string;
  category: string;
  title: string;
  severity: string;
  externalId?: string | null;
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
  state: DimensionScoreState;
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

export function dimensionForFinding(finding: Pick<FindingInput, 'source' | 'category' | 'title' | 'externalId'>): SecurityDimensionId {
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

function controlForDomain(domain: { id: string; label: string; status: string; files: number; detail: string }, findings: readonly FindingInput[]): ControlResult | null {
  const dimension = DOMAIN_DIMENSIONS[domain.id];
  if (!dimension) return null;
  const domainFindings = findings.filter((finding) => dimensionForFinding(finding) === dimension);
  const scoreableFindings = domainFindings.filter((finding) => scoreable(finding) && isNonInformational(finding));
  const excluded = domainFindings.filter((finding) => !scoreable(finding)).length;
  const state: ControlState = domain.status === 'not-detected'
    ? 'not_applicable'
    : domain.status === 'partial'
      ? 'partial'
      : scoreableFindings.length ? 'fail' : 'pass';
  return {
    id: `code:${domain.id}`,
    dimension,
    label: domain.label,
    state,
    detail: `${domain.detail}${scoreableFindings.length ? ` Â· ${scoreableFindings.length} hallazgo(s) puntuable(s)` : ''}${excluded ? ` Â· ${excluded} hallazgo(s) excluido(s) del puntaje` : ''}`,
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
  const byExternalId = new Set(findings.map((finding) => finding.externalId).filter((id): id is string => Boolean(id)));
  const nonInfoBySource = (source: string) => findings.filter((finding) => finding.source === source && isNonInformational(finding) && scoreable(finding));
  const has = (id: string) => byExternalId.has(id);
  const measured = (value: unknown) => value === true;
  const unavailable = (value: unknown) => value === false;
  const errorOf = (key: string) => typeof summary[key] === 'string' ? String(summary[key]) : 'Fuente no disponible';
  const zero = (value: unknown) => value === 0;
  const controls: ControlResult[] = [];

  controls.push(awsControl('aws:root-mfa', 'identity', 'MFA en la cuenta root', has('cloudops:root-mfa') ? 'fail' : 'pass', has('cloudops:root-mfa') ? 'IAM reporta MFA root deshabilitado.' : 'IAM reporta MFA root habilitado.'));
  controls.push(awsControl('aws:root-access-key', 'identity', 'Sin claves de acceso root', has('cloudops:root-access-key') ? 'fail' : 'pass', has('cloudops:root-access-key') ? 'Existe al menos una clave de acceso root.' : 'No se observaron claves de acceso root activas.'));
  controls.push(awsControl('aws:iam-mfa', 'identity', 'MFA en usuarios IAM', has('cloudops:iam-users-without-mfa') ? 'fail' : 'pass', has('cloudops:iam-users-without-mfa') ? 'Existen usuarios IAM sin MFA.' : 'Los usuarios IAM observados tienen MFA o no se detectaron usuarios.'));
  controls.push(awsControl('aws:cloudtrail', 'detection', 'Trail activo', has('cloudops:cloudtrail-not-logging') ? 'fail' : 'pass', has('cloudops:cloudtrail-not-logging') ? 'NingÃºn trail aparece registrando eventos.' : `${Number(summary.trails ?? 0)} trail(s) observados.`));

  if (unavailable(summary.securityHubAvailable)) {
    controls.push(awsControl('aws:security-hub', 'detection', 'Security Hub', 'failed', errorOf('securityHubError')));
  } else if (summary.securityHubAvailable === undefined) {
    controls.push(awsControl('aws:security-hub', 'detection', 'Security Hub', 'skipped', 'Fuente no registrada en esta ejecuciÃ³n.'));
  } else {
    const hubFindings = nonInfoBySource('security-hub');
    controls.push(awsControl('aws:security-hub', 'detection', 'Security Hub', hubFindings.length ? 'fail' : 'pass', `${hubFindings.length} hallazgo(s) no informativos observados.`));
  }

  if (unavailable(summary.configAvailable)) {
    controls.push(awsControl('aws:config-recorder', 'detection', 'AWS Config recorder', 'failed', errorOf('configError')));
    controls.push(awsControl('aws:config-rules', 'configuration', 'AWS Config reglas', 'failed', errorOf('configError')));
  } else if (summary.configAvailable === undefined) {
    controls.push(awsControl('aws:config-recorder', 'detection', 'AWS Config recorder', 'skipped', 'Fuente no registrada en esta ejecuciÃ³n.'));
    controls.push(awsControl('aws:config-rules', 'configuration', 'AWS Config reglas', 'skipped', 'Fuente no registrada en esta ejecuciÃ³n.'));
  } else {
    const recorderFailed = has('aws-config:recorder-inactive');
    const rulesFailed = has('aws-config:no-rules') || findings.some((finding) => finding.source === 'aws-config' && finding.category === 'compliance' && isNonInformational(finding));
    controls.push(awsControl('aws:config-recorder', 'detection', 'AWS Config recorder', recorderFailed ? 'fail' : 'pass', recorderFailed ? 'No hay recorder activo y saludable.' : `${Number(summary.configRecorders ?? 0)} recorder(s) observados.`));
    controls.push(awsControl('aws:config-rules', 'configuration', 'AWS Config reglas', rulesFailed ? 'fail' : 'pass', rulesFailed ? 'Reglas ausentes o no conformes.' : `${Number(summary.configRules ?? 0)} regla(s) observadas.`));
  }

  if (unavailable(summary.inspectorAvailable) || summary.inspectorStatus === 'DISABLED') {
    controls.push(awsControl('aws:inspector', 'dependencies', 'Amazon Inspector', 'failed', summary.inspectorStatus === 'DISABLED' ? 'Inspector estÃ¡ deshabilitado.' : errorOf('inspectorError')));
  } else if (summary.inspectorAvailable === undefined) {
    controls.push(awsControl('aws:inspector', 'dependencies', 'Amazon Inspector', 'skipped', 'Fuente no registrada en esta ejecuciÃ³n.'));
  } else {
    const inspectorFindings = nonInfoBySource('amazon-inspector').filter((finding) => finding.category === 'vulnerability');
    controls.push(awsControl('aws:inspector', 'dependencies', 'Amazon Inspector', inspectorFindings.length ? 'fail' : 'pass', `${Number(summary.inspectorCoveredResources ?? 0)} recurso(s) cubiertos; ${inspectorFindings.length} vulnerabilidad(es).`));
  }

  const resourceControl = (id: string, dimension: SecurityDimensionId, label: string, available: unknown, error: string, items: number, failed: boolean, empty: boolean, emptyDetail: string, okDetail: string, failDetail: string) => {
    if (unavailable(available)) return controls.push(awsControl(id, dimension, label, 'failed', errorOf(error)));
    if (available === undefined) return controls.push(awsControl(id, dimension, label, 'skipped', 'Fuente no registrada en esta ejecuciÃ³n.'));
    if (empty) return controls.push(awsControl(id, dimension, label, 'not_applicable', emptyDetail));
    controls.push(awsControl(id, dimension, label, failed ? 'fail' : 'pass', failed ? failDetail : `${okDetail} (${items} recurso(s)).`));
  };

  resourceControl('aws:s3-public', 'data', 'S3 sin acceso pÃºblico', summary.s3Available, 's3Error', Number(summary.s3Buckets ?? 0), findings.some((finding) => finding.source === 'cloudops' && finding.externalId?.startsWith('cloudops:s3-')), zero(summary.s3Buckets) && summary.s3Available === true, 'No se observaron buckets S3.', 'Buckets sin exposiciÃ³n pÃºblica confirmada.', 'Se observaron buckets pÃºblicos o con bloqueo incompleto.');
  resourceControl('aws:security-groups', 'configuration', 'Security Groups sin puertos sensibles pÃºblicos', summary.networkAvailable, 'networkError', Number(summary.securityGroups ?? 0), findings.some((finding) => finding.externalId?.startsWith('cloudops:security-group')), zero(summary.securityGroups) && summary.networkAvailable === true, 'No se observaron Security Groups.', 'Sin reglas pÃºblicas hacia puertos sensibles.', 'Existen reglas pÃºblicas hacia puertos sensibles.');
  resourceControl('aws:rds-public', 'configuration', 'RDS no accesible pÃºblicamente', summary.rdsAvailable, 'rdsError', Number(summary.rdsInstances ?? 0), findings.some((finding) => finding.externalId?.startsWith('cloudops:rds-public')), zero(summary.rdsInstances) && summary.rdsAvailable === true, 'No se observaron instancias RDS.', 'Instancias sin acceso pÃºblico.', 'Existen instancias RDS pÃºblicamente accesibles.');
  resourceControl('aws:rds-encryption', 'data', 'Cifrado de almacenamiento RDS', summary.rdsAvailable, 'rdsError', Number(summary.rdsInstances ?? 0), findings.some((finding) => finding.externalId?.startsWith('cloudops:rds-unencrypted')), zero(summary.rdsInstances) && summary.rdsAvailable === true, 'No se observaron instancias RDS.', 'Almacenamiento cifrado en las instancias observadas.', 'Existen instancias RDS sin cifrado.');

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
  const observed = applicable.reduce((total, control) => total + (control.state === 'pass' || control.state === 'fail' || control.state === 'failed' ? 1 : control.state === 'partial' ? 0.5 : 0), 0);
  const coverage = applicable.length ? Math.round(observed / applicable.length * 100) : 0;
  const limitedToExcluded = excluded > 0 && scoreableNonInformational === 0;
  const state: DimensionState = limitedToExcluded ? 'partial' : coverage === 100 ? 'measured' : coverage > 0 ? 'partial' : 'not_measured';
  let score: number | null = null;
  if (coverage > 0 && !limitedToExcluded) {
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
  return SECURITY_DIMENSIONS.map((dimension) => dimensionResult(dimension.id, controls.filter((control) => control.dimension === dimension.id), findings));
}

function codeAnalyzerFindings(domainId: string, dimension: SecurityDimensionId, findings: readonly FindingInput[]) {
  return findings.filter((finding) => {
    const externalId = finding.externalId ?? '';
    const awsFinding = /^(cloudops:(root|s3|security-group|rds|cloudtrail|iam)|aws-config:|amazon-inspector:)/.test(externalId)
      || ['security-hub', 'aws-config', 'amazon-inspector'].includes(finding.source.toLowerCase());
    if (awsFinding || dimensionForFinding(finding) !== dimension) return false;
    if (domainId === 'dependencies' && finding.source.toLowerCase() === 'osv') return false;
    return scoreable(finding);
  });
}

function awsAnalyzerFindings(analyzerId: string, findings: readonly FindingInput[]) {
  const externalId = (finding: FindingInput) => finding.externalId ?? '';
  switch (analyzerId) {
    case 'aws:iam': return findings.filter((finding) => finding.source === 'cloudops' && dimensionForFinding(finding) === 'identity');
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
        state: domain.status === 'measured' ? 'completed' : domain.status === 'partial' ? 'partial' : 'skipped',
        itemsAnalyzed: domain.files,
        findingsCount: codeAnalyzerFindings(domain.id, dimension, findings).length,
        error: null,
        detail: { status: domain.status, detail: domain.detail },
      });
    }
    if (Number(summary.dependencyCount ?? 0) > 0) {
      runs.push({
        analyzerId: 'osv',
        dimension: 'dependencies',
        state: summary.osvAvailable === false ? 'failed' : summary.osvAvailable === true ? 'completed' : 'skipped',
        itemsAnalyzed: Number(summary.dependencyCount ?? 0),
        findingsCount: findings.filter((finding) => finding.source === 'osv').length,
        error: typeof summary.osvError === 'string' ? summary.osvError : null,
        detail: { vulnerabilitiesChecked: Number(summary.vulnerabilitiesChecked ?? 0) },
      });
    }
  }
  if (assessmentType !== 'code') {
    for (const analyzer of AWS_ANALYZERS) {
      const available = analyzer.availability ? summary[analyzer.availability] : true;
      const itemsKey = analyzer.items;
      const errorKey = analyzer.error;
      runs.push({
        analyzerId: analyzer.analyzerId,
        dimension: analyzer.dimension,
        state: available === false ? 'failed' : available === undefined && analyzer.availability ? 'skipped' : 'completed',
        itemsAnalyzed: itemsKey ? Number(summary[itemsKey] ?? 0) : 0,
        findingsCount: awsAnalyzerFindings(analyzer.analyzerId, findings).length,
        error: errorKey && typeof summary[errorKey] === 'string' ? String(summary[errorKey]) : null,
        detail: analyzer.availability ? { available: available ?? null } : {},
      });
    }
  }
  return runs;
}
