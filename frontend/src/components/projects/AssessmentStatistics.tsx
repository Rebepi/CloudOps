import { BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import type { EvaluacionSeguridad } from '../../types/cloud';
import { isRepositoryFinding } from '../security/findingLayerHelper';

const series = [
  { key: 'CRITICAL', label: 'Críticos', color: '#f43f5e' },
  { key: 'HIGH', label: 'Altos', color: '#f97316' },
  { key: 'MEDIUM', label: 'Medios', color: '#eab308' },
  { key: 'LOW', label: 'Bajos', color: '#38bdf8' },
  { key: 'INFORMATIONAL', label: 'Informativos', color: '#94a3b8' },
];

export function AssessmentStatistics({ assessment }: { assessment: EvaluacionSeguridad }) {
  const layers = assessment.summary.layerBreakdown ?? [];
  const rows = layers.filter((layer) => layer.candidateFiles || layer.findings).map((layer) => ({ name: layer.label, ...layer.counts }));
  if (assessment.assessmentType === 'full' && rows.length) {
    const awsCounts = (assessment.findings ?? []).filter((finding) => !isRepositoryFinding(finding)).reduce<Record<string, number>>((counts, finding) => {
      counts[finding.severity] = (counts[finding.severity] ?? 0) + 1;
      return counts;
    }, {});
    rows.push({ name: 'Cuenta AWS', ...awsCounts });
  }
  const chartData = rows.length ? rows : [{ name: 'Evaluación', ...assessment.summary.counts }];
  return <section aria-label="Estadísticas de riesgo y cobertura">
    <div className="flex flex-wrap items-baseline justify-between gap-3"><h2 className="text-sm font-bold text-ink">{assessment.assessmentType === 'aws-account' ? 'Distribución de riesgo AWS' : 'Riesgo y cobertura por capa'}</h2><p className="text-xs text-muted">{assessment.assessmentType === 'aws-account' ? `${assessment.summary.observedControls ?? '—'} / ${assessment.summary.totalControls ?? '—'} controles observados` : `${assessment.summary.filesAnalyzed ?? '—'} archivos leídos · ${assessment.summary.dependencyCount ?? '—'} dependencias`} · cobertura {assessment.coverage}%</p></div>
    <p className="mt-2 text-xs text-muted">Las barras muestran hallazgos por severidad. La lectura indica cuánto se inspeccionó; una lectura completa puede contener riesgos altos.</p>
    <div className="mt-4 h-[290px] w-full min-w-0" role="img" aria-label="Gráfico de hallazgos por capa, desglosados por severidad">
      <ResponsiveContainer width="100%" height="100%"><BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 16, left: 0, bottom: 5 }}>
        <CartesianGrid stroke="var(--color-line)" horizontal={false} /><XAxis type="number" allowDecimals={false} tick={{ fill: 'var(--color-muted)', fontSize: 11 }} /><YAxis type="category" dataKey="name" width={140} tick={{ fill: 'var(--color-muted)', fontSize: 11 }} /><Tooltip cursor={{ fill: 'var(--color-brand)', fillOpacity: 0.07 }} contentStyle={{ background: 'var(--color-card)', border: '1px solid var(--color-line-2)', borderRadius: 10, color: 'var(--color-ink)' }} labelStyle={{ color: 'var(--color-ink)' }} /><Legend wrapperStyle={{ fontSize: 11 }} />
        {series.map((item, index) => <Bar key={item.key} dataKey={item.key} name={item.label} fill={item.color} stackId="risk" isAnimationActive animationBegin={index * 70} animationDuration={700} animationEasing="ease-out" />)}
      </BarChart></ResponsiveContainer>
    </div>
    {layers.length > 0 && <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-xs"><thead className="border-b border-line text-muted"><tr><th className="py-2 font-medium">Capa</th><th>Lectura</th><th>Archivos</th><th>Hallazgos</th><th>Críticos / altos</th></tr></thead><tbody>{layers.filter((layer) => layer.candidateFiles || layer.findings).map((layer) => <tr key={layer.id} className="border-b border-line/50"><th className="py-3 font-semibold text-ink">{layer.label}</th><td className="text-blue-400">{layer.candidateFiles ? `${layer.readCoverage}%` : 'No medido'}</td><td className="text-muted">{layer.analyzedFiles} / {layer.candidateFiles}</td><td className="text-ink">{layer.findings}</td><td className={(layer.counts.CRITICAL || layer.counts.HIGH) ? 'font-bold text-rose-400' : 'text-muted'}>{layer.counts.CRITICAL ?? 0} / {layer.counts.HIGH ?? 0}</td></tr>)}</tbody></table></div>}
  </section>;
}
