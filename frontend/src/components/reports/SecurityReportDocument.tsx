import type { AssessmentAdvice, ComparacionEvaluacion, EvaluacionSeguridad, HallazgoSeguridad, Proyecto } from '../../types/cloud';
import type { CSSProperties } from 'react';
import { Logo } from '../ui/Logo';
import { detectAwsService } from '../security/findingServiceHelper';
import { assessmentLabel } from '../../lib/assessmentLabels';

const severityOrder: HallazgoSeguridad['severity'][] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFORMATIONAL'];
const severityLabel: Record<HallazgoSeguridad['severity'], string> = {
  CRITICAL: 'Crítico', HIGH: 'Alto', MEDIUM: 'Medio', LOW: 'Bajo', INFORMATIONAL: 'Informativo',
};
const severityPrintStyle: Record<HallazgoSeguridad['severity'], CSSProperties> = {
  CRITICAL: { backgroundColor: '#fee2e2', color: '#991b1b', border: '1px solid #f87171', fontWeight: 700 },
  HIGH: { backgroundColor: '#ffedd5', color: '#9a3412', border: '1px solid #fb923c', fontWeight: 700 },
  MEDIUM: { backgroundColor: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d' },
  LOW: { backgroundColor: '#e0f2fe', color: '#075985', border: '1px solid #7dd3fc' },
  INFORMATIONAL: { backgroundColor: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1' },
};
const lifecycleLabel: Record<string, string> = {
  open: 'Abierto', in_progress: 'En tratamiento', resolved: 'Corregido', false_positive: 'Falso positivo', risk_accepted: 'Riesgo aceptado',
};

export function SecurityReportDocument({ proyecto, evaluacion, comparacion, advice }: {
  proyecto: Proyecto; evaluacion: EvaluacionSeguridad; comparacion: ComparacionEvaluacion | null; advice?: AssessmentAdvice | null;
}) {
  const fecha = new Date().toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' });
  const findings = evaluacion.findings ?? [];
  const accepted = findings.filter((f) => f.status === 'risk_accepted');
  const falsePositives = findings.filter((f) => f.status === 'false_positive');
  const prioritised = [...findings].filter((finding) => finding.severity !== 'INFORMATIONAL' && finding.category !== 'coverage' && finding.evidence?.scoreExcluded !== true)
    .sort((a, b) => (b.priority?.rank ?? 0) - (a.priority?.rank ?? 0) || severityOrder.indexOf(a.severity) - severityOrder.indexOf(b.severity));
  const counts = evaluacion.summary?.counts ?? {};
  const titulo = 'text-xs font-bold text-slate-900 uppercase tracking-wide border-b border-slate-200 pb-1 mb-2';
  const seccion = 'mb-5 print-avoid-break';
  const cell = 'border border-slate-200 px-2 py-1 align-top text-slate-800 text-[9px]';

  return <div id="security-report-document" className="bg-white text-slate-900 font-sans max-w-4xl mx-auto">
    <div className="border-b-2 border-blue-600 pb-4 mb-6 print-avoid-break">
      <div className="flex items-center justify-between gap-4 mb-3">
        <div className="flex items-center gap-3">
          <Logo size={36} animado={false} conPing={false} />
          <div>
            <p className="text-lg font-black tracking-tight text-slate-900">Cloud<span className="text-blue-600">Ops</span></p>
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Informe ejecutivo · {assessmentLabel(evaluacion, proyecto)}</p>
          </div>
        </div>
        <div className="text-right">
          <span className="inline-block text-[10px] font-bold rounded-full border border-blue-200 bg-blue-50 text-blue-700 px-3 py-1">{proyecto.environment}</span>
          <p className="text-[10px] text-slate-400 mt-1">Ref: {proyecto.id.slice(0, 8)}</p>
        </div>
      </div>
      <h1 className="text-xl font-black text-slate-900">Evaluación de seguridad — {proyecto.name}</h1>
      <p className="mt-1 text-xs text-slate-600">Cliente: <strong className="text-slate-800">{proyecto.clientName || 'Uso interno'}</strong> · Región: <span className="font-mono text-slate-700">{evaluacion.region}</span> · Emitido: {fecha}</p>
    </div>

    <section className={seccion}>
      <h2 className={titulo}>1. Alcance y limitaciones</h2>
      <p className="mt-1 text-[11px] leading-relaxed text-slate-700">
        Tipo de análisis: <strong>{assessmentLabel(evaluacion, proyecto)}</strong>.
        Cobertura observada: <strong>{evaluacion.coverage}%</strong> con confianza <strong>{evaluacion.confidence}</strong>. Metodología: {evaluacion.summary?.methodology ?? 'Controles CloudOps, CIS AWS Foundations Benchmark, AWS FSBP'}.
        Este informe es una evaluación técnica priorizada de postura de seguridad; no constituye una certificación formal ni sustituye un pentest manual.
      </p>
      <p className="mt-1 text-[10px] text-slate-500">Motor: {evaluacion.engineVersion ?? 'Histórico sin versión'} · Metodología: {evaluacion.methodologyVersion ?? 'No registrada'}. {findings.filter((finding) => finding.severity === 'INFORMATIONAL').length} informativos conservados en el reporte técnico, fuera de la tabla ejecutiva.</p>
    </section>

    <section className={seccion}>
      <h2 className={titulo}>2. Resumen ejecutivo de seguridad</h2>
      <div className="security-report-summary-grid mt-2 grid grid-cols-4 gap-3 text-[11px]">
        <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-2.5">
          <span className="block text-[10px] font-semibold text-slate-500 uppercase">Puntaje global</span>
          <strong className="text-lg text-slate-900">{evaluacion.score ?? '—'}/100</strong>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-2.5">
          <span className="block text-[10px] font-semibold text-slate-500 uppercase">Cobertura</span>
          <strong className="text-lg text-slate-900">{evaluacion.coverage}%</strong>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-2.5">
          <span className="block text-[10px] font-semibold text-slate-500 uppercase">Hallazgos no informativos</span>
          <strong className="text-lg text-slate-900">{findings.filter((finding) => finding.severity !== 'INFORMATIONAL').length}</strong>
        </div>
        <div className="rounded-lg border border-rose-200 bg-rose-50/50 p-2.5">
          <span className="block text-[10px] font-semibold text-rose-700 uppercase">Críticos + Altos</span>
          <strong className="text-lg text-rose-700">{(counts.CRITICAL ?? 0) + (counts.HIGH ?? 0)}</strong>
        </div>
      </div>
    </section>

    {comparacion && <section className={seccion}>
      <h2 className={titulo}>3. Comparación con la evaluación anterior</h2>
      {comparacion.previous && comparacion.summary.comparable ? <div className="text-[11px] text-slate-700 leading-relaxed bg-slate-50 rounded-lg p-2.5 border border-slate-200">
        <p><strong>Nuevos detectados:</strong> {comparacion.summary.newCount} · <strong>Corregidos:</strong> {comparacion.summary.resolvedCount} · <strong>Recurrentes:</strong> {comparacion.summary.recurringCount} · <strong>Cambios de severidad:</strong> {comparacion.summary.severityChangedCount}</p>
        <p className="mt-1 text-slate-500">{comparacion.summary.comparable ? `Variación de puntaje: ${comparacion.summary.scoreDelta ?? '—'} pts · Variación de cobertura: ${comparacion.summary.coverageDelta ?? '—'}%` : 'Puntaje y cobertura no comparables: cambió el motor o la metodología.'}</p>
      </div> : <p className="mt-1 text-[11px] text-slate-600 italic">No hay una evaluación anterior comparable; esta ejecución establece la línea base.</p>}
    </section>}

    {!!evaluacion.dimensionScores?.length && <section className="mb-5"><h2 className={titulo}>Dimensiones y límites medidos</h2><table className="w-full table-fixed border-collapse"><thead><tr><th className={cell}>Dimensión</th><th className={cell}>Puntaje</th><th className={cell}>Cobertura</th><th className={cell}>Estado</th></tr></thead><tbody>{evaluacion.dimensionScores.map((dimension) => <tr key={dimension.id}><td className={cell}>{dimension.label}</td><td className={cell}>{dimension.score ?? 'No medido'}</td><td className={cell}>{dimension.coverage}%</td><td className={cell}>{dimension.state}</td></tr>)}</tbody></table></section>}
    {advice?.state === 'approved' && !advice.stale && <section className={seccion}><h2 className={titulo}>Explicación asistida por IA · revisada por una persona</h2><p className="text-[11px] leading-relaxed text-slate-700">{advice.content.summary}</p><p className="mt-2 text-[9px] text-slate-500">{advice.provider} · {advice.model} · Revisión: {advice.reviewedAt ? new Date(advice.reviewedAt).toLocaleString('es-PE') : 'Registrada'}. El texto no determina puntajes, severidades ni estados.</p></section>}

    <section className="mb-4" style={{ breakInside: 'auto', pageBreakInside: 'auto' }}>
      <div className="flex items-center justify-between mb-1.5 pb-1 border-b border-slate-200">
        <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
          {comparacion ? '4' : '3'}. Hallazgos priorizados por servicio y severidad
        </h2>
        <span className="text-[10px] text-slate-500">Primeros {Math.min(25, prioritised.length)} de {prioritised.length} · detalle completo en JSON técnico</span>
      </div>
      <table className="w-full border-collapse" style={{ breakInside: 'auto', pageBreakInside: 'auto' }}>
        <thead style={{ display: 'table-header-group' }}>
          <tr className="bg-slate-100 text-left font-bold text-slate-700" style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}>
            <th className={`${cell} w-16`}>Severidad</th>
            <th className={`${cell} w-24`}>Servicio</th>
            <th className={cell}>Título y Remediación sugerida</th>
            <th className={`${cell} w-28`}>Fuente / Marco</th>
            <th className={`${cell} w-20`}>Estado</th>
          </tr>
        </thead>
        <tbody style={{ breakInside: 'auto', pageBreakInside: 'auto' }}>
          {prioritised.slice(0, 25).map((f) => {
            const svc = detectAwsService(f);
            return (
              <tr key={f.id} className="hover:bg-slate-50/50" style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}>
                <td className={cell}>
                  <span
                    style={{ display: 'inline-block', padding: '1px 5px', borderRadius: '4px', fontSize: '8.5px', ...severityPrintStyle[f.severity] }}
                  >
                    {severityLabel[f.severity]}
                  </span>
                </td>
                <td className={cell}>
                  <span className="font-semibold text-slate-900">{svc.shortName}</span>
                </td>
                <td className={cell}>
                  <strong className="block text-slate-900 leading-tight">{f.title}</strong>
                  <span className="block mt-0.5 text-slate-600 text-[8.5px] leading-tight">{f.recommendation}</span>
                  {f.resource && <code className="mt-0.5 block text-[8px] text-slate-500 font-mono break-all leading-tight">{f.resource}</code>}
                </td>
                <td className={cell}>
                  <span className="block font-medium text-[8.5px]">{f.source}</span>
                  {f.framework && <span className="block text-[8px] text-slate-500 leading-tight">{f.framework}</span>}
                </td>
                <td className={cell}>
                  <span className="font-medium text-slate-700 text-[8.5px]">{lifecycleLabel[f.status] ?? f.status}</span>
                  {f.owner && <span className="block text-[8px] text-slate-500 leading-tight">Resp: {f.owner}</span>}
                </td>
              </tr>
            );
          })}
          {!prioritised.length && <tr><td className={cell} colSpan={5}>Sin hallazgos registrados en los controles observados.</td></tr>}
        </tbody>
      </table>
    </section>

    <section className={seccion}>
      <h2 className={titulo}>{comparacion ? '5' : '4'}. Riesgos aceptados y falsos positivos</h2>
      <div className="mt-1 text-[11px] text-slate-700 space-y-1">
        <p><strong>Riesgos aceptados ({accepted.length}):</strong> {accepted.length ? accepted.map((f) => f.title).join('; ') : 'Ninguno registrado.'}</p>
        <p><strong>Falsos positivos ({falsePositives.length}):</strong> {falsePositives.length ? falsePositives.map((f) => f.title).join('; ') : 'Ninguno registrado.'}</p>
      </div>
    </section>

    <footer className="mt-8 border-t border-slate-200 pt-3 text-[9px] text-slate-500 flex justify-between items-center print-avoid-break">
      <span>CloudOps Enterprise Security Assessment · Documento confidencial generado automáticamente</span>
      <span>{fecha}</span>
    </footer>
  </div>;
}

