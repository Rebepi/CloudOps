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
import { useTheme } from '../context/ThemeContext';
import { serviciosAWS } from '../data/awsServices';
import { useAws } from '../hooks/useAws';
import { StatCard } from '../components/StatCard';
import { Card } from '../components/ui/Card';
import { StatusBadge } from '../components/ui/StatusBadge';
import { InfoTooltip } from '../components/ui/InfoTooltip';
import { usd } from '../lib/format';

export default function Dashboard() {
  const { costoMensual, propuestas, itemsCosto, ambiente, regionPrincipal } = useCloud();
  const overview = useAws<{ inventory?: { instances: { id: string; name: string | null; type: string; state: string; zone: string }[]; databases: { id: string; engine: string; class: string; status: string; zone: string }[] }; buckets?: { name: string }[]; events?: { id: string; name: string; source: string; time: string; username: string }[]; cpu?: { instanceId: string; cpuPercent: number | null }[] }>(`/aws/overview?region=${regionPrincipal}`);
  const security = useAws<{ accountSummary: Record<string, number>; identities: { mfa: boolean }[]; trails: { isLogging: boolean | null }[] }>(`/aws/security?region=${regionPrincipal}`);
  const { esOscuro } = useTheme();
  const [tabGrafico, setTabGrafico] = useState<'costos' | 'trafico' | 'regiones'>('costos');
  const [modalReporte, setModalReporte] = useState(false);

  const gridColor = esOscuro ? 'rgba(255,255,255,0.07)' : '#E2E8F0';
  const tickColor = esOscuro ? '#64748B' : '#64748B';
  const tooltipBg = esOscuro ? '#0d1433' : '#ffffff';
  const tooltipBorder = esOscuro ? 'rgba(255,255,255,0.1)' : '#E2E8F0';
  const tooltipColor = esOscuro ? '#e2e8f0' : '#0f172a';
  const cursorFill = esOscuro ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)';

  const datosTrafico = (overview.data?.cpu ?? []).filter((m) => m.cpuPercent !== null).map((m) => ({ hora: m.instanceId, peticiones: m.cpuPercent }));
  const distribucionRegion = overview.data?.inventory ? [{ nombre: regionPrincipal, valor: overview.data.inventory.instances.length + overview.data.inventory.databases.length, color: '#3B82F6' }] : [];

  const cargasActivas = [
    ...(overview.data?.inventory?.instances ?? []).map((i) => ({ id: i.id, nombre: i.name ?? i.id, tipo: `EC2 ${i.type}`, zona: i.zone ?? regionPrincipal, cpu: overview.data?.cpu?.find((m) => m.instanceId === i.id)?.cpuPercent?.toFixed(1) ?? 'sin dato', memoria: 'sin métrica', estado: i.state === 'running' ? 'activo' as const : 'revision' as const })),
    ...(overview.data?.inventory?.databases ?? []).map((d) => ({ id: d.id, nombre: d.id, tipo: `RDS ${d.engine} ${d.class}`, zona: d.zone ?? regionPrincipal, cpu: 'sin métrica', memoria: 'sin métrica', estado: d.status === 'available' ? 'activo' as const : 'revision' as const })),
    ...(overview.data?.buckets ?? []).map((b) => ({ id: b.name, nombre: b.name, tipo: 'Amazon S3', zona: 'Global', cpu: 'no aplica', memoria: 'no aplica', estado: 'activo' as const })),
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
        return acc + (item.precioUnitario == null ? 0 : item.precioUnitario * item.cantidad * (item.unidadPrecio === 'Hrs' ? item.horasMes : 1));
      }, 0);
    return { categoria: cat, costo: Math.round(costo * 100) / 100 };
  });
  const controlesCuenta = security.data ? [
    { id: 'root-mfa', titulo: 'MFA de la cuenta root', dominio: `IAM: ${security.data.accountSummary.AccountMFAEnabled ?? 'sin dato'}`, nivel: security.data.accountSummary.AccountMFAEnabled === 1 ? 'correcto' as const : 'revision' as const },
    { id: 'iam-mfa', titulo: 'MFA de usuarios IAM', dominio: `${security.data.identities.filter((i) => i.mfa).length}/${security.data.identities.length} usuarios`, nivel: security.data.identities.every((i) => i.mfa) ? 'correcto' as const : 'revision' as const },
    { id: 'trail', titulo: 'CloudTrail activo', dominio: `${security.data.trails.filter((t) => t.isLogging).length} trails registrando`, nivel: security.data.trails.some((t) => t.isLogging) ? 'correcto' as const : 'revision' as const },
  ] : [];


  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 rounded-2xl bg-card border border-line text-xs shadow-xs">
        <div className="flex flex-wrap items-center gap-4">
          <span className="flex items-center gap-1.5 font-bold text-ink">
            <Radio size={14} className="text-amber-500" /> Telemetría de CloudWatch:
            <InfoTooltip
              titulo="Telemetría Global en Tiempo Real"
              descripcion="Métricas de observabilidad capturadas por Amazon CloudWatch cada 60 segundos. Reflejan el estado agregado de todos los recursos activos en la arquitectura Multi-AZ."
            />
          </span>
          <span className="text-muted flex items-center gap-1">
            CPU EC2: <span className="font-mono font-bold text-ink">{overview.data?.cpu?.some((m) => m.cpuPercent !== null) ? `${(overview.data.cpu.reduce((sum, m) => sum + (m.cpuPercent ?? 0), 0) / overview.data.cpu.filter((m) => m.cpuPercent !== null).length).toFixed(1)}%` : 'Sin métrica'}</span>
            <InfoTooltip
              titulo="Uso de CPU Promedio"
              descripcion="Porcentaje promedio de vCPU consumido por todas las instancias EC2 activas. Un valor superior al 80% sostenido activa el Auto Scaling Group para agregar instancias."
            />
          </span>
          <span className="text-slate-300">|</span>
          <span className="text-muted flex items-center gap-1">
            EC2: <span className="font-mono font-bold text-blue-600">{overview.data?.inventory?.instances.length ?? '—'}</span>
            <InfoTooltip
              titulo="Peticiones por Segundo (RPS)"
              descripcion="Volumen de solicitudes HTTP/HTTPS procesadas por segundo en el Application Load Balancer (ALB). Incluye peticiones cacheadas por CloudFront CDN."
            />
          </span>
          <span className="text-slate-300">|</span>
          <span className="text-muted flex items-center gap-1">
            RDS: <span className="font-mono font-bold text-ink">{overview.data?.inventory?.databases.length ?? '—'}</span>
            <InfoTooltip
              titulo="Latencia P99 (Percentil 99)"
              descripcion="El 99% de las peticiones se responden en este tiempo o menos. Es la métrica más crítica del SLA: valores superiores a 200ms indican degradación de servicio."
            />
          </span>
          <span className="text-slate-300">|</span>
          <span className="text-muted flex items-center gap-1">
            S3: <span className="font-mono font-bold text-emerald-600">{overview.data?.buckets?.length ?? '—'}</span>
            <InfoTooltip
              titulo="Tasa de Error HTTP 5xx"
              descripcion="Porcentaje de peticiones que resultaron en error del servidor (5xx). Un valor bajo indica alta disponibilidad. Objetivo: mantener por debajo del 0.1% según SLA."
            />
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button disabled title="La prueba de carga requiere una fuente real de telemetría y autorización para ejecutarla" className="px-3 py-1 rounded-xl font-bold flex items-center gap-1.5 bg-blue-500/10 text-blue-600 border border-blue-500/20 opacity-50"><Flame size={14} /> Simular Pico Black Friday</button>
          <span className="text-xs text-muted">{overview.observedAt ? new Date(overview.observedAt).toLocaleString('es-PE') : 'Consultando AWS'}</span>
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
              Escenario de {ambiente} · {ambiente === 'Sandbox' ? 'Single-AZ (Desarrollo)' : ambiente === 'Staging' ? 'Multi-AZ (Pre-Producción)' : 'Multi-AZ Alta Resiliencia'} · Región {regionPrincipal}
            </p>
          </div>
          <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white">
            Panel de Control Ejecutivo y Observabilidad Cloud
          </h2>
          <p className="text-xs text-blue-100 dark:text-slate-300 max-w-xl">
            Centro de comando para consultar recursos AWS, estimaciones locales y controles de seguridad observados.
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
            title="Generar informe de la cuenta"
          >
            <FileText size={15} /> Informe de la cuenta
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          titulo="Estimación local cotizada"
          valor={usd(costoMensual)}
          detalle={`Presupuesto anual: ${usd(costoMensual * 12)}`}
          icono={DollarSign}
          tono="cost"
          tendencia={`${itemsCosto.filter((i) => i.precioUnitario != null).length} partidas cotizadas`}
          tendenciaPositiva={true}
          info={{
            titulo: "Costo Mensual Proyectado",
            descripcion: "Suma parcial de las ofertas AWS seleccionadas para partidas locales. No equivale al gasto real ni incorpora componentes no modelados."
          }}
        />
        <StatCard
          titulo="Disponibilidad observada"
          valor="Sin medición"
          detalle="No hay SLA calculado para esta cuenta"
          icono={Activity}
          tono="safe"
          tendencia={`Región ${regionPrincipal}`}
          tendenciaPositiva={true}
          info={{
            titulo: "SLA de Disponibilidad",
            descripcion: "Esta vista no mide disponibilidad extremo a extremo ni establece un SLA contractual."
          }}
        />
        <StatCard
          titulo="Seguridad de la cuenta"
          valor="Ver controles"
          detalle="Evidencia IAM, VPC y CloudTrail"
          icono={ShieldCheck}
          tono="purple"
          tendencia="Sin certificación"
          tendenciaPositiva={true}
          info={{
            titulo: "Controles verificables",
            descripcion: "La pantalla Seguridad muestra comprobaciones basadas en AWS; este tablero no calcula un puntaje CIS."
          }}
        />
        <StatCard
          titulo="Recursos detectados"
          valor={overview.loading ? 'Consultando' : overview.error ? 'Sin dato' : `${cargasActivas.length}`}
          detalle={`${propuestas.length} propuestas registradas`}
          icono={Layers}
          tono="brand"
          tendencia="EC2, RDS y S3"
          tendenciaPositiva={true}
          info={{
            titulo: "Cargas de Trabajo (Workloads)",
            descripcion: "Recuento de EC2 y RDS de la región elegida, más buckets S3 globales. No implica que formen clusters o una aplicación completa."
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
                  Costos cotizados y métricas disponibles de AWS
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
                  CPU EC2
                </button>
                <button
                  onClick={() => setTabGrafico('regiones')}
                  className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                    tabGrafico === 'regiones'
                      ? 'bg-card text-blue-600 shadow-xs border border-line'
                      : 'text-muted hover:text-ink'
                  }`}
                >
                  Recursos en Región
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
                        <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                    <XAxis dataKey="hora" tick={{ fontSize: 11, fill: tickColor }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: tickColor }} tickLine={false} axisLine={false} />
                    <Tooltip
                      formatter={(v: any) => [`${Number(v || 0).toFixed(1)}%`, 'CPU EC2']}
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
                      stroke="#2563EB"
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
                          formatter={(v: any) => [`${v} recursos`, 'Inventario']}
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
                        <span className="text-muted font-bold">{r.valor} recursos</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-line pt-3 mt-4 text-xs text-muted">
            <span>Costos: ofertas AWS seleccionadas · CPU e inventario: AWS</span>
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
                Sin evaluación formal
              </span>
            </div>

            <div className="space-y-4 text-xs text-muted">No existe una evaluación Well-Architected de esta carga en los datos consultados. Los controles visibles en Seguridad muestran observaciones puntuales de IAM y CloudTrail.</div>
          </div>

          <div className="rounded-xl bg-canvas p-3 border border-line mt-6 space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-ink">
              <ShieldCheck size={16} className="text-emerald-500" />
              <span>Diagnóstico de Arquitectura</span>
            </div>
            <p className="text-[11px] text-muted leading-relaxed">
              Revisa los controles observados en la cuenta antes de atribuir una calificación arquitectónica.
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
            Región consultada: {regionPrincipal}
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
            {(overview.data?.events ?? []).map((evt) => (
              <div
                key={evt.id}
                className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-2.5 rounded-xl bg-canvas border border-line hover:bg-card transition-colors text-xs"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="font-bold text-ink">{evt.source} · {evt.name}</p>
                    <span className="text-[10px] font-mono text-muted bg-card px-1.5 py-0.5 rounded border border-line shrink-0">
                      {regionPrincipal}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted mt-0.5">
                    Por <span className="font-semibold text-ink">{evt.username ?? 'sin actor'}</span> · {evt.time ? new Date(evt.time).toLocaleString('es-PE') : 'sin fecha'}
                  </p>
                </div>
                <div className="self-start sm:self-center shrink-0">
                  <StatusBadge nivel="correcto" texto="Registrado" />
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
              Ver controles ({controlesCuenta.length})
            </Link>
          </div>

          <div className="space-y-3">
            {controlesCuenta.map((c) => (
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
            {security.error && <p className="text-xs text-rose-600">{security.error}</p>}
            {!security.data && !security.error && <p className="text-xs text-muted">Consultando AWS…</p>}
          </div>

          <div className="mt-4 pt-3 border-t border-line flex items-center justify-between text-xs text-muted">
            <span>Controles consultados en IAM y CloudTrail</span>
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
