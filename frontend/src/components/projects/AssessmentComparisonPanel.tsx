import type { ComparacionEvaluacion } from '../../types/cloud';
import { Card } from '../ui/Card';
import { NewFindingsComparison } from '../security/NewFindingsComparison';
export function AssessmentComparisonPanel({ comparison, onNavigateToFinding }: { comparison: ComparacionEvaluacion | null; onNavigateToFinding: (id: string) => void }) { return <>
        {/* Comparison with Previous Assessment */}
        {comparison && (
          <Card>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-line pb-4">
              <div>
                <h3 className="text-base font-bold text-ink">Comparación con la evaluación anterior</h3>
                <p className="text-xs text-muted">Cambios y desviaciones detectados por huella criptográfica de hallazgo.</p>
              </div>
              {comparison.previous && (
                <span className="text-[11px] font-mono text-muted bg-canvas px-2.5 py-1 rounded-lg border border-line">
                  Base: {new Date(comparison.previous.startedAt).toLocaleString('es-PE')}
                </span>
              )}
            </div>

            {comparison.previous && comparison.summary.comparable ? (
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-center text-xs">
                <div className="rounded-xl bg-canvas p-3 border border-line/60">
                  <strong className="block text-xl font-black text-rose-500">{comparison.summary.newCount}</strong>
                  <span className="text-muted font-medium">Nuevos</span>
                </div>
                <div className="rounded-xl bg-canvas p-3 border border-line/60">
                  <strong className="block text-xl font-black text-emerald-500">{comparison.summary.resolvedCount}</strong>
                  <span className="text-muted font-medium">Corregidos</span>
                </div>
                <div className="rounded-xl bg-canvas p-3 border border-line/60">
                  <strong className="block text-xl font-black text-amber-500">{comparison.summary.recurringCount}</strong>
                  <span className="text-muted font-medium">Recurrentes</span>
                </div>
                <div className="rounded-xl bg-canvas p-3 border border-line/60">
                  <strong className="block text-xl font-black text-violet-500">{comparison.summary.severityChangedCount}</strong>
                  <span className="text-muted font-medium">Cambio severidad</span>
                </div>
                <div className="rounded-xl bg-canvas p-3 border border-line/60">
                  <strong className={`block text-xl font-black ${(comparison.summary.scoreDelta ?? 0) >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                    {(comparison.summary.scoreDelta ?? 0) > 0 ? `+${comparison.summary.scoreDelta}` : comparison.summary.scoreDelta ?? '—'}
                  </strong>
                  <span className="text-muted font-medium">Δ puntaje</span>
                </div>
                <div className="rounded-xl bg-canvas p-3 border border-line/60">
                  <strong className={`block text-xl font-black ${(comparison.summary.coverageDelta ?? 0) >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                    {comparison.summary.coverageDelta === null ? '—' : `${comparison.summary.coverageDelta > 0 ? '+' : ''}${comparison.summary.coverageDelta}%`}
                  </strong>
                  <span className="text-muted font-medium">Δ cobertura</span>
                </div>
              </div>
            ) : (
              <p className="mt-4 text-xs text-muted">
                No hay una evaluación anterior comparable de este tipo. Esta ejecución servirá como línea base.
              </p>
            )}

            {comparison.previous && !comparison.summary.comparable && <p className="mt-3 text-xs text-amber-700 dark:text-amber-400">El motor o la metodología cambió. Los puntajes y la cobertura no son comparables directamente; las diferencias de hallazgos pueden incluir cambios de normalización.</p>}

            {/* Redesigned New Findings Component */}
            {comparison.previous && comparison.summary.comparable && comparison.newFindings.length > 0 && (
              <NewFindingsComparison
                newFindings={comparison.newFindings}
                onNavigateToFinding={onNavigateToFinding}
              />
            )}
          </Card>
        )}


</>; }
