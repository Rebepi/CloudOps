import type { EvaluacionSeguridad, HallazgoSeguridad } from '../types/cloud';

export const protectionAreas = [
  { id: 'identity', label: 'Accesos', question: '¿Quién puede entrar y con qué permisos?', dimensions: ['identity'], action: 'Revisar credenciales, MFA y privilegios.' },
  { id: 'data', label: 'Datos y secretos', question: '¿Se protege la información sensible?', dimensions: ['data'], action: 'Revisar secretos detectados, cifrado y exposición.' },
  { id: 'software', label: 'Aplicación', question: '¿El código y sus componentes presentan riesgos?', dimensions: ['application', 'dependencies'], action: 'Revisar vulnerabilidades del código, bibliotecas e imágenes.' },
  { id: 'configuration', label: 'Infraestructura', question: '¿La configuración evita exposiciones innecesarias?', dimensions: ['configuration'], action: 'Revisar redes y declaraciones de infraestructura.' },
  { id: 'detection', label: 'Detección', question: '¿Podemos identificar y rastrear incidentes?', dimensions: ['detection'], action: 'Revisar auditoría, registros y controles de detección.' },
] as const;
export const severityNames: Record<string, string> = { CRITICAL: 'Crítico', HIGH: 'Alto', MEDIUM: 'Medio', LOW: 'Bajo', INFORMATIONAL: 'Informativo' };
export const controlNames: Record<string, string> = { pass: 'Comprobado sin fallo', fail: 'Fallo observado', partial: 'Comprobación parcial', failed: 'No se pudo verificar', skipped: 'No verificado', not_supported: 'No soportado', not_applicable: 'No aplica en este alcance' };
export function isScoredFinding(finding: HallazgoSeguridad) { return finding.severity !== 'INFORMATIONAL' && finding.evidence?.scoreExcluded !== true && finding.category !== 'coverage'; }
export function securityAreas(assessment: EvaluacionSeguridad) {
  return protectionAreas.map((area) => {
    const dimensions = (assessment.dimensionScores ?? []).filter((dimension) => (area.dimensions as readonly string[]).includes(dimension.id));
    const findings = (assessment.findings ?? []).filter((finding) => isScoredFinding(finding) && (area.dimensions as readonly string[]).includes(finding.dimension ?? ''));
    const controls = dimensions.flatMap((dimension) => dimension.controls ?? []);
    const passed = controls.filter((control) => control.state === 'pass').length;
    const failed = controls.filter((control) => control.state === 'fail').length;
    const unverified = controls.filter((control) => !['pass', 'fail', 'not_applicable'].includes(control.state)).length;
    const critical = findings.filter((finding) => finding.severity === 'CRITICAL').length;
    const high = findings.filter((finding) => finding.severity === 'HIGH').length;
    const status = critical ? 'Riesgo crítico' : high || failed ? 'Requiere atención' : findings.length ? 'Riesgos por revisar' : unverified || !controls.length || dimensions.some((dimension) => dimension.state !== 'measured') ? 'Evidencia incompleta' : 'Sin alertas en lo comprobado';
    return { ...area, dimensions, findings, controls, passed, failed, unverified, critical, high, status };
  });
}
