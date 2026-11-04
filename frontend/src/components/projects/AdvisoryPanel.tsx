import { ProjectHelp } from './ProjectHelp';
import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, BrainCircuit, CheckCircle2, Cloud, Download, ListChecks, LoaderCircle, Radar, RefreshCw, ShieldCheck } from 'lucide-react';
import { AWSArchitectureOptions } from './ArchitectureWorkspace';
import { AdvicePlan } from './AdvicePlan';
import { api } from '../../lib/api';
import type { AssessmentAdvice, ComparacionEvaluacion, EvaluacionSeguridad } from '../../types/cloud';
import './diagnostic.css';
import './improvement.css';

type Context = { selectedFindings: number; actionableFindings: number; omittedActionableFindings: number; totalObservations: number };
export function AdvisoryPanel({ assessment, comparison, onNavigateToFinding, showExport = true }: { showExport?: boolean; assessment: EvaluacionSeguridad; comparison?: ComparacionEvaluacion | null; onNavigateToFinding?: (id: string) => void }) {
  const [advice, setAdvice] = useState<AssessmentAdvice | null>(null);
  const [context, setContext] = useState<Context | null>(null);
  const [configured, setConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'' | 'generate' | 'review'>('');
  const [error, setError] = useState('');
  const [loadFailed, setLoadFailed] = useState(false);
  const [note, setNote] = useState('');
  const base = `/projects/${assessment.projectId}/security/assessments/${assessment.id}`;
  const load = useCallback(async () => {
    const result = await api<{ data: AssessmentAdvice | null; configured: boolean; context?: Context }>(`${base}/advice`);
    setAdvice(result.data); setConfigured(result.configured); setContext(result.context ?? null); setLoadFailed(false);
  }, [base]);
  const reload = async () => { setLoading(true); setError(''); try { await load(); } catch (cause) { setLoadFailed(true); setError(cause instanceof Error ? cause.message : String(cause)); } finally { setLoading(false); } };
  useEffect(() => { void load().catch((cause) => { setLoadFailed(true); setError(cause instanceof Error ? cause.message : String(cause)); }).finally(() => setLoading(false)); }, [load]);
  const generate = async () => {
    setBusy('generate'); setError('');
    try { await api(`${base}/advice`, { method: 'POST' }); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } finally { setBusy(''); }
  };
  const review = async (state: 'approved' | 'rejected') => {
    if (!advice || note.trim().length < 10) return;
    setBusy('review'); setError('');
    try { await api(`${base}/advice/${advice.id}`, { method: 'PATCH', body: JSON.stringify({ state, note }) }); await load(); setNote(''); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } finally { setBusy(''); }
  };
  const download = async () => {
    setError('');
    try { const report = await api(`${base}/report`); const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `cloudops-${assessment.id}-technical.json`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  };
  const current = advice && !advice.stale && advice.state !== 'rejected';
  const canGenerate = !loading && !loadFailed && !current;
  const uniqueRefs = current ? new Set(advice.content.priorities.flatMap((item) => item.findingRefs.map((ref) => advice.content.references?.[ref]).filter(Boolean))).size : 0;
  return <section className="improvement-workspace" aria-label="Plan de mejora">
    <header className="improvement-heading"><div><span className="improvement-heading-icon"><BrainCircuit size={22} aria-hidden="true" /></span><div><h2>Plan de mejora<ProjectHelp topic="plan" /></h2><p>De la evidencia a un orden de trabajo, con pasos y criterios para comprobar cada cambio.</p></div></div><div className="improvement-heading-actions">{current && <span className="plan-state" data-state={advice.state}>{advice.state === 'approved' ? <ShieldCheck size={15} aria-hidden="true" /> : <ListChecks size={15} aria-hidden="true" />}{advice.state === 'approved' ? 'Aprobado para informes' : 'Borrador para revisión'}</span>}{canGenerate && <button type="button" onClick={() => void generate()} disabled={!!busy || !configured} className="diagnostic-primary">{busy === 'generate' ? <LoaderCircle size={16} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <BrainCircuit size={16} aria-hidden="true" />}{advice ? 'Actualizar plan con IA' : 'Generar plan con IA'}</button>}</div></header>
    {loading && <p role="status" className="plan-loading"><LoaderCircle size={17} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />Consultando el plan de esta evaluación…</p>}
    {context && <div className="plan-context-strip"><ProjectHelp topic="sample" label="Alcance de la IA" /><span><strong>{context.selectedFindings}</strong> hallazgos seleccionados para la IA</span><span><strong>{context.actionableFindings}</strong> pendientes en la evaluación</span>{context.omittedActionableFindings > 0 && <span className="plan-context-gap"><strong>{context.omittedActionableFindings}</strong> fuera del contexto</span>}{current && <span><strong>{uniqueRefs}</strong> vinculados a correcciones propuestas</span>}</div>}
    {busy && <p role="status" className="plan-processing"><LoaderCircle size={18} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />{busy === 'generate' ? 'Generando acciones, secuencia y criterios con la evidencia seleccionada…' : 'Registrando la revisión humana…'} No se ejecutan cambios en el proyecto.</p>}
    {error && <div role="alert" className="plan-api-error"><p>{error}</p>{loadFailed && <button type="button" className="plan-text-button" onClick={() => void reload()}><RefreshCw size={14} aria-hidden="true" />Reintentar consulta</button>}</div>}
    {!loading && !loadFailed && !configured && <p className="plan-muted">El servicio de IA no está disponible en este entorno. El diagnóstico y los hallazgos se conservan.</p>}
    {!loading && !loadFailed && !current && <div className="plan-start"><div><span className="plan-start-symbol"><BrainCircuit size={32} aria-hidden="true" /></span><h3>{advice?.stale ? 'La evidencia o el método cambiaron' : advice?.state === 'rejected' ? 'El borrador anterior fue rechazado' : 'Convierte el diagnóstico en un plan de trabajo'}</h3><p>{advice?.stale ? 'El plan anterior se conserva como histórico y queda fuera de los informes vigentes. Genera una propuesta con el contexto actual.' : 'La IA organiza los problemas observados en acciones concretas, identifica condiciones previas y explica cómo comprobar el resultado.'}</p></div><ul><li><ListChecks size={19} aria-hidden="true" /><div><strong>Correcciones con pasos</strong><span>Qué atender, quién podría hacerlo y qué evidencia esperar.</span></div></li><li><Cloud size={19} aria-hidden="true" /><div><strong>Decisiones de arquitectura</strong><span>Alternativas AWS, contrapartidas y cuándo conservar lo existente.</span></div></li><li><Radar size={19} aria-hidden="true" /><div><strong>Completar las pruebas</strong><span>Qué falta por verificar y qué resultado permitiría avanzar.</span></div></li></ul></div>}
    {context && context.omittedActionableFindings > 0 && <p className="plan-sampling-note">El asesor recibe una muestra priorizada y diversa de hasta 40 hallazgos. El plan no cubre automáticamente todos los riesgos; el listado completo permanece en Riesgos.</p>}
    {current && <><AdvicePlan key={advice.id} advice={advice} assessment={assessment} onFinding={onNavigateToFinding} />
      {advice.state === 'draft' && <details className="plan-review"><summary><CheckCircle2 size={17} aria-hidden="true" />Revisar la propuesta antes de incluirla en informes<ArrowRight size={15} aria-hidden="true" /></summary><p>Contrasta las acciones, su orden y las alternativas con la evidencia. La aprobación registra una revisión humana; no acredita implementación ni seguridad.</p><label>Justificación de revisión humana<textarea value={note} maxLength={2000} onChange={(event) => setNote(event.target.value)} placeholder="Documenta lo que contrastaste y los límites de tu revisión (mínimo 10 caracteres)." /></label><div><button type="button" disabled={!!busy || note.trim().length < 10} onClick={() => void review('approved')} className="diagnostic-primary">Aprobar para informes</button><button type="button" disabled={!!busy || note.trim().length < 10} onClick={() => void review('rejected')} className="diagnostic-secondary">Rechazar borrador</button></div></details>}
      {advice.reviewNote && <p className="plan-review-note">Revisión registrada: {advice.reviewNote}{advice.reviewedAt ? ` · ${new Date(advice.reviewedAt).toLocaleString('es-PE')}` : ''}</p>}
    </>}
    {!loading && !loadFailed && (!current || !advice.content.architecture?.length) && <details className="plan-catalog"><summary><Cloud size={16} aria-hidden="true" />Explorar alternativas del catálogo tecnológico</summary><p className="plan-muted">Estas opciones parten de detecciones del proyecto; no son un plan generado por IA ni una confirmación de migración.</p><AWSArchitectureOptions assessment={assessment} /></details>}
    <div className="plan-privacy"><ProjectHelp topic="privacy" label="Cómo se construye el plan y qué datos recibe la IA" />{advice && <p>Modelo: {advice.model} · Contexto: {advice.promptVersion} · Generado: {new Date(advice.createdAt).toLocaleString('es-PE')}</p>}{showExport && <button type="button" onClick={() => void download()} className="plan-text-button"><Download size={14} aria-hidden="true" />Descargar reporte técnico JSON</button>}{comparison?.dimensions && <p>La comparación de dimensiones se consulta en el historial de evaluaciones; solo tiene sentido entre métodos compatibles.</p>}</div>
  </section>;
}
