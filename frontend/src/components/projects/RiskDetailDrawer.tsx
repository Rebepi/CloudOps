import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, Check, ChevronDown, Cloud, Code2, History, Save, Wrench, X } from 'lucide-react';
import { api } from '../../lib/api';
import type { EventoHallazgo, HallazgoSeguridad } from '../../types/cloud';
import { diagnosticDimensions } from '../../lib/diagnosticPresentation';
import { layerOfRisk, riskLayers, riskSources, riskStates } from '../../lib/riskPresentation';
import { isScoredFinding, severityNames } from '../../lib/securityPresentation';
import { FindingObservations } from '../security/FindingObservations';

type Props = { finding: HallazgoSeguridad; projectId: string; onClose: () => void; onUpdated: () => void; onPrevious?: () => void; onNext?: () => void };
const eventNames: Record<string, string> = { created: 'Hallazgo registrado', updated: 'Seguimiento actualizado', commented: 'Comentario', assigned: 'Responsable actualizado', resolved: 'Marcado como resuelto', reopened: 'Reabierto', risk_accepted: 'Riesgo aceptado', false_positive: 'Falso positivo', status_changed: 'Cambio de estado', recurring: 'Detectado de nuevo' };
const safeReference = (value: unknown) => typeof value === 'string' && /^https:\/\/(?:osv\.dev|nvd\.nist\.gov|avd\.aquasec\.com|docs\.aws\.amazon\.com|trivy\.dev|github\.com\/advisories)\//.test(value) ? value : null;

export function RiskDetailDrawer({ finding, projectId, onClose, onUpdated, onPrevious, onNext }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [editing, setEditing] = useState(false);
  const initial = { status: finding.status in riskStates ? finding.status : 'open', owner: finding.owner ?? '', dueDate: finding.dueDate?.slice(0, 10) ?? '', justification: finding.justification ?? '', comment: '' };
  const [draft, setDraft] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [discard, setDiscard] = useState<(() => void) | null>(null);
  const [events, setEvents] = useState<EventoHallazgo[] | null>(null);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState('');
  const dirty = editing && JSON.stringify(draft) !== JSON.stringify(initial);
  const requiresJustification = ['risk_accepted', 'false_positive'].includes(draft.status);
  const request = (action: () => void) => { if (saving) return; if (dirty) setDiscard(() => action); else action(); };
  useEffect(() => {
    const element = dialog.current!;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    if (typeof element.showModal === 'function') element.showModal(); else element.setAttribute('open', '');
    element.querySelector<HTMLButtonElement>('[aria-label="Cerrar detalle del riesgo"]')?.focus();
    return () => { element.close?.(); document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  const loadEvents = async () => {
    setEventsLoading(true); setEventsError('');
    try { const result = await api<{ data: EventoHallazgo[] }>(`/projects/${projectId}/security/findings/${finding.id}/events`); setEvents(result.data); }
    catch (cause) { setEventsError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setEventsLoading(false); }
  };
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(''); setNotice('');
    if (requiresJustification && !draft.justification.trim()) { setError('Explica el motivo antes de aceptar el riesgo o registrar un falso positivo.'); return; }
    setSaving(true);
    try {
      await api(`/projects/${projectId}/security/findings/${finding.id}`, { method: 'PATCH', body: JSON.stringify({ status: draft.status, owner: draft.owner.trim(), justification: draft.justification.trim(), ...(draft.dueDate ? { dueDate: draft.dueDate } : {}), ...(draft.comment.trim() ? { comment: draft.comment.trim() } : {}) }) });
      setEditing(false); setEvents(null); if (events !== null) void loadEvents(); setNotice('Seguimiento guardado. La corrección técnica se comprueba con una nueva evaluación.'); onUpdated();
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setSaving(false); }
  };
  const location = layerOfRisk(finding);
  const SourceIcon = location === 'aws' ? Cloud : Code2;
  const proof = [
    ['Ubicación o recurso', finding.resource], ['Paquete', finding.evidence.package], ['Versión observada', finding.evidence.version],
    ['Versión corregida informada', finding.evidence.fixedVersion], ['Aviso', finding.evidence.advisory], ['Línea', finding.evidence.line],
    ['Regla', finding.evidence.ruleId], ['Política', finding.evidence.policyId],
  ].filter(([, value]) => typeof value === 'string' && value.length > 0 || typeof value === 'number');
  const reference = safeReference(finding.evidence.advisoryUrl) ?? safeReference(finding.evidence.policyUrl);
  return createPortal(<dialog ref={dialog} className="risk-drawer" aria-labelledby="risk-detail-title" onCancel={(event) => { event.preventDefault(); request(onClose); }} onClick={(event) => { if (event.target === event.currentTarget) { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) request(onClose); } }}>
    <div className="risk-drawer-heading"><span>Detalle del hallazgo</span><div><button type="button" aria-label="Riesgo anterior" disabled={!onPrevious || saving} onClick={() => onPrevious && request(onPrevious)}><ArrowLeft size={18} aria-hidden="true" /></button><button type="button" aria-label="Riesgo siguiente" disabled={!onNext || saving} onClick={() => onNext && request(onNext)}><ArrowRight size={18} aria-hidden="true" /></button><button type="button" aria-label="Cerrar detalle del riesgo" disabled={saving} onClick={() => request(onClose)}><X size={20} aria-hidden="true" /></button></div></div>
    <div className="risk-drawer-body">
      {discard && <div className="risk-discard" role="alert"><strong>Hay cambios sin guardar.</strong><p>¿Quieres descartarlos para continuar?</p><div><button type="button" className="diagnostic-secondary" onClick={() => setDiscard(null)}>Seguir editando</button><button type="button" className="diagnostic-primary" onClick={() => discard()}>Descartar cambios</button></div></div>}
      <div className="risk-detail-meta"><span className="risk-severity" data-severity={finding.severity}>{severityNames[finding.severity]}</span><span>{riskStates[finding.status] ?? finding.status}</span>{!isScoredFinding(finding) && <span>Contexto · fuera del puntaje</span>}</div>
      <h2 id="risk-detail-title">{finding.title}</h2>
      <p className="risk-detail-origin"><SourceIcon size={16} aria-hidden="true" />{location === 'aws' ? 'Cuenta AWS' : `Código · ${riskLayers[location]}`}<span>{riskSources[finding.source] ?? finding.source}</span></p>
      {location === 'aws' && <p className="risk-scope-note">Observado en la cuenta evaluada. Su pertenencia al repositorio no está demostrada automáticamente.</p>}
      {notice && <p role="status" className="risk-notice"><Check size={16} aria-hidden="true" />{notice}</p>}
      <section className="risk-detail-section"><h3>Qué se encontró</h3><p>{finding.description || 'El analizador no aportó una descripción adicional. Revisa la evidencia registrada.'}</p>{finding.priority && <details><summary>Por qué aparece en este orden<ChevronDown size={14} aria-hidden="true" /></summary><p>Se ordena por gravedad y prioridad de remediación registrada ({finding.priority.rank}). No es una probabilidad de explotación.</p><ul>{finding.priority.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></details>}</section>
      <section className="risk-detail-section"><h3>Dónde se encontró</h3>{proof.length ? <dl className="risk-proof">{proof.map(([label, value]) => <div key={String(label)}><dt>{String(label)}</dt><dd>{String(value)}</dd></div>)}</dl> : <p>No hay ubicación o componente identificado en la evidencia guardada.</p>}</section>
      <section className="risk-detail-section"><h3>Cómo corregirlo</h3><p>{finding.recommendation || 'No hay una corrección específica informada. Requiere revisión técnica.'}</p>{finding.source === 'gitleaks' && <p>La firma detectada no demuestra que la credencial siga activa.</p>}{reference && <a href={reference} target="_blank" rel="noopener noreferrer">Consultar referencia original</a>}</section>
      <section className="risk-detail-section"><h3>Cómo comprobar la corrección</h3><p>{typeof finding.evidence.verification === 'string' ? finding.evidence.verification : 'No hay un criterio específico de verificación guardado. Contrasta la corrección con la fuente y vuelve a evaluar el mismo alcance con una metodología compatible.'}</p><p className="risk-scope-note">Marcar como resuelto registra una decisión de seguimiento; no ejecuta otra prueba ni recalcula el índice.</p></section>
      <FindingObservations evidence={finding.evidence} />
      <details className="risk-technical"><summary>Identificadores y referencias técnicas</summary><dl className="risk-proof"><div><dt>Identificador</dt><dd>{finding.id}</dd></div>{finding.externalId && <div><dt>ID del proveedor</dt><dd>{finding.externalId}</dd></div>}{finding.framework && <div><dt>Marco relacionado · no acredita cumplimiento</dt><dd>{finding.framework}</dd></div>}<div><dt>Dimensión</dt><dd>{diagnosticDimensions.find((dimension) => dimension.id === finding.dimension)?.label ?? 'Sin clasificar'}</dd></div></dl></details>
      <section className="risk-detail-section"><div className="risk-followup-heading"><h3>Seguimiento</h3>{!editing && <button type="button" className="diagnostic-secondary" onClick={() => { setDraft(initial); setError(''); setEditing(true); }}><Wrench size={15} aria-hidden="true" />Actualizar seguimiento</button>}</div>
        {!editing && <dl className="risk-proof"><div><dt>Responsable</dt><dd>{finding.owner || 'Sin asignar'}</dd></div><div><dt>Fecha objetivo</dt><dd>{finding.dueDate?.slice(0, 10) || 'Sin fecha'}</dd></div>{finding.justification && <div><dt>Justificación registrada</dt><dd>{finding.justification}</dd></div>}</dl>}
        {editing && <form onSubmit={(event) => void save(event)} aria-busy={saving}><fieldset disabled={saving} className="risk-followup-form">
          <label>Estado<select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}>{Object.entries(riskStates).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <label>Responsable<input name="risk-owner" autoComplete="off" value={draft.owner} maxLength={160} onChange={(event) => setDraft({ ...draft, owner: event.target.value })} /></label>
          <label>Fecha objetivo<input type="date" name="risk-date" value={draft.dueDate} onChange={(event) => setDraft({ ...draft, dueDate: event.target.value })} />{finding.dueDate && <small>Dejar vacío conserva la fecha registrada.</small>}</label>
          <label className="risk-form-full">Justificación{requiresJustification ? ' (obligatoria)' : ''}<textarea name="risk-justification" required={requiresJustification} maxLength={4000} value={draft.justification} onChange={(event) => setDraft({ ...draft, justification: event.target.value })} /></label>
          <label className="risk-form-full">Comentario<textarea name="risk-comment" maxLength={4000} value={draft.comment} onChange={(event) => setDraft({ ...draft, comment: event.target.value })} /></label>
          {error && <p role="alert" className="risk-form-full risk-error">{error}</p>}
          <div className="risk-form-actions risk-form-full"><button type="submit" disabled={saving} className="diagnostic-primary"><Save size={16} aria-hidden="true" />{saving ? 'Guardando…' : 'Guardar seguimiento'}</button><button type="button" disabled={saving} className="diagnostic-secondary" onClick={() => request(() => { setDraft(initial); setEditing(false); setDiscard(null); })}>Cancelar</button></div>
        </fieldset></form>}
      </section>
      <details className="risk-history" onToggle={(event) => { if (event.target === event.currentTarget && event.currentTarget.open && events === null && !eventsLoading) void loadEvents(); }}><summary><History size={16} aria-hidden="true" />Historial de seguimiento</summary>{eventsLoading && <p role="status">Consultando eventos…</p>}{eventsError && <p role="alert" className="risk-error">{eventsError}<button type="button" onClick={() => void loadEvents()}>Reintentar</button></p>}{events && !events.length && <p>No hay eventos registrados.</p>}<ol>{events?.map((event) => <li key={event.id}><strong>{eventNames[event.eventType] ?? event.eventType}</strong>{event.toStatus && <span>{riskStates[event.toStatus] ?? event.toStatus}</span>}<time dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleString('es-PE')}</time>{event.actor && <p>{event.actor}</p>}{event.comment && <p>{event.comment}</p>}{event.justification && <p>{event.justification}</p>}</li>)}</ol></details>
    </div>
  </dialog>, document.body);
}
