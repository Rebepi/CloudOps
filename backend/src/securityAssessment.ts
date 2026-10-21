import { computeFingerprint, deduplicateByFingerprint } from './findingFingerprint.js';
import { frameworkFor, isApplicableForScore } from './findingFramework.js';

export type AwsSecuritySnapshot = {
  accountSummary: Record<string, number>;
  identities: { name?: string; arn?: string; mfa: boolean }[];
  roles: { name?: string; arn?: string }[];
  trails: { name?: string; arn?: string; isLogging?: boolean | null }[];
  findings: { id?: string; title?: string; severity?: string; status?: string; resource?: string; description?: string }[];
  findingsError: string | null;
  findingsTruncated?: boolean;
  config: {
    recorders: { arn?: string; name?: string; servicePrincipal?: string; recordingScope?: string; recording: boolean; lastStatus?: string; lastErrorCode?: string; lastStatusChangeTime?: string }[];
    rules: { name?: string; complianceType?: string; nonCompliantResources: number; capExceeded: boolean }[];
    truncated: boolean;
  } | null;
  configError: string | null;
  inspector: {
    accountStatus?: string;
    resourceState?: unknown;
    coverage: { resourceId?: string; resourceType?: string; scanType?: string; statusCode?: string; statusReason?: string; lastScannedAt?: string }[];
    findings: { id?: string; title?: string; description?: string; severity?: string; status?: string; resource?: string; resourceType?: string; inspectorScore?: number; fixAvailable?: string; recommendation?: string }[];
    truncated: boolean;
  } | null;
  inspectorError: string | null;
  s3?: { buckets: { name: string; blockPublicAccess: boolean | null; publicPolicy: boolean | null; inspectionError?: string | null }[]; truncated: boolean } | null;
  s3Error?: string | null;
  network?: { securityGroups: { id?: string; name?: string; vpcId?: string; publicIngress: { cidr: string; protocol?: string; fromPort?: number; toPort?: number }[] }[] } | null;
  networkError?: string | null;
  rds?: { instances: { id?: string; arn?: string; engine?: string; publiclyAccessible: boolean; storageEncrypted: boolean; deletionProtection: boolean; multiAz: boolean }[]; truncated: boolean } | null;
  rdsError?: string | null;
};

export type FindingSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFORMATIONAL';

export type FindingLifecycle = 'open' | 'in_progress' | 'resolved' | 'false_positive' | 'risk_accepted';

export type NormalizedFinding = {
  externalId: string;
  source: 'cloudops' | 'security-hub' | 'aws-config' | 'amazon-inspector';
  category: 'account' | 'identity' | 'logging' | 'cloud-posture' | 'configuration' | 'compliance' | 'vulnerability' | 'coverage';
  title: string;
  description: string;
  severity: FindingSeverity;
  status: FindingLifecycle;
  resource: string | null;
  recommendation: string;
  evidence: Record<string, unknown>;
  fingerprint?: string;
  framework?: string | null;
};

const severityPenalty: Record<FindingSeverity, number> = {
  CRITICAL: 20,
  HIGH: 12,
  MEDIUM: 6,
  LOW: 2,
  INFORMATIONAL: 0,
};

function normalizeSeverity(value?: string): FindingSeverity {
  const normalized = value?.toUpperCase();
  return normalized === 'CRITICAL' || normalized === 'HIGH' || normalized === 'MEDIUM' || normalized === 'LOW'
    ? normalized
    : 'INFORMATIONAL';
}

export function evaluateAwsSecurity(snapshot: AwsSecuritySnapshot) {
  const findings: NormalizedFinding[] = [];
  let observedControls = 0;
  const totalControls = 11;

  if (typeof snapshot.accountSummary.AccountMFAEnabled === 'number') {
    observedControls += 1;
    if (snapshot.accountSummary.AccountMFAEnabled !== 1) {
      findings.push({
        externalId: 'cloudops:root-mfa', source: 'cloudops', category: 'account',
        title: 'MFA no observado en la cuenta root',
        description: 'IAM reporta AccountMFAEnabled con valor distinto de 1.', severity: 'HIGH', status: 'open', resource: null,
        recommendation: 'Habilitar MFA resistente al phishing para el usuario root y proteger sus credenciales.',
        evidence: { accountMfaEnabled: snapshot.accountSummary.AccountMFAEnabled },
      });
    }
  }

  if ((snapshot.accountSummary.AccountAccessKeysPresent ?? 0) > 0) {
    findings.push({
      externalId: 'cloudops:root-access-key', source: 'cloudops', category: 'account',
      title: 'La cuenta root tiene una clave de acceso activa',
      description: 'IAM reporta una o más access keys asociadas al usuario root de la cuenta.', severity: 'CRITICAL', status: 'open', resource: null,
      recommendation: 'Eliminar las claves de acceso root y usar un rol o usuario administrativo con MFA y privilegios temporales.',
      evidence: { accountAccessKeysPresent: snapshot.accountSummary.AccountAccessKeysPresent },
    });
  }

  observedControls += 1;
  const usersWithoutMfa = snapshot.identities.filter((identity) => !identity.mfa);
  if (usersWithoutMfa.length) {
    findings.push({
      externalId: 'cloudops:iam-users-without-mfa', source: 'cloudops', category: 'identity',
      title: `${usersWithoutMfa.length} usuario(s) IAM sin MFA`,
      description: 'Se observaron identidades IAM con acceso que no tienen un dispositivo MFA asociado.', severity: 'MEDIUM', status: 'open', resource: null,
      recommendation: 'Habilitar MFA o migrar el acceso humano a IAM Identity Center con credenciales temporales.',
      evidence: { users: usersWithoutMfa.map((identity) => identity.name ?? identity.arn ?? 'desconocido') },
    });
  }

  observedControls += 1;
  if (!snapshot.trails.some((trail) => trail.isLogging === true)) {
    findings.push({
      externalId: 'cloudops:cloudtrail-not-logging', source: 'cloudops', category: 'logging',
      title: 'No se observó un trail activo',
      description: 'Ninguno de los trails devueltos para la cuenta aparece registrando eventos.', severity: 'HIGH', status: 'open', resource: null,
      recommendation: 'Habilitar un trail multirregión, validación de archivos y almacenamiento protegido de logs.',
      evidence: { trails: snapshot.trails },
    });
  }

  if (!snapshot.findingsError) observedControls += 1;
  for (const finding of snapshot.findings) {
    findings.push({
      externalId: finding.id ?? `security-hub:${finding.title ?? 'finding'}`,
      source: 'security-hub', category: 'cloud-posture',
      title: finding.title ?? 'Hallazgo de Security Hub',
      description: finding.description ?? `${finding.severity ?? 'Sin severidad'} · ${finding.status ?? 'Sin estado'}`,
      severity: normalizeSeverity(finding.severity), status: 'open', resource: finding.resource ?? null,
      recommendation: 'Revisar la evidencia y la remediación indicada por AWS Security Hub.',
      evidence: { workflowStatus: finding.status ?? null },
    });
  }

  if (!snapshot.configError && snapshot.config) {
    observedControls += 2;
    if (!snapshot.config.recorders.some((recorder) => recorder.recording && recorder.lastStatus !== 'FAILURE')) {
      findings.push({
        externalId: 'aws-config:recorder-inactive', source: 'aws-config', category: 'configuration',
        title: 'AWS Config no tiene un grabador activo y saludable',
        description: 'No se observó un configuration recorder en ejecución sin errores.', severity: 'HIGH', status: 'open', resource: null,
        recommendation: 'Habilitar el grabador de AWS Config para los tipos de recursos requeridos y revisar su canal de entrega.',
        evidence: { recorders: snapshot.config.recorders },
      });
    }
    const securityHubManagedRecorder = snapshot.config.recorders.some((recorder) => recorder.recordingScope === 'INTERNAL' && recorder.servicePrincipal?.includes('securityhub.amazonaws.com'));
    if (!snapshot.config.rules.length && !securityHubManagedRecorder) {
      findings.push({
        externalId: 'aws-config:no-rules', source: 'aws-config', category: 'compliance',
        title: 'AWS Config no tiene reglas con resultados',
        description: 'El servicio no devolvió reglas de cumplimiento evaluadas en la región.', severity: 'MEDIUM', status: 'open', resource: null,
        recommendation: 'Definir un conjunto de reglas administradas alineadas con los controles que se ofrecerán en el informe.', evidence: {},
      });
    }
    for (const rule of snapshot.config.rules.filter((item) => item.complianceType === 'NON_COMPLIANT')) {
      findings.push({
        externalId: `aws-config:${rule.name ?? 'unknown'}`, source: 'aws-config', category: 'compliance',
        title: `Regla no conforme: ${rule.name ?? 'sin nombre'}`,
        description: `${rule.nonCompliantResources} recurso(s) reportado(s) como no conformes.`, severity: 'MEDIUM', status: 'open',
        resource: rule.name ?? null, recommendation: 'Revisar los recursos evaluados por la regla, corregir la configuración y volver a evaluar.',
        evidence: { complianceType: rule.complianceType, nonCompliantResources: rule.nonCompliantResources, capExceeded: rule.capExceeded },
      });
    }
  }

  if (!snapshot.inspectorError && snapshot.inspector && snapshot.inspector.accountStatus !== 'DISABLED') {
    observedControls += 2;
    if (!snapshot.inspector.coverage.length) {
      findings.push({
        externalId: 'amazon-inspector:no-coverage', source: 'amazon-inspector', category: 'coverage',
        title: 'Amazon Inspector no reporta recursos cubiertos',
        description: 'No se observaron recursos EC2, imágenes ECR o funciones Lambda bajo análisis en la región.', severity: 'LOW', status: 'open', resource: null,
        recommendation: 'Confirmar que Inspector está habilitado y que existen recursos compatibles en la región.', evidence: {},
      });
    }
    const unhealthyCoverage = snapshot.inspector.coverage.filter((item) => item.statusCode && item.statusCode !== 'ACTIVE');
    if (unhealthyCoverage.length) {
      findings.push({
        externalId: 'amazon-inspector:coverage-errors', source: 'amazon-inspector', category: 'coverage',
        title: `${unhealthyCoverage.length} recurso(s) sin cobertura saludable de Inspector`,
        description: 'Amazon Inspector reporta recursos cuyo análisis no está activo.', severity: 'MEDIUM', status: 'open', resource: null,
        recommendation: 'Resolver los motivos de cobertura indicados por Inspector, incluidos permisos, SSM, cifrado o inventario.',
        evidence: { resources: unhealthyCoverage.slice(0, 50) },
      });
    }
    for (const item of snapshot.inspector.findings) {
      findings.push({
        externalId: item.id ?? `amazon-inspector:${item.title ?? 'finding'}`, source: 'amazon-inspector', category: 'vulnerability',
        title: item.title ?? 'Hallazgo de Amazon Inspector', description: item.description ?? 'Inspector detectó una vulnerabilidad en el recurso.',
        severity: normalizeSeverity(item.severity), status: 'open', resource: item.resource ?? null,
        recommendation: item.recommendation ?? 'Aplicar la remediación recomendada por Amazon Inspector y confirmar el cierre del hallazgo.',
        evidence: { status: item.status, resourceType: item.resourceType, inspectorScore: item.inspectorScore, fixAvailable: item.fixAvailable },
      });
    }
  }

  if (!snapshot.s3Error && snapshot.s3) {
    observedControls += 1;
    for (const bucket of snapshot.s3.buckets) {
      if (bucket.publicPolicy === true) {
        findings.push({
          externalId: `cloudops:s3-public-policy:${bucket.name}`, source: 'cloudops', category: 'configuration',
          title: `Bucket S3 con política pública: ${bucket.name}`, description: 'S3 confirmó que la política efectiva del bucket permite acceso público.',
          severity: 'CRITICAL', status: 'open', resource: bucket.name,
          recommendation: 'Retirar el acceso público salvo justificación documentada y servir contenido público mediante CloudFront con OAC.',
          evidence: { blockPublicAccess: bucket.blockPublicAccess, publicPolicy: true },
        });
      } else if (bucket.blockPublicAccess === false) {
        findings.push({
          externalId: `cloudops:s3-public-block:${bucket.name}`, source: 'cloudops', category: 'configuration',
          title: `Bloqueo público de S3 incompleto: ${bucket.name}`, description: 'No están activos los cuatro controles de S3 Block Public Access para el bucket.',
          severity: 'MEDIUM', status: 'open', resource: bucket.name,
          recommendation: 'Activar BlockPublicAcls, IgnorePublicAcls, BlockPublicPolicy y RestrictPublicBuckets.',
          evidence: { blockPublicAccess: false, publicPolicy: bucket.publicPolicy },
        });
      }
    }
  }

  if (!snapshot.networkError && snapshot.network) {
    observedControls += 1;
    const sensitivePorts = new Set([22, 3389, 3306, 5432, 6379, 27017]);
    for (const group of snapshot.network.securityGroups) {
      const risky = group.publicIngress.filter((rule) => rule.protocol === '-1' || [...sensitivePorts].some((port) => (rule.fromPort ?? 0) <= port && (rule.toPort ?? 65535) >= port));
      if (!risky.length) continue;
      findings.push({
        externalId: `cloudops:security-group-public-admin:${group.id ?? group.name}`, source: 'cloudops', category: 'configuration',
        title: `Security Group expone puertos sensibles: ${group.name ?? group.id ?? 'sin nombre'}`,
        description: 'Se observaron reglas de entrada desde cualquier dirección hacia todos los protocolos o puertos administrativos/de datos.',
        severity: 'HIGH', status: 'open', resource: group.id ?? group.name ?? null,
        recommendation: 'Restringir el origen a redes conocidas, VPN o Session Manager y eliminar reglas 0.0.0.0/0 y ::/0 innecesarias.',
        evidence: { vpcId: group.vpcId, publicIngress: risky },
      });
    }
  }

  if (!snapshot.rdsError && snapshot.rds) {
    observedControls += 1;
    for (const instance of snapshot.rds.instances) {
      if (instance.publiclyAccessible) findings.push({
        externalId: `cloudops:rds-public:${instance.id}`, source: 'cloudops', category: 'configuration',
        title: `Instancia RDS públicamente accesible: ${instance.id ?? 'sin identificador'}`,
        description: 'RDS reporta PubliclyAccessible=true para la instancia.', severity: 'HIGH', status: 'open', resource: instance.arn ?? instance.id ?? null,
        recommendation: 'Mover la base de datos a subredes privadas y limitar el acceso mediante Security Groups.', evidence: { engine: instance.engine, publiclyAccessible: true },
      });
      if (!instance.storageEncrypted) findings.push({
        externalId: `cloudops:rds-unencrypted:${instance.id}`, source: 'cloudops', category: 'configuration',
        title: `Almacenamiento RDS sin cifrado: ${instance.id ?? 'sin identificador'}`,
        description: 'RDS reporta StorageEncrypted=false para la instancia.', severity: 'HIGH', status: 'open', resource: instance.arn ?? instance.id ?? null,
        recommendation: 'Migrar a una instancia cifrada con una clave KMS administrada y validar cifrado de snapshots.', evidence: { engine: instance.engine, storageEncrypted: false },
      });
    }
  }

  const withMetadata = findings.map((finding) => ({
    ...finding,
    fingerprint: computeFingerprint(finding),
    framework: frameworkFor(finding.source, finding.category),
  }));
  const deduplicated = deduplicateByFingerprint(withMetadata);

  const counts = deduplicated.reduce<Record<FindingSeverity, number>>((acc, finding) => {
    acc[finding.severity] += 1;
    return acc;
  }, { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFORMATIONAL: 0 });
  const rawSum = deduplicated.reduce((total, finding) => total + (isApplicableForScore(finding.category) ? severityPenalty[finding.severity] : 0), 0);
  let score: number;
  if (rawSum <= 50) {
    score = Math.max(0, 100 - rawSum);
  } else {
    const excess = rawSum - 50;
    const decayed = 50 / (1 + (excess / 180));
    score = Math.max(5, Math.round(decayed));
  }
  const criticalExposure = deduplicated.some((finding) => finding.severity === 'CRITICAL' && isApplicableForScore(finding.category));
  if (criticalExposure) score = Math.min(score, 45);
  const excludedFromScore = deduplicated.filter((finding) => !isApplicableForScore(finding.category)).length;
  const coverage = Math.round((observedControls / totalControls) * 100);

  return {
    score,
    coverage,
    confidence: coverage === 100 ? 'high' : coverage >= 75 ? 'medium' : 'low',
    summary: {
      counts,
      observedControls,
      totalControls,
      deduplicatedFindings: findings.length - deduplicated.length,
      excludedFromScore,
      users: snapshot.identities.length,
      roles: snapshot.roles.length,
      trails: snapshot.trails.length,
      securityHubAvailable: !snapshot.findingsError,
      securityHubError: snapshot.findingsError,
      securityHubTruncated: Boolean(snapshot.findingsTruncated),
      configAvailable: !snapshot.configError && Boolean(snapshot.config),
      configError: snapshot.configError,
      configRecorders: snapshot.config?.recorders.length ?? 0,
      configRules: snapshot.config?.rules.length ?? 0,
      inspectorAvailable: !snapshot.inspectorError && Boolean(snapshot.inspector),
      inspectorStatus: snapshot.inspector?.accountStatus ?? null,
      inspectorError: snapshot.inspectorError,
      inspectorCoveredResources: snapshot.inspector?.coverage.length ?? 0,
      inspectorFindings: snapshot.inspector?.findings.length ?? 0,
      s3Available: !snapshot.s3Error && Boolean(snapshot.s3),
      s3Error: snapshot.s3Error ?? null,
      s3Buckets: snapshot.s3?.buckets.length ?? 0,
      networkAvailable: !snapshot.networkError && Boolean(snapshot.network),
      networkError: snapshot.networkError ?? null,
      securityGroups: snapshot.network?.securityGroups.length ?? 0,
      rdsAvailable: !snapshot.rdsError && Boolean(snapshot.rds),
      rdsError: snapshot.rdsError ?? null,
      rdsInstances: snapshot.rds?.instances.length ?? 0,
      scoreCapsApplied: criticalExposure ? ['critical-finding:45'] : [],
      methodology: 'Controles propios de CloudOps sobre IAM, CloudTrail, S3, Security Groups y RDS, más Security Hub V2/CSPM, AWS Config e Inspector; puntaje con evidencia observada, deduplicación y exclusión de cobertura opcional.',
      methodologyVersion: '2026.11',
    },
    findings: deduplicated,
  };
}
