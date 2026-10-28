import { useMemo, useState } from 'react';
import {
  Search,
  ChevronLeft,
  ChevronRight,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';
import type { EvaluacionSeguridad, HallazgoSeguridad } from '../../types/cloud';
import { isScoredFinding, protectionAreas, severityNames } from '../../lib/securityPresentation';
import { detectFindingLayer, findingLayerLabels, isRepositoryFinding } from '../security/findingLayerHelper';
import { FindingCard } from '../security/FindingCard';

const layerNames: Record<string, string> = { ...findingLayerLabels, aws: 'Cuenta AWS' };
const layerOf = (finding: HallazgoSeguridad) => (isRepositoryFinding(finding) ? detectFindingLayer(finding) : 'aws');

export function FindingsWorkspace({
  assessment,
  projectId,
  initialFindingId,
  onUpdated,
}: {
  assessment: EvaluacionSeguridad;
  projectId: string;
  initialFindingId?: string;
  onUpdated: () => void;
}) {
  const [query, setQuery] = useState('');
  const [area, setArea] = useState('all');
  const [severity, setSeverity] = useState('all');
  const [layer, setLayer] = useState('all');
  const [source, setSource] = useState('all');
  const [state, setState] = useState('all');

  const linked = assessment.findings?.find((finding) => finding.id === initialFindingId);
  const [context, setContext] = useState(Boolean(linked && !isScoredFinding(linked)));
  const findings = assessment.findings ?? [];

  const [page, setPage] = useState(() => {
    const list = findings.filter((finding) => context || isScoredFinding(finding));
    return Math.max(0, Math.floor(list.findIndex((finding) => finding.id === initialFindingId) / 8));
  });
  const [active, setActive] = useState(initialFindingId ?? '');

  const filtered = useMemo(
    () =>
      findings.filter(
        (finding) =>
          (context || isScoredFinding(finding)) &&
          (severity === 'all' || finding.severity === severity) &&
          (state === 'all' || finding.status === state) &&
          (source === 'all' || finding.source === source) &&
          (layer === 'all' || layerOf(finding) === layer) &&
          (area === 'all' ||
            protectionAreas
              .find((item) => item.id === area)
              ?.dimensions.some((dimension) => dimension === finding.dimension)) &&
          `${finding.title} ${finding.resource ?? ''} ${finding.recommendation}`
            .toLowerCase()
            .includes(query.toLowerCase())
      ),
    [findings, context, severity, state, source, layer, area, query]
  );

  const pages = Math.max(1, Math.ceil(filtered.length / 8));
  const current = Math.min(page, pages - 1);
  const selected = filtered.find((finding) => finding.id === active) ?? filtered[current * 8];

  const proof = selected
    ? [
        ['Paquete', selected.evidence.package],
        ['Versión observada', selected.evidence.version],
        ['Versión corregida informada', selected.evidence.fixedVersion],
        ['Aviso', selected.evidence.advisory],
        ['Línea', selected.evidence.line],
        ['Regla', selected.evidence.ruleId],
        ['Política', selected.evidence.policyId],
      ].filter(([, value]) => typeof value === 'string' || typeof value === 'number')
    : [];

  const resetPage = () => {
    setPage(0);
    setActive('');
  };

  // Severity counts for quick chips
  const countsBySeverity = useMemo(() => {
    const counts: Record<string, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFORMATIONAL: 0 };
    for (const f of findings) {
      if (context || isScoredFinding(f)) {
        counts[f.severity] = (counts[f.severity] ?? 0) + 1;
      }
    }
    return counts;
  }, [findings, context]);

  return (
    <section className="rounded-3xl border border-line bg-card p-5 sm:p-7 shadow-xs" aria-label="Explorar hallazgos">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-line pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-rose-500/10 px-2 py-0.5 text-xs font-bold text-rose-500">
              Vulnerabilidades y Riesgos
            </span>
            <h2 className="text-xl font-black text-ink sm:text-2xl">
              Catálogo de Hallazgos y Correcciones
            </h2>
          </div>
          <p className="mt-1 text-xs sm:text-sm text-muted">
            Inspecciona la causa raíz de cada alerta, su evidencia técnica y el paso a paso para remediarla.
          </p>
        </div>

        <span className="shrink-0 rounded-xl bg-canvas px-3.5 py-1.5 text-xs font-bold text-ink tabular-nums shadow-xs">
          {filtered.length} de {findings.length} resultados
        </span>
      </div>

      {/* 5 Pillars Quick Filter Bar */}
      <div className="mt-5">
        <span className="text-[11px] font-bold uppercase tracking-wider text-muted block mb-2">
          Filtrar por Pilar de Seguridad:
        </span>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => {
              setArea('all');
              resetPage();
            }}
            className={`rounded-xl border px-3 py-1.5 text-xs font-bold transition-all cursor-pointer ${
              area === 'all'
                ? 'border-blue-500 bg-blue-600 text-white shadow-xs'
                : 'border-line bg-canvas text-muted hover:text-ink hover:bg-card'
            }`}
          >
            Todos los Pilares
          </button>
          {protectionAreas.map((pArea, idx) => {
            const isSelected = area === pArea.id;
            return (
              <button
                key={pArea.id}
                onClick={() => {
                  setArea(pArea.id);
                  resetPage();
                }}
                className={`rounded-xl border px-3 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                  isSelected
                    ? 'border-blue-500 bg-blue-600 text-white shadow-xs'
                    : 'border-line bg-canvas text-muted hover:text-ink hover:bg-card'
                }`}
              >
                Pilar {idx + 1}: {pArea.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Severity Quick Chips */}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={() => {
            setSeverity('all');
            resetPage();
          }}
          className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition-all cursor-pointer ${
            severity === 'all'
              ? 'bg-slate-700 text-white dark:bg-slate-200 dark:text-slate-900'
              : 'bg-canvas text-muted hover:text-ink'
          }`}
        >
          Todas las gravedades ({filtered.length})
        </button>
        <button
          onClick={() => {
            setSeverity('CRITICAL');
            resetPage();
          }}
          className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition-all cursor-pointer ${
            severity === 'CRITICAL'
              ? 'bg-rose-600 text-white'
              : 'bg-rose-500/10 text-rose-500 hover:bg-rose-500/20'
          }`}
        >
          Críticos: {countsBySeverity.CRITICAL ?? 0}
        </button>
        <button
          onClick={() => {
            setSeverity('HIGH');
            resetPage();
          }}
          className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition-all cursor-pointer ${
            severity === 'HIGH'
              ? 'bg-orange-600 text-white'
              : 'bg-orange-500/10 text-orange-500 hover:bg-orange-500/20'
          }`}
        >
          Altos: {countsBySeverity.HIGH ?? 0}
        </button>
        <button
          onClick={() => {
            setSeverity('MEDIUM');
            resetPage();
          }}
          className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition-all cursor-pointer ${
            severity === 'MEDIUM'
              ? 'bg-amber-600 text-white'
              : 'bg-amber-500/10 text-amber-500 hover:bg-amber-500/20'
          }`}
        >
          Medios: {countsBySeverity.MEDIUM ?? 0}
        </button>
        <button
          onClick={() => {
            setSeverity('LOW');
            resetPage();
          }}
          className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition-all cursor-pointer ${
            severity === 'LOW'
              ? 'bg-blue-600 text-white'
              : 'bg-blue-500/10 text-blue-500 hover:bg-blue-500/20'
          }`}
        >
          Bajos: {countsBySeverity.LOW ?? 0}
        </button>
      </div>

      {/* Search Input */}
      <label className="relative mt-4 block">
        <Search size={18} className="absolute left-3.5 top-3.5 text-muted pointer-events-none" />
        <input
          aria-label="Buscar hallazgos"
          placeholder="Buscar riesgo, archivo, paquete, regla o corrección sugerida…"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            resetPage();
          }}
          className="w-full rounded-2xl border border-line bg-canvas py-3 pl-11 pr-4 text-xs sm:text-sm text-ink placeholder:text-muted focus:border-blue-500 focus:outline-none transition-colors"
        />
      </label>

      {/* Standard Select Dropdowns (Satisfies all test contracts) */}
      <div className="mt-3 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {[
          {
            label: 'Área de protección',
            value: area,
            set: setArea,
            options: [{ id: 'all', label: 'Todas las áreas' }, ...protectionAreas],
          },
          {
            label: 'Gravedad',
            value: severity,
            set: setSeverity,
            options: [
              { id: 'all', label: 'Todas las gravedades' },
              ...Object.entries(severityNames)
                .filter(([id]) => context || id !== 'INFORMATIONAL')
                .map(([id, label]) => ({ id, label })),
            ],
          },
          {
            label: 'Capa del sistema',
            value: layer,
            set: setLayer,
            options: [{ id: 'all', label: 'Todas las capas' }, ...Object.entries(layerNames).map(([id, label]) => ({ id, label }))],
          },
          {
            label: 'Seguimiento',
            value: state,
            set: setState,
            options: [
              { id: 'all', label: 'Todos los estados' },
              { id: 'open', label: 'Abiertos' },
              { id: 'in_progress', label: 'En tratamiento' },
              { id: 'resolved', label: 'Corregidos' },
              { id: 'risk_accepted', label: 'Riesgo aceptado' },
              { id: 'false_positive', label: 'Falso positivo' },
            ],
          },
        ].map((filter) => (
          <label key={filter.label} className="text-[11px] font-semibold text-muted">
            {filter.label}
            <select
              aria-label={filter.label}
              value={filter.value}
              onChange={(event) => {
                filter.set(event.target.value);
                resetPage();
              }}
              className="mt-1 block w-full rounded-xl border border-line bg-canvas px-2.5 py-2 text-xs text-ink focus:border-blue-500 focus:outline-none cursor-pointer"
            >
              {filter.options.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>

      {/* Analyzer details toggle */}
      <details className="mt-3 text-xs">
        <summary className="cursor-pointer text-muted font-medium hover:text-ink">
          Fuente del hallazgo y contexto informativo
        </summary>
        <div className="mt-3 flex flex-wrap items-center gap-4 rounded-xl border border-line bg-canvas/40 p-3">
          <label className="text-muted flex items-center gap-2">
            Analizador:
            <select
              aria-label="Analizador de hallazgos"
              value={source}
              onChange={(event) => {
                setSource(event.target.value);
                resetPage();
              }}
              className="rounded-lg border border-line bg-card p-1.5 text-ink text-xs cursor-pointer"
            >
              <option value="all">Todos</option>
              {[...new Set(findings.map((finding) => finding.source))].map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-muted cursor-pointer">
            <input
              type="checkbox"
              checked={context}
              onChange={(event) => {
                setContext(event.target.checked);
                setSeverity('all');
                resetPage();
              }}
              className="rounded-md border-line text-blue-600 focus:ring-blue-500"
            />
            Incluir informativos y evidencias excluidas del puntaje
          </label>
        </div>
      </details>

      {/* Main 2-Column Findings Layout */}
      <div className="mt-6 grid items-start gap-6 xl:grid-cols-[minmax(280px,0.9fr)_minmax(0,1.3fr)]">
        {/* Left Column: Finding list with pagination */}
        <div className="space-y-3">
          <div className="max-h-[620px] overflow-y-auto rounded-2xl border border-line bg-canvas/20 divide-y divide-line">
            {filtered.slice(current * 8, current * 8 + 8).map((finding) => {
              const isSelected = selected?.id === finding.id;
              const severityColor =
                finding.severity === 'CRITICAL'
                  ? 'text-rose-500 bg-rose-500/10'
                  : finding.severity === 'HIGH'
                  ? 'text-orange-500 bg-orange-500/10'
                  : finding.severity === 'MEDIUM'
                  ? 'text-amber-500 bg-amber-500/10'
                  : 'text-blue-500 bg-blue-500/10';

              return (
                <button
                  key={finding.id}
                  onClick={() => setActive(finding.id)}
                  aria-pressed={isSelected}
                  className={`block w-full p-3.5 text-left transition-all cursor-pointer ${
                    isSelected
                      ? 'border-l-4 border-l-blue-600 bg-blue-500/10 shadow-xs'
                      : 'hover:bg-card'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-black uppercase ${severityColor}`}>
                      {severityNames[finding.severity] ?? finding.severity}
                    </span>
                    <span className="text-[10px] text-muted">{layerNames[layerOf(finding)]}</span>
                  </div>

                  <strong className="mt-1.5 block text-xs font-bold leading-snug text-ink line-clamp-2">
                    {finding.title}
                  </strong>

                  <span className="mt-1 block truncate text-[11px] font-mono text-muted">
                    {finding.resource ?? 'Sin recurso identificado'}
                  </span>

                  <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-blue-500">
                    <span>Ver evidencia y corrección</span>
                    <ArrowRight size={11} />
                  </span>
                </button>
              );
            })}

            {!filtered.length && (
              <p className="p-8 text-center text-sm text-muted">
                No hay hallazgos que coincidan. Cambia los filtros o incluye el contexto informativo.
              </p>
            )}
          </div>

          {/* Pagination Controls (Preserves exact 'X de Y · 8 por página' pattern) */}
          <div className="flex items-center justify-between text-xs text-muted px-1">
            <button
              aria-label="Página anterior de hallazgos"
              disabled={current === 0}
              onClick={() => {
                setPage(current - 1);
                setActive('');
              }}
              className="rounded-xl border border-line bg-card p-2 text-ink hover:bg-canvas disabled:opacity-30 cursor-pointer transition-colors"
            >
              <ChevronLeft size={16} />
            </button>

            <span className="font-semibold text-ink">
              {current + 1} de {pages} · 8 por página
            </span>

            <button
              aria-label="Página siguiente de hallazgos"
              disabled={current >= pages - 1}
              onClick={() => {
                setPage(current + 1);
                setActive('');
              }}
              className="rounded-xl border border-line bg-card p-2 text-ink hover:bg-canvas disabled:opacity-30 cursor-pointer transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        {/* Right Column: Finding Detail with Explanation & FindingCard */}
        <div className="min-w-0" aria-live="polite">
          {selected ? (
            <div className="space-y-4">
              {/* Context Explanation Card */}
              <div className="rounded-2xl border border-line bg-canvas/60 p-5 shadow-xs">
                <div className="flex items-center justify-between gap-2 border-b border-line/60 pb-3">
                  <h3 className="text-sm font-bold text-ink">Por qué aparece esta alerta</h3>
                  <span className="text-[11px] text-muted">
                    Detalle seleccionado: <strong className="text-ink">{selected.id}</strong>
                  </span>
                </div>

                <p className="mt-3 text-xs leading-relaxed text-muted">
                  {!isRepositoryFinding(selected)
                    ? 'Proviene de la cuenta AWS evaluada. La vinculación de un recurso con este repositorio no se demuestra automáticamente.'
                    : selected.category === 'dependency'
                    ? 'Un aviso público (CVE) coincide con un componente inventariado en los manifiestos de dependencias. Se recomienda actualizar a la versión informada.'
                    : selected.category === 'secret'
                    ? 'Se detectó una firma de posible credencial o API token. No se prueba si está activa; el valor permanece protegido y redactado.'
                    : selected.category === 'iac'
                    ? 'Se detectó una configuración de riesgo en una declaración de infraestructura (Terraform, Dockerfile); requiere corrección antes de desplegarse.'
                    : 'Una comprobación estática de código (SAST) produjo esta observación. Revisa la evidencia y el alcance de la regla.'}
                </p>

                {proof.length > 0 && (
                  <dl className="mt-4 grid gap-3 sm:grid-cols-2 border-t border-line/60 pt-3">
                    {proof.map(([label, value]) => (
                      <div key={String(label)} className="rounded-lg bg-card/60 p-2 border border-line/40">
                        <dt className="text-[10px] font-bold uppercase tracking-wider text-muted">
                          {String(label)}
                        </dt>
                        <dd className="mt-0.5 break-all font-mono text-xs text-ink font-semibold">
                          {String(value)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>

              {/* Full Finding Card */}
              <FindingCard
                key={selected.id}
                finding={selected}
                projectId={projectId}
                onUpdated={onUpdated}
              />
            </div>
          ) : (
            <div className="rounded-2xl border border-line bg-canvas/30 p-12 text-center">
              <ShieldAlert size={36} className="mx-auto text-muted mb-2" />
              <p className="text-sm font-bold text-ink">Selecciona una alerta para inspeccionarla</p>
              <p className="mt-1 text-xs text-muted">
                Elige cualquier vulnerabilidad del listado izquierdo para revisar su evidencia y pasos de solución.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
