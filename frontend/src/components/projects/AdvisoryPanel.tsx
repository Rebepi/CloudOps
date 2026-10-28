import { useCallback, useEffect, useState } from 'react';
import { BrainCircuit, Download, LoaderCircle } from 'lucide-react';
import { AdvicePlan } from './AdvicePlan';
import { api } from '../../lib/api';
import type { AssessmentAdvice, ComparacionEvaluacion, EvaluacionSeguridad } from '../../types/cloud';

export function AdvisoryPanel({ assessment, comparison, onNavigateToFinding }: { assessment: EvaluacionSeguridad; comparison?: ComparacionEvaluacion | null; onNavigateToFinding?: (id: string) => void }) {
  const [advice, setAdvice] = useState<AssessmentAdvice | null>(null);
  const [configured, setConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const base = `/projects/${assessment.projectId}/security/assessments/${assessment.id}`;
  const load = useCallback(async () => {
    const result = await api<{ data: AssessmentAdvice | null; configured: boolean }>(`${base}/advice`);
    setAdvice(result.data); setConfigured(result.configured);
  }, [base]);
  useEffect(() => { void load().catch((cause) => setError(cause instanceof Error ? cause.message : String(cause))).finally(() => setLoading(false)); }, [load]);
  const generate = async () => {
    setBusy(true); setError('');
    try { await api(`${base}/advice`, { method: 'POST' }); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } finally { setBusy(false); }
  };
  const review = async (state: 'approved' | 'rejected') => {
    if (!advice) return;
    setBusy(true); setError('');
    try { await api(`${base}/advice/${advice.id}`, { method: 'PATCH', body: JSON.stringify({ state, note }) }); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } finally { setBusy(false); }
  };
  const download = async () => {
    setError('');
    try {
      const report = await api(`${base}/report`);
      const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = `cloudops-${assessment.id}-technical.json`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  };
  return <section className="mt-5 border-t border-line pt-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="flex items-center gap-2 text-sm font-bold text-ink"><BrainCircuit size={18} className="text-violet-600 dark:text-violet-400" />Plan de acción basado en evidencia</h2><button onClick={() => void download()} className="inline-flex items-center gap-2 text-xs font-bold text-blue-600 dark:text-blue-400"><Download size={14} />Descargar reporte técnico JSON</button></div>
    <p className="mt-2 text-xs text-muted">Groq utiliza controles, avisos públicos de vulnerabilidad, versiones y tecnologías detectadas con referencias anónimas. No se envían código, rutas, cuentas ni valores secretos. Revisa sus propuestas antes de publicarlas.</p>
    {comparison?.dimensions && <details className="mt-4"><summary className="cursor-pointer text-xs font-bold text-ink">Comparación por dimensión</summary><div className="mt-2 overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr className="text-muted"><th className="py-2">Dimensión</th><th>Puntaje anterior / actual</th><th>Variación</th><th>Cobertura anterior / actual</th></tr></thead><tbody>{comparison.dimensions.map((dimension) => <tr key={dimension.id} className="border-t border-line"><td className="py-2 text-ink">{dimension.label}</td><td className="text-muted">{dimension.previousScore ?? '—'} / {dimension.currentScore ?? '—'}</td><td className="text-blue-600 dark:text-blue-400">{dimension.scoreDelta ?? 'No comparable'}</td><td className="text-muted">{dimension.previousCoverage ?? '—'}% / {dimension.currentCoverage}%</td></tr>)}</tbody></table></div></details>}
    {error && <p role="alert" className="mt-3 text-xs text-rose-600 dark:text-rose-400">{error}</p>}
    {advice && <div className="mt-4 space-y-3 text-xs"><AdvicePlan key={advice.id} advice={advice} onFinding={onNavigateToFinding} />
      {advice.state === 'draft' && !advice.stale && <div className="border-t border-line pt-3"><label className="text-xs text-muted">Justificación de revisión humana<textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Contrasta el texto con la evidencia y documenta tu revisión (mínimo 10 caracteres)." className="mt-2 block w-full rounded-xl border border-line bg-canvas p-3 text-xs text-ink" /></label><div className="mt-3 flex gap-3"><button disabled={busy || note.trim().length < 10} onClick={() => void review('approved')} className="rounded-xl bg-blue-600 px-3 py-2 font-bold text-white disabled:opacity-40">Aprobar para informes</button><button disabled={busy || note.trim().length < 10} onClick={() => void review('rejected')} className="text-rose-600 dark:text-rose-400 disabled:opacity-40">Rechazar borrador</button></div></div>}
      {advice.reviewNote && <p className="text-muted">Revisión: {advice.reviewNote} · {advice.reviewedAt ? new Date(advice.reviewedAt).toLocaleString('es-PE') : ''}</p>}
    </div>}
    {!loading && !error && (!advice || advice.stale || advice.state === 'rejected') && <button disabled={busy || !configured} onClick={() => void generate()} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-40">{busy ? <LoaderCircle size={14} className="animate-spin" /> : <BrainCircuit size={14} />}{configured ? 'Generar plan de corrección y arquitectura' : 'Configura Groq en el backend'}</button>}
    {loading && <p role="status" className="mt-3 text-xs text-muted">Consultando el borrador guardado…</p>}
    {busy && <p role="status" className="mt-2 text-xs text-muted">Procesando solicitud… Los resultados de seguridad se conservan.</p>}
  </section>;
}
