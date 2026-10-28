import { useState } from 'react';
import { History, LayoutDashboard } from 'lucide-react';
import type { ComparacionEvaluacion, EvaluacionSeguridad, HallazgoSeguridad } from '../../types/cloud';
import { Card } from '../ui/Card';
import { AssessmentOverview } from './AssessmentOverview';
import { FindingPriority } from './FindingPriority';
import { AdvisoryPanel } from './AdvisoryPanel';
import { AssessmentComparisonPanel } from './AssessmentComparisonPanel';

export function OverviewWorkspace({ assessment, findings, history, comparison, onNavigateToFinding, onSelectAssessment }: {
  assessment: EvaluacionSeguridad; findings: HallazgoSeguridad[]; history: EvaluacionSeguridad[]; comparison: ComparacionEvaluacion | null;
  onNavigateToFinding: (id: string) => void; onSelectAssessment: (id: string) => void;
}) {
  const [view, setView] = useState<'summary' | 'evolution'>('summary');
  return <div className="space-y-4">
    <div className="flex flex-wrap gap-2" aria-label="Vistas del resumen">
      {[{ id: 'summary', label: 'Resumen', icon: LayoutDashboard }, { id: 'evolution', label: 'Evolución e informes', icon: History }].map(({ id, label, icon: Icon }) => <button key={id} type="button" aria-pressed={view === id} onClick={() => setView(id as typeof view)} className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-blue-500 ${view === id ? 'border-blue-500/40 bg-blue-500/10 text-blue-600 dark:text-blue-400' : 'border-line text-muted hover:text-ink'}`}><Icon size={14} />{label}</button>)}
    </div>
    {view === 'summary' ? <Card>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <AssessmentOverview assessment={assessment} history={history} />
        <section className="border-t border-line pt-4 xl:border-l xl:border-t-0 xl:pl-5 xl:pt-0"><h2 className="mb-2 text-sm font-bold text-ink">Qué atender primero</h2><FindingPriority findings={findings} /></section>
      </div>
      <details className="mt-4 border-t border-line pt-4 text-xs"><summary className="cursor-pointer font-bold text-blue-600 dark:text-blue-400">Cómo interpretar el puntaje y la cobertura</summary>
        <div className="mt-3 space-y-3 leading-relaxed text-muted"><p><strong className="text-ink">Puntaje {assessment.score ?? '—'}/100.</strong> Resume la penalización de hallazgos puntuables dentro de este alcance. Los informativos no penalizan. Un 0 indica que se alcanzó el mínimo de la fórmula; no implica que todas las partes del sistema sean vulnerables.</p>
          <p><strong className="text-ink">Cobertura {assessment.coverage}%.</strong> Mide comprobaciones realizadas, completas o parciales. No es el porcentaje de archivos leídos ni una probabilidad de seguridad. El detalle de cada fuente está en Cobertura.</p>
          <p><strong className="text-ink">Lectura de archivos.</strong> Indica archivos compatibles leídos frente a candidatos; leer el 100% no demuestra ausencia de fallos.</p>
          <p>Motor {assessment.engineVersion ?? 'sin registrar'} · metodología {assessment.methodologyVersion ?? 'sin registrar'}. Las dimensiones sin medición suficiente conservan un puntaje vacío.</p>
        </div>
      </details>
    </Card> : <>
      <Card><label className="block text-xs font-semibold text-ink">Evaluación mostrada<select value={assessment.id} onChange={(event) => onSelectAssessment(event.target.value)} className="mt-2 block w-full rounded-xl border border-line bg-canvas px-3 py-2 text-xs text-ink">{history.map((item) => <option key={item.id} value={item.id}>{new Date(item.startedAt).toLocaleString('es-PE')} · {item.assessmentType === 'aws-account' ? 'AWS' : item.assessmentType === 'full' ? 'Integral' : 'Código'} · {item.score ?? '—'}/100</option>)}</select></label><AssessmentOverview assessment={assessment} history={history} mode="trend" /></Card>
      <AssessmentComparisonPanel comparison={comparison} onNavigateToFinding={onNavigateToFinding} />
      <Card><AdvisoryPanel key={assessment.id} assessment={assessment} comparison={comparison} onNavigateToFinding={onNavigateToFinding} /></Card>
    </>}
  </div>;
}
