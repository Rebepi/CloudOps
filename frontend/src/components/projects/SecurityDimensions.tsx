import { CircleHelp, ShieldAlert, ShieldCheck } from 'lucide-react';
import type { AnalizadorEvaluacion, ControlDimensionSeguridad, DimensionSeguridad } from '../../types/cloud';

const dimensionStateLabel: Record<DimensionSeguridad['state'], string> = {
  measured: 'Medido',
  partial: 'Parcial',
  not_measured: 'Sin medir',
};

const controlStateLabel: Record<ControlDimensionSeguridad['state'], string> = {
  pass: 'Aprobado',
  fail: 'Con hallazgos',
  partial: 'Parcial',
  not_applicable: 'No aplica',
  not_supported: 'No soportado',
  failed: 'Fallido',
  skipped: 'Omitido',
};

const controlStateClass: Record<ControlDimensionSeguridad['state'], string> = {
  pass: 'text-emerald-400',
  fail: 'text-rose-400',
  partial: 'text-amber-400',
  not_applicable: 'text-muted',
  not_supported: 'text-muted',
  failed: 'text-rose-400',
  skipped: 'text-amber-400',
};

function scoreClass(score: number | null) {
  if (score === null) return 'text-muted';
  if (score < 50) return 'text-rose-400';
  if (score < 80) return 'text-amber-400';
  return 'text-emerald-400';
}

export function SecurityDimensions({ dimensions = [], analyzers = [] }: { dimensions?: DimensionSeguridad[]; analyzers?: AnalizadorEvaluacion[] }) {
  if (!dimensions.length) {
    return <section className="mt-6 border-t border-line pt-5">
      <div className="flex items-center gap-2"><CircleHelp size={16} className="text-muted" /><h3 className="text-sm font-bold text-ink">Dimensiones de seguridad</h3></div>
      <p className="mt-2 text-xs text-muted">Esta ejecución es anterior al modelo de dimensiones. Vuelve a evaluar para obtener el desglose por dominio y el estado de cada control.</p>
    </section>;
  }

  return <section className="mt-6 border-t border-line pt-5">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h3 className="text-sm font-bold text-ink">Dimensiones de seguridad</h3>
        <p className="mt-1 text-xs text-muted">Cada dimensión muestra su puntaje solo cuando tiene controles medidos. Un control no medido no equivale a aprobado.</p>
      </div>
      <span className="text-[11px] text-muted">{dimensions.filter((dimension) => dimension.state === 'measured').length} de {dimensions.length} dimensiones medidas</span>
    </div>

    <div className="mt-4 grid gap-3 md:grid-cols-2">
      {dimensions.map((dimension) => <article key={dimension.id} className="rounded-2xl border border-line bg-canvas/50 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {dimension.state === 'measured' ? <ShieldCheck size={15} className="text-emerald-400" /> : dimension.state === 'partial' ? <ShieldAlert size={15} className="text-amber-400" /> : <CircleHelp size={15} className="text-muted" />}
              <h4 className="text-xs font-bold text-ink">{dimension.label}</h4>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-muted">{dimension.description}</p>
          </div>
          <div className="shrink-0 text-right">
            <strong className={`block text-lg font-black ${scoreClass(dimension.score)}`}>{dimension.score === null ? '—' : dimension.score}</strong>
            <span className="text-[10px] text-muted">{dimensionStateLabel[dimension.state]}</span>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-blue-500" style={{ width: `${dimension.coverage}%` }} /></div>
          <span className="text-[10px] font-bold text-blue-400">{dimension.coverage}%</span>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5 text-[10px]">
          {Object.entries(dimension.counts).filter(([, count]) => count > 0).map(([severity, count]) => <span key={severity} className="rounded-full border border-line px-2 py-0.5 text-muted">{severity} {count}</span>)}
          {dimension.scoreExcludedFindings > 0 && <span className="rounded-full border border-line px-2 py-0.5 text-muted">{dimension.scoreExcludedFindings} excluidos del puntaje</span>}
        </div>

        <details className="mt-3 border-t border-line pt-2">
          <summary className="cursor-pointer text-[11px] font-semibold text-muted">{dimension.controls.length} control(es)</summary>
          <div className="mt-2 divide-y divide-line">
            {dimension.controls.map((control) => <div key={control.id} className="py-2">
              <div className="flex items-start justify-between gap-2">
                <strong className="text-[11px] text-ink">{control.label}</strong>
                <span className={`shrink-0 text-[10px] font-bold ${controlStateClass[control.state]}`}>{controlStateLabel[control.state]}</span>
              </div>
              <p className="mt-1 text-[10px] leading-relaxed text-muted">{control.detail}</p>
            </div>)}
          </div>
        </details>
      </article>)}
    </div>

    {analyzers.length > 0 && <details className="mt-4 rounded-2xl border border-line bg-canvas/40 p-4">
      <summary className="cursor-pointer text-xs font-bold text-ink">Analizadores ejecutados ({analyzers.length})</summary>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[520px] text-left text-[11px]">
          <thead className="text-muted"><tr><th className="pb-2 font-semibold">Analizador</th><th className="pb-2 font-semibold">Dimensión</th><th className="pb-2 font-semibold">Estado</th><th className="pb-2 text-right font-semibold">Elementos</th><th className="pb-2 text-right font-semibold">Hallazgos</th></tr></thead>
          <tbody className="divide-y divide-line">{analyzers.map((analyzer) => <tr key={analyzer.analyzerId}>
            <td className="py-2 font-mono text-[10px] text-ink">{analyzer.analyzerId}</td>
            <td className="py-2 text-muted">{analyzer.dimension}</td>
            <td className={`py-2 ${analyzer.state === 'failed' ? 'text-rose-400' : analyzer.state === 'completed' ? 'text-emerald-400' : 'text-amber-400'}`}>{analyzer.state}</td>
            <td className="py-2 text-right text-muted">{analyzer.itemsAnalyzed}</td>
            <td className="py-2 text-right text-muted">{analyzer.findingsCount}</td>
          </tr>)}</tbody>
        </table>
      </div>
      {analyzers.filter((analyzer) => analyzer.error).map((analyzer) => <p key={`${analyzer.analyzerId}-error`} className="mt-2 text-[10px] text-rose-400">{analyzer.analyzerId}: {analyzer.error}</p>)}
    </details>}
  </section>;
}
