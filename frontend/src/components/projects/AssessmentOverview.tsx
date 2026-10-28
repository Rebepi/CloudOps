import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { EvaluacionSeguridad } from '../../types/cloud';
import { comparableHistory } from '../../lib/assessmentComparison';

const severities = [
  { id: 'CRITICAL', name: 'Críticos', color: '#f43f5e' },
  { id: 'HIGH', name: 'Altos', color: '#f97316' },
  { id: 'MEDIUM', name: 'Medios', color: '#eab308' },
  { id: 'LOW', name: 'Bajos', color: '#38bdf8' },
  { id: 'INFORMATIONAL', name: 'Informativos', color: '#94a3b8' },
];
const tooltipStyle = { background: 'var(--color-card)', border: '1px solid var(--color-line-2)', borderRadius: 10, color: 'var(--color-ink)' };

export function AssessmentOverview({ assessment, history, mode = 'distribution' }: { assessment: EvaluacionSeguridad; history: EvaluacionSeguridad[]; mode?: 'distribution' | 'trend' }) {
  const counts = assessment.summary.counts ?? {};
  const distribution = severities.map((severity) => ({ ...severity, value: counts[severity.id] ?? 0 }));
  const total = distribution.filter((item) => item.id !== 'INFORMATIONAL').reduce((sum, item) => sum + item.value, 0);
  const riskDistribution = distribution.filter((item) => item.id !== 'INFORMATIONAL' && item.value > 0);
  const timeline = comparableHistory(assessment, history).slice(-12).map((item) => ({
      name: new Date(item.completedAt ?? item.startedAt).toLocaleString('es-PE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }), score: item.score,
    }));
  const previous = timeline.length > 1 ? timeline[timeline.length - 2].score : null;
  const delta = previous == null || assessment.score == null ? null : assessment.score - previous;
  return <section aria-label="Resumen ejecutivo de la evaluación">
    {mode === 'distribution' && <><div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="text-sm font-bold text-ink">Estado y prioridades de seguridad</h2><span className="text-xs text-muted">{total} no informativos · {counts.INFORMATIONAL ?? 0} informativos · {assessment.score ?? '—'}/100</span></div>
    <div className="mt-3 grid items-center gap-4 sm:grid-cols-[220px_1fr]">
      <div className="relative h-[210px]" role="img" aria-label="Distribución de hallazgos por severidad">
        {total ? <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={riskDistribution} dataKey="value" nameKey="name" innerRadius={62} outerRadius={90} stroke="var(--color-card)" paddingAngle={2} animationDuration={900} animationEasing="ease-out">{riskDistribution.map((item) => <Cell key={item.id} fill={item.color} />)}</Pie><Tooltip contentStyle={tooltipStyle} labelStyle={{ color: 'var(--color-ink)' }} /></PieChart></ResponsiveContainer> : <div className="flex h-full items-center justify-center text-xs text-muted">Sin hallazgos registrados</div>}
        {total > 0 && <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"><strong className="text-2xl text-ink">{total}</strong><span className="text-[10px] text-muted">no informativos</span></div>}
      </div>
      <dl className="divide-y divide-line">{distribution.map((item) => <div key={item.id} className="flex items-center justify-between py-2 text-xs"><dt className="flex items-center gap-2 text-muted"><span className="h-2 w-2 rounded-full" style={{ background: item.color }} />{item.name}</dt><dd className="font-bold text-ink">{item.value}</dd></div>)}</dl>
    </div>
    </>}
    {mode === 'trend' && <div className="mt-4 border-t border-line pt-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-xs font-bold text-ink">Evolución del puntaje</h3><span className={`text-xs ${delta == null ? 'text-muted' : delta >= 0 ? 'text-blue-400' : 'text-rose-400'}`}>{delta == null ? 'Primera línea base de este alcance' : `${delta > 0 ? '+' : ''}${delta} puntos frente a la evaluación anterior`}</span></div>
      {timeline.length > 1 ? <div className="mt-3 h-[170px]" role="img" aria-label="Evolución del puntaje en evaluaciones comparables"><ResponsiveContainer width="100%" height="100%"><AreaChart data={timeline} margin={{ left: -20, right: 8, top: 10, bottom: 0 }}><CartesianGrid stroke="var(--color-line)" vertical={false} /><XAxis dataKey="name" tick={{ fill: 'var(--color-muted)', fontSize: 9 }} minTickGap={35} /><YAxis domain={[0, 100]} tick={{ fill: 'var(--color-muted)', fontSize: 10 }} /><Tooltip contentStyle={tooltipStyle} labelStyle={{ color: 'var(--color-ink)' }} /><Area type="monotone" dataKey="score" name="Puntaje" stroke="#3b82f6" fill="#3b82f633" strokeWidth={2} animationDuration={900} /></AreaChart></ResponsiveContainer></div> : <p className="mt-3 text-xs text-muted">La tendencia requiere dos evaluaciones con el mismo alcance, motor y metodología. Los históricos incompatibles permanecen disponibles sin deltas numéricos.</p>}
    </div>}
  </section>;
}
