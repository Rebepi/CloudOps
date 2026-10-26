import type { EvaluacionSeguridad } from '../../types/cloud';

const states: Record<string, string> = { completed: 'Completado', partial: 'Parcial', failed: 'Fallido', skipped: 'Omitido', not_supported: 'No soportado' };
export function IacCoveragePanel({ assessment }: { assessment: EvaluacionSeguridad }) {
  if (assessment.assessmentType === 'aws-account') return null;
  const iac = assessment.summary.iac;
  if (!iac) return <section className="mt-5 border-t border-line pt-4 text-xs text-muted">Esta evaluación es anterior al perfil IaC. Ejecuta un nuevo análisis para obtener su cobertura.</section>;
  return <section className="mt-6 border-t border-line pt-5">
    <h3 className="text-sm font-bold text-ink">Infraestructura declarada: {states[iac.state] ?? iac.state}</h3>
    <p className="mt-2 text-xs text-muted">Perfil {iac.catalog.version} · {iac.filesSubmitted}/{iac.filesCandidate} archivos preparados · {iac.targetsAnalyzed} unidades informadas.</p>
    <p className="mt-1 text-xs text-muted">Políticas: {iac.checks.successes} sin fallo, {iac.checks.failures} fallidas y {iac.checks.exceptions} excepciones. No son recursos desplegados ni una certificación de cumplimiento.</p>
    <p className="mt-2 text-[11px] text-muted">{iac.engine.vendorInvoked ? `Perfil Trivy config ${iac.catalog.engineVersion}; políticas embebidas del motor fijado.` : iac.reportedKinds.includes('iam-policy') ? 'Se evaluaron documentos IAM literales sin invocar Trivy.' : 'Trivy no fue invocado en esta ejecución.'} No se ejecutan init, plan, apply, despliegues ni contenedores del proyecto.</p>
    {iac.reason && <p className="mt-2 text-xs text-amber-400">{iac.reason}</p>}
    <p className="mt-2 text-[11px] text-muted">Tipos observados: {iac.kinds.join(', ') || 'ninguno'}. Tipos evaluados: {iac.reportedKinds.join(', ') || 'ninguno'}.</p>
    <p className="mt-2 text-[11px] text-muted">Compose, Helm y referencias externas no se dan por evaluados mediante los otros escáneres del perfil.</p>
    {(iac.skipped.length > 0 || iac.unresolved.length > 0) && <details className="mt-3 text-[11px] text-muted"><summary className="cursor-pointer">Omisiones y condiciones no resueltas</summary>{[...iac.skipped, ...iac.unresolved].map((entry, index) => <p key={`${entry.path}:${index}`} className="mt-1 break-all">{entry.path}: {entry.reason}</p>)}</details>}
  </section>;
}
