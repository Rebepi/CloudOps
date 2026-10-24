import type { EvaluacionSeguridad } from '../../types/cloud';

const states: Record<string, string> = { completed: 'Completado', partial: 'Parcial', failed: 'Fallido', skipped: 'Omitido' };

export function RepositorySecretsPanel({ assessment }: { assessment: EvaluacionSeguridad }) {
  if (assessment.assessmentType === 'aws-account') return null;
  const secrets = assessment.summary.secrets;
  if (!secrets) return <section className="mt-5 border-t border-line pt-4 text-xs text-muted">Esta evaluación es anterior al análisis Gitleaks de repositorio. Ejecuta un nuevo análisis para obtener su cobertura.</section>;
  return <section className="mt-6 border-t border-line pt-5">
    <h3 className="text-sm font-bold text-ink">Secretos del repositorio: {states[secrets.state] ?? secrets.state}</h3>
    <p className="mt-2 text-xs text-muted">Gitleaks {secrets.engine.version ?? 'sin versión nativa comprobada'} · modalidad {secrets.engine.mode} · catálogo {secrets.catalog.version}.</p>
    <p className="mt-1 text-xs text-muted">{secrets.filesAnalyzed}/{secrets.filesCandidate} archivos de texto enviados al motor; {secrets.filesSkipped} omitidos; {secrets.detections} coincidencias antes de corroboración.</p>
    <p className="mt-2 text-[11px] text-muted">Valores y fragmentos descartados; redacción 100 %. No se comprueba actividad contra proveedores ni se rota ninguna credencial automáticamente. No se evalúa historial Git.</p>
    {secrets.reason && <p className="mt-2 text-xs text-amber-400">{secrets.reason}</p>}
    {secrets.catalog.sha256 && <p className="mt-2 break-all font-mono text-[10px] text-muted">SHA-256 de configuración: {secrets.catalog.sha256}</p>}
    {secrets.skipped.length > 0 && <details className="mt-3 text-[11px] text-muted"><summary className="cursor-pointer">Omisiones registradas ({secrets.skipped.length})</summary>{secrets.skipped.map((file, index) => <p key={`${file.path}:${index}`} className="mt-1 break-all">{file.path}: {file.reason}</p>)}</details>}
  </section>;
}
