import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, ShieldAlert, Sparkles } from 'lucide-react';
import type { HallazgoSeguridad } from '../../types/cloud';
import { detectAwsService } from './findingServiceHelper';

const severityOrder: Record<HallazgoSeguridad['severity'], number> = {
  CRITICAL: 1,
  HIGH: 2,
  MEDIUM: 3,
  LOW: 4,
  INFORMATIONAL: 5,
};

const severityBadgeStyle: Record<HallazgoSeguridad['severity'], string> = {
  CRITICAL: 'bg-rose-500/15 text-rose-500 border-rose-500/30 ring-1 ring-rose-500/20',
  HIGH: 'bg-orange-500/15 text-orange-500 border-orange-500/30',
  MEDIUM: 'bg-amber-500/15 text-amber-500 border-amber-500/30',
  LOW: 'bg-blue-500/15 text-blue-500 border-blue-500/30',
  INFORMATIONAL: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
};

export function NewFindingsComparison({
  newFindings,
  onNavigateToFinding,
}: {
  newFindings: HallazgoSeguridad[];
  onNavigateToFinding?: (findingId: string) => void;
}) {
  const [filterSeverity, setFilterSeverity] = useState<'all' | 'critical_high' | 'CRITICAL' | 'HIGH' | 'MEDIUM'>('critical_high');
  const [page, setPage] = useState(1);
  const pageSize = 5;

  // Count severities
  const counts = useMemo(() => {
    return newFindings.reduce(
      (acc, f) => {
        acc[f.severity] = (acc[f.severity] || 0) + 1;
        return acc;
      },
      { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFORMATIONAL: 0 } as Record<string, number>
    );
  }, [newFindings]);

  const criticalHighTotal = counts.CRITICAL + counts.HIGH;

  // Filter & sort by severity
  const filteredFindings = useMemo(() => {
    const list = newFindings.filter((f) => {
      if (filterSeverity === 'all') return true;
      if (filterSeverity === 'critical_high') return f.severity === 'CRITICAL' || f.severity === 'HIGH';
      return f.severity === filterSeverity;
    });

    return list.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
  }, [newFindings, filterSeverity]);

  const totalPages = Math.max(1, Math.ceil(filteredFindings.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginated = filteredFindings.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const handleFilterChange = (filter: typeof filterSeverity) => {
    setFilterSeverity(filter);
    setPage(1);
  };

  if (!newFindings.length) return null;

  return (
    <div className="mt-5 rounded-2xl border border-line bg-canvas/60 p-4 sm:p-5">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-line/60 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-500/15 text-rose-500 border border-rose-500/20">
            <Sparkles size={14} />
          </div>
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-ink flex items-center gap-2">
              Hallazgos Nuevos Detectados
              <span className="rounded-full bg-rose-500/20 border border-rose-500/30 px-2 py-0.5 text-[10px] font-extrabold text-rose-400">
                {newFindings.length}
              </span>
            </h4>
            <p className="text-[11px] text-muted">
              Desviaciones identificadas que no existían en la evaluación previa.
            </p>
          </div>
        </div>

        {/* Severity Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <button
            type="button"
            onClick={() => handleFilterChange('critical_high')}
            className={`inline-flex items-center gap-1 rounded-xl px-2.5 py-1 text-[10px] font-bold border transition-colors cursor-pointer ${
              filterSeverity === 'critical_high'
                ? 'border-rose-500/40 bg-rose-500/20 text-rose-300'
                : 'border-line bg-card/60 text-muted hover:text-ink'
            }`}
          >
            <ShieldAlert size={12} className="text-rose-500" />
            Críticos & Altos ({criticalHighTotal})
          </button>
          <button
            type="button"
            onClick={() => handleFilterChange('all')}
            className={`rounded-xl px-2.5 py-1 text-[10px] font-bold border transition-colors cursor-pointer ${
              filterSeverity === 'all'
                ? 'border-blue-500/40 bg-blue-500/20 text-blue-300'
                : 'border-line bg-card/60 text-muted hover:text-ink'
            }`}
          >
            Todos ({newFindings.length})
          </button>
          {counts.CRITICAL > 0 && (
            <button
              type="button"
              onClick={() => handleFilterChange('CRITICAL')}
              className={`rounded-xl px-2 py-1 text-[10px] font-bold border transition-colors cursor-pointer ${
                filterSeverity === 'CRITICAL'
                  ? 'border-rose-600 bg-rose-600 text-white'
                  : 'border-line bg-card/60 text-rose-400 hover:text-rose-300'
              }`}
            >
              Crítico ({counts.CRITICAL})
            </button>
          )}
          {counts.HIGH > 0 && (
            <button
              type="button"
              onClick={() => handleFilterChange('HIGH')}
              className={`rounded-xl px-2 py-1 text-[10px] font-bold border transition-colors cursor-pointer ${
                filterSeverity === 'HIGH'
                  ? 'border-orange-500 bg-orange-500/20 text-orange-300'
                  : 'border-line bg-card/60 text-orange-400 hover:text-orange-300'
              }`}
            >
              Alto ({counts.HIGH})
            </button>
          )}
        </div>
      </div>

      {/* List of New Findings */}
      <div className="mt-3 space-y-2">
        {paginated.map((finding) => {
          const service = detectAwsService(finding);
          const isCritical = finding.severity === 'CRITICAL';

          return (
            <div
              key={finding.id}
              onClick={() => onNavigateToFinding?.(finding.id)}
              className={`group flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 rounded-xl border p-3 transition-all cursor-pointer ${
                isCritical
                  ? 'border-rose-500/30 bg-rose-500/5 hover:border-rose-500/50 hover:bg-rose-500/10'
                  : 'border-line bg-card/80 hover:border-blue-500/30 hover:bg-card'
              }`}
            >
              <div className="flex items-start gap-2.5 min-w-0">
                {isCritical && (
                  <span className="mt-0.5 flex h-2 w-2 shrink-0 rounded-full bg-rose-500 animate-ping" />
                )}
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-md border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${service.badgeClass}`}
                    >
                      {service.shortName}
                    </span>
                    <strong className="text-xs font-semibold text-ink group-hover:text-blue-500 transition-colors truncate">
                      {finding.title}
                    </strong>
                  </div>
                  {finding.recommendation && (
                    <p className="mt-1 text-[11px] text-muted line-clamp-1">
                      {finding.recommendation}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                <span
                  className={`rounded-lg border px-2 py-0.5 text-[9px] font-bold ${
                    severityBadgeStyle[finding.severity]
                  }`}
                >
                  {finding.severity}
                </span>
                <span className="text-[10px] font-medium text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity">
                  Ver detalles →
                </span>
              </div>
            </div>
          );
        })}

        {!paginated.length && (
          <p className="py-4 text-center text-xs text-muted">
            No hay hallazgos nuevos en el filtro seleccionado.
          </p>
        )}
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="mt-3 flex items-center justify-between border-t border-line/60 pt-2.5 text-xs text-muted">
          <span>
            Mostrando {(currentPage - 1) * pageSize + 1} -{' '}
            {Math.min(currentPage * pageSize, filteredFindings.length)} de {filteredFindings.length} nuevos
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-lg border border-line p-1 text-muted hover:text-ink disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="px-2 text-[11px] font-medium text-ink">
              {currentPage} / {totalPages}
            </span>
            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="rounded-lg border border-line p-1 text-muted hover:text-ink disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
