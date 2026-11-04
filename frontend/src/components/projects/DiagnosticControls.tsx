import { ProjectHelp } from './ProjectHelp';
import { useState } from 'react';
import { Code2, Database, Fingerprint, Layers3, Network, Radar, ChevronDown, ArrowUpRight, CircleCheck, CircleAlert, CircleDashed, CircleMinus } from 'lucide-react';
import type { diagnosticModel } from '../../lib/diagnosticPresentation';
import { controlSegments } from '../../lib/diagnosticPresentation';
import { controlNames } from '../../lib/securityPresentation';

const icons = { identity: Fingerprint, data: Database, application: Code2, dependencies: Layers3, configuration: Network, detection: Radar };
const stateIcons = { pass: CircleCheck, fail: CircleAlert, partial: CircleDashed, pending: CircleMinus };
type Dimension = ReturnType<typeof diagnosticModel>['dimensions'][number];

function DimensionRow({ dimension, onFinding }: { dimension: Dimension; onFinding: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(0);
  const { counts, measured, controls } = dimension;
  const Icon = icons[dimension.id];
  const state = counts.fail ? 'danger' : counts.partial || counts.pending || !controls.length || measured?.state !== 'measured' ? 'warning' : 'ok';
  const status = counts.fail ? `${counts.fail} con fallo` : !controls.length ? 'Sin comprobaciones' : counts.applicable === 0 ? 'No aplicable' : counts.partial || counts.pending ? 'Evidencia incompleta' : measured?.state !== 'measured' ? 'Medición parcial' : 'Sin fallo observado';
  const barLabel = controlSegments.map((segment) => `${counts[segment.key]} ${segment.label.toLowerCase()}`).join(', ');
  return <details className="diagnostic-dimension" onToggle={(event) => { if (event.target === event.currentTarget) setOpen(event.currentTarget.open); }}>
    <summary>
      <span className="diagnostic-dimension-name"><span className="diagnostic-dimension-icon"><Icon size={19} aria-hidden="true" /></span><span><strong>{dimension.label}</strong><span className="diagnostic-row-status" data-tone={state}>{status}</span></span></span>
      <span className="diagnostic-dimension-chart">
        <span className={`diagnostic-segments ${counts.applicable ? '' : 'diagnostic-empty-bar'}`} role="img" aria-label={`${dimension.label}: ${barLabel}${counts.notApplicable ? `, ${counts.notApplicable} no aplicables` : ''}`}>
          {controlSegments.map((segment) => counts[segment.key] > 0 && <span key={segment.key} className={`diagnostic-segment diagnostic-${segment.tone}`} title={`${counts[segment.key]} ${segment.label.toLowerCase()}`} style={{ flexGrow: counts[segment.key] }} />)}
        </span>
        <span className="diagnostic-row-foot"><span>{controls.length ? `${counts.applicable} controles aplicables` : 'Sin evidencia de controles'}{counts.notApplicable > 0 ? ` · ${counts.notApplicable} ${counts.notApplicable === 1 ? 'no aplicable' : 'no aplicables'}` : ''}</span><span>{dimension.findings.length} alertas</span></span>
      </span>
      <ChevronDown size={16} className="diagnostic-chevron" aria-hidden="true" />
    </summary>
    {open && <div className="diagnostic-dimension-detail">
      <p>{dimension.description} {measured?.score != null ? `Índice registrado: ${measured.score}/100.` : 'Sin puntaje concluyente.'} {measured ? `Cobertura de la dimensión: ${measured.coverage}%.` : ''}</p>
      {!controls.length && <p>No hay comprobaciones guardadas para esta dimensión. No equivale a un resultado seguro.</p>}
      <dl>{controls.map((control) => {
        const key = control.state === 'pass' || control.state === 'fail' || control.state === 'partial' ? control.state : 'pending';
        const StateIcon = stateIcons[key];
        return <div className="diagnostic-control" key={control.id}><StateIcon size={16} aria-hidden="true" data-tone={key === 'pass' ? 'ok' : key === 'fail' ? 'danger' : key === 'partial' ? 'warning' : 'neutral'} /><div><dt>{control.label}<span>{controlNames[control.state]}</span></dt><dd>{control.detail}</dd></div></div>;
      })}</dl>
      {dimension.findings.length > 0 && <details className="diagnostic-evidence"><summary>Alertas vinculadas ({dimension.findings.length})</summary><div className="diagnostic-evidence-list">{dimension.findings.slice(page * 5, page * 5 + 5).map((finding) => <button type="button" key={finding.id} onClick={() => onFinding(finding.id)}>{finding.title}<ArrowUpRight size={14} aria-hidden="true" /></button>)}</div>{dimension.findings.length > 5 && <div className="diagnostic-evidence-pagination"><button type="button" disabled={!page} onClick={() => setPage(page - 1)}>Anterior</button><span>{page + 1} de {Math.ceil(dimension.findings.length / 5)}</span><button type="button" disabled={(page + 1) * 5 >= dimension.findings.length} onClick={() => setPage(page + 1)}>Siguiente</button></div>}</details>}
    </div>}
  </details>;
}

export function DiagnosticControls({ dimensions, onFinding }: { dimensions: Dimension[]; onFinding: (id: string) => void }) {
  return <section className="diagnostic-panel diagnostic-control-map" aria-labelledby="diagnostic-map-title">
    <div className="diagnostic-panel-heading"><div><h2 id="diagnostic-map-title">Mapa de comprobaciones<ProjectHelp topic="controls" /></h2><p>Abre una dimensión para revisar sus pruebas y evidencia.</p></div><span className="diagnostic-label">6 dimensiones</span></div>
    <div className="diagnostic-legend">{controlSegments.map((segment) => <span key={segment.key}><i className={`diagnostic-${segment.tone}`} aria-hidden="true" />{segment.label}</span>)}</div>
    <div>{dimensions.map((dimension) => <DimensionRow key={dimension.id} dimension={dimension} onFinding={onFinding} />)}</div>
    <p className="diagnostic-map-note">Los segmentos representan controles, no porcentajes de protección. Las alertas corresponden a la evidencia de esta ejecución.</p>
  </section>;
}
