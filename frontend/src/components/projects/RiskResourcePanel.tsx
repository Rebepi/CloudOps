import { useState } from 'react';
import type { EvaluacionSeguridad } from '../../types/cloud';

export function RiskResourcePanel({ assessment, onSelect }: { assessment: EvaluacionSeguridad; onSelect?: (resource: string) => void }) {
  const [query, setQuery] = useState('');
  const [showContext, setShowContext] = useState(false);
  const [page, setPage] = useState(0);
  const overview = assessment.riskOverview;
  if (!overview) return null;
  const groups = overview.groups.filter((group) => (showContext || group.actionable > 0) && `${group.resource} ${group.service} ${group.region}`.toLowerCase().includes(query.toLowerCase()));
  const pages = Math.max(1, Math.ceil(groups.length / 12));
  const current = Math.min(page, pages - 1);
  return <section className="border-b border-line pb-5" aria-label="Priorización por recurso">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-sm font-bold text-ink">Prioridades por recurso</h2><p className="mt-1 text-xs text-muted"><strong className="text-rose-400">{overview.actionable} pendientes puntuables</strong> · {overview.informational} informativos · {overview.excluded} evidencias excluidas · {overview.total} total</p></div><input aria-label="Buscar servicio o recurso" placeholder="Buscar recurso, servicio o región…" value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} className="rounded-xl border border-line bg-canvas px-3 py-2 text-xs text-ink" /></div>
    <label className="mt-3 flex items-center gap-2 text-xs text-muted"><input type="checkbox" checked={showContext} onChange={(event) => { setShowContext(event.target.checked); setPage(0); }} />Incluir recursos sin pendientes puntuables</label>
    <div className="mt-3 max-h-80 overflow-auto divide-y divide-line">{groups.slice(current * 12, current * 12 + 12).map((group) => <button key={JSON.stringify([group.service, group.region, group.resource])} type="button" onClick={() => onSelect?.(group.resource)} className="flex w-full items-start justify-between gap-3 py-3 text-left cursor-pointer hover:bg-blue-500/5"><div className="min-w-0"><strong className="block break-all text-xs text-ink">{group.resource}</strong><p className="mt-1 text-[10px] text-muted">{group.service} · {group.region} · {group.sources.join(', ')}</p></div><div className="shrink-0 text-right text-xs"><span className="font-bold text-rose-400">{group.actionable} pendientes</span><p className="mt-1 text-[10px] text-muted">{group.informational} informativos</p></div></button>)}</div>
    {!groups.length && <p className="mt-3 text-xs text-muted">No hay recursos que coincidan con este filtro.</p>}
    <div className="mt-3 flex items-center justify-between text-[11px] text-muted"><span>Prioridad determinista por severidad y señales observadas. No cambia la severidad ni el puntaje.</span><span className="flex items-center gap-2"><button disabled={!current} onClick={() => setPage(current - 1)}>Anterior</button>{current + 1}/{pages}<button disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>Siguiente</button></span></div>
  </section>;
}
