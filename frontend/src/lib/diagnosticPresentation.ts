import type { ControlDimensionSeguridad, EvaluacionSeguridad } from '../types/cloud';
import { isScoredFinding } from './securityPresentation';

export const diagnosticDimensions = [
  { id: 'identity', label: 'Accesos', description: 'Autenticación, credenciales y permisos.' },
  { id: 'data', label: 'Datos y secretos', description: 'Información sensible, cifrado y exposición.' },
  { id: 'application', label: 'Código', description: 'Reglas de seguridad sobre la aplicación.' },
  { id: 'dependencies', label: 'Dependencias e imágenes', description: 'Vulnerabilidades conocidas en componentes.' },
  { id: 'configuration', label: 'Infraestructura', description: 'Configuración y declaraciones de despliegue.' },
  { id: 'detection', label: 'Detección y auditoría', description: 'Registro y comprobación de eventos.' },
] as const;

export const controlSegments = [
  { key: 'pass', label: 'Sin fallo', tone: 'ok' },
  { key: 'fail', label: 'Con fallo', tone: 'danger' },
  { key: 'partial', label: 'Parciales', tone: 'warning' },
  { key: 'pending', label: 'Pendientes', tone: 'neutral' },
] as const;

export function controlDistribution(controls: ControlDimensionSeguridad[]) {
  const counts = { pass: 0, fail: 0, partial: 0, pending: 0, notApplicable: 0 };
  for (const control of controls) {
    if (control.state === 'not_applicable') counts.notApplicable++;
    else if (control.state === 'pass' || control.state === 'fail' || control.state === 'partial') counts[control.state]++;
    else counts.pending++;
  }
  return { ...counts, total: controls.length, applicable: controls.length - counts.notApplicable };
}

export function diagnosticModel(assessment: EvaluacionSeguridad) {
  const findings = (assessment.findings ?? []).filter(isScoredFinding);
  const actionable = findings.filter((finding) => !['resolved', 'false_positive', 'risk_accepted'].includes(finding.status));
  const severityOrder: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  const priorities = [...actionable].sort((a, b) => (severityOrder[a.severity] ?? 4) - (severityOrder[b.severity] ?? 4) || (b.priority?.rank ?? 0) - (a.priority?.rank ?? 0)).slice(0, 3);
  const dimensions = diagnosticDimensions.map((meta) => {
    const measured = assessment.dimensionScores?.find((dimension) => dimension.id === meta.id);
    const controls = measured?.controls ?? [];
    return { ...meta, measured, controls, counts: controlDistribution(controls), findings: findings.filter((finding) => finding.dimension === meta.id) };
  });
  const analyzers = assessment.analyzers ?? [];
  return {
    dimensions, actionable, priorities,
    critical: actionable.filter((finding) => finding.severity === 'CRITICAL').length,
    high: actionable.filter((finding) => finding.severity === 'HIGH').length,
    analyzers,
    complete: analyzers.filter((analyzer) => analyzer.state === 'completed'),
    partial: analyzers.filter((analyzer) => analyzer.state === 'partial'),
    unavailable: analyzers.filter((analyzer) => !['completed', 'partial'].includes(analyzer.state)),
    incomplete: analyzers.filter((analyzer) => analyzer.state !== 'completed'),
  };
}

export function boundedPercentage(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;
}
