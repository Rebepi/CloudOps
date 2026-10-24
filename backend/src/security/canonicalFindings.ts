import { computeFingerprint, findingPriority } from '../findingFingerprint.js';
import { canonicalControlForFinding } from './controlCatalog.js';

type Finding = {
  source: string;
  externalId?: string | null;
  category: string;
  title: string;
  severity: string;
  resource?: string | null;
  recommendation: string;
  fingerprint?: string | null;
  evidence: Record<string, unknown>;
};

type Observation = {
  source: string;
  title: string;
  category: string;
  externalId: string | null;
  severity: string;
  resource: string | null;
  recommendation: string;
  fingerprint: string;
  evidence: Record<string, unknown>;
};

function canonicalScope(finding: Finding): string | null {
  const control = canonicalControlForFinding(finding);
  if (!control || finding.severity === 'INFORMATIONAL' || finding.category === 'coverage' || finding.evidence.scoreExcluded === true) return null;
  const account = finding.evidence.accountId;
  if (typeof account !== 'string' || !/^\d{12}$/.test(account)) return null;
  const origin = /^arn:([^:]+):securityhub:([^:]+):(\d{12}):/.exec(finding.externalId ?? '');
  if (origin && origin[3] !== account) return null;
  const partition = typeof finding.evidence.partition === 'string' ? finding.evidence.partition : origin?.[1] ?? 'aws';
  if (!/^aws(?:-[a-z]+)*$/.test(partition) || origin && origin[1] !== partition) return null;
  const resource = finding.resource;
  if (control.scope === 'inspector-finding') {
    const inspector = /^arn:([^:]+):inspector2:([^:]+):(\d{12}):finding\/([A-Za-z0-9-]+)$/.exec(finding.externalId ?? '');
    if (!inspector || inspector[1] !== partition || inspector[3] !== account || !resource) return null;
    const region = inspector[2]!;
    if (typeof finding.evidence.region === 'string' && finding.evidence.region !== region) return null;
    let normalizedResource = resource;
    if (/^i-[0-9a-f]{8,17}$/.test(resource)) normalizedResource = `ec2:${resource}`;
    else {
      const arn = /^arn:([^:]+):(ec2|lambda|ecr):([^:]+):(\d{12}):(.+)$/.exec(resource);
      if (!arn || arn[1] !== partition || arn[3] !== region || arn[4] !== account) return null;
      if (arn[2] === 'ec2') {
        const instance = /^(?:instance\/)?(i-[0-9a-f]{8,17})$/.exec(arn[5]!);
        if (!instance) return null;
        normalizedResource = `ec2:${instance[1]}`;
      }
    }
    return `${partition}:${account}:${region}:inspector:${inspector[4]}:${normalizedResource}`;
  }
  if (control.scope === 'account') {
    // Account controls must never collapse findings about distinct IAM users.
    if (resource && resource !== account && resource !== `arn:${partition}:iam::${account}:root`) return null;
    return `${partition}:${account}:${control.id}`;
  }
  if (!resource) return null;
  if (control.scope === 's3-bucket') {
    const name = resource.startsWith(`arn:${partition}:s3:::`) ? resource.slice(`arn:${partition}:s3:::`.length) : resource;
    if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(name) || /^\d{12}$/.test(name)) return null;
    if (finding.source === 'cloudops' && finding.externalId !== `${control.cloudopsId}${name}`) return null;
    return `${partition}:${account}:s3:${name}:${control.id}`;
  }
  const arn = /^arn:([^:]+):rds:([^:]+):(\d{12}):db:([A-Za-z][A-Za-z0-9-]{0,62})$/.exec(resource);
  const metadataRegion = typeof finding.evidence.region === 'string' ? finding.evidence.region : undefined;
  const region = arn?.[2] ?? metadataRegion ?? origin?.[2];
  if (!region || !/^[a-z]{2}(?:-[a-z]+)+-\d+$/.test(region)) return null;
  if (arn && (arn[1] !== partition || arn[3] !== account)) return null;
  if (metadataRegion && metadataRegion !== region || origin && origin[2] !== region) return null;
  const name = arn?.[4] ?? resource;
  if (!/^[A-Za-z][A-Za-z0-9-]{0,62}$/.test(name)) return null;
  if (finding.source === 'cloudops' && finding.externalId !== `${control.cloudopsId}${name}`) return null;
  return `${partition}:${account}:${region}:rds:${name}:${control.id}`;
}

function observations(finding: Finding): Observation[] {
  if (Array.isArray(finding.evidence.observations)) return finding.evidence.observations as Observation[];
  return [{
    source: finding.source,
    title: finding.title,
    category: finding.category,
    externalId: finding.externalId ?? null,
    severity: finding.severity,
    resource: finding.resource ?? null,
    recommendation: finding.recommendation,
    fingerprint: finding.fingerprint ?? computeFingerprint(finding),
    evidence: finding.evidence,
  }];
}

/** Merge only explicitly equivalent controls with a proven account scope. */
export function deduplicateSecurityFindings<T extends Finding>(findings: T[]): T[] {
  const grouped = new Map<string, T[]>();
  for (const finding of findings) {
    const scope = canonicalScope(finding);
    const key = scope ?? finding.fingerprint ?? computeFingerprint(finding);
    const group = grouped.get(key) ?? [];
    group.push(finding);
    grouped.set(key, group);
  }
  return [...grouped.entries()].map(([key, group]) => {
    const winner = [...group].sort((a, b) => findingPriority(a) - findingPriority(b)
      || (a.externalId ?? '').localeCompare(b.externalId ?? ''))[0]!;
    if (!canonicalScope(winner)) return winner;
    const evidence = { ...winner.evidence };
    delete evidence.observations;
    const sightings = new Map<string, Observation>();
    for (const finding of group) {
      for (const observation of observations(finding)) sightings.set(`${observation.source}:${observation.fingerprint}`, observation);
    }
    return {
      ...winner,
      fingerprint: computeFingerprint({ ...winner, source: 'canonical', externalId: key }),
      evidence: { ...evidence, canonicalControl: canonicalControlForFinding(winner)!.id, canonicalScope: key,
        observations: [...sightings.values()].sort((a, b) => `${a.source}:${a.fingerprint}`.localeCompare(`${b.source}:${b.fingerprint}`)) },
    };
  });
}
