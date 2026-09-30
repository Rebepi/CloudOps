import { useState, useEffect } from 'react';
import {
  Trash2,
  ClipboardList,
  Sparkles,
  Search,
  Eye,
  CheckCircle2,
  FileSpreadsheet,
  AlertCircle,
  ShieldCheck,
  Clock,
  DollarSign,
  Users,
  Globe,
  RotateCcw,
  Check,
  Compass,
  Zap,
  Download,
} from 'lucide-react';
import { useCloud } from '../context/CloudContext';
import { serviciosAWS } from '../data/awsServices';
import { regionGeometry } from '../data/regionGeometry';
import { useAws } from '../hooks/useAws';
import { Card } from '../components/ui/Card';
import { ServiceCard } from '../components/ServiceCard';
import { Modal } from '../components/ui/Modal';
import { InfoTooltip } from '../components/ui/InfoTooltip';
import { Select } from '../components/ui/Select';
import { fecha } from '../lib/format';
import { api } from '../lib/api';
import type { PropuestaCloud } from '../types/cloud';

const disponibilidades = [
  {
    value: 'basica',
    label: 'Básica',
    sublabel: 'Objetivo de disponibilidad',
    downtime: 'Por evaluar',
    desc: 'Despliegue estándar en una sola zona de disponibilidad. Apto para ambientes de desarrollo, pruebas y sistemas no críticos.',
    dotColor: 'bg-amber-500',
    badgeText: 'Dev / Testing',
  },
  {
    value: 'alta',
    label: 'Alta Disponibilidad',
    sublabel: 'Objetivo de disponibilidad',
    downtime: 'Por evaluar',
    desc: 'Despliegue Multi-AZ con réplica síncrona en base de datos y balanceo de carga automático (ALB + Auto Scaling).',
    dotColor: 'bg-blue-500',
    badgeText: 'Recomendado',
  },
  {
    value: 'critica',
    label: 'Misión Crítica',
    sublabel: 'Objetivo de disponibilidad',
    downtime: 'Por evaluar',
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
  const { propuestas, agregarPropuesta, eliminarPropuesta, regionPrincipal, refrescar } = useCloud();
  const awsRegions = useAws<{ id: string; status: string }[]>('/aws/regions');
  const [form, setForm] = useState<FormState>({ ...estadoInicial, regionId: regionPrincipal });
  const [errores, setErrores] = useState<Partial<Record<keyof FormState, string>>>({});
  const [confirmacion, setConfirmacion] = useState(false);
  const [errorGuardado, setErrorGuardado] = useState<string | null>(null);
  const [mensajeImportacion, setMensajeImportacion] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [filtroTipo, setFiltroTipo] = useState<string>('Todos');
  const [propuestaDetalle, setPropuestaDetalle] = useState<PropuestaCloud | null>(null);
  const [categoriaServicios, setCategoriaServicios] = useState<string>('Todas');

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
    if (!validar()) return;
    try {
      await agregarPropuesta({
      ...form,
      });
      setErrorGuardado(null);
      setConfirmacion(true);
      setForm({ ...estadoInicial, regionId: regionPrincipal });
      setTimeout(() => setConfirmacion(false), 4000);
    } catch (cause) { setErrorGuardado(cause instanceof Error ? cause.message : String(cause)); }
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

  const importarJson = async (file?: File) => {
    if (!file) return;
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (typeof parsed !== 'object' || parsed === null) throw new Error('Archivo JSON inválido');
      const data = parsed as Record<string, unknown>;
      const proposals = Array.isArray(data.propuestas) ? data.propuestas : Array.isArray(data.proposals) ? data.proposals : data.propuesta ? [data.propuesta] : [];
      const costItems = Array.isArray(data.itemsCosto) ? data.itemsCosto : Array.isArray(data.costItems) ? data.costItems : [];
      if (!proposals.length && !costItems.length) throw new Error('No se encontraron propuestas ni ítems de costo');
      const result = await api<{ data: { proposals: number; costItems: number } }>('/import/browser', { method: 'POST', body: JSON.stringify({ proposals, costItems }) });
      await refrescar();
      setMensajeImportacion(`Importados: ${result.data.proposals} propuestas y ${result.data.costItems} ítems.`);
    } catch (error) { setMensajeImportacion(error instanceof Error ? error.message : String(error)); }
  };

  const exportarPropuestaJson = (p: PropuestaCloud) => {
    const blob = new Blob([JSON.stringify({ propuesta: p, fechaExportacion: new Date().toISOString(), tipo: 'plan_local' }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `propuesta-${p.nombre.toLowerCase().replace(/\s+/g, '-')}.json`;
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
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-indigo-500/10 text-indigo-500 font-bold border border-indigo-500/20"><Zap size={13} /><span>{form.serviciosSeleccionados.length} servicios previstos</span></div>
          </div>
        </div>

        <form onSubmit={manejarEnvio} className="space-y-6">
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
                  opciones={(awsRegions.data ?? [{ id: regionPrincipal, status: 'consultando' }]).filter((r) => r.status !== 'not-opted-in').map((r) => ({
                    value: r.id,
                    label: regionGeometry[r.id]?.name ?? r.id,
                    sublabel: r.id,
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
                  descripcion="La selección expresa un objetivo de diseño. El SLA real depende de servicios y configuraciones concretas."
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

          <div className="p-4 rounded-2xl border border-blue-500/25 bg-gradient-to-br from-blue-500/5 via-card to-indigo-500/5 text-xs text-muted">
            <p className="font-bold text-ink">Resumen de la propuesta</p>
            <p className="mt-1">{form.usuariosEstimados.toLocaleString()} usuarios · {form.serviciosSeleccionados.length} servicios seleccionados · {form.regionId} · presupuesto objetivo {form.presupuestoMaximo ? `$${form.presupuestoMaximo}/mes` : 'sin definir'}.</p>
            <p className="mt-1">El costo y el cumplimiento requieren cotizaciones y una evaluación formal; se consultan por separado en Costos y Seguridad.</p>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 border-t border-line">
            <div className="flex items-center gap-2">
              {confirmacion && (
                <div className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-600 bg-emerald-500/10 px-3.5 py-2 rounded-xl border border-emerald-500/20 animate-fade-up">
                  <CheckCircle2 size={16} /> Propuesta guardada en PostgreSQL local.
                </div>
              )}
              {errorGuardado && <p className="text-xs text-rose-600">{errorGuardado}</p>}
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
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-500 hover:from-blue-500 hover:to-indigo-500 text-xs font-bold text-white shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 hover:-translate-y-0.5 active:translate-y-0 transition-all cursor-pointer flex items-center gap-2"
              >
                <Sparkles size={14} /> Guardar Propuesta Cloud
              </button>
            </div>
          </div>
        </form>
      </Card>

      <div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg font-bold text-ink flex items-center gap-2">
              <ClipboardList size={18} className="text-blue-600" /> Propuestas Registradas ({propuestas.length})
            </h2>
            <p className="text-xs text-muted">Historial persistido localmente de evaluaciones de arquitectura</p>
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
            <label className="inline-flex items-center gap-1.5 h-9 rounded-xl border border-line bg-card px-3 text-xs font-bold text-ink hover:bg-canvas cursor-pointer">
              <Download size={14} className="text-blue-600" /> Importar JSON anterior
              <input type="file" accept="application/json,.json" className="sr-only" onChange={(e) => { void importarJson(e.target.files?.[0]); e.target.value = ''; }} />
            </label>
          </div>
        </div>
        {mensajeImportacion && <p className="mb-3 text-xs text-blue-600">{mensajeImportacion}</p>}

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
                        onClick={() => eliminarPropuesta(p.id)}
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
                      <p className="text-[10px] text-muted">Servicios</p>
                      <p className="font-bold text-amber-500 font-mono">{p.serviciosSeleccionados.length}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted">Presupuesto</p>
                      <p className="font-bold text-ink">{p.presupuestoMaximo == null ? 'Sin definir' : `$${p.presupuestoMaximo}/m`}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted">Evaluación</p>
                      <p className="font-bold text-indigo-500">Pendiente</p>
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
        {propuestaDetalle && <div className="space-y-4 text-xs">
          <div className="rounded-xl border border-line bg-canvas p-4"><p className="font-bold text-ink">Descripción</p><p className="mt-1 text-muted">{propuestaDetalle.descripcion}</p></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-xl border border-line p-3"><p className="text-muted">Región</p><p className="font-bold text-ink">{propuestaDetalle.regionId}</p></div>
            <div className="rounded-xl border border-line p-3"><p className="text-muted">Usuarios estimados</p><p className="font-bold text-ink">{propuestaDetalle.usuariosEstimados.toLocaleString()}</p></div>
            <div className="rounded-xl border border-line p-3"><p className="text-muted">Disponibilidad deseada</p><p className="font-bold text-ink">{propuestaDetalle.disponibilidad}</p></div>
            <div className="rounded-xl border border-line p-3"><p className="text-muted">Presupuesto máximo</p><p className="font-bold text-ink">{propuestaDetalle.presupuestoMaximo == null ? 'No definido' : `$${propuestaDetalle.presupuestoMaximo}/mes`}</p></div>
          </div>
          <div className="rounded-xl border border-line p-3"><p className="font-bold text-ink">Servicios previstos</p><p className="mt-1 text-muted">{propuestaDetalle.serviciosSeleccionados.join(', ')}</p></div>
          <div className="rounded-xl border border-line p-3"><p className="font-bold text-ink">Objetivo</p><p className="mt-1 text-muted">{propuestaDetalle.objetivoMigracion}</p></div>
          <p className="text-muted">Esta propuesta es un plan local. Consulta ofertas AWS en Servicios o Costos para crear una estimación y Seguridad para revisar controles observados.</p>
          <button type="button" onClick={() => exportarPropuestaJson(propuestaDetalle)} className="rounded-xl border border-line bg-canvas px-4 py-2 font-bold text-blue-600"><Download size={13} className="inline mr-1" />Exportar propuesta JSON</button>
        </div>}
      </Modal>
    </div>
  );
}
