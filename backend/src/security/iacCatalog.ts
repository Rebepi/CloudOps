import { TRIVY_IMAGE } from './toolProcess.js';

export const IAC_CATALOG = { version: '2026.10.iac1', engineVersion: '0.76.1', image: TRIVY_IMAGE,
  rulesSource: 'embedded-in-pinned-image-plus-owned-literal-iam-policy', scanners: ['terraform', 'cloudformation', 'kubernetes', 'dockerfile'],
  includeDeprecatedChecks: false, customPolicies: ['CLOUDOPS-IAM-0001'], network: 'disabled-in-docker', deployment: 'not-verified' };

export function iacDimension(id: string): 'configuration' | 'identity' | 'data' | 'detection' {
  if (id === 'CLOUDOPS-IAM-0001' || id === 'AWS-0057') return 'identity';
  if (id === 'AWS-0089') return 'detection';
  if (/^AWS-(?:0026|0027|0086|0087|0088|0090|0091|0092|0093|0132)$/.test(id)) return 'data';
  return 'configuration';
}

export type IacFrameworkReference = { framework: string; control: string | null; relation: 'related'; url: string };
export function iacFrameworkReferences(id: string, references: string[]): IacFrameworkReference[] {
  const result: IacFrameworkReference[] = [];
  for (const reference of references) {
    try {
      const url = new URL(reference);
      const control = /^#([a-z][a-z0-9]*)-(\d+)$/.exec(url.hash);
      if (url.hostname === 'docs.aws.amazon.com' && url.pathname.includes('/securityhub/') && control) {
        result.push({ framework: 'AWS FSBP', control: `${control[1]!.toUpperCase()}.${control[2]}`, relation: 'related', url: reference });
      }
      if (url.hostname === 'kubernetes.io' && url.pathname.includes('/pod-security-standards/')) {
        result.push({ framework: 'Kubernetes Pod Security', control: url.hash.slice(1) || null, relation: 'related', url: reference });
      }
    } catch { /* Unrecognized reference is not a compliance assertion. */ }
  }
  if (id === 'CLOUDOPS-IAM-0001') result.push(
    { framework: 'AWS FSBP', control: 'IAM.1', relation: 'related', url: 'https://docs.aws.amazon.com/securityhub/latest/userguide/iam-controls.html#iam-1' },
    { framework: 'CIS AWS 1.4 (referencia histórica)', control: null, relation: 'related', url: 'https://avd.aquasec.com/misconfig/aws/iam/aws-0057/' },
  );
  return [...new Map(result.map((reference) => [`${reference.framework}:${reference.control}:${reference.url}`, reference])).values()];
}
