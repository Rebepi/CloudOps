import type { HallazgoSeguridad } from '../../types/cloud';
export function FindingPriority({ findings }: { findings: HallazgoSeguridad[] }) {
  const order = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFORMATIONAL'];
  const prioritized = [...findings].filter((finding) => finding.priority?.actionable ?? (finding.severity !== 'INFORMATIONAL' && ['open', 'in_progress'].includes(finding.status)))
    .sort((a, b) => (b.priority?.rank ?? 0) - (a.priority?.rank ?? 0) || order.indexOf(a.severity) - order.indexOf(b.severity)).slice(0, 5);
  if (!prioritized.length) return <p className="text-xs text-muted">No hay remediaciones abiertas en esta evaluación.</p>;
  return <div className="divide-y divide-line">{prioritized.map((finding, index) => <div key={finding.id} className="py-3">
    <div className="flex items-start gap-2"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-rose-500/10 text-[10px] font-black text-rose-600 dark:text-rose-400">{index + 1}</span><div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2"><strong className="text-xs text-ink">{finding.title}</strong><span className="text-[9px] font-bold text-rose-600 dark:text-rose-400">{{ CRITICAL: 'Crítico', HIGH: 'Alto', MEDIUM: 'Medio', LOW: 'Bajo', INFORMATIONAL: 'Informativo' }[finding.severity]}</span></div>
      <p className="mt-1 text-[11px] text-muted">{finding.recommendation}</p>
      {finding.resource && <p className="mt-1 truncate font-mono text-[9px] text-blue-600 dark:text-blue-400">{finding.resource}</p>}
    </div></div>
  </div>)}</div>;
}
