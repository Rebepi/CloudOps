import { useState, useEffect, useMemo } from 'react';
import {
  Trash2,
  ClipboardList,
  Sparkles,
  Search,
  Eye,
  CheckCircle2,
  FileSpreadsheet,
  AlertCircle,
  AlertTriangle,
  Layers,
  ShieldCheck,
  ShieldAlert,
  Clock,
  DollarSign,
  Users,
  Globe,
  RotateCcw,
  Check,
  Compass,
  TrendingDown,
  Award,
  FileCheck2,
  Zap,
  RefreshCw,
  Download,
  CheckCheck,
} from 'lucide-react';
import { useCloud } from '../context/CloudContext';
import { useBackend } from '../context/BackendContext';
import { serviciosAWS } from '../data/awsServices';
import { regiones } from '../data/regions';
import { simularArquitecturaCloud } from '../lib/cloudSimulator';
import { Card } from '../components/ui/Card';
import { ServiceCard } from '../components/ServiceCard';
import { Modal } from '../components/ui/Modal';
import { InfoTooltip } from '../components/ui/InfoTooltip';
import { Select } from '../components/ui/Select';
import { fecha } from '../lib/format';
import type { PropuestaCloud } from '../types/cloud';

const disponibilidades = [
  {
    value: 'basica',
    label: 'Básica (99.5% SLA)',
    sublabel: 'Mono-AZ Estándar',
    downtime: '~43.8 h/año',
    desc: 'Despliegue estándar en una sola zona de disponibilidad. Apto para ambientes de desarrollo, pruebas y sistemas no críticos.',
    dotColor: 'bg-amber-500',
    badgeText: 'Dev / Testing',
  },
  {
    value: 'alta',
    label: 'Alta Disponibilidad (99.9% SLA)',
    sublabel: 'Multi-AZ con Balanceo',
    downtime: '~8.7 h/año',
    desc: 'Despliegue Multi-AZ con réplica síncrona en base de datos y balanceo de carga automático (ALB + Auto Scaling).',
    dotColor: 'bg-blue-500',
    badgeText: 'Recomendado',
  },
  {
    value: 'critica',
    label: 'Misión Crítica (99.99% SLA)',
    sublabel: 'Multi-Región Activo-Activo',
    downtime: '~52.6 min/año',
    desc: 'Failover global en milisegundos con Route 53, aceleración perimetral con CloudFront y réplica global continua.',
    dotColor: 'bg-purple-500',
    badgeText: 'Enterprise 24/7',
  },
];

const objetivos = [
  'Aumentar disponibilidad y resiliencia',
  'Reducir costos operativos (OpEx)',
  'Mejorar escalabilidad elástica',
  'Modernizar infraestructura legacy',
  'Expansión global de baja latencia',
  'Recuperación ante desastres (DRP)',
];

const marcosCumplimientoDetalles = [
  { id: 'SOC 2 Tipo II', nombre: 'SOC 2 Tipo II', desc: 'Auditoría SaaS y Seguridad Cloud' },
  { id: 'PCI-DSS v4.0', nombre: 'PCI-DSS v4.0', desc: 'Pasarela y Pagos con Tarjeta' },
  { id: 'ISO/IEC 27001', nombre: 'ISO/IEC 27001', desc: 'Gestión de Seguridad de la Información' },
  { id: 'HIPAA', nombre: 'HIPAA', desc: 'Protección de Datos Médicos' },
  { id: 'GDPR', nombre: 'GDPR', desc: 'Privacidad y Soberanía de Datos UE' },
];

const promptsSugeridos = [
  'Alta disponibilidad Multi-AZ con balanceador ALB y réplicas de lectura RDS.',
  'Arquitectura serverless event-driven con Lambda, API Gateway y DynamoDB.',
  'Estrategia DRP con RTO < 1h, RPO < 15m y backups cifrados en S3.',
  'Cifrado integral con KMS y políticas IAM de privilegio mínimo.',
];

const presetsServicios = [
  {
    nombre: 'Web 3-Capas',
    servicios: ['ec2', 'rds', 'elb', 's3'],
  },
  {
    nombre: 'Serverless',
    servicios: ['lambda', 's3', 'dynamodb', 'cloudfront', 'route53'],
  },
  {
    nombre: 'Seguridad Reforzada',
    servicios: ['iam', 'kms', 'waf', 'cloudwatch'],
  },
];

interface PlantillaArquitectura {
  nombre: string;
  tipo: 'Web' | 'Móvil' | 'API' | 'Analítica' | 'Interna';
  descripcion: string;
  regionId: string;
  usuarios: number;
  disponibilidad: 'basica' | 'alta' | 'critica';
  servicios: string[];
  objetivo: string;
  presupuesto: number;
  rto: number;
  rpo: number;
  cumplimiento: string[];
}

const plantillas: PlantillaArquitectura[] = [
  {
    nombre: 'E-Commerce Global Multi-AZ',
    tipo: 'Web',
    descripcion: 'Tienda en línea de alta concurrencia con balanceador ALB, réplica de lectura en base de datos y aceleración CloudFront.',
    regionId: 'us-east-1',
    usuarios: 45000,
    disponibilidad: 'critica',
    servicios: ['ec2', 's3', 'rds', 'elb', 'cloudfront', 'route53', 'waf', 'kms'],
    objetivo: 'Aumentar disponibilidad y resiliencia',
    presupuesto: 350,
    rto: 1,
    rpo: 15,
    cumplimiento: ['PCI-DSS v4.0', 'SOC 2 Tipo II'],
  },
  {
    nombre: 'SaaS B2B Multi-Tenant Backend',
    tipo: 'API',
    descripcion: 'Microservicios API containerizados con políticas IAM granulares, monitoreo de CloudWatch y almacenamiento cifrado.',
    regionId: 'sa-east-1',
    usuarios: 12000,
    disponibilidad: 'alta',
    servicios: ['ec2', 'rds', 'ebs', 'iam', 'cloudwatch', 'kms'],
    objetivo: 'Mejorar escalabilidad elástica',
    presupuesto: 220,
    rto: 2,
    rpo: 30,
    cumplimiento: ['ISO/IEC 27001', 'GDPR'],
  },
  {
    nombre: 'Data Lake & Procesamiento Serverless',
    tipo: 'Analítica',
    descripcion: 'Ingesta de datos y archivos multimedia procesados con AWS Lambda y almacenados en buckets S3 inmutables.',
    regionId: 'us-east-1',
    usuarios: 8000,
    disponibilidad: 'alta',
    servicios: ['s3', 'lambda', 'cloudwatch', 'kms', 'iam'],
    objetivo: 'Reducir costos operativos (OpEx)',
    presupuesto: 140,
    rto: 4,
    rpo: 60,
    cumplimiento: ['SOC 2 Tipo II'],
  },
];

type FormState = Omit<PropuestaCloud, 'id' | 'creadaEn'>;

const estadoInicial: FormState = {
  nombre: '',
  tipoAplicacion: 'Web',
  descripcion: '',
  regionId: 'us-east-1',
  usuariosEstimados: 1000,
  disponibilidad: 'alta',
  serviciosSeleccionados: ['ec2', 's3', 'rds'],
  objetivoMigracion: objetivos[0],
  presupuestoMaximo: 200,
  rtoHoras: 2,
  rpoMinutos: 30,
  cumplimiento: ['SOC 2 Tipo II'],
};

export default function Planning() {
  const backend = useBackend();
  const canWrite = backend.mode === 'demo' || backend.permissions.includes('proposal:write');
  const { propuestas, propuestasCargando, propuestasError, agregarPropuesta, eliminarPropuesta, regionPrincipal, ambiente, multiplicadorAmbiente, agregarItemCosto } = useCloud();
  const [guardando, setGuardando] = useState(false);
  const [errorGuardado, setErrorGuardado] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({ ...estadoInicial, regionId: regionPrincipal });
  const [errores, setErrores] = useState<Partial<Record<keyof FormState, string>>>({});
  const [confirmacion, setConfirmacion] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [filtroTipo, setFiltroTipo] = useState<string>('Todos');
  const [propuestaDetalle, setPropuestaDetalle] = useState<PropuestaCloud | null>(null);
  const [categoriaServicios, setCategoriaServicios] = useState<string>('Todas');
  const [tabModalDetalle, setTabModalDetalle] = useState<'finops' | 'resiliencia' | 'pilares' | 'recomendaciones'>('finops');
  const [transferenciaExitosa, setTransferenciaExitosa] = useState(false);
  const [mostrarAlertasForm, setMostrarAlertasForm] = useState(true);

  // Simulación en tiempo real de la arquitectura del formulario
  const simulacionActual = useMemo(() => {
    return simularArquitecturaCloud(
      {
        usuariosEstimados: form.usuariosEstimados || 1000,
        tipoAplicacion: form.tipoAplicacion,
        disponibilidad: form.disponibilidad,
        serviciosSeleccionados: form.serviciosSeleccionados,
        presupuestoMaximo: form.presupuestoMaximo || 200,
        rtoHoras: form.rtoHoras || 2,
        rpoMinutos: form.rpoMinutos || 15,
        cumplimiento: form.cumplimiento || [],
        regionId: form.regionId,
      },
      multiplicadorAmbiente
    );
  }, [form, multiplicadorAmbiente]);

  // Simulación en tiempo real de la propuesta abierta en el modal
  const simulacionDetalle = useMemo(() => {
    if (!propuestaDetalle) return null;
    return simularArquitecturaCloud(
      {
        usuariosEstimados: propuestaDetalle.usuariosEstimados || 1000,
        tipoAplicacion: propuestaDetalle.tipoAplicacion,
        disponibilidad: propuestaDetalle.disponibilidad,
        serviciosSeleccionados: propuestaDetalle.serviciosSeleccionados,
        presupuestoMaximo: propuestaDetalle.presupuestoMaximo || 200,
        rtoHoras: propuestaDetalle.rtoHoras || 2,
        rpoMinutos: propuestaDetalle.rpoMinutos || 15,
        cumplimiento: propuestaDetalle.cumplimiento || [],
        regionId: propuestaDetalle.regionId,
      },
      multiplicadorAmbiente
    );
  }, [propuestaDetalle, multiplicadorAmbiente]);

  useEffect(() => {
    setForm((f) => ({ ...f, regionId: regionPrincipal }));
  }, [regionPrincipal]);

  const categoriasServiciosFiltro = ['Todas', 'Cómputo', 'Almacenamiento', 'Base de datos', 'Redes', 'Seguridad e identidad'];

  const serviciosParaMostrar = categoriaServicios === 'Todas'
    ? serviciosAWS
    : serviciosAWS.filter((s) => s.categoria === categoriaServicios);

  const agregarPrompt = (texto: string) => {
    setForm((f) => ({
      ...f,
      descripcion: f.descripcion ? `${f.descripcion.trim()} ${texto}` : texto,
    }));
  };

  const aplicarBundleServicios = (bundleIds: string[]) => {
    setForm((f) => {
      const todosPresentes = bundleIds.every((id) => f.serviciosSeleccionados.includes(id));
      const nuevos = todosPresentes
        ? f.serviciosSeleccionados.filter((id) => !bundleIds.includes(id))
        : Array.from(new Set([...f.serviciosSeleccionados, ...bundleIds]));
      return { ...f, serviciosSeleccionados: nuevos };
    });
  };

  const actualizar = <K extends keyof FormState>(campo: K, valor: FormState[K]) =>
    setForm((f) => ({ ...f, [campo]: valor }));

  const alternarServicio = (id: string) =>
    setForm((f) => ({
      ...f,
      serviciosSeleccionados: f.serviciosSeleccionados.includes(id)
        ? f.serviciosSeleccionados.filter((s) => s !== id)
        : [...f.serviciosSeleccionados, id],
    }));

  const alternarCumplimiento = (c: string) => {
    const actuales = form.cumplimiento ?? [];
    setForm((f) => ({
      ...f,
      cumplimiento: actuales.includes(c) ? actuales.filter((x) => x !== c) : [...actuales, c],
    }));
  };

  const aplicarPlantilla = (p: PlantillaArquitectura) => {
    if (!canWrite) return;
    setForm({
      nombre: p.nombre,
      tipoAplicacion: p.tipo,
      descripcion: p.descripcion,
      regionId: p.regionId,
      usuariosEstimados: p.usuarios,
      disponibilidad: p.disponibilidad,
      serviciosSeleccionados: p.servicios,
      objetivoMigracion: p.objetivo,
      presupuestoMaximo: p.presupuesto,
      rtoHoras: p.rto,
      rpoMinutos: p.rpo,
      cumplimiento: p.cumplimiento,
    });
    setErrores({});
  };

  const validar = (): boolean => {
    const e: Partial<Record<keyof FormState, string>> = {};
    if (form.nombre.trim().length < 3) e.nombre = 'Mínimo 3 caracteres';
    if (!form.descripcion.trim()) e.descripcion = 'La justificación técnica es obligatoria';
    if (!form.objetivoMigracion) e.objetivoMigracion = 'Selecciona un objetivo principal';
    if (form.serviciosSeleccionados.length === 0) e.serviciosSeleccionados = 'Selecciona al menos un servicio AWS';
    setErrores(e);
    return Object.keys(e).length === 0;
  };

  const manejarEnvio = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canWrite) { setErrorGuardado('Tu perfil es de lectura en este proyecto'); return; }
    if (!validar() || guardando || propuestasCargando) return;
    setGuardando(true); setErrorGuardado(null);
    try {
    await agregarPropuesta({
      ...form,
      costoEstimadoMensual: simulacionActual.costoMensualEstimado,
      costoEstimadoAnual: simulacionActual.costoAnualEstimado,
      scoreWellArchitected: simulacionActual.pilares.scoreGlobal,
      desgloseServicios: simulacionActual.desglose,
    });
    setConfirmacion(true);
    setForm({ ...estadoInicial, regionId: regionPrincipal });
    setTimeout(() => setConfirmacion(false), 4000);
    } catch (err) { setErrorGuardado(err instanceof Error ? err.message : 'No se pudo guardar'); }
    finally { setGuardando(false); }
  };

  const exportarCsv = () => {
    const cabeceras = 'ID,Nombre,Tipo,Region,Disponibilidad,Usuarios,PresupuestoUSD,Servicios,CreadaEn\n';
    const filas = propuestas
      .map(
        (p) =>
          `"${p.id}","${p.nombre}","${p.tipoAplicacion}","${p.regionId}","${p.disponibilidad}",${p.usuariosEstimados},${p.presupuestoMaximo || 0},"${p.serviciosSeleccionados.join(';')}",${p.creadaEn}`
      )
      .join('\n');
    const blob = new Blob([cabeceras + filas], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `propuestas-cloud-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const transferirACostos = () => {
    if (!simulacionDetalle) return;
    simulacionDetalle.desglose.forEach((d) => {
      const s = serviciosAWS.find((x) => x.id === d.servicioId);
      if (!s) return;
      agregarItemCosto({
        servicioId: d.servicioId,
        cantidad: d.cantidadEstimada,
        horasMes: s.tipoCobro === 'hora' ? 730 : 1,
        configuracion: d.explicacionCalculo,
      });
    });
    setTransferenciaExitosa(true);
    setTimeout(() => setTransferenciaExitosa(false), 3500);
  };

  const exportarPropuestaJson = (p: PropuestaCloud) => {
    const sim = simularArquitecturaCloud(p, multiplicadorAmbiente);
    const reporte = {
      titulo: 'Auditoría y Planificación de Arquitectura Cloud — AWS',
      generadoPor: 'CloudOps Platform',
      fecha: new Date().toISOString(),
      propuesta: p,
      simulacionFinOps: {
        costoMensualEstimadoUSD: sim.costoMensualEstimado,
        costoAnualEstimadoUSD: sim.costoAnualEstimado,
        costoPorUsuarioMensualUSD: sim.costoPorUsuarioMensual,
        presupuestoMaximoUSD: sim.presupuestoMaximo,
        diferenciaPresupuestoUSD: sim.diferenciaPresupuesto,
        porcentajeUsoPresupuesto: `${sim.porcentajeUsoPresupuesto}%`,
        estadoFinOps: sim.estadoPresupuesto,
        desgloseServicios: sim.desglose,
      },
      resilienciaSLA: {
        slaPorcentaje: `${sim.slaPorcentaje}%`,
        downtimeAnualMaximo: sim.downtimeAnualTexto,
        estrategiaRTO: sim.estrategiaRto,
        estrategiaRPO: sim.estrategiaRpo,
      },
      wellArchitected: {
        scoreGlobal: `${sim.pilares.scoreGlobal}%`,
        pilares: sim.pilares,
      },
      observacionesArquitectonicas: sim.incoherencias,
      cumplimientoNormativo: sim.cumplimientoAnalisis,
      recomendacionesFinOps: sim.recomendacionesAhorro,
    };

    const blob = new Blob([JSON.stringify(reporte, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `auditoria-arquitectura-${p.nombre.toLowerCase().replace(/\s+/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const propuestasFiltradas = propuestas.filter((p) => {
    const coincideTexto =
      p.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
      p.descripcion.toLowerCase().includes(busqueda.toLowerCase());
    const coincideTipo = filtroTipo === 'Todos' || p.tipoAplicacion === filtroTipo;
    return coincideTexto && coincideTipo;
  });

  return (
    <div className="space-y-8 animate-fade-in">
      {propuestasCargando && <p className="text-muted" role="status">Cargando propuestas…</p>}
      {(errorGuardado || propuestasError) && <p className="text-rose-500" role="alert">{errorGuardado || propuestasError}</p>}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-xl font-bold text-ink flex items-center gap-2">
              <Sparkles size={20} className="text-blue-600" /> Plantillas Preconfiguradas de Arquitectura
              <InfoTooltip
                titulo="Plantillas de Arquitectura"
                descripcion="Patrones de infraestructura probados y alineados al AWS Well-Architected Framework. Al hacer clic en 'Usar plantilla' se pre-rellenan todos los campos del formulario con los valores recomendados para ese caso de uso."
                size="md"
              />
            </h2>
            <p className="text-xs text-muted">
              Carga patrones arquitectónicos probados del Well-Architected Framework con un solo clic.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {plantillas.map((p) => (
            <div
              key={p.nombre}
              onClick={() => aplicarPlantilla(p)}
              className="group cursor-pointer rounded-2xl border border-line bg-card p-4 shadow-xs transition-all hover:border-blue-500/50 hover:shadow-md hover:-translate-y-0.5 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600">
                    {p.tipo}
                  </span>
                  <span className="text-xs font-mono font-bold text-amber-600">${p.presupuesto}/mes</span>
                </div>
                <h3 className="text-sm font-bold text-ink group-hover:text-blue-600 transition-colors">
                  {p.nombre}
                </h3>
                <p className="text-xs text-muted mt-1 leading-relaxed line-clamp-2">{p.descripcion}</p>
              </div>

              <div className="mt-4 pt-3 border-t border-line/60 flex items-center justify-between text-xs">
                <span className="text-muted">{p.servicios.length} servicios AWS</span>
                <span className="font-semibold text-blue-600 group-hover:underline flex items-center gap-1">
                  Usar plantilla →
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <Card className="p-6 sm:p-8 shadow-2xl border border-blue-500/25 bg-gradient-to-b from-card via-card to-blue-500/[0.02] relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-blue-600 via-indigo-500 to-cyan-400" />

        <div className="border-b border-line/80 pb-5 mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/25">
              <Compass size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-bold text-ink tracking-tight">Formulador de Propuesta de Solución Cloud</h2>
                <InfoTooltip
                  titulo="AWS Well-Architected Framework"
                  descripcion="Esta herramienta evalúa tu propuesta sobre los pilares de AWS: Seguridad, Fiabilidad, Eficiencia de Rendimiento, Optimización de Costos y Excelencia Operativa."
                  size="md"
                />
              </div>
              <p className="text-xs text-muted mt-0.5">
                Diseña, evalúa y dimensiona cargas de trabajo de infraestructura alineadas a las mejores prácticas de AWS.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 bg-canvas/80 border border-line p-1.5 rounded-2xl backdrop-blur-xs shrink-0 self-start md:self-auto text-xs">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-blue-500/10 text-blue-500 font-bold border border-blue-500/20">
              <ShieldCheck size={13} />
              <span>SLA {form.disponibilidad.toUpperCase()}</span>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-amber-500/10 text-amber-500 font-bold border border-amber-500/20">
              <DollarSign size={13} />
              <span>Tope ${form.presupuestoMaximo || 200}/m</span>
            </div>
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl font-bold border ${
                simulacionActual.estadoPresupuesto === 'optimo' || simulacionActual.estadoPresupuesto === 'holgado'
                  ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                  : 'bg-rose-500/10 text-rose-500 border-rose-500/20'
              }`}
            >
              <Zap size={13} />
              <span>Simulado: ${simulacionActual.costoMensualEstimado.toFixed(2)}/m</span>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-indigo-500/10 text-indigo-500 font-bold border border-indigo-500/20">
              <Award size={13} />
              <span>Score {simulacionActual.pilares.scoreGlobal}%</span>
            </div>
            {simulacionActual.incoherencias.length > 0 && (
              <div
                onClick={() => setMostrarAlertasForm((v) => !v)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-amber-500/15 text-amber-600 font-bold border border-amber-500/30 cursor-pointer hover:bg-amber-500/25 transition-colors"
                title="Haz clic para ver las observaciones arquitectónicas"
              >
                <AlertTriangle size={13} />
                <span>{simulacionActual.incoherencias.length} alertas</span>
              </div>
            )}
          </div>
        </div>

        {!canWrite && <p role="status" className="mb-4 text-sm text-amber-500">Perfil lector: puedes consultar propuestas, pero no crearlas, modificarlas ni eliminarlas.</p>}
        <form onSubmit={manejarEnvio}>
          <fieldset disabled={!canWrite} className={`space-y-6 ${!canWrite ? 'pointer-events-none opacity-50' : ''}`}>
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted">
              <span className="grid h-5 w-5 place-items-center rounded-full bg-blue-500/10 text-blue-600 font-mono text-[11px]">1</span>
              <span>Identidad & Alcance de la Solución</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-ink mb-1.5">
                  Nombre del Proyecto / Solución *
                </label>
                <input
                  type="text"
                  value={form.nombre}
                  onChange={(e) => actualizar('nombre', e.target.value)}
                  placeholder="Ej. Sistema Core de Pagos Transaccionales"
                  className={`w-full rounded-xl border px-3.5 py-2.5 text-xs text-ink outline-none transition-all ${
                    errores.nombre ? 'border-rose-500 bg-rose-500/5' : 'border-line bg-canvas focus:border-blue-600 focus:bg-card shadow-xs'
                  }`}
                />
                {errores.nombre && <p className="mt-1 text-[11px] text-rose-500 font-medium">{errores.nombre}</p>}
              </div>

              <div>
                <label className="block text-xs font-bold text-ink mb-1.5 flex items-center gap-1.5">
                  Tipo de Aplicación
                  <InfoTooltip
                    titulo="Tipo de Aplicación"
                    descripcion="Web: portal o frontend con CDN. API: microservicios en contenedores. Móvil: backend BaaS. Analítica: Data Lake con S3. Interna: sistema corporativo privado."
                  />
                </label>
                <Select
                  value={form.tipoAplicacion}
                  onChange={(v) => actualizar('tipoAplicacion', v as FormState['tipoAplicacion'])}
                  opciones={[
                    { value: 'Web', label: 'Aplicación Web / Portal', sublabel: 'CDN + ALB + EC2' },
                    { value: 'API', label: 'API REST / Microservicios', sublabel: 'Containers + API Gateway' },
                    { value: 'Móvil', label: 'Backend Móvil', sublabel: 'BaaS + Lambda + DynamoDB' },
                    { value: 'Analítica', label: 'Data Lake / Analítica', sublabel: 'S3 + Athena + Glue' },
                    { value: 'Interna', label: 'Sistema Empresarial Interno', sublabel: 'VPC privada + Direct Connect' },
                  ]}
                  className="w-full"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-ink">
                  Descripción y Justificación Arquitectónica *
                </label>
                <span className="text-[10px] text-muted font-mono">{form.descripcion.length} caracteres</span>
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 mb-1.5 scrollbar-none text-[10px]">
                <span className="text-muted shrink-0 mr-0.5">Inspiración:</span>
                {promptsSugeridos.map((prompt, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => agregarPrompt(prompt)}
                    className="px-2 py-0.5 rounded-lg bg-canvas text-muted hover:text-blue-500 hover:border-blue-500/30 border border-line whitespace-nowrap transition-all cursor-pointer shadow-2xs"
                  >
                    + {prompt.slice(0, 32)}...
                  </button>
                ))}
              </div>

              <textarea
                rows={3}
                value={form.descripcion}
                onChange={(e) => actualizar('descripcion', e.target.value)}
                placeholder="Explica qué problema resuelve la solución, cómo escala el tráfico y por qué se eligen estos componentes..."
                className={`w-full rounded-xl border px-3.5 py-2.5 text-xs text-ink outline-none transition-all ${
                  errores.descripcion ? 'border-rose-500 bg-rose-500/5' : 'border-line bg-canvas focus:border-blue-600 focus:bg-card shadow-xs'
                }`}
              />
              {errores.descripcion && <p className="mt-1 text-[11px] text-rose-500 font-medium">{errores.descripcion}</p>}
            </div>
          </div>

          <div className="space-y-4 pt-2">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted">
              <span className="grid h-5 w-5 place-items-center rounded-full bg-blue-500/10 text-blue-600 font-mono text-[11px]">2</span>
              <span>Localización & Alineación Estratégica</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-ink mb-1.5 flex items-center gap-1">
                  <Globe size={13} className="text-blue-500" />
                  Región Primaria de AWS
                </label>
                <Select
                  value={form.regionId}
                  onChange={(v) => actualizar('regionId', v)}
                  opciones={regiones.map((r) => ({
                    value: r.id,
                    label: r.nombre,
                    badge: `${r.latenciaMs}ms`,
                    sublabel: `${r.zonasDisponibilidad} AZs · ${r.ubicacion}`,
                  }))}
                  buscable={true}
                  className="w-full"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-ink mb-1.5 flex items-center gap-1">
                  <Compass size={13} className="text-blue-500" />
                  Objetivo Estratégico Principal
                </label>
                <Select
                  value={form.objetivoMigracion ?? ''}
                  onChange={(v) => actualizar('objetivoMigracion', v)}
                  opciones={objetivos.map((obj) => ({ value: obj, label: obj }))}
                  className="w-full"
                />
              </div>
            </div>
          </div>

          <div className="space-y-4 pt-2">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted">
              <span className="grid h-5 w-5 place-items-center rounded-full bg-blue-500/10 text-blue-600 font-mono text-[11px]">3</span>
              <span>Dimensionamiento de Carga & Presupuesto FinOps</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 rounded-2xl bg-canvas/60 border border-line space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-xs font-bold text-ink flex items-center gap-1.5">
                    <Users size={13} className="text-blue-500" />
                    Usuarios Concurrentes
                  </label>
                  <div className="flex items-center gap-1 bg-blue-500/10 px-2 py-0.5 rounded-lg border border-blue-500/20 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/30 transition-all">
                    <input
                      type="number"
                      min={100}
                      max={100000}
                      step={100}
                      value={form.usuariosEstimados || ''}
                      onChange={(e) => {
                        const valStr = e.target.value;
                        if (valStr === '') {
                          actualizar('usuariosEstimados', 0);
                          return;
                        }
                        const parsed = parseInt(valStr, 10);
                        if (isNaN(parsed)) return;
                        actualizar('usuariosEstimados', Math.min(100000, Math.max(0, parsed)));
                      }}
                      onBlur={() => {
                        if (form.usuariosEstimados < 100) {
                          actualizar('usuariosEstimados', 100);
                        }
                      }}
                      className="w-16 bg-transparent font-mono text-xs font-bold text-blue-600 outline-none text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <span className="text-[11px] font-bold text-blue-600 select-none">
                      usuarios
                    </span>
                  </div>
                </div>

                <input
                  type="range"
                  min={100}
                  max={100000}
                  step={500}
                  value={Math.min(100000, Math.max(100, form.usuariosEstimados || 100))}
                  onChange={(e) => actualizar('usuariosEstimados', Number(e.target.value))}
                  style={{
                    background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${Math.min(100, Math.max(0, ((form.usuariosEstimados - 100) / (100000 - 100)) * 100))}%, var(--color-line-2) ${Math.min(100, Math.max(0, ((form.usuariosEstimados - 100) / (100000 - 100)) * 100))}%, var(--color-line-2) 100%)`,
                  }}
                  className="w-full h-2 rounded-lg cursor-pointer accent-blue-600 appearance-none bg-canvas"
                />

                <div className="flex items-center gap-1 flex-wrap pt-0.5">
                  <span className="text-[10px] text-muted mr-1">Rápido:</span>
                  {[500, 2500, 10000, 25000, 50000, 100000].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => actualizar('usuariosEstimados', n)}
                      className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-semibold transition-all cursor-pointer ${
                        form.usuariosEstimados === n
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'bg-card text-muted hover:text-ink border border-line'
                      }`}
                    >
                      {n >= 1000 ? `${n / 1000}k` : n}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-canvas/60 border border-line space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-xs font-bold text-ink flex items-center gap-1.5">
                    <DollarSign size={13} className="text-amber-500" />
                    Presupuesto Máximo (OpEx)
                  </label>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20">
                      {(form.presupuestoMaximo ?? 200) <= 200 ? 'Tier Dev' : (form.presupuestoMaximo ?? 200) <= 600 ? 'Tier Producción' : 'Tier Enterprise'}
                    </span>
                    <div className="flex items-center bg-amber-500/10 px-2 py-0.5 rounded-lg border border-amber-500/20 focus-within:border-amber-500 focus-within:ring-2 focus-within:ring-amber-500/30 transition-all">
                      <span className="text-xs font-bold text-amber-600 select-none mr-0.5">$</span>
                      <input
                        type="number"
                        min={50}
                        max={2000}
                        step={25}
                        value={form.presupuestoMaximo || ''}
                        onChange={(e) => {
                          const valStr = e.target.value;
                          if (valStr === '') {
                            actualizar('presupuestoMaximo', 0);
                            return;
                          }
                          const parsed = parseInt(valStr, 10);
                          if (isNaN(parsed)) return;
                          actualizar('presupuestoMaximo', Math.min(2000, Math.max(0, parsed)));
                        }}
                        onBlur={() => {
                          if ((form.presupuestoMaximo ?? 200) < 50) {
                            actualizar('presupuestoMaximo', 50);
                          }
                        }}
                        className="w-14 bg-transparent font-mono text-xs font-bold text-amber-600 outline-none text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <span className="text-[11px] font-bold text-amber-600 select-none ml-0.5">/mes</span>
                    </div>
                  </div>
                </div>

                <input
                  type="range"
                  min={50}
                  max={2000}
                  step={25}
                  value={Math.min(2000, Math.max(50, form.presupuestoMaximo || 200))}
                  onChange={(e) => actualizar('presupuestoMaximo', Number(e.target.value))}
                  style={{
                    background: `linear-gradient(to right, #f59e0b 0%, #f59e0b ${Math.min(100, Math.max(0, (((form.presupuestoMaximo || 200) - 50) / (2000 - 50)) * 100))}%, var(--color-line-2) ${Math.min(100, Math.max(0, (((form.presupuestoMaximo || 200) - 50) / (2000 - 50)) * 100))}%, var(--color-line-2) 100%)`,
                  }}
                  className="w-full h-2 rounded-lg cursor-pointer accent-amber-600 appearance-none bg-canvas"
                />

                <div className="flex items-center gap-1 flex-wrap pt-0.5">
                  <span className="text-[10px] text-muted mr-1">Rápido:</span>
                  {[100, 250, 500, 1000, 2000].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => actualizar('presupuestoMaximo', n)}
                      className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-semibold transition-all cursor-pointer ${
                        (form.presupuestoMaximo || 200) === n
                          ? 'bg-amber-600 text-white shadow-xs'
                          : 'bg-card text-muted hover:text-ink border border-line'
                      }`}
                    >
                      ${n}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4 pt-2">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted">
              <span className="grid h-5 w-5 place-items-center rounded-full bg-blue-500/10 text-blue-600 font-mono text-[11px]">4</span>
              <span>Disaster Recovery & Continuidad de Negocio (DRP)</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 rounded-2xl bg-canvas/60 border border-line space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-xs font-bold text-ink flex items-center gap-1.5">
                    <Clock size={13} className="text-blue-500" />
                    RTO (Recovery Time Objective)
                    <InfoTooltip
                      titulo="RTO — Recovery Time Objective"
                      descripcion="Tiempo máximo tolerable de interrupción del servicio antes de restaurar la operación normal tras un fallo o desastre."
                    />
                  </label>
                  <div className="flex items-center bg-blue-500/10 px-2 py-0.5 rounded-lg border border-blue-500/20 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/30 transition-all">
                    <input
                      type="number"
                      min={0.5}
                      max={24}
                      step={0.5}
                      value={form.rtoHoras || ''}
                      onChange={(e) => {
                        const valStr = e.target.value;
                        if (valStr === '') {
                          actualizar('rtoHoras', 0);
                          return;
                        }
                        const parsed = parseFloat(valStr);
                        if (isNaN(parsed)) return;
                        actualizar('rtoHoras', Math.min(24, Math.max(0, parsed)));
                      }}
                      onBlur={() => {
                        if ((form.rtoHoras ?? 2) < 0.5) {
                          actualizar('rtoHoras', 0.5);
                        }
                      }}
                      className="w-10 bg-transparent font-mono text-xs font-bold text-blue-600 outline-none text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <span className="text-[11px] font-bold text-blue-600 select-none ml-0.5">h máx</span>
                  </div>
                </div>

                <div className="text-[10px] text-muted flex items-center justify-between">
                  <span>Estrategia:</span>
                  <span className="font-semibold text-blue-500">
                    {(form.rtoHoras ?? 2) <= 1 ? 'Hot Standby / Multi-AZ Activo' : (form.rtoHoras ?? 2) <= 4 ? 'Warm Standby / Piloto' : 'Backup & Restore'}
                  </span>
                </div>

                <input
                  type="range"
                  min={0.5}
                  max={24}
                  step={0.5}
                  value={Math.min(24, Math.max(0.5, form.rtoHoras || 2))}
                  onChange={(e) => actualizar('rtoHoras', Number(e.target.value))}
                  style={{
                    background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${Math.min(100, Math.max(0, (((form.rtoHoras || 2) - 0.5) / (24 - 0.5)) * 100))}%, var(--color-line-2) ${Math.min(100, Math.max(0, (((form.rtoHoras || 2) - 0.5) / (24 - 0.5)) * 100))}%, var(--color-line-2) 100%)`,
                  }}
                  className="w-full h-2 rounded-lg cursor-pointer accent-blue-600 appearance-none bg-canvas"
                />

                <div className="flex items-center gap-1 flex-wrap pt-0.5">
                  <span className="text-[10px] text-muted mr-1">Rápido:</span>
                  {[0.5, 1, 2, 4, 12].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => actualizar('rtoHoras', n)}
                      className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-semibold transition-all cursor-pointer ${
                        (form.rtoHoras || 2) === n
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'bg-card text-muted hover:text-ink border border-line'
                      }`}
                    >
                      {n}h
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-canvas/60 border border-line space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-xs font-bold text-ink flex items-center gap-1.5">
                    <Clock size={13} className="text-blue-500" />
                    RPO (Recovery Point Objective)
                    <InfoTooltip
                      titulo="RPO — Recovery Point Objective"
                      descripcion="Cantidad máxima de datos que se tolera perder en caso de desastre. Cuanto menor el RPO, más frecuente o síncrona debe ser la replicación."
                    />
                  </label>
                  <div className="flex items-center bg-blue-500/10 px-2 py-0.5 rounded-lg border border-blue-500/20 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/30 transition-all">
                    <input
                      type="number"
                      min={5}
                      max={240}
                      step={5}
                      value={form.rpoMinutos || ''}
                      onChange={(e) => {
                        const valStr = e.target.value;
                        if (valStr === '') {
                          actualizar('rpoMinutos', 0);
                          return;
                        }
                        const parsed = parseInt(valStr, 10);
                        if (isNaN(parsed)) return;
                        actualizar('rpoMinutos', Math.min(240, Math.max(0, parsed)));
                      }}
                      onBlur={() => {
                        if ((form.rpoMinutos ?? 15) < 5) {
                          actualizar('rpoMinutos', 5);
                        }
                      }}
                      className="w-12 bg-transparent font-mono text-xs font-bold text-blue-600 outline-none text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <span className="text-[11px] font-bold text-blue-600 select-none ml-0.5">m máx</span>
                  </div>
                </div>

                <div className="text-[10px] text-muted flex items-center justify-between">
                  <span>Replicación:</span>
                  <span className="font-semibold text-blue-500">
                    {(form.rpoMinutos ?? 15) <= 15 ? 'Replicación Síncrona / WAL' : (form.rpoMinutos ?? 15) <= 60 ? 'Snapshots Cada Hora' : 'Backups Diarios'}
                  </span>
                </div>

                <input
                  type="range"
                  min={5}
                  max={240}
                  step={5}
                  value={Math.min(240, Math.max(5, form.rpoMinutos || 15))}
                  onChange={(e) => actualizar('rpoMinutos', Number(e.target.value))}
                  style={{
                    background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${Math.min(100, Math.max(0, (((form.rpoMinutos || 15) - 5) / (240 - 5)) * 100))}%, var(--color-line-2) ${Math.min(100, Math.max(0, (((form.rpoMinutos || 15) - 5) / (240 - 5)) * 100))}%, var(--color-line-2) 100%)`,
                  }}
                  className="w-full h-2 rounded-lg cursor-pointer accent-blue-600 appearance-none bg-canvas"
                />

                <div className="flex items-center gap-1 flex-wrap pt-0.5">
                  <span className="text-[10px] text-muted mr-1">Rápido:</span>
                  {[5, 15, 30, 60, 120].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => actualizar('rpoMinutos', n)}
                      className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-semibold transition-all cursor-pointer ${
                        (form.rpoMinutos || 15) === n
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'bg-card text-muted hover:text-ink border border-line'
                      }`}
                    >
                      {n}m
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-muted flex items-center gap-2">
                <span className="grid h-5 w-5 place-items-center rounded-full bg-blue-500/10 text-blue-600 font-mono text-[11px]">5</span>
                <span>Objetivo de Disponibilidad y SLA</span>
                <InfoTooltip
                  titulo="Niveles de Disponibilidad (SLA)"
                  descripcion="Básica (99.5%): ~43.8h de caída al año. Alta (99.9%): ~8.7h/año con Multi-AZ. Misión Crítica (99.99%): ~52.6 min/año con Multi-Región activo-activo."
                />
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {disponibilidades.map((d) => {
                const activo = form.disponibilidad === d.value;
                return (
                  <div
                    key={d.value}
                    onClick={() => actualizar('disponibilidad', d.value as FormState['disponibilidad'])}
                    className={`p-4 rounded-2xl border cursor-pointer transition-all select-none relative overflow-hidden flex flex-col justify-between ${
                      activo
                        ? 'border-blue-600 bg-blue-500/10 shadow-md ring-2 ring-blue-500/30'
                        : 'border-line bg-canvas hover:border-line-2 hover:bg-card/70'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className={`h-2.5 w-2.5 rounded-full ${d.dotColor} ${activo ? 'animate-pulse' : ''}`} />
                          <span className="text-[10px] font-bold uppercase tracking-wider text-muted">{d.sublabel}</span>
                        </div>
                        <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-card border border-line text-ink">
                          {d.downtime}
                        </span>
                      </div>

                      <h4 className="text-sm font-bold text-ink">{d.label}</h4>
                      <p className="text-[11px] text-muted mt-1 leading-relaxed">{d.desc}</p>
                    </div>

                    <div className="mt-3 pt-2.5 border-t border-line/60 flex items-center justify-between text-[11px]">
                      <span className="text-muted font-medium">{d.badgeText}</span>
                      {activo ? (
                        <span className="inline-flex items-center gap-1 font-bold text-blue-500">
                          <Check size={13} className="stroke-[3]" /> Seleccionado
                        </span>
                      ) : (
                        <span className="text-muted group-hover:text-ink">Elegir nivel</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-muted flex items-center gap-2">
                <span className="grid h-5 w-5 place-items-center rounded-full bg-blue-500/10 text-blue-600 font-mono text-[11px]">6</span>
                <span>Requerimientos de Cumplimiento Normativo & Auditoría</span>
                <InfoTooltip
                  titulo="Marcos de Cumplimiento Normativo"
                  descripcion="Certificaciones de seguridad aplicables a tu industria: SOC 2 para SaaS, PCI-DSS para pasarelas de pago, ISO 27001 para gobierno global, HIPAA para salud y GDPR para privacidad europea."
                />
              </label>
              <span className="text-[11px] text-muted">
                {form.cumplimiento?.length || 0} de {marcosCumplimientoDetalles.length} activos
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {marcosCumplimientoDetalles.map((m) => {
                const activo = (form.cumplimiento ?? []).includes(m.id);
                return (
                  <button
                    type="button"
                    key={m.id}
                    onClick={() => alternarCumplimiento(m.id)}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between gap-3 ${
                      activo
                        ? 'border-blue-600 bg-blue-500/10 text-ink shadow-xs ring-1 ring-blue-500/30'
                        : 'border-line bg-canvas text-muted hover:border-line-2 hover:text-ink'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <ShieldCheck size={14} className={activo ? 'text-blue-500' : 'text-muted'} />
                        <span className="font-bold text-xs text-ink">{m.nombre}</span>
                      </div>
                      <p className="text-[10px] text-muted mt-0.5 truncate">{m.desc}</p>
                    </div>

                    <div
                      className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border transition-all ${
                        activo ? 'bg-blue-600 text-white border-blue-600' : 'border-line bg-card'
                      }`}
                    >
                      {activo && <Check size={12} className="stroke-[3]" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-3 pt-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <label className="text-xs font-bold uppercase tracking-wider text-muted flex items-center gap-2">
                <span className="grid h-5 w-5 place-items-center rounded-full bg-blue-500/10 text-blue-600 font-mono text-[11px]">7</span>
                <span>Componentes AWS Incluidos ({form.serviciosSeleccionados.length} seleccionados) *</span>
              </label>

              <div className="flex items-center gap-1.5 flex-wrap text-[10px]">
                <span className="text-muted mr-0.5">Paquetes:</span>
                {presetsServicios.map((preset) => {
                  const activo = preset.servicios.every((id) => form.serviciosSeleccionados.includes(id));
                  return (
                    <button
                      key={preset.nombre}
                      type="button"
                      onClick={() => aplicarBundleServicios(preset.servicios)}
                      className={`px-2.5 py-1 rounded-lg border font-medium transition-all cursor-pointer ${
                        activo
                          ? 'bg-blue-600 text-white border-blue-600 font-bold shadow-xs'
                          : 'bg-canvas border-line text-muted hover:text-ink hover:border-line-2'
                      }`}
                    >
                      {preset.nombre}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => actualizar('serviciosSeleccionados', serviciosAWS.map((s) => s.id))}
                  className="px-2 py-1 rounded-lg border border-line bg-canvas text-muted hover:text-ink transition-colors cursor-pointer"
                >
                  Todos
                </button>
                <button
                  type="button"
                  onClick={() => actualizar('serviciosSeleccionados', [])}
                  className="px-2 py-1 rounded-lg border border-rose-500/20 bg-rose-500/5 text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer"
                >
                  Limpiar
                </button>
              </div>
            </div>

            {errores.serviciosSeleccionados && (
              <p className="text-[11px] text-rose-500 font-medium bg-rose-500/10 border border-rose-500/20 p-2 rounded-xl">
                {errores.serviciosSeleccionados}
              </p>
            )}

            <div className="flex items-center gap-1 overflow-x-auto pb-1.5 scrollbar-none text-[10px]">
              {categoriasServiciosFiltro.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategoriaServicios(cat)}
                  className={`px-2.5 py-1 rounded-lg font-medium whitespace-nowrap transition-all cursor-pointer ${
                    categoriaServicios === cat
                      ? 'bg-blue-600 text-white font-bold shadow-xs'
                      : 'bg-canvas text-muted hover:text-ink border border-line'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {serviciosParaMostrar.map((s) => (
                <ServiceCard
                  key={s.id}
                  servicio={s}
                  seleccionado={form.serviciosSeleccionados.includes(s.id)}
                  onToggle={() => alternarServicio(s.id)}
                />
              ))}
            </div>
          </div>

          {simulacionActual.incoherencias.length > 0 && mostrarAlertasForm && (
            <div className="p-4 rounded-2xl border border-amber-500/30 bg-amber-500/5 space-y-2 animate-fade-in">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-600 flex items-center gap-1.5">
                  <AlertTriangle size={15} />
                  Observaciones Arquitectónicas Detectadas ({simulacionActual.incoherencias.length})
                </span>
                <button
                  type="button"
                  onClick={() => setMostrarAlertasForm(false)}
                  className="text-[10px] text-muted hover:text-ink cursor-pointer"
                >
                  Ocultar
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                {simulacionActual.incoherencias.map((inc, i) => (
                  <div
                    key={i}
                    className={`p-2.5 rounded-xl border flex items-start gap-2 ${
                      inc.tipo === 'error'
                        ? 'border-rose-500/30 bg-rose-500/5 text-rose-700 dark:text-rose-300'
                        : inc.tipo === 'advertencia'
                        ? 'border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300'
                        : 'border-blue-500/30 bg-blue-500/5 text-blue-700 dark:text-blue-300'
                    }`}
                  >
                    <span className="mt-0.5 shrink-0">
                      {inc.tipo === 'error' ? (
                        <ShieldAlert size={14} className="text-rose-500" />
                      ) : (
                        <AlertCircle size={14} className="text-amber-500" />
                      )}
                    </span>
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-[11px]">{inc.titulo}</span>
                        <span className="text-[9px] uppercase px-1 rounded bg-card border border-line text-muted">
                          {inc.pilar}
                        </span>
                      </div>
                      <p className="text-[10.5px] opacity-90 mt-0.5 leading-snug">{inc.descripcion}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="p-4 rounded-2xl border border-blue-500/25 bg-gradient-to-br from-blue-500/5 via-card to-indigo-500/5 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-ink flex items-center gap-1.5">
                <Sparkles size={14} className="text-blue-500" />
                Resumen Ejecutivo Simulado de la Arquitectura
              </span>
              <span className="font-mono text-[10px] text-muted">Alineado a AWS Well-Architected Framework</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-[11px]">
              <div className="p-3 rounded-xl bg-canvas border border-line flex flex-col justify-between">
                <div>
                  <p className="text-muted text-[10px] uppercase font-bold tracking-wider">Fiabilidad & SLA</p>
                  <p className="font-bold text-ink text-sm mt-0.5 capitalize">
                    {form.disponibilidad} ({simulacionActual.slaPorcentaje}%)
                  </p>
                  <p className="text-[10px] text-muted mt-0.5">Downtime: {simulacionActual.downtimeAnualTexto}</p>
                </div>
                <div className="mt-2 pt-2 border-t border-line/60 flex items-center justify-between text-[10px]">
                  <span className="text-muted">RTO {form.rtoHoras}h · RPO {form.rpoMinutos}m</span>
                  <span className="font-semibold text-blue-500 truncate max-w-[120px]" title={simulacionActual.estrategiaRto}>
                    {simulacionActual.estrategiaRto.split('/')[0]}
                  </span>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-canvas border border-line flex flex-col justify-between">
                <div>
                  <p className="text-muted text-[10px] uppercase font-bold tracking-wider">Carga & Capacidad</p>
                  <p className="font-bold text-ink text-sm mt-0.5">
                    {form.usuariosEstimados.toLocaleString()} usuarios
                  </p>
                  <p className="text-[10px] text-muted mt-0.5">{form.tipoAplicacion} · Región {form.regionId}</p>
                </div>
                <div className="mt-2 pt-2 border-t border-line/60 flex items-center justify-between text-[10px]">
                  <span className="text-muted">Flota:</span>
                  <span className="font-semibold text-ink">{form.serviciosSeleccionados.length} componentes AWS</span>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-canvas border border-line flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <p className="text-muted text-[10px] uppercase font-bold tracking-wider">Costeo FinOps Simulado</p>
                    <span
                      className={`text-[9.5px] font-bold px-1.5 py-0.2 rounded border ${
                        simulacionActual.estadoPresupuesto === 'optimo' || simulacionActual.estadoPresupuesto === 'holgado'
                          ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                          : 'bg-rose-500/10 text-rose-500 border-rose-500/20'
                      }`}
                    >
                      {simulacionActual.porcentajeUsoPresupuesto}% uso
                    </span>
                  </div>
                  <p className="font-bold text-amber-500 text-sm mt-0.5">
                    ${simulacionActual.costoMensualEstimado.toFixed(2)} USD/mes
                  </p>
                  <p className="text-[10px] text-muted">
                    Tope asignado: ${form.presupuestoMaximo || 200}/mes
                  </p>
                </div>
                <div className="mt-2 pt-2 border-t border-line/60 flex items-center justify-between text-[10px]">
                  <span className="text-muted">
                    {simulacionActual.diferenciaPresupuesto >= 0 ? 'Holgura:' : 'Déficit:'}
                  </span>
                  <span
                    className={`font-semibold font-mono ${
                      simulacionActual.diferenciaPresupuesto >= 0 ? 'text-emerald-500' : 'text-rose-500'
                    }`}
                  >
                    {simulacionActual.diferenciaPresupuesto >= 0 ? '+' : '-'}$
                    {Math.abs(simulacionActual.diferenciaPresupuesto).toFixed(2)}/m
                  </span>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-canvas border border-line flex flex-col justify-between">
                <div>
                  <p className="text-muted text-[10px] uppercase font-bold tracking-wider">Well-Architected & Compliance</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <p className="font-bold text-indigo-500 text-sm">
                      Score {simulacionActual.pilares.scoreGlobal}%
                    </p>
                    <span className="text-[9.5px] px-1.5 py-0.2 rounded bg-indigo-500/10 text-indigo-500 font-semibold border border-indigo-500/20">
                      5 Pilares
                    </span>
                  </div>
                  <p className="text-[10px] text-muted mt-0.5">
                    {form.cumplimiento?.length || 0} marcos de cumplimiento seleccionados (no auditados)
                  </p>
                </div>
                <div className="mt-2 pt-2 border-t border-line/60 flex items-center justify-between text-[10px]">
                  <span className="text-muted">Costo unitario:</span>
                  <span className="font-semibold font-mono text-ink">
                    ${simulacionActual.costoPorUsuarioMensual.toFixed(4)}/usr/m
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 border-t border-line">
            <div className="flex items-center gap-2">
              {confirmacion && (
                <div className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-600 bg-emerald-500/10 px-3.5 py-2 rounded-xl border border-emerald-500/20 animate-fade-up">
                  <CheckCircle2 size={16} /> ¡Propuesta guardada correctamente!
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setForm(estadoInicial)}
                className="px-4 py-2.5 rounded-xl border border-line bg-canvas hover:bg-card text-muted hover:text-ink text-xs font-bold transition-all cursor-pointer"
              >
                <RotateCcw size={13} className="inline mr-1" /> Limpiar
              </button>
              <button
                type="submit"
                disabled={!canWrite || guardando || propuestasCargando}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-500 hover:from-blue-500 hover:to-indigo-500 text-xs font-bold text-white shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 hover:-translate-y-0.5 active:translate-y-0 transition-all cursor-pointer flex items-center gap-2"
              >
                <Sparkles size={14} /> {guardando ? 'Guardando…' : 'Guardar Propuesta Cloud'}
              </button>
            </div>
          </div>
          </fieldset>
        </form>
      </Card>

      <div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg font-bold text-ink flex items-center gap-2">
              <ClipboardList size={18} className="text-blue-600" /> Propuestas Registradas ({propuestas.length})
            </h2>
            <p className="text-xs text-muted">Propuestas guardadas en el almacenamiento del modo activo</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                type="search"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar propuesta..."
                className="h-9 rounded-xl border border-line bg-card pl-8 pr-3 text-xs text-ink outline-none focus:border-blue-600"
              />
            </div>

            <Select
              value={filtroTipo}
              onChange={setFiltroTipo}
              opciones={[
                { value: 'Todos', label: 'Todos los tipos' },
                { value: 'Web', label: 'Web' },
                { value: 'API', label: 'API' },
                { value: 'Móvil', label: 'Móvil' },
                { value: 'Analítica', label: 'Analítica' },
                { value: 'Interna', label: 'Interna' },
              ]}
              anchoMinimo="160px"
              ariaLabel="Filtrar por tipo de propuesta"
            />

            <button
              onClick={exportarCsv}
              className="inline-flex items-center gap-1.5 h-9 rounded-xl border border-line bg-card px-3 text-xs font-bold text-ink hover:bg-canvas transition-colors cursor-pointer"
            >
              <FileSpreadsheet size={14} className="text-emerald-600" /> Exportar CSV
            </button>
          </div>
        </div>

        {propuestasFiltradas.length === 0 ? (
          <Card className="py-12 text-center text-muted text-xs">
            <AlertCircle size={32} className="mx-auto mb-2 text-muted opacity-50" />
            No hay propuestas que coincidan con los filtros seleccionados.
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {propuestasFiltradas.map((p) => (
              <Card key={p.id} hover className="flex flex-col justify-between gap-4 p-5">
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600">
                          {p.tipoAplicacion}
                        </span>
                        <span className="text-xs font-mono text-muted bg-canvas px-1.5 py-0.2 rounded border border-line">
                          {p.regionId}
                        </span>
                      </div>
                      <h3 className="text-base font-bold text-ink mt-1.5">{p.nombre}</h3>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setPropuestaDetalle(p)}
                        className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-canvas hover:text-blue-600 transition-colors"
                        title="Ver detalles arquitectónicos"
                      >
                        <Eye size={16} />
                      </button>
                      <button
                        onClick={() => void eliminarPropuesta(p.id).catch(err => setErrorGuardado(err.message))}
                        disabled={!canWrite}
                        className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-rose-500/10 hover:text-rose-600 transition-colors"
                        title="Eliminar propuesta"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>

                  <p className="text-xs text-muted leading-relaxed line-clamp-2">{p.descripcion}</p>

                  <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-line/60 text-xs">
                    <div>
                      <p className="text-[10px] text-muted">Costo Simulado</p>
                      <p className="font-bold text-amber-500 font-mono">
                        ${(p.costoEstimadoMensual || p.presupuestoMaximo || 200).toFixed(2)}/m
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted">Presupuesto</p>
                      <p className="font-bold text-ink">${p.presupuestoMaximo || 200}/m</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted">Well-Architected</p>
                      <p className="font-bold text-indigo-500">
                        Score {p.scoreWellArchitected || 85}%
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-line/60 text-xs text-muted">
                  <div className="flex flex-wrap gap-1">
                    {p.serviciosSeleccionados.slice(0, 4).map((s) => (
                      <span key={s} className="text-[10px] font-mono bg-canvas border border-line px-1.5 py-0.5 rounded">
                        {s}
                      </span>
                    ))}
                    {p.serviciosSeleccionados.length > 4 && (
                      <span className="text-[10px] text-muted">+{p.serviciosSeleccionados.length - 4}</span>
                    )}
                  </div>
                  <span>{fecha(p.creadaEn)}</span>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Modal
        abierto={!!propuestaDetalle}
        onCerrar={() => setPropuestaDetalle(null)}
        titulo={propuestaDetalle?.nombre ?? ''}
        subtitulo={`Auditoría Técnica y Arquitectura Cloud · ${propuestaDetalle?.tipoAplicacion} · Región ${propuestaDetalle?.regionId}`}
        tamano="xl"
      >
        {propuestaDetalle && simulacionDetalle && (
          <div className="space-y-5 text-xs">
            {/* Header del Modal con KPIs rápidos */}
            <div className="p-3.5 rounded-2xl bg-canvas border border-line flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-600/10 text-blue-600 border border-blue-500/20 font-bold">
                  <Award size={20} />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-ink text-sm">{propuestaDetalle.tipoAplicacion} App</span>
                    <span className="text-[10px] font-mono uppercase px-1.5 py-0.2 rounded bg-card border border-line text-muted">
                      {propuestaDetalle.regionId}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                        simulacionDetalle.estadoPresupuesto === 'optimo' || simulacionDetalle.estadoPresupuesto === 'holgado'
                          ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                          : 'bg-rose-500/10 text-rose-500 border-rose-500/20'
                      }`}
                    >
                      {simulacionDetalle.estadoPresupuesto === 'optimo'
                        ? 'En Presupuesto'
                        : simulacionDetalle.estadoPresupuesto === 'holgado'
                        ? 'Superávit FinOps'
                        : 'Sobrecosto Presupuestario'}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted mt-0.5 line-clamp-1">{propuestaDetalle.descripcion}</p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0 self-start md:self-auto">
                <div className="text-right">
                  <p className="text-[10px] text-muted">Well-Architected</p>
                  <p className="font-bold text-indigo-500 text-sm">{simulacionDetalle.pilares.scoreGlobal}% Global</p>
                </div>
                <div className="h-8 w-px bg-line/80 mx-1" />
                <div className="text-right">
                  <p className="text-[10px] text-muted">Costo Simulado</p>
                  <p className="font-bold text-amber-500 text-sm font-mono">
                    ${simulacionDetalle.costoMensualEstimado.toFixed(2)}/m
                  </p>
                </div>
              </div>
            </div>

            {/* Pestañas de Navegación del Modal */}
            <div className="flex items-center gap-1.5 border-b border-line pb-2 overflow-x-auto scrollbar-none text-xs">
              <button
                type="button"
                onClick={() => setTabModalDetalle('finops')}
                className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  tabModalDetalle === 'finops'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-muted hover:text-ink hover:bg-canvas'
                }`}
              >
                <DollarSign size={14} /> Desglose FinOps (${simulacionDetalle.costoMensualEstimado.toFixed(0)})
              </button>
              <button
                type="button"
                onClick={() => setTabModalDetalle('resiliencia')}
                className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  tabModalDetalle === 'resiliencia'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-muted hover:text-ink hover:bg-canvas'
                }`}
              >
                <ShieldCheck size={14} /> Resiliencia, SLA & DRP
              </button>
              <button
                type="button"
                onClick={() => setTabModalDetalle('pilares')}
                className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  tabModalDetalle === 'pilares'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-muted hover:text-ink hover:bg-canvas'
                }`}
              >
                <Award size={14} /> Pilares & Compliance ({simulacionDetalle.pilares.scoreGlobal}%)
              </button>
              <button
                type="button"
                onClick={() => setTabModalDetalle('recomendaciones')}
                className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  tabModalDetalle === 'recomendaciones'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-muted hover:text-ink hover:bg-canvas'
                }`}
              >
                <Sparkles size={14} /> Diagnóstico ({simulacionDetalle.incoherencias.length})
              </button>
            </div>

            {/* PESTAÑA 1: FINOPS & DESGLOSE DE COSTOS */}
            {tabModalDetalle === 'finops' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div className="p-3 rounded-xl bg-canvas border border-line">
                    <p className="text-muted text-[10px] uppercase font-bold">Costo Mensual Simulado</p>
                    <p className="font-bold text-amber-500 text-base mt-0.5 font-mono">
                      ${simulacionDetalle.costoMensualEstimado.toFixed(2)} USD
                    </p>
                    <p className="text-[10px] text-muted mt-0.5">Anual: ${simulacionDetalle.costoAnualEstimado.toFixed(2)} USD</p>
                  </div>
                  <div className="p-3 rounded-xl bg-canvas border border-line">
                    <p className="text-muted text-[10px] uppercase font-bold">Presupuesto Asignado</p>
                    <p className="font-bold text-ink text-base mt-0.5 font-mono">
                      ${propuestaDetalle.presupuestoMaximo || 200} USD/mes
                    </p>
                    <p className="text-[10px] text-muted mt-0.5">
                      {simulacionDetalle.porcentajeUsoPresupuesto}% utilizado
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-canvas border border-line">
                    <p className="text-muted text-[10px] uppercase font-bold">
                      {simulacionDetalle.diferenciaPresupuesto >= 0 ? 'Holgura FinOps' : 'Déficit Presupuestario'}
                    </p>
                    <p
                      className={`font-bold text-base mt-0.5 font-mono ${
                        simulacionDetalle.diferenciaPresupuesto >= 0 ? 'text-emerald-500' : 'text-rose-500'
                      }`}
                    >
                      {simulacionDetalle.diferenciaPresupuesto >= 0 ? '+' : '-'}$
                      {Math.abs(simulacionDetalle.diferenciaPresupuesto).toFixed(2)} USD
                    </p>
                    <p className="text-[10px] text-muted mt-0.5">
                      {simulacionDetalle.diferenciaPresupuesto >= 0 ? 'Margen disponible' : 'Exceso sobre tope'}
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-canvas border border-line">
                    <p className="text-muted text-[10px] uppercase font-bold">Costo Unitario por Usuario</p>
                    <p className="font-bold text-ink text-base mt-0.5 font-mono">
                      ${simulacionDetalle.costoPorUsuarioMensual.toFixed(4)} USD
                    </p>
                    <p className="text-[10px] text-muted mt-0.5">
                      Para {propuestaDetalle.usuariosEstimados.toLocaleString()} usuarios
                    </p>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-ink flex items-center gap-1.5">
                      <Layers size={14} className="text-blue-500" />
                      Desglose Detallado por Servicio AWS ({simulacionDetalle.desglose.length} componentes)
                    </span>
                    <span className="text-[10px] text-muted">Dimensionado según carga y SLA</span>
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-line">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-canvas/80 text-[10px] uppercase font-bold text-muted border-b border-line">
                          <th className="p-2.5">Servicio AWS</th>
                          <th className="p-2.5">Dimensionamiento y Capacidad</th>
                          <th className="p-2.5 text-right">Tarifa Unit.</th>
                          <th className="p-2.5 text-right">Subtotal Mensual</th>
                          <th className="p-2.5 text-right">Subtotal Anual</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line/60">
                        {simulacionDetalle.desglose.map((d) => (
                          <tr key={d.servicioId} className="hover:bg-canvas/50 transition-colors">
                            <td className="p-2.5">
                              <p className="font-bold text-ink">{d.nombre}</p>
                              <span className="text-[10px] text-muted">{d.categoria}</span>
                            </td>
                            <td className="p-2.5">
                              <p className="font-medium text-ink">{d.explicacionCalculo}</p>
                              <span className="text-[10px] text-muted font-mono">
                                Cantidad: {d.cantidadEstimada} ({d.unidadMedida})
                              </span>
                            </td>
                            <td className="p-2.5 text-right font-mono text-muted text-[11px]">
                              {d.costoUnitario === 0 ? 'Sin costo' : `$${d.costoUnitario}`}
                            </td>
                            <td className="p-2.5 text-right font-mono font-bold text-ink text-[11px]">
                              ${d.subtotalMensual.toFixed(2)}
                            </td>
                            <td className="p-2.5 text-right font-mono text-muted text-[11px]">
                              ${(d.subtotalMensual * 12).toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-canvas/90 border-t border-line font-bold text-xs">
                          <td colSpan={3} className="p-2.5 text-ink">Total Mensual Proyectado (Entorno {ambiente})</td>
                          <td className="p-2.5 text-right font-mono text-amber-500 text-sm">
                            ${simulacionDetalle.costoMensualEstimado.toFixed(2)}
                          </td>
                          <td className="p-2.5 text-right font-mono text-muted text-xs">
                            ${simulacionDetalle.costoAnualEstimado.toFixed(2)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* PESTAÑA 2: RESILIENCIA, SLA & DRP */}
            {tabModalDetalle === 'resiliencia' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="p-3.5 rounded-xl bg-canvas border border-line space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase font-bold text-muted">SLA & Disponibilidad</span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-500 border border-blue-500/20 capitalize">
                        {propuestaDetalle.disponibilidad}
                      </span>
                    </div>
                    <p className="text-xl font-bold text-ink font-mono">{simulacionDetalle.slaPorcentaje}% SLA</p>
                    <div className="pt-2 border-t border-line/60 space-y-1 text-[11px] text-muted">
                      <p>• Caída admisible: <strong className="text-ink">{simulacionDetalle.downtimeAnualTexto}</strong></p>
                      <p>• Redundancia: <strong className="text-ink">
                        {propuestaDetalle.disponibilidad === 'critica'
                          ? 'Multi-Región Activo-Activo'
                          : propuestaDetalle.disponibilidad === 'alta'
                          ? 'Multi-AZ con failover'
                          : 'Mono-AZ'}
                      </strong></p>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-canvas border border-line space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase font-bold text-muted">RTO Objetivo</span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20 font-mono">
                        {propuestaDetalle.rtoHoras || 2} horas máx
                      </span>
                    </div>
                    <p className="text-sm font-bold text-ink">{simulacionDetalle.estrategiaRto}</p>
                    <p className="text-[11px] text-muted leading-relaxed">
                      Tiempo máximo tolerable de parada antes de conmutar tráfico a destinos de contingencia.
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-canvas border border-line space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase font-bold text-muted">RPO Objetivo</span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 font-mono">
                        {propuestaDetalle.rpoMinutos || 15} min máx
                      </span>
                    </div>
                    <p className="text-sm font-bold text-ink">{simulacionDetalle.estrategiaRpo}</p>
                    <p className="text-[11px] text-muted leading-relaxed">
                      Límite de pérdida de datos tolerable. Exige replicación de transacciones y snapshots continuos.
                    </p>
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-line bg-card space-y-2">
                  <h4 className="font-bold text-ink text-xs flex items-center gap-1.5">
                    <ShieldCheck size={14} className="text-blue-500" />
                    Matriz de Conmutación por Error y Continuidad de Negocio
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] pt-1">
                    <div className="p-2.5 rounded-lg bg-canvas border border-line">
                      <p className="font-bold text-ink mb-1">Capa de Tráfico y DNS</p>
                      <p className="text-muted leading-relaxed">
                        Route 53 con comprobaciones de estado de latencia y failover global automatizado en segundos.
                      </p>
                    </div>
                    <div className="p-2.5 rounded-lg bg-canvas border border-line">
                      <p className="font-bold text-ink mb-1">Capa de Aplicación y Cómputo</p>
                      <p className="text-muted leading-relaxed">
                        Balanceador ALB con Auto Scaling distribuido en múltiples zonas de disponibilidad (Multi-AZ).
                      </p>
                    </div>
                    <div className="p-2.5 rounded-lg bg-canvas border border-line">
                      <p className="font-bold text-ink mb-1">Capa de Base de Datos</p>
                      <p className="text-muted leading-relaxed">
                        {propuestaDetalle.disponibilidad === 'basica'
                          ? 'Instancia única con backups automáticos periódicos (sin réplica síncrona).'
                          : 'RDS Multi-AZ con replicación síncrona en zona standby y failover en < 60s.'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* PESTAÑA 3: PILARES WELL-ARCHITECTED & CUMPLIMIENTO */}
            {tabModalDetalle === 'pilares' && (
              <div className="space-y-4">
                <div className="p-4 rounded-xl border border-line bg-card space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-ink flex items-center gap-1.5">
                      <Award size={15} className="text-indigo-500" />
                      Evaluación de los 5 Pilares del AWS Well-Architected Framework
                    </span>
                    <span className="font-bold font-mono text-indigo-500 bg-indigo-500/10 px-2 py-0.5 rounded-md border border-indigo-500/20">
                      Score Global: {simulacionDetalle.pilares.scoreGlobal}%
                    </span>
                  </div>

                  <div className="space-y-2.5 pt-1">
                    {[
                      { nombre: 'Seguridad', valor: simulacionDetalle.pilares.seguridad, desc: 'IAM de mínimo privilegio, cifrado KMS, WAF y VPC privada' },
                      { nombre: 'Fiabilidad', valor: simulacionDetalle.pilares.fiabilidad, desc: 'Multi-AZ, Auto Scaling, balanceo ALB y conmutación automática' },
                      { nombre: 'Eficiencia de Rendimiento', valor: simulacionDetalle.pilares.eficienciaRendimiento, desc: 'CloudFront CDN, elástica según usuarios concurrentes' },
                      { nombre: 'Optimización de Costos', valor: simulacionDetalle.pilares.optimizacionCostos, desc: 'Uso eficiente de recursos FinOps y holgura presupuestaria' },
                      { nombre: 'Excelencia Operativa', valor: simulacionDetalle.pilares.excelenciaOperativa, desc: 'Monitoreo CloudWatch, telemetría y alarmas automatizadas' },
                    ].map((pilar) => (
                      <div key={pilar.nombre} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-ink">{pilar.nombre}</span>
                          <span className="font-mono text-muted">{pilar.valor}%</span>
                        </div>
                        <div className="w-full h-2 rounded-full bg-canvas border border-line overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              pilar.valor >= 80 ? 'bg-emerald-500' : pilar.valor >= 60 ? 'bg-blue-500' : 'bg-amber-500'
                            }`}
                            style={{ width: `${pilar.valor}%` }}
                          />
                        </div>
                        <p className="text-[10px] text-muted">{pilar.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="font-bold text-ink text-xs mb-2 flex items-center gap-1.5">
                    <FileCheck2 size={14} className="text-emerald-500" />
                    Diagnóstico de Marcos Normativos y Cumplimiento
                  </h4>

                  {simulacionDetalle.cumplimientoAnalisis.length === 0 ? (
                    <div className="p-3 rounded-xl bg-canvas border border-line text-muted text-center text-xs">
                      No se definieron marcos normativos específicos en esta propuesta.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {simulacionDetalle.cumplimientoAnalisis.map((m) => (
                        <div
                          key={m.id}
                          className={`p-3 rounded-xl border space-y-1.5 ${
                            m.cubierto
                              ? 'border-emerald-500/30 bg-emerald-500/5'
                              : 'border-amber-500/30 bg-amber-500/5'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-ink text-xs flex items-center gap-1.5">
                              {m.cubierto ? (
                                <CheckCheck size={14} className="text-emerald-500" />
                              ) : (
                                <AlertTriangle size={14} className="text-amber-500" />
                              )}
                              {m.id}
                            </span>
                            <span
                              className={`text-[9.5px] font-bold px-1.5 py-0.2 rounded border ${
                                m.cubierto
                                  ? 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30'
                                  : 'bg-amber-500/15 text-amber-600 border-amber-500/30'
                              }`}
                            >
                              {m.cubierto ? 'Controles Cubiertos' : 'Requiere Ajustes'}
                            </span>
                          </div>
                          <p className="text-[10.5px] text-muted leading-snug">{m.descripcion}</p>

                          <div className="pt-1.5 border-t border-line/60 text-[10px] space-y-1">
                            <p className="text-muted">
                              Respaldado por: <strong className="text-ink">{m.serviciosPresentes.join(', ') || 'Ninguno'}</strong>
                            </p>
                            {m.serviciosFaltantesRecomendados.length > 0 && (
                              <p className="text-amber-600">
                                Componentes faltantes: <strong>{m.serviciosFaltantesRecomendados.join(', ')}</strong>
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* PESTAÑA 4: DIAGNÓSTICO & RECOMENDACIONES */}
            {tabModalDetalle === 'recomendaciones' && (
              <div className="space-y-4">
                <div>
                  <h4 className="font-bold text-ink text-xs mb-2 flex items-center gap-1.5">
                    <AlertTriangle size={14} className="text-amber-500" />
                    Observaciones Arquitectónicas ({simulacionDetalle.incoherencias.length})
                  </h4>

                  {simulacionDetalle.incoherencias.length === 0 ? (
                    <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 text-xs flex items-center gap-2">
                      <CheckCircle2 size={16} /> ¡Excelente diseño! No se detectaron incoherencias arquitectónicas ni violaciones normativas.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {simulacionDetalle.incoherencias.map((inc, i) => (
                        <div
                          key={i}
                          className={`p-3 rounded-xl border flex items-start gap-2.5 ${
                            inc.tipo === 'error'
                              ? 'border-rose-500/30 bg-rose-500/5'
                              : inc.tipo === 'advertencia'
                              ? 'border-amber-500/30 bg-amber-500/5'
                              : 'border-blue-500/30 bg-blue-500/5'
                          }`}
                        >
                          <span className="mt-0.5 shrink-0">
                            {inc.tipo === 'error' ? (
                              <ShieldAlert size={16} className="text-rose-500" />
                            ) : (
                              <AlertCircle size={16} className="text-amber-500" />
                            )}
                          </span>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-ink">{inc.titulo}</span>
                              <span className="text-[9px] uppercase px-1.5 py-0.2 rounded bg-card border border-line text-muted">
                                Pilar: {inc.pilar}
                              </span>
                            </div>
                            <p className="text-[11px] text-muted mt-1 leading-relaxed">{inc.descripcion}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <h4 className="font-bold text-ink text-xs mb-2 flex items-center gap-1.5">
                    <TrendingDown size={14} className="text-emerald-500" />
                    Oportunidades de Optimización FinOps
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {simulacionDetalle.recomendacionesAhorro.map((rec, i) => (
                      <div key={i} className="p-3 rounded-xl bg-canvas border border-line space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-ink text-xs">{rec.titulo}</span>
                          <span className="font-mono text-emerald-500 font-bold text-[11px]">
                            -${rec.ahorroPotencialMensual.toFixed(2)}/m
                          </span>
                        </div>
                        <p className="text-[10.5px] text-muted leading-relaxed">{rec.detalle}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Footer de Acciones del Modal */}
            <div className="pt-3 border-t border-line flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                {transferenciaExitosa && (
                  <span className="text-xs font-bold text-emerald-500 flex items-center gap-1">
                    <CheckCircle2 size={14} /> ¡Servicios cargados con éxito en la calculadora de Costos!
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => exportarPropuestaJson(propuestaDetalle)}
                  className="px-3.5 py-2 rounded-xl border border-line bg-canvas hover:bg-card text-muted hover:text-ink text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <Download size={13} /> Exportar Auditoría JSON
                </button>
                <button
                  type="button"
                  onClick={transferirACostos}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-md shadow-blue-500/20"
                >
                  <RefreshCw size={13} /> Cargar en Calculadora de Costos
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
