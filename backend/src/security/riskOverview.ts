import { canonicalControlForFinding } from './controlCatalog.js';

export type RiskFinding = {
  id?: string; fingerprint?: string | null; externalId?: string | null; source: string; category: string; title: string;
  severity: string; status?: string; resource?: string | null; recommendation?: string; evidence?: Record<string, unknown>;
};
export const PRIORITY_VERSION = '2026.10.priority1';
const weights: Record<string, number> = { CRITICAL: 80, HIGH: 60, MEDIUM: 35, LOW: 15, INFORMATIONAL: 0 };

export function priorityFor(finding: RiskFinding) {
  const excluded = finding.category === 'coverage' || finding.evidence?.scoreExcluded === true || finding.severity === 'INFORMATIONAL';
  const id = finding.externalId ?? '';
  const canonical = canonicalControlForFinding(finding)?.id ?? String(finding.evidence?.canonicalControl ?? '');
  const exposure = /cloudops:(?:s3-public-policy|rds-public|security-group-public-admin)/.test(id)
    || /(?:^|[/:])security-control\/(?:RDS\.2|EC2\.19)(?:\/|$)/.test(id) || canonical === 'rds-public';
  const privilege = /^cloudops:root-access-key/.test(id) || /(?:^|[/:])security-control\/IAM\.4(?:\/|$)/.test(id)
    || canonical === 'root-access-key';
  const data = finding.category === 'secret' || /^cloudops:(?:rds-unencrypted|s3-public-policy)/.test(id) || canonical === 'rds-encryption';
  const reasons = [exposure ? 'Exposición declarada por el control observado' : null, privilege ? 'Privilegio root observado' : null,
    data ? 'Credenciales o protección de datos afectadas' : null].filter((value): value is string => Boolean(value));
  const actionable = !excluded && !['resolved', 'false_positive', 'risk_accepted'].includes(finding.status ?? 'open');
  return { version: PRIORITY_VERSION, rank: actionable ? (weights[finding.severity] ?? 0) + (exposure ? 10 : 0) + (privilege ? 15 : 0) + (data ? 5 : 0) : 0,
    actionable, reasons: excluded ? ['Informativo o evidencia excluida del puntaje'] : reasons.length ? reasons : ['Severidad del analizador; contexto adicional no demostrado'] };
}

export function serviceFor(finding: RiskFinding) {
  const resource = finding.resource ?? '';
  const id = finding.externalId ?? '';
  const arn = /^arn:[^:]+:([^:]+):/.exec(resource)?.[1];
  if (arn) return arn;
  const control = canonicalControlForFinding(finding);
  if (control?.scope === 'account') return 'iam';
  if (control?.scope === 's3-bucket') return 's3';
  if (control?.scope === 'rds-instance') return 'rds';
  if (/root-|iam-/.test(id) || finding.category === 'account' || finding.category === 'identity') return 'iam';
  if (/s3-/.test(id)) return 's3';
  if (/rds-/.test(id)) return 'rds';
  if (/security-group/.test(id) || /^sg-/.test(resource)) return 'ec2';
  if (/cloudtrail/.test(id)) return 'cloudtrail';
  return finding.source;
}

/** Grouping is presentation-only; it never merges distinct controls or changes scoring. */
export function buildRiskOverview(findings: RiskFinding[], region: string) {
  const grouped = new Map<string, { resource: string; service: string; region: string; actionable: number; informational: number; counts: Record<string, number>; sources: Set<string>; priority: number; findingIds: string[] }>();
  for (const finding of findings) {
    const service = serviceFor(finding);
    const resource = finding.resource ?? 'Cuenta / recurso no identificado';
    const observedRegion = String(finding.evidence?.region ?? region);
    const key = JSON.stringify([service, observedRegion, resource]);
    const group = grouped.get(key) ?? { resource, service, region: observedRegion, actionable: 0, informational: 0, counts: {}, sources: new Set<string>(), priority: 0, findingIds: [] };
    const priority = priorityFor(finding);
    group.actionable += Number(priority.actionable);
    group.informational += Number(finding.severity === 'INFORMATIONAL');
    group.counts[finding.severity] = (group.counts[finding.severity] ?? 0) + 1;
    group.sources.add(finding.source);
    if (Array.isArray(finding.evidence?.observations)) for (const observation of finding.evidence.observations) {
      if (observation && typeof observation === 'object' && typeof observation.source === 'string') group.sources.add(observation.source);
    }
    group.priority = Math.max(group.priority, priority.rank);
    if (finding.id) group.findingIds.push(finding.id);
    grouped.set(key, group);
  }
  return { version: PRIORITY_VERSION, actionable: findings.filter((finding) => priorityFor(finding).actionable).length,
    informational: findings.filter((finding) => finding.severity === 'INFORMATIONAL').length,
    excluded: findings.filter((finding) => finding.category === 'coverage' || finding.evidence?.scoreExcluded === true).length,
    total: findings.length, groups: [...grouped.values()].map((group) => ({ ...group, sources: [...group.sources].sort() }))
      .sort((a, b) => b.priority - a.priority || a.resource.localeCompare(b.resource)) };
}
