import type { HallazgoSeguridad } from '../../types/cloud';

export type FindingLayer = 'all' | 'backend' | 'frontend' | 'infrastructure' | 'dependencies' | 'shared';

export const findingLayerLabels: Record<Exclude<FindingLayer, 'all'>, string> = {
  backend: 'Backend',
  frontend: 'Frontend',
  infrastructure: 'Infra / Compose',
  dependencies: 'Dependencias',
  shared: 'Compartido',
};

export function detectFindingLayer(finding: Pick<HallazgoSeguridad, 'category' | 'source' | 'resource'>): Exclude<FindingLayer, 'all'> {
  const resource = (finding.resource ?? '').replace(/\\/g, '/').toLowerCase();
  const base = resource.split('/').pop() ?? '';
  if (finding.source === 'trivy') return finding.category === 'secret' ? 'infrastructure' : 'dependencies';
  if (finding.category === 'dependency' || finding.source === 'osv' || /^(?:package-lock\.json|composer\.lock|poetry\.lock|uv\.lock|pipfile\.lock|requirements.*\.txt)$/.test(base)) return 'dependencies';
  if (finding.category === 'iac' || base === 'dockerfile' || /(?:docker-)?compose.*\.ya?ml$/.test(base)
    || /\.(?:tf|tfvars)$/.test(base) || resource.includes('/.github/workflows/')) return 'infrastructure';
  if (/(?:^|\/)backend(?:\/|$)/.test(resource)) return 'backend';
  if (/(?:^|\/)frontend(?:\/|$)/.test(resource)) return 'frontend';
  return 'shared';
}

export function isRepositoryFinding(finding: Pick<HallazgoSeguridad, 'category' | 'source' | 'resource'>) {
  const resource = (finding.resource ?? '').replace(/\\/g, '/').toLowerCase();
  return finding.source === 'osv' || finding.source === 'trivy' || ['code', 'secret', 'dependency', 'iac', 'archive', 'license'].includes(finding.category)
    || /(?:^|\/)(?:backend|frontend)(?:\/|$)/.test(resource);
}
