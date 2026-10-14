import { useState } from 'react';
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  LoaderCircle,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import { Modal } from '../ui/Modal';
import type { Proyecto } from '../../types/cloud';

interface ManageProjectModalProps {
  abierto: boolean;
  onCerrar: () => void;
  proyecto: Proyecto;
  onArchivar: () => Promise<void>;
  onEliminar: () => Promise<void>;
}

export function ManageProjectModal({
  abierto,
  onCerrar,
  proyecto,
  onArchivar,
  onEliminar,
}: ManageProjectModalProps) {
  const [tab, setTab] = useState<'archive' | 'delete'>('archive');
  const [confirmName, setConfirmName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isArchived = proyecto.status === 'archived';

  const handleArchive = async () => {
    setBusy(true);
    setError(null);
    try {
      await onArchivar();
      onCerrar();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (confirmName.trim() !== proyecto.name.trim()) {
      setError(`Debes escribir exactamente el nombre del proyecto "${proyecto.name}" para confirmar.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onEliminar();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <Modal abierto={abierto} onCerrar={onCerrar} titulo="Gestión del Proyecto">
      <div className="space-y-5 text-ink">
        {/* Tab selection */}
        <div className="flex rounded-2xl bg-canvas p-1 border border-line">
          <button
            type="button"
            onClick={() => {
              setTab('archive');
              setError(null);
            }}
            className={`flex-1 inline-flex items-center justify-center gap-2 rounded-xl py-2 text-xs font-bold transition-all cursor-pointer ${
              tab === 'archive'
                ? 'bg-card text-ink shadow-sm'
                : 'text-muted hover:text-ink'
            }`}
          >
            {isArchived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
            {isArchived ? 'Restaurar / Desarchivar' : 'Archivar proyecto'}
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('delete');
              setError(null);
            }}
            className={`flex-1 inline-flex items-center justify-center gap-2 rounded-xl py-2 text-xs font-bold transition-all cursor-pointer ${
              tab === 'delete'
                ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20 shadow-sm'
                : 'text-muted hover:text-rose-500'
            }`}
          >
            <Trash2 size={14} /> Eliminar definitivamente
          </button>
        </div>

        {error && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-400">
            <AlertTriangle size={14} className="mr-1.5 inline" /> {error}
          </div>
        )}

        {/* Tab 1: Archive (Recommended for Audit) */}
        {tab === 'archive' && (
          <div className="space-y-4 rounded-2xl border border-line bg-canvas/60 p-4 text-xs">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-500 border border-blue-500/20">
                {isArchived ? <ArchiveRestore size={18} /> : <Archive size={18} />}
              </div>
              <div className="space-y-1">
                <strong className="block text-sm text-ink">
                  {isArchived ? 'Restaurar proyecto activo' : '¿Por qué archivar en lugar de borrar?'}
                </strong>
                <p className="text-muted leading-relaxed">
                  {isArchived
                    ? 'El proyecto volverá a estar activo en el portafolio y listo para nuevas evaluaciones de seguridad.'
                    : 'En estándares como CIS, SOC 2 e ISO 27001, las evaluaciones históricas representan evidencia de cumplimiento. Al archivar, el proyecto se retira de la vista activa sin perder el historial ni los hallazgos.'}
                </p>
              </div>
            </div>

            <div className="border-t border-line/60 pt-3 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={onCerrar}
                className="rounded-xl border border-line px-4 py-2 text-xs font-semibold text-muted hover:text-ink cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleArchive}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-500 disabled:opacity-50 cursor-pointer shadow-md shadow-blue-600/30"
              >
                {busy && <LoaderCircle size={14} className="animate-spin" />}
                {isArchived ? 'Restaurar a Activo' : 'Confirmar Archivado'}
              </button>
            </div>
          </div>
        )}

        {/* Tab 2: Delete Permanently */}
        {tab === 'delete' && (
          <div className="space-y-4 rounded-2xl border border-rose-500/30 bg-rose-500/5 p-4 text-xs">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-500/20 text-rose-500 border border-rose-500/30">
                <ShieldAlert size={18} />
              </div>
              <div className="space-y-1">
                <strong className="block text-sm text-rose-500">
                  Zona de peligro: Eliminación permanente
                </strong>
                <p className="text-rose-400/90 leading-relaxed">
                  Esta acción no se puede deshacer. Se eliminarán permanentemente el proyecto, todas sus evaluaciones, artefactos, hallazgos y configuraciones programadas.
                </p>
              </div>
            </div>

            <div className="space-y-1.5 pt-2">
              <label className="block text-[11px] font-semibold text-muted">
                Escribe <strong className="text-ink font-mono">{proyecto.name}</strong> para confirmar:
              </label>
              <input
                type="text"
                value={confirmName}
                onChange={(e) => setConfirmName(e.target.value)}
                placeholder={proyecto.name}
                className="w-full rounded-xl border border-line bg-card px-3 py-2 text-xs text-ink placeholder:text-muted/50 focus:outline-none focus:border-rose-500 font-mono"
              />
            </div>

            <div className="border-t border-line/60 pt-3 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={onCerrar}
                className="rounded-xl border border-line px-4 py-2 text-xs font-semibold text-muted hover:text-ink cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={busy || confirmName.trim() !== proyecto.name.trim()}
                className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-500 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-md shadow-rose-600/30"
              >
                {busy && <LoaderCircle size={14} className="animate-spin" />}
                Eliminar definitivamente
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
