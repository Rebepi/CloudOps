export type AwsSecuritySnapshot = {
  accountSummary: Record<string, number>;
  identities: { name?: string; arn?: string; mfa: boolean }[];
  roles: { name?: string; arn?: string }[];
  trails: { name?: string; arn?: string; isLogging?: boolean | null }[];
  findings: { id?: string; title?: string; severity?: string; status?: string; resource?: string; description?: string }[];
  findingsError: string | null;
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
};

export type FindingSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFORMATIONAL';

export type NormalizedFinding = {
  externalId: string;
  source: 'cloudops' | 'security-hub' | 'aws-config' | 'amazon-inspector';
  category: 'account' | 'identity' | 'logging' | 'cloud-posture' | 'configuration' | 'compliance' | 'vulnerability' | 'coverage';
  title: string;
  description: string;
  severity: FindingSeverity;
  status: 'open';
  resource: string | null;
  recommendation: string;
  evidence: Record<string, unknown>;
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
  const totalControls = 8;

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

  const counts = findings.reduce<Record<FindingSeverity, number>>((acc, finding) => {
    acc[finding.severity] += 1;
    return acc;
  }, { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFORMATIONAL: 0 });
  const score = Math.max(0, 100 - findings.reduce((total, finding) => total + severityPenalty[finding.severity], 0));
  const coverage = Math.round((observedControls / totalControls) * 100);

  return {
    score,
    coverage,
    confidence: coverage === 100 ? 'high' : coverage >= 75 ? 'medium' : 'low',
    summary: {
      counts,
      observedControls,
      totalControls,
      users: snapshot.identities.length,
      roles: snapshot.roles.length,
      securityHubAvailable: !snapshot.findingsError,
      securityHubError: snapshot.findingsError,
      configAvailable: !snapshot.configError && Boolean(snapshot.config),
      configError: snapshot.configError,
      configRecorders: snapshot.config?.recorders.length ?? 0,
      configRules: snapshot.config?.rules.length ?? 0,
      inspectorAvailable: !snapshot.inspectorError && Boolean(snapshot.inspector),
      inspectorStatus: snapshot.inspector?.accountStatus ?? null,
      inspectorError: snapshot.inspectorError,
      inspectorCoveredResources: snapshot.inspector?.coverage.length ?? 0,
      inspectorFindings: snapshot.inspector?.findings.length ?? 0,
    },
    findings,
  };
}
