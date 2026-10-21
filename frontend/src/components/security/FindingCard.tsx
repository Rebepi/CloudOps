import { useState } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Copy,
  History,
  Shield,
  ShieldCheck,
  User,
  Wrench,
  X,
} from 'lucide-react';
import { api } from '../../lib/api';
import type { EstadoHallazgo, EventoHallazgo, HallazgoSeguridad } from '../../types/cloud';
import { detectAwsService } from './findingServiceHelper';
import { detectFindingLayer, findingLayerLabels, isRepositoryFinding } from './findingLayerHelper';

const severityStyle: Record<HallazgoSeguridad['severity'], string> = {
  CRITICAL: 'bg-rose-500/15 text-rose-500 border-rose-500/30 ring-1 ring-rose-500/20 font-black',
  HIGH: 'bg-orange-500/15 text-orange-500 border-orange-500/30 font-bold',
  MEDIUM: 'bg-amber-500/15 text-amber-500 border-amber-500/30 font-bold',
  LOW: 'bg-blue-500/15 text-blue-500 border-blue-500/30 font-semibold',
  INFORMATIONAL: 'bg-slate-500/15 text-slate-400 border-slate-500/30 font-medium',
};

const lifecycleLabel: Record<string, string> = {
  open: 'Abierto',
  in_progress: 'En tratamiento',
  resolved: 'Corregido',
  false_positive: 'Falso positivo',
  risk_accepted: 'Riesgo aceptado',
};

const lifecycleStyle: Record<string, string> = {
  open: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
  in_progress: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  resolved: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  false_positive: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  risk_accepted: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
};

const sourceLabel: Record<string, string> = {
  'security-hub': 'AWS Security Hub',
  'aws-config': 'AWS Config',
  'amazon-inspector': 'Amazon Inspector',
  osv: 'OSV Vulnerability DB',
  cloudops: 'CloudOps Engine',
};

export function FindingCard({
  finding,
  projectId,
  onUpdated,
}: {
  finding: HallazgoSeguridad;
  projectId: string;
  onUpdated: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [events, setEvents] = useState<EventoHallazgo[] | null>(null);
  const [showEvents, setShowEvents] = useState(false);
  const [copiedResource, setCopiedResource] = useState(false);
  const [draft, setDraft] = useState({
    status: (finding.status || 'open') as EstadoHallazgo,
    owner: finding.owner ?? '',
    dueDate: finding.dueDate ? finding.dueDate.slice(0, 10) : '',
    justification: finding.justification ?? '',
    comment: '',
  });

  const service = detectAwsService(finding);
  const layer = detectFindingLayer(finding);
  const isCritical = finding.severity === 'CRITICAL';
  const isHigh = finding.severity === 'HIGH';

  const toggleEvents = async () => {
    if (showEvents) return setShowEvents(false);
    setShowEvents(true);
    if (events) return;
    try {
      const result = await api<{ data: EventoHallazgo[] }>(
        `/projects/${projectId}/security/findings/${finding.id}/events`
      );
      setEvents(result.data);
    } catch {
      setEvents([]);
    }
  };

  const save = async (override?: Partial<typeof draft>) => {
    const payload = { ...draft, ...override };
    setSaving(true);
    try {
      await api(`/projects/${projectId}/security/findings/${finding.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: payload.status,
          owner: payload.owner,
          ...(payload.dueDate ? { dueDate: payload.dueDate } : {}),
          ...(payload.justification ? { justification: payload.justification } : {}),
          ...(payload.comment ? { comment: payload.comment } : {}),
        }),
      });
      setEditing(false);
      onUpdated();
    } finally {
      setSaving(false);
    }
  };

  const copyResource = async () => {
    if (!finding.resource) return;
    try {
      await navigator.clipboard.writeText(finding.resource);
      setCopiedResource(true);
      setTimeout(() => setCopiedResource(false), 2000);
    } catch {
      /* fallback */
    }
  };

  return (
    <div
      id={`finding-${finding.id}`}
      className={`rounded-2xl border transition-all duration-200 overflow-hidden ${
        isCritical
          ? 'border-rose-500/40 bg-gradient-to-r from-rose-950/20 via-card to-card shadow-sm ring-1 ring-rose-500/15'
          : isHigh
          ? 'border-orange-500/30 bg-card hover:border-orange-500/40'
          : 'border-line bg-card hover:border-line-2'
      }`}
    >
      <div className="p-4 sm:p-5">
        {/* Top bar with Service, Severity, Lifecycle */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div className="space-y-1.5 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {/* Service Chip */}
              <span
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${service.badgeClass}`}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: service.dotColor }} />
                {service.shortName}
              </span>

              {isRepositoryFinding(finding) && (
                <span className="rounded-md border border-violet-500/25 bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-bold text-violet-400">
                  {findingLayerLabels[layer]}
                </span>
              )}

              {/* Source tag */}
              <span className="text-[10px] text-muted">
                vía {sourceLabel[finding.source] ?? finding.source}
              </span>

              {finding.framework && (
                <span className="rounded-md bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-medium text-blue-400 border border-blue-500/20">
                  {finding.framework}
                </span>
              )}
            </div>

            <h4 className="text-sm sm:text-base font-bold text-ink tracking-tight flex items-center gap-2">
              {isCritical && <AlertOctagon size={16} className="text-rose-500 shrink-0" />}
              {finding.title}
            </h4>

            {finding.description && (
              <p className="text-xs text-muted leading-relaxed line-clamp-2">
                {finding.description}
              </p>
            )}
          </div>

          <div className="flex shrink-0 items-center sm:flex-col sm:items-end gap-1.5">
            <span className={`rounded-xl border px-2.5 py-1 text-[10px] uppercase tracking-wider ${severityStyle[finding.severity]}`}>
              {finding.severity}
            </span>
            <span className={`rounded-xl border px-2.5 py-0.5 text-[10px] font-medium ${lifecycleStyle[finding.status] ?? lifecycleStyle.open}`}>
              {lifecycleLabel[finding.status] ?? finding.status}
            </span>
          </div>
        </div>

        {/* Recommendation Box */}
        {finding.recommendation && (
          <div className="mt-3.5 rounded-xl border border-blue-500/15 bg-blue-500/5 p-3 text-xs">
            <div className="flex items-start gap-2">
              <ShieldCheck size={15} className="mt-0.5 shrink-0 text-blue-500" />
              <div className="min-w-0">
                <strong className="font-semibold text-blue-400">Remediación recomendada:</strong>{' '}
                <span className="text-ink/90 leading-relaxed">{finding.recommendation}</span>
              </div>
            </div>
          </div>
        )}

        {/* Resource info & metadata footer */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line/60 pt-3 text-[11px] text-muted">
          <div className="flex flex-wrap items-center gap-3">
            {finding.resource && (
              <div className="flex items-center gap-1 font-mono text-[10.5px]">
                <span className="opacity-70">Recurso:</span>
                <span className="rounded bg-canvas px-1.5 py-0.5 text-ink max-w-[200px] sm:max-w-[340px] truncate" title={finding.resource}>
                  {finding.resource}
                </span>
                <button
                  type="button"
                  onClick={copyResource}
                  title="Copiar recurso"
                  className="text-muted hover:text-ink cursor-pointer p-0.5"
                >
                  <Copy size={12} className={copiedResource ? 'text-emerald-500' : ''} />
                </button>
              </div>
            )}
            {finding.owner && (
              <span className="inline-flex items-center gap-1 text-ink">
                <User size={12} className="text-muted" /> {finding.owner}
              </span>
            )}
            {finding.dueDate && (
              <span className="inline-flex items-center gap-1 text-ink">
                <Calendar size={12} className="text-muted" /> Límite: {finding.dueDate.slice(0, 10)}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setEditing(!editing)}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-500 hover:text-blue-400 cursor-pointer transition-colors"
            >
              <Wrench size={13} />
              {editing ? 'Cerrar gestión' : 'Gestionar hallazgo'}
            </button>
            <button
              type="button"
              onClick={() => void toggleEvents()}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted hover:text-ink cursor-pointer transition-colors"
            >
              <History size={13} />
              {showEvents ? 'Ocultar historial' : 'Historial de auditoría'}
            </button>
          </div>
        </div>

        {/* Management Form Panel */}
        {editing && (
          <div className="mt-4 rounded-2xl border border-blue-500/25 bg-blue-500/5 p-4 sm:p-5 space-y-4 animate-fade-in">
            <div className="flex items-center justify-between border-b border-blue-500/20 pb-2">
              <h5 className="text-xs font-bold uppercase tracking-wider text-blue-400 flex items-center gap-1.5">
                <Shield size={14} /> Gestión de ciclo de vida del hallazgo
              </h5>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="text-muted hover:text-ink cursor-pointer"
              >
                <X size={15} />
              </button>
            </div>

            {/* Quick 1-click status shortcuts */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted mb-2">
                Acciones rápidas de auditoría:
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void save({ status: 'resolved' })}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-50 cursor-pointer transition-colors"
                >
                  <CheckCircle2 size={13} /> Marcar como Corregido
                </button>
                <button
                  type="button"
                  onClick={() => void save({ status: 'risk_accepted' })}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-violet-500/30 bg-violet-500/10 px-3 py-1.5 text-xs font-bold text-violet-400 hover:bg-violet-500/20 disabled:opacity-50 cursor-pointer transition-colors"
                >
                  <Shield size={13} /> Aceptar Riesgo (Excepción)
                </button>
                <button
                  type="button"
                  onClick={() => void save({ status: 'false_positive' })}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-bold text-amber-400 hover:bg-amber-500/20 disabled:opacity-50 cursor-pointer transition-colors"
                >
                  <AlertTriangle size={13} /> Falso Positivo
                </button>
              </div>
            </div>

            {/* Detailed fields */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-muted mb-1">Estado Formal</label>
                <select
                  value={draft.status}
                  onChange={(e) => setDraft({ ...draft, status: e.target.value as EstadoHallazgo })}
                  className="w-full rounded-xl border border-line bg-card px-3 py-2 text-xs text-ink focus:outline-none focus:border-blue-500"
                >
                  {Object.entries(lifecycleLabel).map(([val, label]) => (
                    <option key={val} value={val}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-muted mb-1">Responsable Asignado</label>
                <input
                  type="text"
                  value={draft.owner}
                  onChange={(e) => setDraft({ ...draft, owner: e.target.value })}
                  placeholder="ej. devsecops@empresa.com"
                  className="w-full rounded-xl border border-line bg-card px-3 py-2 text-xs text-ink focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-muted mb-1">Fecha Límite (SLA)</label>
                <input
                  type="date"
                  value={draft.dueDate}
                  onChange={(e) => setDraft({ ...draft, dueDate: e.target.value })}
                  className="w-full rounded-xl border border-line bg-card px-3 py-2 text-xs text-ink focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-muted mb-1">
                Justificación Técnica (requerida para Riesgo Aceptado o Falso Positivo)
              </label>
              <textarea
                value={draft.justification}
                onChange={(e) => setDraft({ ...draft, justification: e.target.value })}
                rows={2}
                placeholder="Indica el control compensatorio o motivo por el que no aplica..."
                className="w-full rounded-xl border border-line bg-card px-3 py-2 text-xs text-ink focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-muted mb-1">
                Nota de Bitácora / Comentario
              </label>
              <input
                type="text"
                value={draft.comment}
                onChange={(e) => setDraft({ ...draft, comment: e.target.value })}
                placeholder="Comentario sobre el avance de la remediación..."
                className="w-full rounded-xl border border-line bg-card px-3 py-2 text-xs text-ink focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => void save()}
                disabled={saving}
                className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-md hover:bg-blue-500 disabled:opacity-50 cursor-pointer transition-all"
              >
                {saving ? 'Guardando…' : 'Guardar Cambios'}
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="rounded-xl border border-line px-4 py-2 text-xs font-semibold text-muted hover:text-ink cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Audit Event Timeline */}
        {showEvents && (
          <div className="mt-4 rounded-2xl border border-line bg-canvas p-4 sm:p-5 space-y-3 animate-fade-in">
            <h5 className="text-xs font-bold uppercase tracking-wider text-muted flex items-center gap-1.5 border-b border-line pb-2">
              <History size={14} /> Historial y Trazabilidad del Hallazgo
            </h5>

            {events === null && (
              <p className="py-2 text-xs text-muted">Cargando eventos de auditoría…</p>
            )}

            {events && !events.length && (
              <p className="py-2 text-xs text-muted">Sin cambios de estado ni comentarios registrados.</p>
            )}

            {events && events.length > 0 && (
              <div className="relative pl-6 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-line">
                {events.map((event) => (
                  <div key={event.id} className="relative text-xs">
                    <span className="absolute -left-6 top-1 h-2.5 w-2.5 rounded-full border-2 border-card bg-blue-500 ring-2 ring-blue-500/20" />
                    <div className="flex flex-wrap items-center gap-2">
                      <strong className="font-semibold text-ink">{event.eventType}</strong>
                      {event.toStatus && (
                        <span className="inline-flex items-center gap-1 rounded bg-canvas px-1.5 py-0.5 text-[10px] text-blue-400 font-semibold border border-line">
                          → {lifecycleLabel[event.toStatus] ?? event.toStatus}
                        </span>
                      )}
                      {event.actor && (
                        <span className="text-[11px] text-muted font-medium">por {event.actor}</span>
                      )}
                      <span className="text-[10px] text-muted/70 ml-auto">
                        {new Date(event.createdAt).toLocaleString('es-PE')}
                      </span>
                    </div>

                    {event.justification && (
                      <p className="mt-1 rounded-lg bg-card/80 p-2 text-[11px] text-ink border border-line">
                        <strong className="text-muted">Justificación:</strong> {event.justification}
                      </p>
                    )}

                    {event.comment && (
                      <p className="mt-1 text-[11px] italic text-muted">
                        "{event.comment}"
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
