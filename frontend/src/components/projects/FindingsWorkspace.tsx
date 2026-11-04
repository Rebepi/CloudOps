import { ProjectHelp } from './ProjectHelp';
import { useMemo, useState } from 'react';
import { CircleAlert, Cloud, Code2, Search, SlidersHorizontal, X, ArrowUpRight, ChevronLeft, ChevronRight } from 'lucide-react';
import type { EvaluacionSeguridad } from '../../types/cloud';
import { diagnosticDimensions } from '../../lib/diagnosticPresentation';
import { isScoredFinding, severityNames } from '../../lib/securityPresentation';
import { defaultRiskFilters, filterRisks, isPendingRisk, layerOfRisk, riskLayers, riskSources, riskStates, type RiskFilters } from '../../lib/riskPresentation';
import { RiskDetailDrawer } from './RiskDetailDrawer';
import './diagnostic.css';
import './risks.css';

const PAGE_SIZE = 10;
export function FindingsWorkspace({ assessment, projectId, initialFindingId, onUpdated }: {
  assessment: EvaluacionSeguridad; projectId: string; initialFindingId?: string; onUpdated: () => void;
}) {
  const findings = assessment.findings ?? [];
  const [filters, setFilters] = useState<RiskFilters>(() => {
    const linked = findings.find((item) => item.id === initialFindingId);
    return { ...defaultRiskFilters, ...(linked ? { context: !isScoredFinding(linked), state: isPendingRisk(linked) ? 'pending' : 'all' } : {}) };
  });
  const [advanced, setAdvanced] = useState(false);
  const [active, setActive] = useState(initialFindingId ?? '');
  const filtered = useMemo(() => filterRisks(findings, filters), [findings, filters]);
  const distribution = useMemo(() => {
    const items = filterRisks(findings, filters, false);
    return { total: items.length, counts: Object.keys(severityNames).map((id) => ({ id, label: severityNames[id], value: items.filter((finding) => finding.severity === id).length })).filter((item) => filters.context || item.id !== 'INFORMATIONAL') };
  }, [findings, filters]);
  const [page, setPage] = useState(() => Math.max(0, Math.floor(filterRisks(findings, filters).findIndex((finding) => finding.id === initialFindingId) / PAGE_SIZE)));
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const selected = findings.find((item) => item.id === active);
  const selectedIndex = filtered.findIndex((item) => item.id === active);
  const riskCount = findings.filter(isScoredFinding).length;
  const setFilter = <K extends keyof RiskFilters>(key: K, value: RiskFilters[K]) => { setFilters((previous) => ({ ...previous, [key]: value })); setPage(0); };
  const reset = () => { setFilters({ ...defaultRiskFilters }); setPage(0); };
  const navigate = (index: number) => { setActive(filtered[index].id); setPage(Math.floor(index / PAGE_SIZE)); };
  const filterChips = [
    ...(filters.query ? [{ key: 'query' as const, label: `Buscar: ${filters.query}`, value: '' }] : []),
    ...(filters.dimension !== 'all' ? [{ key: 'dimension' as const, label: diagnosticDimensions.find((item) => item.id === filters.dimension)?.label ?? filters.dimension, value: 'all' }] : []),
    ...(filters.severity !== 'all' ? [{ key: 'severity' as const, label: severityNames[filters.severity], value: 'all' }] : []),
    ...(filters.layer !== 'all' ? [{ key: 'layer' as const, label: riskLayers[filters.layer], value: 'all' }] : []),
    ...(filters.source !== 'all' ? [{ key: 'source' as const, label: riskSources[filters.source], value: 'all' }] : []),
    ...(filters.state !== 'pending' ? [{ key: 'state' as const, label: filters.state === 'all' ? 'Todos los estados' : riskStates[filters.state], value: 'pending' }] : []),
  ];
  return <section className="risk-workspace" aria-label="Explorar hallazgos">
    <header className="risk-header"><div><h2>Riesgos de la evaluación<ProjectHelp topic="risks" /></h2><p>Revisa los problemas encontrados y la evidencia que respalda cada uno.</p></div><p className="risk-record-count">{riskCount.toLocaleString('es-PE')} riesgos registrados<span>{(findings.length - riskCount).toLocaleString('es-PE')} observaciones de contexto · todos los estados</span></p></header>
    <section className="risk-distribution" aria-label="Filtrar por gravedad"><button type="button" aria-pressed={filters.severity === 'all'} className="risk-all-severities" onClick={() => setFilter('severity', 'all')}>Todas las gravedades<strong>{distribution.total.toLocaleString('es-PE')}</strong></button><div className="risk-severity-filters">{distribution.counts.map((item) => <button type="button" key={item.id} aria-pressed={filters.severity === item.id} onClick={() => setFilter('severity', filters.severity === item.id ? 'all' : item.id)} data-severity={item.id}><span><CircleAlert size={14} aria-hidden="true" />{item.label}</span><strong>{item.value.toLocaleString('es-PE')}</strong><span className="risk-severity-track" aria-hidden="true"><span style={{ transform: `scaleX(${distribution.total ? item.value / distribution.total : 0})` }} /></span></button>)}</div></section>
    <p className="risk-distribution-caption"><ProjectHelp topic="severity" />Distribución según la búsqueda y filtros actuales, antes de seleccionar una gravedad.{filters.context ? ' Incluye observaciones de contexto.' : ' Excluye informativos y resultados fuera del puntaje.'}</p>
    <div className="risk-toolbar">
      <label className="risk-search"><span className="sr-only">Buscar hallazgos</span><Search size={18} aria-hidden="true" /><input aria-label="Buscar hallazgos" name="risk-search" autoComplete="off" value={filters.query} placeholder="Buscar problema, archivo, paquete o aviso…" onChange={(event) => setFilter('query', event.target.value)} /></label>
      <label>Dimensión<select aria-label="Dimensión de seguridad" value={filters.dimension} onChange={(event) => setFilter('dimension', event.target.value)}><option value="all">Todas las dimensiones</option>{diagnosticDimensions.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
      <label>Seguimiento<select aria-label="Seguimiento" value={filters.state} onChange={(event) => setFilter('state', event.target.value)}><option value="pending">Pendientes</option><option value="all">Todos los estados</option>{Object.entries(riskStates).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      <label>Ordenar<select aria-label="Orden de revisión" value={filters.order} onChange={(event) => setFilter('order', event.target.value)}><option value="priority">Gravedad y prioridad</option><option value="location">Ubicación</option></select></label>
      <button type="button" className="diagnostic-secondary" aria-expanded={advanced} aria-controls="risk-advanced-filters" onClick={() => setAdvanced(!advanced)}><SlidersHorizontal size={16} aria-hidden="true" />Más filtros</button>
    </div>
    {advanced && <div className="risk-advanced" id="risk-advanced-filters"><label>Capa del sistema<select aria-label="Capa del sistema" value={filters.layer} onChange={(event) => setFilter('layer', event.target.value)}><option value="all">Todas las capas</option>{Object.entries(riskLayers).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label><label>Herramienta<select aria-label="Analizador de hallazgos" value={filters.source} onChange={(event) => setFilter('source', event.target.value)}><option value="all">Todas las herramientas</option>{[...new Set(findings.map((item) => item.source))].map((id) => <option key={id} value={id}>{riskSources[id] ?? id}</option>)}</select></label><label className="risk-context-toggle"><input type="checkbox" checked={filters.context} onChange={(event) => setFilter('context', event.target.checked)} />Incluir observaciones informativas o fuera del puntaje</label></div>}
    {(filterChips.length > 0 || filters.context || filters.order !== 'priority') && <div className="risk-filter-chips">{filterChips.map((chip) => <button type="button" key={chip.key} aria-label={`Quitar filtro: ${chip.label}`} onClick={() => setFilter(chip.key, chip.value)}>{chip.label}<X size={13} aria-hidden="true" /></button>)}{filters.context && <button type="button" onClick={() => { setFilters((previous) => ({ ...previous, context: false, severity: previous.severity === 'INFORMATIONAL' ? 'all' : previous.severity })); setPage(0); }}>Contexto incluido<X size={13} aria-hidden="true" /></button>}<button type="button" className="risk-reset" onClick={reset}>Limpiar filtros</button></div>}
    <div className="risk-results-header"><p role="status" aria-live="polite">{filtered.length.toLocaleString('es-PE')} {filters.context ? 'resultados' : 'riesgos'} coinciden con los filtros{filters.state === 'pending' ? ' · abiertos y en tratamiento' : ''}</p></div>
    {filtered.length ? <><table className="risk-table"><caption className="sr-only">Hallazgos de esta evaluación. Usa Revisar para abrir su evidencia y seguimiento.</caption><thead><tr><th>Gravedad</th><th>Riesgo y ubicación</th><th>Procedencia</th><th>Seguimiento</th><th><span className="sr-only">Revisar hallazgo</span></th></tr></thead><tbody>{filtered.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE).map((finding) => {
      const layer = layerOfRisk(finding); const Icon = layer === 'aws' ? Cloud : Code2;
      return <tr key={finding.id} data-selected={active === finding.id}><td data-label="Gravedad"><span className="risk-severity" data-severity={finding.severity}><CircleAlert size={14} aria-hidden="true" />{severityNames[finding.severity]}</span></td><td className="risk-table-title"><strong>{finding.title}</strong><span>{finding.resource || 'Ubicación no identificada'}</span>{!isScoredFinding(finding) && <small>Contexto · fuera del puntaje</small>}</td><td data-label="Procedencia"><span className="risk-table-origin"><Icon size={15} aria-hidden="true" />{layer === 'aws' ? 'Cuenta AWS' : 'Código'}</span><small>{layer === 'aws' ? riskSources[finding.source] : riskLayers[layer]}</small></td><td data-label="Seguimiento"><span className="risk-status" data-status={finding.status}>{riskStates[finding.status] ?? finding.status}</span>{finding.owner && <small>{finding.owner}</small>}</td><td className="risk-table-action"><button type="button" aria-label={`Revisar riesgo: ${finding.title}`} onClick={() => setActive(finding.id)}>Revisar<ArrowUpRight size={15} aria-hidden="true" /></button></td></tr>;
    })}</tbody></table><div className="risk-pagination"><span>{current * PAGE_SIZE + 1}–{Math.min((current + 1) * PAGE_SIZE, filtered.length)} de {filtered.length} · {PAGE_SIZE} por página</span><div><button type="button" disabled={!current} onClick={() => setPage(current - 1)} aria-label="Página anterior"><ChevronLeft size={17} aria-hidden="true" /></button><span>{current + 1} de {pages}</span><button type="button" disabled={current >= pages - 1} onClick={() => setPage(current + 1)} aria-label="Página siguiente"><ChevronRight size={17} aria-hidden="true" /></button></div></div></> : <div className="risk-empty"><Search size={24} aria-hidden="true" /><h3>No hay hallazgos que coincidan con estos filtros</h3><p>Cambia la búsqueda o consulta otros estados. Un resultado vacío no demuestra ausencia de vulnerabilidades.</p><button type="button" className="diagnostic-secondary" onClick={reset}>Restablecer búsqueda</button></div>}
    {selected && <RiskDetailDrawer key={selected.id} finding={selected} projectId={projectId} onClose={() => setActive('')} onUpdated={onUpdated} onPrevious={selectedIndex > 0 ? () => navigate(selectedIndex - 1) : undefined} onNext={selectedIndex >= 0 && selectedIndex < filtered.length - 1 ? () => navigate(selectedIndex + 1) : undefined} />}
  </section>;
}
