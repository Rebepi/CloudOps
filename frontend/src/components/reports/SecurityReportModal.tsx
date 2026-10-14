import { FileText, Printer, X } from 'lucide-react';
import type { ComparacionEvaluacion, EvaluacionSeguridad, Proyecto } from '../../types/cloud';
import { printElement } from '../../lib/print';
import { SecurityReportDocument } from './SecurityReportDocument';

export function SecurityReportModal({ abierto, onCerrar, proyecto, evaluacion, comparacion }: {
  abierto: boolean; onCerrar: () => void; proyecto: Proyecto; evaluacion: EvaluacionSeguridad; comparacion: ComparacionEvaluacion | null;
}) {
  if (!abierto) return null;

  const assessmentTypeText =
    evaluacion.assessmentType === 'code'
      ? 'Código / ZIP'
      : evaluacion.assessmentType === 'full'
      ? 'Evaluación Completa (AWS + Código)'
      : 'Auditoría Cuenta AWS';

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6 md:p-8 bg-slate-950/80 backdrop-blur-md overflow-hidden animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCerrar();
      }}
    >
      <div className="relative flex flex-col w-full max-w-4xl max-h-[86vh] rounded-2xl sm:rounded-3xl bg-slate-900 border border-slate-700/70 shadow-2xl shadow-black/60 overflow-hidden">
        {/* Modal Top Bar */}
        <div className="flex items-center justify-between gap-3 border-b border-slate-800 bg-slate-900/95 px-5 py-3.5 sm:px-6 sm:py-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30">
              <FileText size={18} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white truncate">Informe de Seguridad Ejecutivo</h3>
                <span className="hidden sm:inline-flex rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-[10px] font-semibold text-blue-300">
                  {proyecto.environment}
                </span>
              </div>
              <p className="text-xs text-slate-400 truncate">
                {proyecto.name} · <span className="text-slate-300">{assessmentTypeText}</span> · Región: {evaluacion.region}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => printElement('security-report-document')}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white shadow-lg shadow-blue-600/30 hover:bg-blue-500 active:scale-95 transition-all cursor-pointer"
            >
              <Printer size={15} />
              <span className="hidden xs:inline">Imprimir / Guardar PDF</span>
            </button>
            <button
              onClick={onCerrar}
              aria-label="Cerrar modal"
              className="rounded-xl border border-slate-700/80 bg-slate-800/60 p-2 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X size={17} />
            </button>
          </div>
        </div>

        {/* Modal Body / Paper Sheet Preview */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-6 md:p-8 bg-slate-950/70 scrollbar-thin">
          <div className="mx-auto max-w-3xl rounded-xl bg-white p-6 sm:p-10 md:p-12 shadow-2xl ring-1 ring-black/10 text-slate-900">
            <SecurityReportDocument proyecto={proyecto} evaluacion={evaluacion} comparacion={comparacion} />
          </div>
        </div>
      </div>
    </div>
  );
}

