import { useState } from 'react';
import {
  Printer,
  Download,
  Copy,
  Check,
  FileText,
  FileCode,
  ShieldCheck,
  Layers,
  Database,
  Network,
  DollarSign,
  Clock,
  Users,
  Globe,
  Sparkles,
  CheckCircle2,
  TrendingUp,
  BarChart3,
  Zap,
  Calendar,
  FileSpreadsheet,
  Lock,
} from 'lucide-react';
import { Modal } from './ui/Modal';
import {
  calcularMetricasPropuesta,
  generarTerraformCode,
  generarMarkdownRFC,
  generarCsvPropuesta,
  generarHtmlImpresion,
} from '../lib/planningHelpers';
import { usd, numero, fecha } from '../lib/format';
import type { PropuestaCloud } from '../types/cloud';

interface Props {
  propuesta: PropuestaCloud | null;
  abierto: boolean;
  onCerrar: () => void;
}

type TabType =
  | 'resumen'
  | 'topologia'
  | 'finops'
  | 'wellArchitected'
  | 'seguridad'
  | 'roadmap'
  | 'terraform';

export function ProposalDetailModal({ propuesta, abierto, onCerrar }: Props) {
  const [tabActiva, setTabActiva] = useState<TabType>('resumen');
  const [copiadoTerraform, setCopiadoTerraform] = useState(false);
  const [copiadoResumen, setCopiadoResumen] = useState(false);

  if (!propuesta) return null;

  const metricas = calcularMetricasPropuesta(propuesta);

  const imprimirInforme = () => {
    const htmlContenido = generarHtmlImpresion(propuesta, metricas);
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

    doc.open();
    doc.write(htmlContenido);
    doc.close();

    iframe.onload = () => {
      setTimeout(() => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        setTimeout(() => {
          document.body.removeChild(iframe);
        }, 2000);
      }, 300);
    };
  };

  const descargarJson = () => {
    const payload = {
      propuesta,
      metricasCalculadas: metricas,
      fechaExportacion: new Date().toISOString(),
      versionSchema: '2.0-full-architecture',
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `plan-cloud-${propuesta.nombre.toLowerCase().replace(/[^a-z0-9]/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const descargarMarkdown = () => {
    const md = generarMarkdownRFC(propuesta, metricas);
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `RFC-Arquitectura-${propuesta.nombre.toLowerCase().replace(/[^a-z0-9]/g, '-')}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const descargarCsv = () => {
    const csv = generarCsvPropuesta(propuesta, metricas);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `servicios-costos-${propuesta.nombre.toLowerCase().replace(/[^a-z0-9]/g, '-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copiarTerraform = async () => {
    const tf = generarTerraformCode(propuesta, metricas);
    await navigator.clipboard.writeText(tf);
    setCopiadoTerraform(true);
    setTimeout(() => setCopiadoTerraform(false), 2500);
  };

  const copiarResumenEjecutivo = async () => {
    const texto = `Propuesta Cloud: ${propuesta.nombre}
Tipo: ${propuesta.tipoAplicacion} | Región: ${propuesta.regionId} (${metricas.nombreRegion})
SLA: ${propuesta.disponibilidad.toUpperCase()} (${metricas.slaDetalle.porcentaje})
Usuarios previstos: ${numero(propuesta.usuariosEstimados)} concurrentes
RTO: ${metricas.drpDetalle.rtoHoras}h máx | RPO: ${metricas.drpDetalle.rpoMinutos}m máx
Presupuesto: ${usd(metricas.presupuestoMaximo)}/m | Costo Estimado: ${usd(metricas.costoMensualCalculado)}/m (${usd(metricas.costoAnualCalculado)}/año)
Score Well-Architected: ${metricas.wellArchitectedScores.global}/100
Servicios AWS (${propuesta.serviciosSeleccionados.length}): ${propuesta.serviciosSeleccionados.join(', ')}`;
    await navigator.clipboard.writeText(texto);
    setCopiadoResumen(true);
    setTimeout(() => setCopiadoResumen(false), 2500);
  };

  const tabs: Array<{ id: TabType; label: string; icon: typeof Layers; count?: number }> = [
    { id: 'resumen', label: 'Visión General', icon: Sparkles },
    { id: 'topologia', label: 'Topología & Servicios', icon: Layers, count: propuesta.serviciosSeleccionados.length },
    { id: 'finops', label: 'FinOps & Costos', icon: DollarSign },
    { id: 'wellArchitected', label: 'Well-Architected (5 Pilares)', icon: BarChart3, count: metricas.wellArchitectedScores.global },
    { id: 'seguridad', label: 'Seguridad & Normativa', icon: ShieldCheck, count: propuesta.cumplimiento?.length || 0 },
    { id: 'roadmap', label: 'Roadmap de Fases', icon: Calendar },
    { id: 'terraform', label: 'Código IaC (Terraform)', icon: FileCode },
  ];

  return (
    <Modal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo={propuesta.nombre}
      subtitulo={`Auditoría Técnica, Arquitectura Cloud & FinOps · ${propuesta.tipoAplicacion} · Región ${propuesta.regionId} (${metricas.nombreRegion})`}
      tamano="full"
    >
      <div className="space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-4 rounded-2xl bg-gradient-to-r from-blue-500/10 via-indigo-500/5 to-card border border-blue-500/20">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-blue-600 text-white shadow-xs">
              {propuesta.tipoAplicacion}
            </span>
            <span className="text-xs font-mono font-bold px-2 py-1 rounded-xl bg-card border border-line text-ink flex items-center gap-1.5">
              <Globe size={13} className="text-blue-500" />
              {propuesta.regionId} ({metricas.nombreRegion})
            </span>
            <span className="text-xs font-bold px-2.5 py-1 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-500">
              SLA {metricas.slaDetalle.porcentaje} ({propuesta.disponibilidad})
            </span>
            <span className="text-xs font-bold px-2.5 py-1 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 flex items-center gap-1">
              <Sparkles size={13} /> Score {metricas.wellArchitectedScores.global}/100
            </span>
            <span className="text-xs text-muted font-medium ml-1">
              Registrado el {fecha(propuesta.creadaEn || new Date().toISOString())}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={imprimirInforme}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-sm transition-all cursor-pointer"
              title="Abrir vista de impresión y guardar como PDF"
            >
              <Printer size={13} /> Imprimir / PDF
            </button>
            <button
              type="button"
              onClick={descargarJson}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-card border border-line hover:border-line-2 text-ink text-xs font-bold transition-all cursor-pointer"
              title="Descargar especificación completa en JSON"
            >
              <Download size={13} className="text-blue-500" /> JSON
            </button>
            <button
              type="button"
              onClick={descargarMarkdown}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-card border border-line hover:border-line-2 text-ink text-xs font-bold transition-all cursor-pointer"
              title="Descargar documento RFC en Markdown"
            >
              <FileText size={13} className="text-purple-500" /> Markdown (RFC)
            </button>
            <button
              type="button"
              onClick={descargarCsv}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-card border border-line hover:border-line-2 text-ink text-xs font-bold transition-all cursor-pointer"
              title="Exportar inventario y costos en CSV"
            >
              <FileSpreadsheet size={13} className="text-emerald-500" /> CSV
            </button>
            <button
              type="button"
              onClick={copiarResumenEjecutivo}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-canvas border border-line text-muted hover:text-ink text-xs font-medium transition-all cursor-pointer"
            >
              {copiadoResumen ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
              {copiadoResumen ? '¡Copiado!' : 'Copiar Resumen'}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1 border-b border-line overflow-x-auto pb-1 scrollbar-none">
          {tabs.map((t) => {
            const Icono = t.icon;
            const activo = tabActiva === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTabActiva(t.id)}
                className={`flex items-center gap-2 px-3.5 py-2.5 text-xs font-bold border-b-2 whitespace-nowrap transition-all cursor-pointer ${
                  activo
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-muted hover:text-ink hover:border-line'
                }`}
              >
                <Icono size={14} />
                <span>{t.label}</span>
                {t.count !== undefined && (
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                      activo ? 'bg-blue-500/10 text-blue-600' : 'bg-canvas text-muted border border-line'
                    }`}
                  >
                    {t.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {tabActiva === 'resumen' && (
          <div className="space-y-6 animate-fade-in text-xs">
            <div className="rounded-2xl border border-line bg-canvas/70 p-5 space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted">
                Justificación Técnica & Caso de Negocio
              </span>
              <p className="text-sm font-medium text-ink leading-relaxed whitespace-pre-line">
                {propuesta.descripcion}
              </p>
              <div className="pt-2 flex items-center gap-2 text-muted">
                <span className="font-semibold text-ink">Objetivo Estratégico:</span>
                <span>{propuesta.objetivoMigracion}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-2xl border border-line bg-card p-4 space-y-1">
                <span className="text-[10px] text-muted font-bold uppercase flex items-center gap-1">
                  <Users size={12} className="text-blue-500" /> Usuarios Concurrentes
                </span>
                <p className="text-xl font-bold font-mono text-ink">{numero(propuesta.usuariosEstimados)}</p>
                <span className="text-[10px] text-muted font-medium block">{metricas.tierEscala}</span>
              </div>

              <div className="rounded-2xl border border-line bg-card p-4 space-y-1">
                <span className="text-[10px] text-muted font-bold uppercase flex items-center gap-1">
                  <Zap size={12} className="text-amber-500" /> Tráfico Pico Estimado
                </span>
                <p className="text-xl font-bold font-mono text-amber-500">{numero(metricas.rpsEstimados)} RPS</p>
                <span className="text-[10px] text-muted font-medium block">~{numero(metricas.anchoBandaGbMes)} GB/mes salida</span>
              </div>

              <div className="rounded-2xl border border-line bg-card p-4 space-y-1">
                <span className="text-[10px] text-muted font-bold uppercase flex items-center gap-1">
                  <DollarSign size={12} className="text-blue-500" /> Costo Proyectado
                </span>
                <p className="text-xl font-bold font-mono text-blue-600">{usd(metricas.costoMensualCalculado)}/m</p>
                <span className="text-[10px] text-muted font-medium block">Tope: {usd(metricas.presupuestoMaximo)}/m</span>
              </div>

              <div className="rounded-2xl border border-line bg-card p-4 space-y-1">
                <span className="text-[10px] text-muted font-bold uppercase flex items-center gap-1">
                  <BarChart3 size={12} className="text-emerald-500" /> Score Arquitectura
                </span>
                <p className="text-xl font-bold font-mono text-emerald-600">{metricas.wellArchitectedScores.global} / 100</p>
                <span className="text-[10px] text-muted font-medium block">AWS Well-Architected</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-2xl border border-line bg-card p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-ink uppercase tracking-wider flex items-center gap-1.5">
                    <Clock size={14} className="text-blue-500" /> Resiliencia & Objetivos DRP
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600">
                    SLA {metricas.slaDetalle.porcentaje}
                  </span>
                </div>

                <div className="space-y-3 pt-1">
                  <div className="p-3 rounded-xl bg-canvas border border-line space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-ink">RTO (Recovery Time Objective)</span>
                      <span className="font-mono font-bold text-blue-600">{metricas.drpDetalle.rtoHoras}h máx</span>
                    </div>
                    <p className="text-[11px] text-muted leading-relaxed">{metricas.drpDetalle.rtoEstrategia}</p>
                  </div>

                  <div className="p-3 rounded-xl bg-canvas border border-line space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-ink">RPO (Recovery Point Objective)</span>
                      <span className="font-mono font-bold text-blue-600">{metricas.drpDetalle.rpoMinutos}m máx</span>
                    </div>
                    <p className="text-[11px] text-muted leading-relaxed">{metricas.drpDetalle.rpoEstrategia}</p>
                  </div>

                  <div className="text-[11px] text-muted flex items-center justify-between pt-1">
                    <span>Ventana de caída máxima tolerada:</span>
                    <span className="font-bold text-ink">{metricas.slaDetalle.downtimeMes}/mes</span>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-line bg-card p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-ink uppercase tracking-wider flex items-center gap-1.5">
                    <ShieldCheck size={14} className="text-emerald-500" /> Gobernanza & Cumplimiento Normativo
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600">
                    {propuesta.cumplimiento?.length || 0} activos
                  </span>
                </div>

                <div className="space-y-2 pt-1">
                  {(propuesta.cumplimiento || []).length === 0 ? (
                    <p className="text-xs text-muted py-4 text-center">No se seleccionaron marcos de cumplimiento específicos.</p>
                  ) : (
                    (propuesta.cumplimiento || []).map((norm) => (
                      <div key={norm} className="p-2.5 rounded-xl bg-canvas border border-line flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                          <span className="font-bold text-ink">{norm}</span>
                        </div>
                        <span className="text-[10px] font-medium text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                          Controles Mapeados
                        </span>
                      </div>
                    ))
                  )}

                  <div className="p-3 rounded-xl bg-blue-500/5 border border-blue-500/15 text-[11px] text-muted leading-relaxed">
                    Arquitectura preparada con cifrado de almacenamiento, autenticación IAM y registros centralizados en CloudWatch.
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {tabActiva === 'topologia' && (
          <div className="space-y-6 animate-fade-in text-xs">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-2xl border border-line bg-card p-4 space-y-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted flex items-center gap-1.5">
                  <Globe size={13} className="text-blue-500" /> Borde & Perímetro (Edge)
                </span>
                <p className="text-xs text-muted">Aceleración perimetral, resolución DNS y firewall WAF de capa 7.</p>
                <div className="space-y-2 pt-1">
                  {metricas.serviciosPorCapa.borde.map((s) => (
                    <div key={s.servicioId} className="p-2.5 rounded-xl bg-canvas border border-line">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-ink">{s.nombre}</span>
                        <span className="font-mono text-blue-600 font-bold">{usd(s.costoEstimado)}/m</span>
                      </div>
                      <p className="text-[10px] text-muted mt-0.5">{s.cantidad}</p>
                    </div>
                  ))}
                  {metricas.serviciosPorCapa.borde.length === 0 && (
                    <p className="text-[11px] text-muted py-2">Sin componentes perimetrales seleccionados.</p>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-line bg-card p-4 space-y-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted flex items-center gap-1.5">
                  <Network size={13} className="text-indigo-500" /> Red & Cómputo (Core App)
                </span>
                <p className="text-xs text-muted">Aislamiento en VPC, balanceo de carga ALB y servidores de aplicación.</p>
                <div className="space-y-2 pt-1">
                  {[...metricas.serviciosPorCapa.red, ...metricas.serviciosPorCapa.computo].map((s) => (
                    <div key={s.servicioId} className="p-2.5 rounded-xl bg-canvas border border-line">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-ink">{s.nombre}</span>
                        <span className="font-mono text-indigo-500 font-bold">{usd(s.costoEstimado)}/m</span>
                      </div>
                      <p className="text-[10px] text-muted mt-0.5">{s.cantidad}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-line bg-card p-4 space-y-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted flex items-center gap-1.5">
                  <Database size={13} className="text-emerald-500" /> Persistencia & Gobernanza
                </span>
                <p className="text-xs text-muted">Bases de datos Multi-AZ, almacenamiento S3, KMS e IAM.</p>
                <div className="space-y-2 pt-1">
                  {[...metricas.serviciosPorCapa.datos, ...metricas.serviciosPorCapa.gobierno].map((s) => (
                    <div key={s.servicioId} className="p-2.5 rounded-xl bg-canvas border border-line">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-ink">{s.nombre}</span>
                        <span className="font-mono text-emerald-600 font-bold">{usd(s.costoEstimado)}/m</span>
                      </div>
                      <p className="text-[10px] text-muted mt-0.5">{s.cantidad}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-line bg-card overflow-hidden">
              <div className="p-4 border-b border-line flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-sm text-ink">Catálogo Detallado de Servicios Incluidos</h4>
                  <p className="text-xs text-muted">Especificación técnica, comandos AWS CLI y modelo de responsabilidad</p>
                </div>
                <span className="text-xs font-mono font-bold text-muted">{metricas.desgloseServicios.length} servicios</span>
              </div>

              <div className="divide-y divide-line/60">
                {metricas.desgloseServicios.map((srv) => (
                  <div key={srv.servicioId} className="p-4 hover:bg-canvas/50 transition-colors space-y-2">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <span className="text-sm font-bold text-ink">{srv.nombre}</span>
                        <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-md bg-canvas border border-line text-muted">
                          {srv.categoria}
                        </span>
                        {srv.gratisTier && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                            Free Tier Elegible
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-muted">Responsabilidad: <strong className="text-ink">{srv.responsabilidad}</strong></span>
                        <span className="font-mono font-bold text-sm text-blue-600">{usd(srv.costoEstimado)}/m</span>
                      </div>
                    </div>

                    <p className="text-xs text-muted leading-relaxed">{srv.funcion}</p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 text-[11px]">
                      <div className="p-2 rounded-lg bg-canvas border border-line">
                        <span className="text-muted block text-[10px]">Dimensionamiento Estimado:</span>
                        <span className="font-semibold text-ink">{srv.cantidad}</span>
                      </div>
                      <div className="p-2 rounded-lg bg-canvas border border-line font-mono text-[10px] text-muted overflow-x-auto whitespace-nowrap">
                        <span className="text-muted block text-[10px] font-sans">Comando CLI Sugerido:</span>
                        <span className="text-ink">{srv.cli}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tabActiva === 'finops' && (
          <div className="space-y-6 animate-fade-in text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-5 rounded-2xl bg-card border border-line space-y-1">
                <span className="text-muted text-[10px] uppercase font-bold block">Presupuesto Asignado</span>
                <p className="text-2xl font-bold font-mono text-ink">{usd(metricas.presupuestoMaximo)}</p>
                <span className="text-[11px] text-muted">Límite mensual fijado</span>
              </div>

              <div className="p-5 rounded-2xl bg-card border border-line space-y-1">
                <span className="text-muted text-[10px] uppercase font-bold block">Costo Proyectado Mensual</span>
                <p className="text-2xl font-bold font-mono text-blue-600">{usd(metricas.costoMensualCalculado)}</p>
                <span className="text-[11px] text-muted">Equivale a {usd(metricas.costoAnualCalculado)} / año</span>
              </div>

              <div className={`p-5 rounded-2xl border space-y-1 ${
                metricas.dentroPresupuesto
                  ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-600'
                  : 'bg-rose-500/5 border-rose-500/20 text-rose-600'
              }`}>
                <span className="text-[10px] uppercase font-bold block">
                  {metricas.dentroPresupuesto ? 'Superávit / Margen Disponible' : 'Déficit / Sobrecosto'}
                </span>
                <p className="text-2xl font-bold font-mono">
                  {metricas.dentroPresupuesto ? `+${usd(metricas.varianzaPresupuesto)}` : `-${usd(Math.abs(metricas.varianzaPresupuesto))}`}
                </p>
                <span className="text-[11px] font-medium block">
                  {metricas.dentroPresupuesto
                    ? `${metricas.porcentajeUsoPresupuesto}% del presupuesto utilizado`
                    : `Excede por ${metricas.porcentajeUsoPresupuesto - 100}% el presupuesto`}
                </span>
              </div>
            </div>

            <div className="rounded-2xl border border-line bg-card p-5 space-y-3">
              <h4 className="font-bold text-sm text-ink flex items-center gap-2">
                <TrendingUp size={16} className="text-blue-500" /> Oportunidades de Reducción de Costos (FinOps)
              </h4>
              <p className="text-xs text-muted">
                Estrategias de contratación y optimización recomendadas para maximizar el retorno de inversión en AWS:
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
                <div className="p-3.5 rounded-xl bg-canvas border border-line space-y-1">
                  <span className="text-[10px] font-bold text-blue-500 uppercase">Savings Plans (1 Año)</span>
                  <p className="text-base font-bold font-mono text-ink">-{usd(metricas.ahorroFinOps.savingsPlans1Ano)}/m</p>
                  <p className="text-[10px] text-muted">Hasta 32% de descuento con compromiso flexible de cómputo.</p>
                </div>

                <div className="p-3.5 rounded-xl bg-canvas border border-line space-y-1">
                  <span className="text-[10px] font-bold text-emerald-500 uppercase">Savings Plans (3 Años)</span>
                  <p className="text-base font-bold font-mono text-emerald-600">-{usd(metricas.ahorroFinOps.savingsPlans3Anos)}/m</p>
                  <p className="text-[10px] text-muted">Hasta 54% de descuento con compromiso a largo plazo.</p>
                </div>

                <div className="p-3.5 rounded-xl bg-canvas border border-line space-y-1">
                  <span className="text-[10px] font-bold text-purple-500 uppercase">RDS Reserved Instances</span>
                  <p className="text-base font-bold font-mono text-purple-600">-{usd(metricas.ahorroFinOps.reservedInstances)}/m</p>
                  <p className="text-[10px] text-muted">Ahorro de ~40% en base de datos reservada continua.</p>
                </div>

                <div className="p-3.5 rounded-xl bg-canvas border border-line space-y-1">
                  <span className="text-[10px] font-bold text-amber-500 uppercase">Ciclo de Vida S3 Glacier</span>
                  <p className="text-base font-bold font-mono text-amber-600">-{usd(metricas.ahorroFinOps.s3Glacier)}/m</p>
                  <p className="text-[10px] text-muted">Mover respaldos fríos a Glacier tras 30 días ahorra hasta 68%.</p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-line bg-card overflow-hidden">
              <div className="p-4 border-b border-line flex items-center justify-between">
                <h4 className="font-bold text-sm text-ink">Desglose de Costos por Componente</h4>
                <span className="text-xs text-muted font-mono">Total: {usd(metricas.costoMensualCalculado)}/m</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-canvas border-b border-line text-muted uppercase text-[10px]">
                    <tr>
                      <th className="py-2.5 px-4">Componente</th>
                      <th className="py-2.5 px-4">Categoría</th>
                      <th className="py-2.5 px-4">Dimensionamiento</th>
                      <th className="py-2.5 px-4 text-right">Costo Estimado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line/60">
                    {metricas.desgloseServicios.map((s) => (
                      <tr key={s.servicioId} className="hover:bg-canvas/40 transition-colors">
                        <td className="py-2.5 px-4 font-bold text-ink">{s.nombre}</td>
                        <td className="py-2.5 px-4 text-muted">{s.categoria}</td>
                        <td className="py-2.5 px-4 text-ink">{s.cantidad}</td>
                        <td className="py-2.5 px-4 text-right font-mono font-bold text-blue-600">{usd(s.costoEstimado)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {tabActiva === 'wellArchitected' && (
          <div className="space-y-6 animate-fade-in text-xs">
            <div className="p-5 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-lg shadow-blue-500/20">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-200 block">
                  Calificación Global de Arquitectura
                </span>
                <h3 className="text-2xl font-black mt-0.5">
                  AWS Well-Architected Framework: {metricas.wellArchitectedScores.global} / 100
                </h3>
                <p className="text-xs text-blue-100 mt-1 max-w-xl">
                  Evaluación automatizada basada en los 5 pilares oficiales de AWS: Seguridad, Fiabilidad, Rendimiento, Optimización de Costos y Excelencia Operativa.
                </p>
              </div>
              <div className="grid h-16 w-16 place-items-center rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 shrink-0">
                <Sparkles size={28} />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {metricas.wellArchitectedPillares.map((pilar) => (
                <div key={pilar.id} className="p-5 rounded-2xl bg-card border border-line space-y-3 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-sm text-ink">{pilar.nombre}</span>
                      <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded-lg border ${pilar.color}`}>
                        {pilar.score}%
                      </span>
                    </div>

                    <div className="w-full h-2 rounded-full bg-canvas border border-line overflow-hidden mb-3">
                      <div
                        className="h-full rounded-full bg-blue-600 transition-all duration-500"
                        style={{ width: `${pilar.score}%` }}
                      />
                    </div>

                    <p className="text-xs text-muted leading-relaxed mb-3">{pilar.descripcion}</p>

                    <ul className="space-y-1.5 text-[11px] text-ink">
                      {pilar.puntosClave.map((pt, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <CheckCircle2 size={13} className="text-blue-500 shrink-0 mt-0.5" />
                          <span>{pt}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tabActiva === 'seguridad' && (
          <div className="space-y-6 animate-fade-in text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-5 rounded-2xl bg-card border border-line space-y-3">
                <h4 className="font-bold text-sm text-ink flex items-center gap-2">
                  <ShieldCheck size={16} className="text-blue-500" /> Marcos de Cumplimiento Activados
                </h4>
                <div className="space-y-2 pt-1">
                  {(propuesta.cumplimiento || []).length === 0 ? (
                    <p className="text-muted text-xs py-4 text-center">No hay marcos seleccionados.</p>
                  ) : (
                    (propuesta.cumplimiento || []).map((c) => (
                      <div key={c} className="p-3 rounded-xl bg-canvas border border-line flex items-center justify-between">
                        <div>
                          <strong className="text-xs text-ink block">{c}</strong>
                          <span className="text-[10px] text-muted">Auditoría y certificación de seguridad</span>
                        </div>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                          Alineado
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="p-5 rounded-2xl bg-card border border-line space-y-3">
                <h4 className="font-bold text-sm text-ink flex items-center gap-2">
                  <Lock size={16} className="text-indigo-500" /> Controles de Protección Obligatorios
                </h4>
                <div className="space-y-2 pt-1 text-[11px]">
                  <div className="p-2.5 rounded-xl bg-canvas border border-line flex items-center gap-2.5">
                    <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                    <span><strong>Cifrado en Reposo:</strong> Activado con claves administradas KMS (AES-256).</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-canvas border border-line flex items-center gap-2.5">
                    <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                    <span><strong>Cifrado en Tránsito:</strong> Terminación TLS 1.3 forzada en balanceador y CDN.</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-canvas border border-line flex items-center gap-2.5">
                    <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                    <span><strong>Segmentación de Red:</strong> Subredes privadas sin salida pública directa.</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-canvas border border-line flex items-center gap-2.5">
                    <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                    <span><strong>Principio de Mínimo Privilegio:</strong> Roles IAM con permisos restringidos.</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-canvas border border-line flex items-center gap-2.5">
                    <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                    <span><strong>Trazabilidad & Auditoría:</strong> Registros inmutables en CloudWatch y S3.</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {tabActiva === 'roadmap' && (
          <div className="space-y-6 animate-fade-in text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-5 rounded-2xl bg-card border border-line space-y-2 flex flex-col justify-between">
                <div>
                  <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600">
                    Fase 1 · Semanas 1-2
                  </span>
                  <h4 className="font-bold text-sm text-ink mt-2">Cimientos & Red Segura</h4>
                  <p className="text-xs text-muted mt-1 leading-relaxed">
                    Despliegue de VPC, subredes públicas y privadas, Internet Gateway, claves KMS y políticas IAM iniciales.
                  </p>
                </div>
                <div className="pt-3 border-t border-line/60 text-[11px] text-muted font-medium flex items-center gap-1">
                  <CheckCircle2 size={12} className="text-blue-500" /> Infraestructura Base
                </div>
              </div>

              <div className="p-5 rounded-2xl bg-card border border-line space-y-2 flex flex-col justify-between">
                <div>
                  <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600">
                    Fase 2 · Semanas 3-4
                  </span>
                  <h4 className="font-bold text-sm text-ink mt-2">Capa de Datos & Respaldo</h4>
                  <p className="text-xs text-muted mt-1 leading-relaxed">
                    Aprovisionamiento de RDS Multi-AZ, DynamoDB, buckets S3 con versionado y retención, y migración de esquemas.
                  </p>
                </div>
                <div className="pt-3 border-t border-line/60 text-[11px] text-muted font-medium flex items-center gap-1">
                  <CheckCircle2 size={12} className="text-indigo-500" /> Integridad de Datos
                </div>
              </div>

              <div className="p-5 rounded-2xl bg-card border border-line space-y-2 flex flex-col justify-between">
                <div>
                  <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-600">
                    Fase 3 · Semanas 5-6
                  </span>
                  <h4 className="font-bold text-sm text-ink mt-2">Cómputo & Distribución CDN</h4>
                  <p className="text-xs text-muted mt-1 leading-relaxed">
                    Despliegue de servidores EC2 / Lambda, Application Load Balancer, distribución CloudFront y WAF perimetral.
                  </p>
                </div>
                <div className="pt-3 border-t border-line/60 text-[11px] text-muted font-medium flex items-center gap-1">
                  <CheckCircle2 size={12} className="text-purple-500" /> Lógica de Negocio
                </div>
              </div>

              <div className="p-5 rounded-2xl bg-card border border-line space-y-2 flex flex-col justify-between">
                <div>
                  <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600">
                    Fase 4 · Semanas 7-8
                  </span>
                  <h4 className="font-bold text-sm text-ink mt-2">Pruebas, DRP & Go-Live</h4>
                  <p className="text-xs text-muted mt-1 leading-relaxed">
                    Simulación de failover DRP (validación RTO/RPO), pruebas de estrés con {numero(propuesta.usuariosEstimados)} usuarios y cutover DNS en Route 53.
                  </p>
                </div>
                <div className="pt-3 border-t border-line/60 text-[11px] text-muted font-medium flex items-center gap-1">
                  <CheckCircle2 size={12} className="text-emerald-500" /> Salida a Producción
                </div>
              </div>
            </div>
          </div>
        )}

        {tabActiva === 'terraform' && (
          <div className="space-y-4 animate-fade-in text-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-canvas border border-line">
              <div>
                <h4 className="font-bold text-ink">Plantilla de Infraestructura como Código (IaC)</h4>
                <p className="text-muted text-[11px]">Código HashiCorp Terraform HCL listo para inicializar y desplegar este diseño</p>
              </div>
              <button
                type="button"
                onClick={copiarTerraform}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold transition-all cursor-pointer shadow-xs"
              >
                {copiadoTerraform ? <Check size={14} /> : <Copy size={14} />}
                {copiadoTerraform ? '¡Código Copiado!' : 'Copiar Código Terraform'}
              </button>
            </div>

            <div className="relative rounded-2xl border border-line bg-slate-950 p-4 font-mono text-[11px] text-emerald-400 overflow-x-auto max-h-[500px]">
              <pre>{generarTerraformCode(propuesta, metricas)}</pre>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
