import type { HallazgoSeguridad } from '../types/cloud';
import { isScoredFinding } from './securityPresentation';
import { detectFindingLayer, findingLayerLabels, isRepositoryFinding } from '../components/security/findingLayerHelper';

export const riskStates: Record<string, string> = { open: 'Abierto', in_progress: 'En tratamiento', resolved: 'Marcado como resuelto', risk_accepted: 'Riesgo aceptado', false_positive: 'Falso positivo' };
export const riskSources: Record<string, string> = { cloudops: 'CloudOps Engine', osv: 'OSV', trivy: 'Trivy', 'trivy-config': 'Trivy config', semgrep: 'Semgrep', gitleaks: 'Gitleaks', 'security-hub': 'Security Hub', 'aws-config': 'AWS Config', 'amazon-inspector': 'Inspector' };
export const riskLayers: Record<string, string> = { ...findingLayerLabels, aws: 'Cuenta AWS' };
export const layerOfRisk = (finding: HallazgoSeguridad) => isRepositoryFinding(finding) ? detectFindingLayer(finding) : 'aws';
export const isPendingRisk = (finding: HallazgoSeguridad) => finding.status === 'open' || finding.status === 'in_progress';
export const severityOrder: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFORMATIONAL: 4 };

export interface RiskFilters { query: string; dimension: string; state: string; layer: string; source: string; context: boolean; severity: string; order: string }
export const defaultRiskFilters: RiskFilters = { query: '', dimension: 'all', state: 'pending', layer: 'all', source: 'all', context: false, severity: 'all', order: 'priority' };
export function filterRisks(findings: HallazgoSeguridad[], filters: RiskFilters, includeSeverity = true) {
  const query = filters.query.toLocaleLowerCase().trim();
  const result = findings.filter((finding) => {
    if (!filters.context && !isScoredFinding(finding)) return false;
    if (filters.state === 'pending' ? !isPendingRisk(finding) : filters.state !== 'all' && finding.status !== filters.state) return false;
    if (filters.dimension !== 'all' && finding.dimension !== filters.dimension) return false;
    if (filters.layer !== 'all' && layerOfRisk(finding) !== filters.layer) return false;
    if (filters.source !== 'all' && finding.source !== filters.source) return false;
    if (includeSeverity && filters.severity !== 'all' && finding.severity !== filters.severity) return false;
    return !query || [finding.title, finding.resource, finding.description, finding.recommendation, finding.externalId,
      finding.evidence.package, finding.evidence.version, finding.evidence.advisory, finding.evidence.ruleId, finding.evidence.policyId,
    ].some((value) => (typeof value === 'string' || typeof value === 'number') && String(value).toLocaleLowerCase().includes(query));
  });
  return result.sort((a, b) => filters.order === 'location' ? (a.resource ?? '').localeCompare(b.resource ?? '') || a.id.localeCompare(b.id)
    : (severityOrder[a.severity] ?? 5) - (severityOrder[b.severity] ?? 5) || (b.priority?.rank ?? 0) - (a.priority?.rank ?? 0) || a.id.localeCompare(b.id));
}
