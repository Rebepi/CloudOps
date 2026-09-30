import { useState } from 'react';
import { X, Printer, FileDown, Settings, Eye, CheckSquare, Square, Building2, User, Sparkles } from 'lucide-react';
import { ExecutiveReportDocument, type ReportConfig } from './ExecutiveReportDocument';

interface ReportModalProps {
  abierto: boolean;
  onCerrar: () => void;
}

export function ReportModal({ abierto, onCerrar }: ReportModalProps) {
  const [config, setConfig] = useState<ReportConfig>({
    empresa: '',
    autor: '',
    cargo: '',
    incluirResumen: true,
    incluirPropuesta: true,
    incluirFinOps: true,
    incluirSeguridad: true,
    incluirRed: true,
    incluirServicios: true,
    notasAdicionales: '',
  });

  const [pestanaActiva, setPestanaActiva] = useState<'preview' | 'config'>('preview');

  if (!abierto) return null;

  const handlePrint = () => {
    const docElement = document.getElementById('executive-report-document');
    if (!docElement) {
      window.print();
      return;
    }

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) {
      window.print();
      return;
    }

    const styleTags = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
      .map((el) => el.outerHTML)
      .join('\n');

    doc.open();
    doc.write(`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title></title>
${styleTags}
<style>
@page {
  size: A4 portrait;
  margin: 0 !important;
}
* {
  -webkit-print-color-adjust: exact !important;
  print-color-adjust: exact !important;
  box-sizing: border-box;
}
html, body {
  background-color: #ffffff !important;
  background: #ffffff !important;
  color: #0f172a !important;
  margin: 0 !important;
  padding: 0 !important;
  width: 100% !important;
  height: auto !important;
  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
}
.print-layout-table {
  width: 100% !important;
  border-collapse: collapse !important;
  border-spacing: 0 !important;
  border: none !important;
  margin: 0 !important;
  padding: 0 !important;
}
.print-layout-thead {
  display: table-header-group !important;
}
.print-layout-tfoot {
  display: table-footer-group !important;
}
.print-header-space {
  height: 12mm !important;
  border: none !important;
  padding: 0 !important;
  margin: 0 !important;
}
.print-footer-space {
  height: 10mm !important;
  border: none !important;
  padding: 0 !important;
  margin: 0 !important;
}
.print-content-cell {
  border: none !important;
  padding: 0 14mm !important;
  margin: 0 !important;
  vertical-align: top !important;
}
#executive-report-document {
  width: 100% !important;
  max-width: 100% !important;
  padding: 0 !important;
  margin: 0 auto !important;
  box-shadow: none !important;
  border: none !important;
  border-radius: 0 !important;
}
.print-avoid-break {
  break-inside: avoid !important;
  page-break-inside: avoid !important;
}
tr {
  break-inside: avoid !important;
  page-break-inside: avoid !important;
}
</style>
</head>
<body style="background-color: #ffffff !important; margin: 0; padding: 0;">
<table class="print-layout-table">
  <thead class="print-layout-thead">
    <tr>
      <th class="print-header-space"></th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td class="print-content-cell">
        ${docElement.outerHTML}
      </td>
    </tr>
  </tbody>
  <tfoot class="print-layout-tfoot">
    <tr>
      <td class="print-footer-space"></td>
    </tr>
  </tfoot>
</table>
</body>
</html>`);
    doc.close();

    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => {
        try {
          document.body.removeChild(iframe);
        } catch {}
      }, 3000);
    }, 350);
  };

  const toggleSeccion = (campo: keyof ReportConfig) => {
    setConfig((prev) => ({
      ...prev,
      [campo]: !prev[campo],
    }));
  };

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-slate-950/80 backdrop-blur-md overflow-hidden animate-fade-in print:relative print:z-auto print:bg-white print:overflow-visible print:inset-auto">
      <div className="no-print border-b border-white/10 bg-slate-900/90 px-4 sm:px-6 py-3 shrink-0 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-8 w-8 sm:h-9 sm:w-9 shrink-0 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 grid place-items-center text-white shadow-md">
              <FileDown size={16} />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <h2 className="text-xs sm:text-base font-bold text-white leading-tight">Reporte del escenario de arquitectura</h2>
                <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30 shrink-0">
                  PDF READY
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">
                Documento imprimible con datos consultados de AWS y planes guardados localmente.
              </p>
            </div>
          </div>
          <button
            onClick={onCerrar}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-xl text-slate-400 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
            aria-label="Cerrar modal"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center bg-slate-800 p-0.5 rounded-lg border border-white/10 text-xs flex-1 sm:flex-none">
            <button
              onClick={() => setPestanaActiva('preview')}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors ${
                pestanaActiva === 'preview'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Eye size={13} />
              <span>Vista Previa</span>
            </button>
            <button
              onClick={() => setPestanaActiva('config')}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors ${
                pestanaActiva === 'config'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Settings size={13} />
              <span>Configuración</span>
            </button>
          </div>

          <button
            onClick={handlePrint}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-3 sm:px-4 py-2 text-xs font-bold text-white shadow-lg hover:from-blue-500 hover:to-indigo-500 transition-all hover:scale-105 active:scale-95 cursor-pointer shrink-0"
            title="Imprimir o guardar como PDF"
          >
            <Printer size={14} />
            <span className="hidden sm:inline">Guardar como PDF / Imprimir</span>
            <span className="sm:hidden">PDF</span>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-slate-900/50 p-4 sm:p-8 print:p-0 print:m-0 print:bg-white print:overflow-visible">
        {pestanaActiva === 'config' && (
          <div className="no-print max-w-2xl mx-auto rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl space-y-6 animate-fade-up">
            <div className="flex items-center gap-2 pb-3 border-b border-white/10">
              <Sparkles className="text-blue-400" size={18} />
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">Personalización del Informe</h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  <Building2 size={13} className="inline mr-1 text-slate-400" />
                  Nombre de la Organización / Empresa
                </label>
                <input
                  type="text"
                  value={config.empresa}
                  onChange={(e) => setConfig({ ...config, empresa: e.target.value })}
                  className="w-full rounded-xl border border-white/10 bg-slate-800/80 px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  <User size={13} className="inline mr-1 text-slate-400" />
                  Autor / Líder Técnico
                </label>
                <input
                  type="text"
                  value={config.autor}
                  onChange={(e) => setConfig({ ...config, autor: e.target.value })}
                  className="w-full rounded-xl border border-white/10 bg-slate-800/80 px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Cargo / Rol Profesional
              </label>
              <input
                type="text"
                value={config.cargo}
                onChange={(e) => setConfig({ ...config, cargo: e.target.value })}
                className="w-full rounded-xl border border-white/10 bg-slate-800/80 px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <span className="block text-xs font-semibold text-slate-300 mb-2">Secciones a Incluir en el PDF:</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {[
                  { key: 'incluirResumen', label: '1. Resumen Ejecutivo (KPIs)' },
                  { key: 'incluirPropuesta', label: '2. Propuesta Well-Architected' },
                  { key: 'incluirFinOps', label: '3. Desglose FinOps y Gráficos' },
                  { key: 'incluirSeguridad', label: '4. Seguridad, IAM y Cumplimiento' },
                  { key: 'incluirRed', label: '5. Arquitectura de Red (VPC)' },
                  { key: 'incluirServicios', label: '6. Inventario de Servicios AWS' },
                ].map(({ key, label }) => {
                  const activa = Boolean(config[key as keyof ReportConfig]);
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => toggleSeccion(key as keyof ReportConfig)}
                      className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-xs font-medium transition-all text-left cursor-pointer ${
                        activa
                          ? 'border-blue-500/40 bg-blue-500/10 text-white'
                          : 'border-white/5 bg-slate-800/50 text-slate-400'
                      }`}
                    >
                      {activa ? (
                        <CheckSquare size={16} className="text-blue-400 shrink-0" />
                      ) : (
                        <Square size={16} className="text-slate-500 shrink-0" />
                      )}
                      <span>{label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Observaciones o Conclusiones Técnicas
              </label>
              <textarea
                rows={3}
                value={config.notasAdicionales}
                onChange={(e) => setConfig({ ...config, notasAdicionales: e.target.value })}
                className="w-full rounded-xl border border-white/10 bg-slate-800/80 p-3 text-xs text-white focus:outline-none focus:border-blue-500 resize-none"
              />
            </div>

            <div className="pt-2 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setPestanaActiva('preview')}
                className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-500 transition-colors cursor-pointer"
              >
                Ver Documento Actualizado
              </button>
            </div>
          </div>
        )}

        <div className={`my-4 print:m-0 print:p-0 print:overflow-visible ${pestanaActiva === 'config' ? 'hidden print:block' : 'block'}`}>
          <div className="sm:hidden w-full overflow-x-auto pb-2">
            <div style={{ width: '794px', transformOrigin: 'top left', transform: `scale(${Math.min(1, (typeof window !== 'undefined' ? window.innerWidth - 32 : 360) / 794)})`, display: 'block' }}>
              <div className="rounded-2xl overflow-hidden shadow-2xl border border-slate-300 print:border-none print:shadow-none print:m-0 print:p-0 print:rounded-none print:overflow-visible">
                <ExecutiveReportDocument config={config} />
              </div>
            </div>
          </div>
          <div className="hidden sm:block mx-auto">
            <div className="rounded-2xl overflow-hidden shadow-2xl border border-slate-300 print:border-none print:shadow-none print:m-0 print:p-0 print:rounded-none print:overflow-visible">
              <ExecutiveReportDocument config={config} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
