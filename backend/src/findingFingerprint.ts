import { createHash } from 'node:crypto';

export type FingerprintInput = {
  source: string;
  externalId?: string | null;
  category: string;
  title: string;
  resource?: string | null;
};

export function computeFingerprint(input: FingerprintInput): string {
  const externalId = input.externalId?.trim();
  const basis = externalId
    ? `${input.source}:${externalId}`
    : `${input.source}:${input.category}:${input.title}:${input.resource ?? ''}`;
  return `fp_${createHash('sha256').update(basis).digest('hex').slice(0, 32)}`;
}

const SOURCE_PRIORITY: Record<string, number> = {
  cloudops: 0,
  'security-hub': 1,
  'aws-config': 2,
  'amazon-inspector': 3,
  osv: 4,
};

const SEVERITY_PRIORITY: Record<string, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
  INFORMATIONAL: 4,
};

export function findingPriority(finding: { source: string; severity: string }): number {
  return (SEVERITY_PRIORITY[finding.severity] ?? 9) * 10 + (SOURCE_PRIORITY[finding.source] ?? 9);
}

export function deduplicateByFingerprint<T extends { fingerprint?: string | null; source: string; severity: string; externalId?: string | null }>(findings: T[]): T[] {
  const best = new Map<string, T>();
  for (const finding of findings) {
    const key = finding.fingerprint ?? computeFingerprint(finding as unknown as FingerprintInput);
    const current = best.get(key);
    if (!current || findingPriority(finding) < findingPriority(current)) best.set(key, finding);
  }
  return [...best.values()];
}
