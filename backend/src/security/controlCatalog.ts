/** Equivalences are explicit: similar titles alone do not establish the same risk. */
export const CANONICAL_CONTROL_CATALOG = [
  { id: 'root-access-key', cloudopsId: 'cloudops:root-access-key', securityHubId: 'IAM.4', configSourceIdentifier: 'IAM_ROOT_ACCESS_KEY_CHECK', resourceType: 'AWS::::Account', scope: 'account', dimension: 'identity' },
  { id: 'root-mfa', cloudopsId: 'cloudops:root-mfa', securityHubId: 'IAM.9', configSourceIdentifier: 'ROOT_ACCOUNT_MFA_ENABLED', resourceType: 'AWS::::Account', scope: 'account', dimension: 'identity' },
  { id: 'rds-public', cloudopsId: 'cloudops:rds-public:', securityHubId: 'RDS.2', configSourceIdentifier: 'RDS_INSTANCE_PUBLIC_ACCESS_CHECK', resourceType: 'AWS::RDS::DBInstance', scope: 'rds-instance', dimension: 'configuration' },
  { id: 'rds-encryption', cloudopsId: 'cloudops:rds-unencrypted:', securityHubId: 'RDS.3', configSourceIdentifier: 'RDS_STORAGE_ENCRYPTED', resourceType: 'AWS::RDS::DBInstance', scope: 'rds-instance', dimension: 'data' },
  { id: 's3-block-public-access', cloudopsId: 'cloudops:s3-public-block:', securityHubId: 'S3.8', configSourceIdentifier: 'S3_BUCKET_LEVEL_PUBLIC_ACCESS_PROHIBITED', resourceType: 'AWS::S3::Bucket', scope: 's3-bucket', dimension: 'data' },
  { id: 'inspector-vulnerability', cloudopsId: '', securityHubId: '', configSourceIdentifier: '', resourceType: '', scope: 'inspector-finding', dimension: 'dependencies' },
] as const;

export type CanonicalControl = (typeof CANONICAL_CONTROL_CATALOG)[number];

export function canonicalControlForFinding(finding: { source: string; externalId?: string | null; evidence?: Record<string, unknown> }): CanonicalControl | undefined {
  const id = finding.externalId ?? '';
  if (['amazon-inspector', 'security-hub'].includes(finding.source) && /^arn:[^:]+:inspector2:[^:]+:\d{12}:finding\/[A-Za-z0-9-]+$/.test(id)) {
    return CANONICAL_CONTROL_CATALOG.find((control) => control.scope === 'inspector-finding');
  }
  if (finding.source === 'cloudops') {
    return CANONICAL_CONTROL_CATALOG.find((control) => control.cloudopsId && (control.scope === 'account'
      ? id === control.cloudopsId : id.startsWith(control.cloudopsId) && id.length > control.cloudopsId.length));
  }
  if (finding.source === 'aws-config') {
    return CANONICAL_CONTROL_CATALOG.find((control) => control.configSourceIdentifier
      && control.configSourceIdentifier === finding.evidence?.sourceIdentifier
      && control.resourceType === finding.evidence?.resourceType);
  }
  if (finding.source === 'security-hub') {
    const code = /(?:^|[/:])security-control\/([A-Z][A-Z0-9]*\.\d+)(?:\/|$)/.exec(id)?.[1]
      ?? /^(?:[A-Z][A-Z0-9]*\.\d+)$/.exec(id)?.[0];
    return CANONICAL_CONTROL_CATALOG.find((control) => control.securityHubId === code);
  }
  return undefined;
}
