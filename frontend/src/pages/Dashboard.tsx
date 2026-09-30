import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  DollarSign,
  ShieldCheck,
  Layers,
  ArrowUpRight,
  Activity,
  PlusCircle,
  Calculator,
  Network,
  Radio,
  Flame,
  FileText,
} from 'lucide-react';
import { ReportModal } from '../components/reports/ReportModal';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { useCloud } from '../context/CloudContext';
import { useBackend } from '../context/BackendContext';
import ConnectedDashboard from './ConnectedDashboard';
import { useTheme } from '../context/ThemeContext';
import { serviciosAWS } from '../data/awsServices';
import { controlesSeguridad, eventosAuditoria } from '../data/securityChecks';
import { StatCard } from '../components/StatCard';
import { Card } from '../components/ui/Card';
import { StatusBadge } from '../components/ui/StatusBadge';
import { InfoTooltip } from '../components/ui/InfoTooltip';
import { usd } from '../lib/format';

const traficoNormal = [
  { hora: '00:00', peticiones: 1200, latencia: 42 },
  { hora: '03:00', peticiones: 800, latencia: 38 },
  { hora: '06:00', peticiones: 1500, latencia: 40 },
  { hora: '09:00', peticiones: 4800, latencia: 55 },
  { hora: '12:00', peticiones: 6200, latencia: 68 },
  { hora: '15:00', peticiones: 5900, latencia: 62 },
  { hora: '18:00', peticiones: 7100, latencia: 70 },
  { hora: '21:00', peticiones: 4300, latencia: 48 },
];

const traficoPico = [
  { hora: '00:00', peticiones: 4200, latencia: 52 },
  { hora: '03:00', peticiones: 3100, latencia: 46 },
  { hora: '06:00', peticiones: 6500, latencia: 58 },
  { hora: '09:00', peticiones: 14800, latencia: 78 },
  { hora: '12:00', peticiones: 19400, latencia: 92 },
  { hora: '15:00', peticiones: 18200, latencia: 86 },
  { hora: '18:00', peticiones: 22800, latencia: 98 },
  { hora: '21:00', peticiones: 15900, latencia: 74 },
];

const distribucionRegion = [
  { nombre: 'us-east-1 (N. Virginia)', valor: 55, color: '#3B82F6' },
  { nombre: 'sa-east-1 (São Paulo)', valor: 25, color: '#10B981' },
  { nombre: 'eu-west-1 (Irlanda)', valor: 15, color: '#F59E0B' },
  { nombre: 'us-west-2 (Oregón)', valor: 5, color: '#8B5CF6' },
];

const pilaresWellArchitected = [
  { nombre: 'Excelencia Operativa', porcentaje: 95, color: 'bg-blue-500' },
  { nombre: 'Seguridad', porcentaje: 92, color: 'bg-emerald-500' },
  { nombre: 'Confiabilidad (Multi-AZ)', porcentaje: 98, color: 'bg-indigo-500' },
  { nombre: 'Eficiencia de Rendimiento', porcentaje: 88, color: 'bg-purple-500' },
  { nombre: 'Optimización de Costos', porcentaje: 84, color: 'bg-amber-500' },
];

export default function Dashboard() {
  const { mode } = useBackend();
  return mode === 'api' ? <ConnectedDashboard /> : <DemoDashboard />;
}

function DemoDashboard() {
  const { costoMensual, propuestas, itemsCosto, ambiente, regionPrincipal } = useCloud();
  const { esOscuro } = useTheme();
  const [tabGrafico, setTabGrafico] = useState<'costos' | 'trafico' | 'regiones'>('costos');
  const [modoPico, setModoPico] = useState(false);
  const [modalReporte, setModalReporte] = useState(false);

  const gridColor = esOscuro ? 'rgba(255,255,255,0.07)' : '#E2E8F0';
  const tickColor = esOscuro ? '#64748B' : '#64748B';
  const tooltipBg = esOscuro ? '#0d1433' : '#ffffff';
  const tooltipBorder = esOscuro ? 'rgba(255,255,255,0.1)' : '#E2E8F0';
  const tooltipColor = esOscuro ? '#e2e8f0' : '#0f172a';
  const cursorFill = esOscuro ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)';

  const datosTrafico = modoPico ? traficoPico : traficoNormal;

  const cargasActivas = [
    {
      id: 'wk-1',
      nombre: 'App Web Cluster',
      tipo: 'Amazon EC2 (Auto Scaling)',
      instancias: ambiente === 'Sandbox'
        ? '1 x t3.micro (Dev Standalone)'
        : ambiente === 'Staging'
        ? (modoPico ? '3 x t3.medium (Pre-Prod)' : '2 x t3.medium (Pre-Prod)')
        : (modoPico ? '6 x t3.medium (Auto-Scaled)' : '4 x t3.medium (Multi-AZ)'),
      zona: `${regionPrincipal}a / ${regionPrincipal}b`,
      cpu: ambiente === 'Sandbox' ? '18%' : (modoPico ? '74%' : '34%'),
      memoria: ambiente === 'Sandbox' ? '32%' : (modoPico ? '68%' : '48%'),
      estado: 'activo' as const,
    },
    {
      id: 'wk-2',
      nombre: 'PostgreSQL Relational DB',
      tipo: ambiente === 'Sandbox' ? 'Amazon RDS (Single-AZ)' : 'Amazon RDS (Multi-AZ)',
      instancias: ambiente === 'Sandbox'
        ? '1 x db.t3.micro (Single-AZ)'
        : ambiente === 'Staging'
        ? '1 x db.t3.small (Single-AZ QA)'
        : '1 x db.t3.medium (Multi-AZ Standby)',
      zona: `${regionPrincipal} (VPC ${ambiente})`,
      cpu: ambiente === 'Sandbox' ? '12%' : (modoPico ? '52%' : '28%'),
      memoria: ambiente === 'Sandbox' ? '28%' : '62%',
      estado: 'activo' as const,
    },
    {
      id: 'wk-3',
      nombre: 'Assets & Multimedia Storage',
      tipo: 'Amazon S3 (Standard)',
      instancias: ambiente === 'Sandbox' ? '1 Bucket · 5 GB' : ambiente === 'Staging' ? '2 Buckets · 45 GB' : '3 Buckets · 120 GB',
      zona: 'Global Multi-Region',
      cpu: 'N/A',
      memoria: '11 nueves durabilidad',
      estado: 'activo' as const,
    },
    {
      id: 'wk-4',
      nombre: 'Edge CDN & WAF Shield',
      tipo: 'CloudFront + AWS WAF',
      instancias: ambiente === 'Sandbox' ? 'Direct Origin (Sin CDN)' : '450+ Edge PoPs',
      zona: 'Global Edge',
      cpu: modoPico ? '98% Hit Ratio' : '94% Hit Ratio',
      memoria: 'TLS 1.3 Strict',
      estado: 'activo' as const,
    },
  ];

  const categorias = [
    'Cómputo',
    'Almacenamiento',
    'Base de datos',
    'Redes',
    'Seguridad e identidad',
    'Entrega de contenido',
  ];

  const datosCosto = categorias.map((cat) => {
    const servicios = serviciosAWS.filter((s) => s.categoria === cat).map((s) => s.id);
    const costo = itemsCosto
      .filter((i) => servicios.includes(i.servicioId))
      .reduce((acc, item) => {
        const s = serviciosAWS.find((x) => x.id === item.servicioId);
        return acc + (s ? s.precioUnitario * item.cantidad * item.horasMes : 0);
      }, 0);
    return { categoria: cat, costo: Math.round(costo * 100) / 100 };
  });

  const correctos = controlesSeguridad.filter((c) => c.nivel === 'correcto').length;
  const totalSeguridad = controlesSeguridad.length;
  const pctSeguridad = Math.round((correctos / totalSeguridad) * 100);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 rounded-2xl bg-card border border-line text-xs shadow-xs">
        <div className="flex flex-wrap items-center gap-4">
          <span className="flex items-center gap-1.5 font-bold text-ink">
            <Radio size={14} className="text-emerald-500 animate-pulse" /> Telemetría Global:
            <InfoTooltip
              titulo="Telemetría Global en Tiempo Real"
              descripcion="Métricas de observabilidad capturadas por Amazon CloudWatch cada 60 segundos. Reflejan el estado agregado de todos los recursos activos en la arquitectura Multi-AZ."
            />
          </span>
          <span className="text-muted flex items-center gap-1">
            CPU: <span className="font-mono font-bold text-ink">{modoPico ? '74%' : '32%'}</span>
            <InfoTooltip
              titulo="Uso de CPU Promedio"
              descripcion="Porcentaje promedio de vCPU consumido por todas las instancias EC2 activas. Un valor superior al 80% sostenido activa el Auto Scaling Group para agregar instancias."
            />
          </span>
          <span className="text-slate-300">|</span>
          <span className="text-muted flex items-center gap-1">
            Peticiones: <span className="font-mono font-bold text-blue-600">{modoPico ? '19,400 req/s' : '5,420 req/s'}</span>
            <InfoTooltip
              titulo="Peticiones por Segundo (RPS)"
              descripcion="Volumen de solicitudes HTTP/HTTPS procesadas por segundo en el Application Load Balancer (ALB). Incluye peticiones cacheadas por CloudFront CDN."
            />
          </span>
          <span className="text-slate-300">|</span>
          <span className="text-muted flex items-center gap-1">
            Latencia P99: <span className="font-mono font-bold text-ink">{modoPico ? '52 ms' : '38 ms'}</span>
            <InfoTooltip
              titulo="Latencia P99 (Percentil 99)"
              descripcion="El 99% de las peticiones se responden en este tiempo o menos. Es la métrica más crítica del SLA: valores superiores a 200ms indican degradación de servicio."
            />
          </span>
          <span className="text-slate-300">|</span>
          <span className="text-muted flex items-center gap-1">
            Tasa de Error: <span className="font-mono font-bold text-emerald-600">0.001%</span>
            <InfoTooltip
              titulo="Tasa de Error HTTP 5xx"
              descripcion="Porcentaje de peticiones que resultaron en error del servidor (5xx). Un valor bajo indica alta disponibilidad. Objetivo: mantener por debajo del 0.1% según SLA."
            />
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setModoPico(!modoPico)}
            className={`px-3 py-1 rounded-xl font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              modoPico
                ? 'bg-rose-500/15 text-rose-600 border border-rose-500/30'
                : 'bg-blue-500/10 text-blue-600 border border-blue-500/20 hover:bg-blue-500/20'
            }`}
          >
            <Flame size={14} className={modoPico ? 'animate-bounce text-rose-600' : ''} />
            {modoPico ? 'Desactivar Simulación Pico' : 'Simular Pico Black Friday (18k req/s)'}
          </button>
          {!modoPico && (
            <InfoTooltip
              titulo="Simulador de Carga Pico"
              descripcion="Simula el tráfico de un evento de alta demanda (ej. Black Friday). Escala métricas de CPU, peticiones y latencia a niveles de 18,000+ req/s para visualizar el comportamiento del Auto Scaling."
            />
          )}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-3xl bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-800 dark:from-blue-900 dark:via-indigo-900 dark:to-slate-900 p-6 text-white shadow-xl">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5 items-center justify-center">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-40" style={{ animationDuration: '4s' }} />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]" />
            </span>
            <p className="text-xs font-bold uppercase tracking-wider text-blue-200 dark:text-blue-300">
              Arquitectura de {ambiente} Operativa · {ambiente === 'Sandbox' ? 'Single-AZ (Desarrollo)' : ambiente === 'Staging' ? 'Multi-AZ (Pre-Producción)' : 'Multi-AZ Alta Resiliencia'} · Región {regionPrincipal}
            </p>
          </div>
          <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white">
            Panel de Control Ejecutivo y Observabilidad Cloud
          </h2>
          <p className="text-xs text-blue-100 dark:text-slate-300 max-w-xl">
            Centro de comando para el diseño y simulación de la solución AWS: Resiliencia Multi-AZ, estimación OpEx y directivas de seguridad.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <Link
            to="/planning"
            className="inline-flex items-center gap-2 rounded-xl bg-white text-blue-600 dark:bg-blue-600 dark:text-white px-3.5 py-2 text-xs font-bold shadow-md hover:bg-blue-50 dark:hover:bg-blue-500 transition-all cursor-pointer"
          >
            <PlusCircle size={15} /> Nueva Propuesta
          </Link>
          <Link
            to="/costs"
            className="inline-flex items-center gap-2 rounded-xl bg-white/15 dark:bg-white/10 px-3.5 py-2 text-xs font-bold text-white backdrop-blur-sm hover:bg-white/25 dark:hover:bg-white/20 transition-all border border-white/20 dark:border-white/15 cursor-pointer"
          >
            <Calculator size={15} /> Presupuesto
          </Link>
          <Link
            to="/network"
            className="inline-flex items-center gap-2 rounded-xl bg-white/15 dark:bg-white/10 px-3.5 py-2 text-xs font-bold text-white backdrop-blur-sm hover:bg-white/25 dark:hover:bg-white/20 transition-all border border-white/20 dark:border-white/15 cursor-pointer"
          >
            <Network size={15} /> Topología VPC
          </Link>
          <button
            onClick={() => setModalReporte(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow-md transition-all cursor-pointer"
            title="Generar e imprimir informe ejecutivo en PDF"
          >
            <FileText size={15} /> Reporte PDF
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          titulo="Costo mensual proyectado"
          valor={usd(costoMensual)}
          detalle={`Presupuesto anual: ${usd(costoMensual * 12)}`}
          icono={DollarSign}
          tono="cost"
          tendencia={`Entorno ${ambiente}`}
          tendenciaPositiva={true}
          info={{
            titulo: "Costo Mensual Proyectado",
            descripcion: "Suma del costo estimado de todos los recursos activos. Calculado como: Precio unitario × Cantidad × Horas/mes. Refleja tarifa On-Demand estándar de AWS sin compromisos."
          }}
        />
        <StatCard
          titulo="SLA de Disponibilidad"
          valor={ambiente === 'Sandbox' ? '99.50%' : ambiente === 'Staging' ? '99.90%' : '99.99%'}
          detalle={ambiente === 'Sandbox' ? 'Ambiente Dev (Single-AZ)' : ambiente === 'Staging' ? 'Pre-Producción (Multi-AZ)' : 'Tolerancia a fallos Multi-AZ'}
          icono={Activity}
          tono="safe"
          tendencia={ambiente === 'Sandbox' ? 'Pruebas internas' : ambiente === 'Staging' ? 'SLA Staging QA' : '4.3 min caída/año max'}
          tendenciaPositiva={true}
          info={{
            titulo: "SLA de Disponibilidad",
            descripcion: "Service Level Agreement garantizado por la arquitectura. Producción ofrece 99.99%, Staging 99.90% y Sandbox 99.50%."
          }}
        />
        <StatCard
          titulo="Cumplimiento de Seguridad"
          valor={`${pctSeguridad}%`}
          detalle={`${correctos} de ${totalSeguridad} controles verificados`}
          icono={ShieldCheck}
          tono="purple"
          tendencia="CIS Benchmark Level 1"
          tendenciaPositiva={true}
          info={{
            titulo: "Score de Cumplimiento de Seguridad",
            descripcion: "Porcentaje de controles de seguridad en estado 'correcto' según el CIS AWS Foundations Benchmark v1.4 y el pilar de Seguridad del AWS Well-Architected Framework."
          }}
        />
        <StatCard
          titulo="Cargas de Trabajo Desplegadas"
          valor={`${cargasActivas.length} Clusters`}
          detalle={`${propuestas.length} propuestas registradas`}
          icono={Layers}
          tono="brand"
          tendencia={ambiente === 'Sandbox' ? '1 instancia base (Dev)' : ambiente === 'Staging' ? (modoPico ? 'Escalado a 3 instancias' : '2 instancias base') : (modoPico ? 'Escalado a 6 instancias' : 'Flota Base (4 instancias)')}
          tendenciaPositiva={true}
          info={{
            titulo: "Cargas de Trabajo (Workloads)",
            descripcion: "Una workload es un conjunto de recursos AWS (EC2, RDS, S3, etc.) que forman una aplicación completa. Cada workload tiene su propia configuración de escalado, monitoreo y seguridad."
          }}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 flex flex-col justify-between">
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
              <div>
                <h3 className="text-base font-bold text-ink flex items-center gap-2">
                  Telemetría y Distribución de Recursos
                  <InfoTooltip
                    titulo="Telemetría y Distribución de Recursos"
                    descripcion="Visualización de datos de CloudWatch Metrics y Cost Explorer. Las pestañas muestran: Costos por categoría de servicio, Tráfico de peticiones en 24h, y Distribución de carga por región geográfica."
                    size="md"
                  />
                </h3>
                <p className="text-xs text-muted">
                  {modoPico ? 'Simulando tráfico extremo de pico con auto-escalado' : 'Métricas en tiempo real procesadas desde CloudWatch'}
                </p>
              </div>

              <div className="flex items-center rounded-xl bg-canvas p-1 border border-line">
                <button
                  onClick={() => setTabGrafico('costos')}
                  className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                    tabGrafico === 'costos'
                      ? 'bg-card text-blue-600 shadow-xs border border-line'
                      : 'text-muted hover:text-ink'
                  }`}
                >
                  Costos por Categoría
                </button>
                <button
                  onClick={() => setTabGrafico('trafico')}
                  className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                    tabGrafico === 'trafico'
                      ? 'bg-card text-blue-600 shadow-xs border border-line'
                      : 'text-muted hover:text-ink'
                  }`}
                >
                  Tráfico 24h
                </button>
                <button
                  onClick={() => setTabGrafico('regiones')}
                  className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                    tabGrafico === 'regiones'
                      ? 'bg-card text-blue-600 shadow-xs border border-line'
                      : 'text-muted hover:text-ink'
                  }`}
                >
                  Carga por Región
                </button>
              </div>
            </div>

            <div className="h-72 w-full">
              {tabGrafico === 'costos' && (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={datosCosto} margin={{ top: 12, right: 12, bottom: 20, left: -10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                    <XAxis
                      dataKey="categoria"
                      tick={{ fontSize: 11, fill: tickColor }}
                      interval={0}
                      angle={-15}
                      textAnchor="end"
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: tickColor }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => `$${v}`}
                    />
                    <Tooltip
                      formatter={(v: any) => [`$${Number(v || 0).toFixed(2)} USD`, 'Costo estimado']}
                      cursor={{ fill: cursorFill }}
                      contentStyle={{
                        borderRadius: 12,
                        border: `1px solid ${tooltipBorder}`,
                        fontSize: 12,
                        background: tooltipBg,
                        color: tooltipColor,
                        boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
                      }}
                    />
                    <Bar dataKey="costo" fill="#2563EB" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}

              {tabGrafico === 'trafico' && (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={datosTrafico} margin={{ top: 12, right: 12, bottom: 0, left: -10 }}>
                    <defs>
                      <linearGradient id="colorPeticiones" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={modoPico ? '#EF4444' : '#3B82F6'} stopOpacity={0.4} />
                        <stop offset="95%" stopColor={modoPico ? '#EF4444' : '#3B82F6'} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                    <XAxis dataKey="hora" tick={{ fontSize: 11, fill: tickColor }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: tickColor }} tickLine={false} axisLine={false} />
                    <Tooltip
                      formatter={(v: any) => [`${Number(v || 0).toLocaleString()} req/min`, 'Peticiones']}
                      cursor={{ stroke: cursorFill, strokeWidth: 1, fill: cursorFill }}
                      contentStyle={{
                        borderRadius: 12,
                        border: `1px solid ${tooltipBorder}`,
                        fontSize: 12,
                        background: tooltipBg,
                        color: tooltipColor,
                        boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="peticiones"
                      stroke={modoPico ? '#DC2626' : '#2563EB'}
                      strokeWidth={2.5}
                      fillOpacity={1}
                      fill="url(#colorPeticiones)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}

              {tabGrafico === 'regiones' && (
                <div className="flex flex-col sm:flex-row items-center justify-center gap-6 h-full">
                  <div className="h-56 w-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={distribucionRegion}
                          dataKey="valor"
                          nameKey="nombre"
                          innerRadius={55}
                          outerRadius={85}
                          paddingAngle={3}
                        >
                          {distribucionRegion.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(v: any) => [`${v}% de peticiones`, 'Tráfico']}
                          contentStyle={{
                            borderRadius: 12,
                            border: `1px solid ${tooltipBorder}`,
                            fontSize: 12,
                            background: tooltipBg,
                            color: tooltipColor,
                            boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-2 text-xs">
                    {distribucionRegion.map((r) => (
                      <div key={r.nombre} className="flex items-center gap-2.5">
                        <span className="h-3 w-3 rounded-md" style={{ backgroundColor: r.color }} />
                        <span className="text-ink font-medium">{r.nombre}:</span>
                        <span className="text-muted font-bold">{r.valor}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-line pt-3 mt-4 text-xs text-muted">
            <span>Fuente: AWS CloudWatch Metrics & Cost Explorer Simulator</span>
            <Link to="/costs" className="text-blue-600 font-semibold hover:underline flex items-center gap-1">
              Ver desglose detallado <ArrowUpRight size={13} />
            </Link>
          </div>
        </Card>

        <Card className="flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-ink flex items-center gap-2">
                  Well-Architected Framework
                  <InfoTooltip
                    titulo="AWS Well-Architected Framework"
                    descripcion="Marco de buenas prácticas de AWS con 5 pilares: Excelencia Operativa, Seguridad, Confiabilidad, Eficiencia de Rendimiento y Optimización de Costos. El porcentaje indica el nivel de adopción de las mejores prácticas en cada área."
                    size="md"
                  />
                </h3>
                <p className="text-xs text-muted">Evaluación de los 5 pilares arquitectónicos</p>
              </div>
              <span className="rounded-full bg-emerald-500/10 text-emerald-600 font-bold px-2 py-0.5 text-xs">
                Nivel Óptimo
              </span>
            </div>

            <div className="space-y-4">
              {pilaresWellArchitected.map((pilar) => (
                <div key={pilar.nombre} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-ink">{pilar.nombre}</span>
                    <span className="font-mono font-bold text-muted">{pilar.porcentaje}%</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-canvas overflow-hidden border border-line">
                    <div
                      className={`h-full rounded-full ${pilar.color} transition-all duration-700`}
                      style={{ width: `${pilar.porcentaje}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl bg-canvas p-3 border border-line mt-6 space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-ink">
              <ShieldCheck size={16} className="text-emerald-500" />
              <span>Diagnóstico de Arquitectura</span>
            </div>
            <p className="text-[11px] text-muted leading-relaxed">
              La solución cumple con las mejores prácticas de desacoplamiento, almacenamiento inmutable y conmutación automática por error.
            </p>
          </div>
        </Card>
      </div>

      <Card>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div>
            <h3 className="text-base font-bold text-ink flex items-center gap-2">
              Estado de Cargas de Trabajo (Workloads)
              <InfoTooltip
                titulo="Cargas de Trabajo Activas"
                descripcion="Tabla de recursos AWS en ejecución. CPU y RAM muestran el uso promedio de los últimos 5 minutos. Estado 'Activo' confirma que el health check del ALB es positivo y el servicio responde correctamente."
                size="md"
              />
            </h3>
            <p className="text-xs text-muted">Instancias y recursos activos en las zonas de disponibilidad configuradas</p>
          </div>
          <span className="text-xs font-semibold text-muted bg-canvas border border-line px-3 py-1 rounded-lg">
            Región primaria: us-east-1
          </span>
        </div>

        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-line text-muted">
                <th className="pb-3 font-semibold">Carga de Trabajo</th>
                <th className="pb-3 font-semibold">Tipo de Servicio</th>
                <th className="pb-3 font-semibold">Ubicación / Zonas</th>
                <th className="pb-3 font-semibold">Rendimiento / Telemetría</th>
                <th className="pb-3 font-semibold text-right">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60 text-ink">
              {cargasActivas.map((w) => (
                <tr key={w.id} className="hover:bg-canvas/50 transition-colors">
                  <td className="py-3 font-bold">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
                      {w.nombre}
                    </div>
                  </td>
                  <td className="py-3 font-mono text-muted">{w.tipo}</td>
                  <td className="py-3 text-muted">{w.zona}</td>
                  <td className="py-3">
                    <span className="font-mono bg-canvas border border-line px-2 py-0.5 rounded text-[11px] text-ink font-semibold">
                      CPU: {w.cpu} · RAM: {w.memoria}
                    </span>
                  </td>
                  <td className="py-3 text-right">
                    <StatusBadge nivel={w.estado} pulso={true} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="md:hidden space-y-3">
          {cargasActivas.map((w) => (
            <div key={w.id} className="rounded-xl bg-canvas border border-line p-3 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
                  <span className="font-bold text-sm text-ink truncate">{w.nombre}</span>
                </div>
                <StatusBadge nivel={w.estado} pulso={true} />
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                <div>
                  <p className="text-muted font-semibold uppercase tracking-wide text-[10px]">Servicio</p>
                  <p className="font-mono text-ink mt-0.5">{w.tipo}</p>
                </div>
                <div>
                  <p className="text-muted font-semibold uppercase tracking-wide text-[10px]">Zona / Región</p>
                  <p className="text-ink mt-0.5">{w.zona}</p>
                </div>
              </div>
              <div className="pt-1 border-t border-line/60">
                <span className="font-mono bg-card border border-line px-2.5 py-1 rounded-lg text-[11px] text-ink font-semibold inline-block">
                  CPU: {w.cpu} · RAM: {w.memoria}
                </span>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-bold text-ink flex items-center gap-2">
                Registro de Auditoría
                <InfoTooltip
                  titulo="CloudWatch & CloudTrail"
                  descripcion="AWS CloudTrail registra cada llamada a la API realizada en tu cuenta (quién, qué, cuándo, desde dónde). CloudWatch complementa con métricas de rendimiento. Esencial para auditoría de seguridad y cumplimiento normativo."
                  size="md"
                />
              </h3>
              <p className="text-xs text-muted">Últimos eventos de llamadas a la API de AWS</p>
            </div>
            <Radio size={16} className="text-blue-600 animate-pulse" />
          </div>

          <div className="space-y-3">
            {eventosAuditoria.map((evt) => (
              <div
                key={evt.id}
                className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-2.5 rounded-xl bg-canvas border border-line hover:bg-card transition-colors text-xs"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="font-bold text-ink">{evt.servicio} · {evt.evento}</p>
                    <span className="text-[10px] font-mono text-muted bg-card px-1.5 py-0.5 rounded border border-line shrink-0">
                      {evt.region}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted mt-0.5">
                    Por <span className="font-semibold text-ink">{evt.actor}</span> · {evt.tiempo}
                  </p>
                </div>
                <div className="self-start sm:self-center shrink-0">
                  <StatusBadge nivel={evt.estado === 'Éxito' ? 'correcto' : 'revision'} texto={evt.estado} />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-bold text-ink flex items-center gap-2">
                Resumen de Controles de Seguridad
                <InfoTooltip
                  titulo="Modelo de Responsabilidad Compartida"
                  descripcion="AWS gestiona la seguridad 'DE' la nube (hardware, red física, hipervisor). El cliente gestiona la seguridad 'EN' la nube (SO, aplicaciones, datos, IAM, cifrado). Los controles aquí verifican ambas capas."
                  size="md"
                />
              </h3>
              <p className="text-xs text-muted">Supervisión del modelo de responsabilidad compartida</p>
            </div>
            <Link to="/security" className="text-xs text-blue-600 font-semibold hover:underline">
              Ver todos ({totalSeguridad})
            </Link>
          </div>

          <div className="space-y-3">
            {controlesSeguridad.slice(0, 5).map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-canvas border border-line text-xs"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-ink truncate">{c.titulo}</p>
                  <p className="text-[11px] text-muted truncate">{c.dominio}</p>
                </div>
                <StatusBadge nivel={c.nivel} />
              </div>
            ))}
          </div>

          <div className="mt-4 pt-3 border-t border-line flex items-center justify-between text-xs text-muted">
            <span>Privilegio mínimo & MFA activos</span>
            <Link to="/security" className="text-blue-600 font-semibold hover:underline">
              Revisar políticas IAM →
            </Link>
          </div>
        </Card>
      </div>

      <ReportModal abierto={modalReporte} onCerrar={() => setModalReporte(false)} />
    </div>
  );
}
