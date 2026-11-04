import { ProjectHelp } from './ProjectHelp';
import { ArrowUpRight, CircleAlert, CircleCheck, CircleDashed, CircleMinus, FileSearch, ScanSearch } from 'lucide-react';
import type { EvaluacionSeguridad } from '../../types/cloud';
import type { diagnosticModel } from '../../lib/diagnosticPresentation';
import { boundedPercentage } from '../../lib/diagnosticPresentation';
import { analyzerNames } from './MeasurementReceipt';

export function DiagnosticCoverage({ assessment, model, onCoverage }: { assessment: EvaluacionSeguridad; model: ReturnType<typeof diagnosticModel>; onCoverage: () => void }) {
  const coverage = boundedPercentage(assessment.coverage);
  const groups = [
    { label: 'Completados', items: model.complete, tone: 'coverage', Icon: CircleCheck },
    { label: 'Parciales', items: model.partial, tone: 'warning', Icon: CircleDashed },
    { label: 'Fallidos u omitidos', items: model.unavailable, tone: 'neutral', Icon: CircleMinus },
  ];
  return <section className="diagnostic-panel diagnostic-coverage" aria-labelledby="diagnostic-coverage-title">
    <div className="diagnostic-panel-heading"><div><h2 id="diagnostic-coverage-title">Alcance del diagnóstico<ProjectHelp topic="coverage" /></h2><p>Qué pudo comprobarse y qué quedó pendiente.</p></div><ScanSearch size={20} aria-hidden="true" /></div>
    <div className="diagnostic-coverage-value"><strong>{coverage === null ? 'Sin medir' : `${coverage}%`}</strong><span>Cobertura del método</span></div>
    <div className="diagnostic-coverage-track" role="img" aria-label={`Cobertura registrada: ${coverage === null ? 'sin medir' : `${coverage}%`}`}><span style={{ transform: `scaleX(${(coverage ?? 0) / 100})` }} /></div>
    <p className="diagnostic-coverage-note">Incluye comprobaciones parciales. No es el porcentaje de archivos leídos ni de seguridad.</p>
    <div className="diagnostic-tool-distribution" role="img" aria-label={groups.map((group) => `${group.items.length} ${group.label.toLowerCase()}`).join(', ')}>{groups.map((group) => group.items.length > 0 && <span key={group.label} className={`diagnostic-${group.tone}`} style={{ flexGrow: group.items.length }} />)}</div>
    <dl className="diagnostic-tool-counts">{groups.map(({ label, items, tone, Icon }) => <div key={label}><dt><Icon size={16} data-tone={tone} aria-hidden="true" />{label}</dt><dd>{items.length}</dd></div>)}</dl>
    {!model.analyzers.length && <p className="diagnostic-limit">Esta evaluación no conserva trazas de analizadores. No se puede confirmar su ejecución.</p>}
    {model.incomplete.length > 0 && <div className="diagnostic-limits"><h3><CircleAlert size={15} aria-hidden="true" />Límites que debes conocer</h3>{model.incomplete.slice(0, 2).map((analyzer) => <div key={analyzer.analyzerId}><strong>{analyzerNames[analyzer.analyzerId] ?? analyzer.analyzerId}</strong><p>{analyzer.error || (typeof analyzer.detail?.reason === 'string' ? analyzer.detail.reason : analyzer.state === 'partial' ? 'Se comprobó solo parte del alcance. Consulta las omisiones y límites.' : 'No se completó la comprobación. Consulta el motivo y alcance pendiente.')}</p></div>)}{model.incomplete.length > 2 && <p className="diagnostic-more-limits">{model.incomplete.length - 2} comprobaciones adicionales con límites.</p>}</div>}
    <div className="diagnostic-sample"><FileSearch size={16} aria-hidden="true" /><span>{assessment.summary.filesAnalyzed == null ? 'Archivos: sin registro' : `${assessment.summary.filesAnalyzed.toLocaleString('es-PE')} archivos leídos`}{assessment.summary.dependencyCount != null && <span>{assessment.summary.dependencyCount.toLocaleString('es-PE')} dependencias inventariadas</span>}</span></div>
    <button type="button" onClick={onCoverage} className="diagnostic-secondary diagnostic-coverage-button">Ver comprobaciones<ArrowUpRight size={16} aria-hidden="true" /></button>
  </section>;
}
