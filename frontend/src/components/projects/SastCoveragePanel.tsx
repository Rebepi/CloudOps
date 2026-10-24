import type { EvaluacionSeguridad } from '../../types/cloud';

const states: Record<string, string> = { completed: 'Completado', partial: 'Parcial', skipped: 'Omitido', failed: 'Fallido', not_supported: 'No soportado' };

export function SastCoveragePanel({ assessment }: { assessment: EvaluacionSeguridad }) {
  const sast = assessment.summary.sast;
  if (assessment.assessmentType === 'aws-account') return null;
  if (!sast) return <section className="mt-5 border-t border-line pt-4 text-xs text-muted">Esta evaluación es anterior al SAST Semgrep. Ejecuta un nuevo análisis para obtener cobertura por lenguaje.</section>;
  return <section className="mt-6 border-t border-line pt-5">
    <h3 className="text-sm font-bold text-ink">SAST Semgrep: {states[sast.state] ?? sast.state}</h3>
    <p className="mt-2 text-xs text-muted">Catálogo {sast.catalog.version} · {sast.catalog.ruleCount} reglas · motor {sast.engineVersion ?? 'sin medición'}.</p>
    {sast.engine && <p className="mt-1 text-[11px] text-muted">Modalidad: {sast.engine.mode}.</p>}
    <p className="mt-1 text-xs text-muted">{sast.filesAnalyzed} archivos analizados; {sast.filesExcluded} excluidos por contexto; {sast.filesSkipped} omitidos; {sast.unsupportedFiles} sin reglas de lenguaje.</p>
    {sast.reason && <p className="mt-2 text-xs text-amber-400">{sast.reason}</p>}
    <p className="mt-2 text-[11px] text-muted">El motor analiza sintaxis y flujo intraprocedimental con reglas locales. No prueba autorización por recurso, lógica de negocio ni todo flujo entre archivos.</p>
    {sast.catalog.sha256 && <p className="mt-2 break-all font-mono text-[10px] text-muted">SHA-256 del catálogo: {sast.catalog.sha256}</p>}
    <div className="mt-3 divide-y divide-line">{sast.languages.map((language) => <div key={language.language} className="flex flex-wrap justify-between gap-2 py-2 text-xs"><strong className="text-ink">{language.language}</strong><span className="text-muted">{states[language.state] ?? language.state} · {language.filesAnalyzed}/{language.filesCandidate} archivos · {language.filesExcluded} excluidos · {language.rules.length} reglas</span></div>)}</div>
    {sast.skipped.length > 0 && <details className="mt-3 text-[11px] text-muted"><summary className="cursor-pointer">Fuentes omitidas ({sast.skipped.length} registradas)</summary>{sast.skipped.map((file, index) => <p key={`${file.path}:${index}`} className="mt-1 break-all">{file.path}: {file.reason}</p>)}</details>}
  </section>;
}
