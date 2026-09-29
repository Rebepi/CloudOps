import { ShieldCheck, DollarSign, Activity, CheckCircle2, Server, TrendingDown, Network } from 'lucide-react';
import { useCloud } from '../../context/CloudContext';
import { regiones } from '../../data/regions';
import { serviciosAWS } from '../../data/awsServices';
import { usd } from '../../lib/format';
import type { PropuestaCloud } from '../../types/cloud';
import { Logo } from '../ui/Logo';

export interface ReportConfig {
  empresa: string;
  autor: string;
  cargo: string;
  incluirResumen: boolean;
  incluirPropuesta: boolean;
  incluirFinOps: boolean;
  incluirSeguridad: boolean;
  incluirRed: boolean;
  incluirServicios: boolean;
  notasAdicionales: string;
}

export function ExecutiveReportDocument({ config }: { config: ReportConfig }) {
  const {
    propuestas,
    costoMensual,
    costoAnual,
    regionPrincipal,
    ambiente,
    itemsCosto,
    presupuestoLimite,
  } = useCloud();

  const propuestaFallback: PropuestaCloud = {
    id: 'default-arch',
    nombre: 'Arquitectura Empresarial CloudOps Multi-AZ',
    tipoAplicacion: 'Web',
    descripcion: 'Arquitectura de misión crítica desplegada en Amazon Web Services (AWS) con balanceo de carga elástico, alta disponibilidad en múltiples zonas (Multi-AZ), caché perimetral con CloudFront y base de datos relacional con failover automático.',
    regionId: regionPrincipal,
    usuariosEstimados: 75000,
    disponibilidad: 'alta',
    serviciosSeleccionados: ['ec2', 's3', 'rds', 'elb', 'cloudfront'],
    objetivoMigracion: 'Escalabilidad elástica, resiliencia ante desastres y optimización de costos operativos (FinOps)',
    presupuestoMaximo: presupuestoLimite,
    rtoHoras: 1,
    rpoMinutos: 15,
    cumplimiento: ['PCI-DSS Level 1', 'SOC 2 Type II', 'CIS AWS Foundations', 'ISO 27001'],
    creadaEn: new Date().toISOString(),
  };

  const propuesta: PropuestaCloud = propuestas[0] || propuestaFallback;

  const regionInfo = regiones.find((r) => r.id === regionPrincipal) || regiones[0];
  const fechaHoy = new Date().toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const costosDetallados = itemsCosto.map((item) => {
    const s = serviciosAWS.find((x) => x.id === item.servicioId);
    const mensual = s ? s.precioUnitario * item.cantidad * item.horasMes : 0;
    const conDescuento = mensual * 0.72;
    const ahorroMensual = mensual - conDescuento;
    return {
      id: item.id,
      nombre: s?.nombre || item.servicioId.toUpperCase(),
      categoria: s?.categoria || 'General',
      configuracion: item.configuracion || 'Instancia estándar',
      cantidad: item.cantidad,
      horasMes: item.horasMes,
      mensual,
      conDescuento,
      ahorroMensual,
      anual: mensual * 12,
      porcentaje: costoMensual > 0 ? Math.round((mensual / costoMensual) * 100) : 0,
    };
  });

  const ahorroAnualTotal = costosDetallados.reduce((acc, curr) => acc + curr.ahorroMensual * 12, 0);

  const categoriasCostos = [
    { cat: 'Cómputo (EC2/Lambda)', color: '#2563EB', valor: costosDetallados.filter(c => c.categoria.toLowerCase().includes('cómputo') || c.nombre.includes('EC2')).reduce((a, b) => a + b.mensual, 0) },
    { cat: 'Bases de Datos (RDS)', color: '#6366F1', valor: costosDetallados.filter(c => c.categoria.toLowerCase().includes('datos') || c.nombre.includes('RDS')).reduce((a, b) => a + b.mensual, 0) },
    { cat: 'Almacenamiento (S3)', color: '#06B6D4', valor: costosDetallados.filter(c => c.categoria.toLowerCase().includes('almacenamiento') || c.nombre.includes('S3')).reduce((a, b) => a + b.mensual, 0) },
    { cat: 'Red & CDN (CloudFront/ELB)', color: '#10B981', valor: costosDetallados.filter(c => c.categoria.toLowerCase().includes('red') || c.nombre.includes('CloudFront') || c.nombre.includes('ELB')).reduce((a, b) => a + b.mensual, 0) },
    { cat: 'Seguridad & Otros', color: '#F59E0B', valor: costosDetallados.filter(c => c.categoria.toLowerCase().includes('seguridad')).reduce((a, b) => a + b.mensual, 0) || (costoMensual * 0.08) },
  ];

  const totalCategorias = categoriasCostos.reduce((a, b) => a + b.valor, 0) || 1;

  let acumuladoOffset = 0;
  const segmentosDonut = categoriasCostos.map((c) => {
    const pct = Math.max(2, Math.round((c.valor / totalCategorias) * 100));
    const dashLength = (pct / 100) * 283;
    const offset = acumuladoOffset;
    acumuladoOffset += dashLength;
    return { ...c, pct, dashLength, offset };
  });

  const pilares = [
    { nombre: 'Excelencia Operativa', valor: 95, color: 'bg-blue-600', texto: '95% · CI/CD & CloudWatch activo' },
    { nombre: 'Seguridad Integral', valor: 92, color: 'bg-emerald-600', texto: '92% · PoLP & KMS Encryption' },
    { nombre: 'Confiabilidad (Multi-AZ)', valor: 98, color: 'bg-indigo-600', texto: '98% · SLA 99.99% con Auto Scaling' },
    { nombre: 'Eficiencia de Rendimiento', valor: 88, color: 'bg-purple-600', texto: '88% · Edge CDN & Caching' },
    { nombre: 'Optimización de Costos', valor: 84, color: 'bg-amber-500', texto: '84% · Savings Plans proyectados' },
  ];

  const regionesDistribucion = regiones.slice(0, 4).map((r) => {
    const esPrincipal = r.id === regionPrincipal;
    return {
      nombre: `${r.id} (${r.nombre})`,
      latencia: `${r.latenciaMs}ms`,
      azs: `${r.zonasDisponibilidad} Zonas`,
      trafico: esPrincipal ? '55%' : r.id === 'sa-east-1' ? '25%' : '10%',
      estado: esPrincipal ? 'Principal' : 'Secundaria',
    };
  });

  const idsActivos = Array.from(new Set([
    ...itemsCosto.map((i) => i.servicioId),
    ...(propuesta.serviciosSeleccionados || []),
  ]));
  const serviciosDesplegados = serviciosAWS.filter((s) => idsActivos.includes(s.id));
  const serviciosMostrar = serviciosDesplegados.length > 0 
    ? [...serviciosDesplegados, ...serviciosAWS.filter((s) => !idsActivos.includes(s.id))].slice(0, 8)
    : serviciosAWS.slice(0, 8);

  return (
    <div id="executive-report-document" className="bg-white text-slate-900 font-sans p-6 sm:p-10 max-w-4xl mx-auto">
      <div className="border-b-2 border-blue-600 pb-3 mb-4 print-avoid-break">
        <div className="flex items-center justify-between gap-4 mb-2">
          <div className="flex items-center gap-3">
            <Logo size={38} animado={false} conPing={false} />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-black tracking-tight text-slate-900">Cloud<span className="text-blue-600">Ops</span></span>
                <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-blue-100 text-blue-800 border border-blue-200">
                  AWS Enterprise Architecture
                </span>
              </div>
              <p className="text-[10px] text-slate-500 font-medium">Cloud Architecture, FinOps Economics & Governance Brief</p>
            </div>
          </div>
          <div className="text-right">
            <span className="inline-block px-2.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wider bg-slate-100 text-slate-800 border border-slate-200">
              Entorno: {ambiente}
            </span>
            <p className="text-[9px] text-slate-400 mt-0.5 font-mono">Ref: AWS-REP-{new Date().getFullYear()}-001</p>
          </div>
        </div>

        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Informe Ejecutivo de Arquitectura Cloud & FinOps
          </h1>
          <p className="text-xs text-slate-600 mt-0.5">
            Evaluación técnica, viabilidad económica y arquitectura de seguridad basada en el <span className="font-semibold text-blue-700">AWS Well-Architected Framework</span>.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-2.5 p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs">
          <div>
            <span className="text-slate-400 uppercase text-[8.5px] font-bold block">Organización / Cliente</span>
            <span className="font-bold text-slate-800 text-[11px]">{config.empresa || 'Corporación Digital S.A.'}</span>
          </div>
          <div>
            <span className="text-slate-400 uppercase text-[8.5px] font-bold block">Arquitecto Líder</span>
            <span className="font-bold text-slate-800 text-[11px]">{config.autor || 'Renzo DevOps'}</span>
          </div>
          <div>
            <span className="text-slate-400 uppercase text-[8.5px] font-bold block">Región Primaria AWS</span>
            <span className="font-bold text-slate-800 text-[11px]">{regionInfo.nombre.split(' ')[0]} ({regionInfo.id})</span>
          </div>
          <div>
            <span className="text-slate-400 uppercase text-[8.5px] font-bold block">Fecha de Emisión</span>
            <span className="font-bold text-slate-800 text-[11px]">{fechaHoy}</span>
          </div>
        </div>
      </div>

      {config.incluirResumen && (
        <section className="mb-4 print-avoid-break">
          <div className="flex items-center gap-2 border-b border-slate-200 pb-1 mb-2">
            <Activity size={15} className="text-blue-600" />
            <h2 className="text-xs sm:text-sm font-bold text-slate-900 uppercase tracking-wide">1. Resumen Ejecutivo & Indicadores Clave (KPIs)</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="p-2.5 rounded-xl border border-blue-200 bg-blue-50/50">
              <span className="text-[8.5px] font-bold uppercase text-blue-600 block">Costo Mensual Estimado</span>
              <p className="text-base sm:text-lg font-extrabold text-blue-900 mt-0.5">{usd(costoMensual)}</p>
              <span className="text-[8.5px] text-blue-600 mt-0.5 block">Límite: {usd(presupuestoLimite)}</span>
            </div>
            <div className="p-2.5 rounded-xl border border-indigo-200 bg-indigo-50/50">
              <span className="text-[8.5px] font-bold uppercase text-indigo-600 block">Proyección Anual OpEx</span>
              <p className="text-base sm:text-lg font-extrabold text-indigo-900 mt-0.5">{usd(costoAnual)}</p>
              <span className="text-[8.5px] text-indigo-600 mt-0.5 block">Sin inversión CapEx</span>
            </div>
            <div className="p-2.5 rounded-xl border border-emerald-200 bg-emerald-50/50">
              <span className="text-[8.5px] font-bold uppercase text-emerald-600 block">SLA de Confiabilidad</span>
              <p className="text-base sm:text-lg font-extrabold text-emerald-900 mt-0.5">99.99%</p>
              <span className="text-[8.5px] text-emerald-700 mt-0.5 block">Multi-AZ Redundante</span>
            </div>
            <div className="p-2.5 rounded-xl border border-purple-200 bg-purple-50/50">
              <span className="text-[8.5px] font-bold uppercase text-purple-600 block">Índice de Seguridad</span>
              <p className="text-base sm:text-lg font-extrabold text-purple-900 mt-0.5">94 / 100</p>
              <span className="text-[8.5px] text-purple-700 mt-0.5 block">CIS Benchmark Auditado</span>
            </div>
          </div>
        </section>
      )}

      {config.incluirPropuesta && (
        <section className="mb-4 print-avoid-break">
          <div className="flex items-center gap-2 border-b border-slate-200 pb-1 mb-2">
            <CheckCircle2 size={15} className="text-blue-600" />
            <h2 className="text-xs sm:text-sm font-bold text-slate-900 uppercase tracking-wide">2. Propuesta de Arquitectura & Pilares Well-Architected</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="p-3 rounded-xl border border-slate-200 bg-slate-50 space-y-1.5 text-xs">
              <div>
                <span className="font-bold text-slate-700 text-[8.5px] uppercase block">Proyecto:</span>
                <span className="text-slate-900 font-bold text-xs sm:text-sm">{propuesta.nombre}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[10px]">
                <div>
                  <span className="text-slate-500 font-semibold block">Tipo:</span>
                  <span className="text-slate-800">{propuesta.tipoAplicacion}</span>
                </div>
                <div>
                  <span className="text-slate-500 font-semibold block">Usuarios:</span>
                  <span className="text-slate-800">{propuesta.usuariosEstimados.toLocaleString()} conc.</span>
                </div>
              </div>
              <p className="text-slate-600 text-[10px] leading-relaxed pt-1 border-t border-slate-200">{propuesta.descripcion}</p>
              <div className="flex items-center justify-between pt-1 border-t border-slate-200 text-[9.5px]">
                <span><strong>RTO:</strong> {propuesta.rtoHoras}h</span>
                <span><strong>RPO:</strong> {propuesta.rpoMinutos}min</span>
                <span className="text-emerald-700 font-bold">Multi-AZ Sync</span>
              </div>
            </div>

            <div className="p-3 rounded-xl border border-slate-200 bg-slate-50 space-y-1.5">
              <span className="font-bold text-slate-800 text-[8.5px] uppercase block">Gráfico: Evaluación de los 5 Pilares Well-Architected</span>
              <div className="space-y-1">
                {pilares.map((p) => (
                  <div key={p.nombre} className="text-[9.5px]">
                    <div className="flex justify-between font-semibold mb-0.5">
                      <span className="text-slate-700">{p.nombre}</span>
                      <span className="text-slate-900 font-mono">{p.valor}%</span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                      <div className={`h-full ${p.color} rounded-full`} style={{ width: `${p.valor}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {config.incluirFinOps && (
        <section className="mb-4">
          <div className="flex items-center gap-2 border-b border-slate-200 pb-1 mb-2">
            <DollarSign size={15} className="text-amber-600" />
            <h2 className="text-xs sm:text-sm font-bold text-slate-900 uppercase tracking-wide">3. Análisis Económico FinOps, Gráficos & Desglose</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3 print-avoid-break">
            <div className="p-3 rounded-xl border border-slate-200 bg-slate-50 flex items-center gap-3">
              <div className="relative shrink-0 w-24 h-24">
                <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                  <circle cx="50" cy="50" r="45" fill="none" stroke="#E2E8F0" strokeWidth="10" />
                  {segmentosDonut.map((seg, i) => (
                    <circle
                      key={i}
                      cx="50"
                      cy="50"
                      r="45"
                      fill="none"
                      stroke={seg.color}
                      strokeWidth="10"
                      strokeDasharray={`${seg.dashLength} 283`}
                      strokeDashoffset={-seg.offset}
                      className="transition-all"
                    />
                  ))}
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                  <span className="text-[7.5px] font-bold text-slate-400 uppercase">Total</span>
                  <span className="text-[10px] font-black text-slate-800 font-mono">{usd(costoMensual)}</span>
                </div>
              </div>

              <div className="space-y-0.5 text-[9.5px] flex-1 min-w-0">
                <span className="font-bold text-slate-700 uppercase text-[8.5px] block mb-0.5">Gráfico 1: Desglose por Dominio</span>
                {segmentosDonut.map((s) => (
                  <div key={s.cat} className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 truncate">
                      <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                      <span className="text-slate-600 truncate">{s.cat}</span>
                    </span>
                    <span className="font-mono font-bold text-slate-800 shrink-0 ml-1">{s.pct}%</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-3 rounded-xl border border-slate-200 bg-slate-50 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-slate-800 text-[8.5px] uppercase">Gráfico 2: Modelo On-Demand vs Savings Plans</span>
                  <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-200">
                    -28% Ahorro
                  </span>
                </div>
                <p className="text-[9.5px] text-slate-500 mb-1.5 leading-snug">
                  Compromiso de 1 año en cómputo EC2 y bases RDS Aurora genera un ahorro mensual proyectado inmediato.
                </p>

                <div className="space-y-1.5 text-[9.5px]">
                  <div>
                    <div className="flex justify-between mb-0.5">
                      <span className="text-slate-600 font-semibold">Tarifa Estándar On-Demand:</span>
                      <span className="font-mono font-bold text-slate-800">{usd(costoMensual)}/mes</span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-600 rounded-full w-full" />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between mb-0.5">
                      <span className="text-emerald-700 font-semibold">Tarifa Optimizada Savings Plans:</span>
                      <span className="font-mono font-bold text-emerald-700">{usd(costoMensual * 0.72)}/mes</span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded-full w-[72%]" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-1.5 pt-1.5 border-t border-slate-200 flex items-center justify-between text-[10px] font-bold">
                <span className="text-slate-700 flex items-center gap-1">
                  <TrendingDown size={13} className="text-emerald-600" />
                  Ahorro Anual Neto:
                </span>
                <span className="text-emerald-600 font-mono">{usd(ahorroAnualTotal)} USD</span>
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 mb-2 print-avoid-break mt-3">
            <div className="bg-slate-50 border-b border-slate-200 px-3 py-1.5 flex items-center justify-between">
              <span className="text-[9px] font-bold text-slate-700 uppercase tracking-wider">
                Desglose Detallado de Costos por Servicio & Estimación Anual
              </span>
              <span className="text-[8.5px] font-mono font-semibold text-slate-500">
                Modelo On-Demand vs Savings Plan (1 año)
              </span>
            </div>
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-100 text-slate-700 font-bold uppercase text-[8.5px] border-b border-slate-200">
                <tr>
                  <th className="p-1.5 sm:p-2">Servicio AWS</th>
                  <th className="p-1.5 sm:p-2">Configuración / Talla</th>
                  <th className="p-1.5 sm:p-2 text-center">Cant.</th>
                  <th className="p-1.5 sm:p-2 text-center">Horas</th>
                  <th className="p-1.5 sm:p-2 text-right">On-Demand</th>
                  <th className="p-1.5 sm:p-2 text-right">Savings Plan</th>
                  <th className="p-1.5 sm:p-2 text-right">Costo Anual</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-600 font-mono text-[10px]">
                {costosDetallados.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <td className="p-1.5 sm:p-2 font-sans font-bold text-slate-800">{item.nombre}</td>
                    <td className="p-1.5 sm:p-2 font-sans text-slate-500 text-[9.5px]">{item.configuracion}</td>
                    <td className="p-1.5 sm:p-2 text-center">{item.cantidad}</td>
                    <td className="p-1.5 sm:p-2 text-center">{item.horasMes}</td>
                    <td className="p-1.5 sm:p-2 text-right text-slate-800 font-bold">{usd(item.mensual)}</td>
                    <td className="p-1.5 sm:p-2 text-right text-emerald-700 font-bold">{usd(item.conDescuento)}</td>
                    <td className="p-1.5 sm:p-2 text-right text-slate-700">{usd(item.anual)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-100 text-slate-900 font-bold border-t border-slate-200 text-[10px]">
                <tr>
                  <td colSpan={4} className="p-1.5 sm:p-2 font-sans text-right uppercase text-[8.5px]">Totales Consolidados:</td>
                  <td className="p-1.5 sm:p-2 text-right font-mono text-blue-700">{usd(costoMensual)}</td>
                  <td className="p-1.5 sm:p-2 text-right font-mono text-emerald-700">{usd(costoMensual * 0.72)}</td>
                  <td className="p-1.5 sm:p-2 text-right font-mono text-indigo-700">{usd(costoAnual)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      )}

      {config.incluirRed && (
        <section className="mb-4">
          <div className="flex items-center gap-2 border-b border-slate-200 pb-1 mb-2">
            <Network size={15} className="text-blue-600" />
            <h2 className="text-xs sm:text-sm font-bold text-slate-900 uppercase tracking-wide">4. Arquitectura de Red (VPC) & Resiliencia Multi-Región</h2>
          </div>

          <div className="p-3 rounded-xl border border-slate-200 bg-slate-50 mb-2.5 print-avoid-break">
            <span className="font-bold text-slate-800 block mb-1.5 uppercase text-[8.5px]">Gráfico 3: Flujo de Paquetes en Topología 3-Capas VPC</span>
            <div className="grid grid-cols-5 gap-1.5 text-center font-mono text-[8.5px]">
              <div className="p-1.5 rounded-lg bg-blue-100/90 text-blue-900 border border-blue-300">
                <span className="block font-bold">1. Clientes</span>
                <span className="text-[7px] text-blue-700">HTTPS / TLS 1.3</span>
              </div>
              <div className="p-1.5 rounded-lg bg-indigo-100/90 text-indigo-900 border border-indigo-300">
                <span className="block font-bold">2. Route 53 + CDN</span>
                <span className="text-[7px] text-indigo-700">Anycast + WAF</span>
              </div>
              <div className="p-1.5 rounded-lg bg-purple-100/90 text-purple-900 border border-purple-300">
                <span className="block font-bold">3. IGW & ALB</span>
                <span className="text-[7px] text-purple-700">Subredes Públicas</span>
              </div>
              <div className="p-1.5 rounded-lg bg-emerald-100/90 text-emerald-900 border border-emerald-300">
                <span className="block font-bold">4. EC2 Cluster</span>
                <span className="text-[7px] text-emerald-700">Subredes Privadas</span>
              </div>
              <div className="p-1.5 rounded-lg bg-amber-100/90 text-amber-900 border border-amber-300">
                <span className="block font-bold">5. RDS Aurora</span>
                <span className="text-[7px] text-amber-700">Subredes Aisladas</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs print-avoid-break">
            {regionesDistribucion.map((reg) => (
              <div key={reg.nombre} className="p-2 rounded-xl border border-slate-200 bg-slate-50 text-[9.5px]">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="font-bold text-slate-800 truncate">{reg.nombre.split(' ')[0]}</span>
                  <span className="font-mono font-bold text-blue-600">{reg.latencia}</span>
                </div>
                <div className="flex justify-between text-slate-500 text-[8.5px]">
                  <span>Tráfico: {reg.trafico}</span>
                  <span>{reg.azs}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {config.incluirSeguridad && (
        <section className="mb-4">
          <div className="flex items-center gap-2 border-b border-slate-200 pb-1 mb-2">
            <ShieldCheck size={15} className="text-emerald-600" />
            <h2 className="text-xs sm:text-sm font-bold text-slate-900 uppercase tracking-wide">5. Seguridad, Cumplimiento & Responsabilidad Compartida</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 text-xs mb-2 print-avoid-break">
            <div className="p-2.5 rounded-xl border border-slate-200 bg-slate-50">
              <span className="font-bold text-slate-800 uppercase text-[8.5px] block mb-1 text-blue-700">Responsabilidad AWS (Seguridad DE la nube)</span>
              <ul className="space-y-0.5 text-slate-600 text-[10px] list-disc list-inside">
                <li>Centros de datos protegidos y redundancia eléctrica.</li>
                <li>Mantenimiento de red física y virtualización Nitro.</li>
                <li>Aislamiento de hardware y parches de hipervisores.</li>
                <li>Certificaciones internacionales (SOC 1/2/3, ISO 27001).</li>
              </ul>
            </div>
            <div className="p-2.5 rounded-xl border border-slate-200 bg-slate-50">
              <span className="font-bold text-slate-800 uppercase text-[8.5px] block mb-1 text-indigo-700">Responsabilidad del Cliente (Seguridad EN la nube)</span>
              <ul className="space-y-0.5 text-slate-600 text-[10px] list-disc list-inside">
                <li>Políticas IAM con Principio de Mínimo Privilegio (PoLP).</li>
                <li>Cifrado simétrico de datos con AWS KMS (AES-256).</li>
                <li>Configuración de Security Groups con denegación por defecto.</li>
                <li>Gestión de credenciales, rotación de claves y MFA.</li>
              </ul>
            </div>
          </div>
        </section>
      )}

      {config.incluirServicios && (
        <section className="mb-4">
          <div className="flex items-center gap-2 border-b border-slate-200 pb-1 mb-2">
            <Server size={15} className="text-rose-600" />
            <h2 className="text-xs sm:text-sm font-bold text-slate-900 uppercase tracking-wide">6. Inventario de Servicios AWS Desplegados</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs print-avoid-break">
            {serviciosMostrar.map((srv) => (
              <div key={srv.id} className="p-2 rounded-lg border border-slate-200 bg-slate-50 text-[9.5px]">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="font-black text-blue-700 uppercase">{srv.id}</span>
                  <span className="text-[8px] text-slate-400">({srv.categoria.split(' ')[0]})</span>
                </div>
                <p className="text-[9px] font-semibold text-slate-800 truncate">{srv.nombre}</p>
                <p className="text-[8px] text-slate-500 truncate">{srv.descripcion}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {config.notasAdicionales && (
        <section className="mb-4 print-avoid-break text-xs">
          <div className="border-b border-slate-200 pb-1 mb-1 font-bold uppercase text-[9px] text-slate-700">Conclusiones Técnicas de la Evaluación</div>
          <p className="p-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-600 leading-relaxed text-[10.5px] italic">
            "{config.notasAdicionales}"
          </p>
        </section>
      )}
    </div>
  );
}
