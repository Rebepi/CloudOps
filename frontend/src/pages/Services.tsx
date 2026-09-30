import { useState } from 'react';
import {
  Search,
  ArrowRightLeft,
  CheckCircle2,
  Terminal,
  Copy,
  Check,
  Server,
  Sparkles,
  Wifi,
  RefreshCw,
  HardDrive,
  Database,
  Network,
  ShieldCheck,
  Zap,
  LayoutGrid,
  Activity,
  Tag,
  X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { serviciosAWS } from '../data/awsServices';
import { ServiceCard } from '../components/ServiceCard';
import { Card } from '../components/ui/Card';
import { StatusBadge } from '../components/ui/StatusBadge';
import { Modal } from '../components/ui/Modal';
import { InfoTooltip } from '../components/ui/InfoTooltip';
import { useCloud } from '../context/CloudContext';
import { usePrecios } from '../hooks/usePrecios';
import { usd } from '../lib/format';
import type { ServicioAWS } from '../types/cloud';
import { useAws } from '../hooks/useAws';
import { api, type AwsResponse } from '../lib/api';

type Quote = { sku: string; serviceCode: string; regionCode: string | null; description: string; product: string; priceUsd: number; unit: string; rateCode: string; beginRange: string; endRange: string };
const codes: Record<string, string> = { ec2: 'AmazonEC2', ebs: 'AmazonEC2', s3: 'AmazonS3', rds: 'AmazonRDS', lambda: 'AWSLambda', dynamodb: 'AmazonDynamoDB', cloudfront: 'AmazonCloudFront', route53: 'AmazonRoute53', cloudwatch: 'AmazonCloudWatch', vpc: 'AmazonVPC', kms: 'awskms', waf: 'awswaf', elb: 'AWSELB' };

export default function Services() {
  const navigate = useNavigate();
  const { agregarItemCosto, regionPrincipal } = useCloud();
  const usage = useAws<{ resources: Record<string, { items: unknown[]; truncated: boolean }>; errors: Record<string, string> }>(`/aws/services?region=${regionPrincipal}`);
  const inventory = useAws<{ instances: unknown[]; databases: unknown[] }>(`/aws/inventory?region=${regionPrincipal}`);
  const buckets = useAws<unknown[]>('/aws/buckets');
  const network = useAws<{ vpcs: unknown[] }>(`/aws/network?region=${regionPrincipal}`);
  const security = useAws<{ identities: unknown[]; roles: unknown[] }>(`/aws/security?region=${regionPrincipal}`);
  const { precios, cargando: cargandoPrecios, refrescar: refrescarPrecios } = usePrecios();
  const [busqueda, setBusqueda] = useState('');
  const [categoria, setCategoria] = useState<string>('Todas');
  const [soloEnUso, setSoloEnUso] = useState(false);
  const [soloGratis, setSoloGratis] = useState(false);
  const [servicioSeleccionado, setServicioSeleccionado] = useState<ServicioAWS | null>(null);
  const [serviciosComparar, setServiciosComparar] = useState<string[]>([]);
  const [modalComparacion, setModalComparacion] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [mensajeToast, setMensajeToast] = useState<string | null>(null);
  const [ofertas, setOfertas] = useState<Quote[] | null>(null);
  const [cargandoOfertas, setCargandoOfertas] = useState(false);
  const [errorOfertas, setErrorOfertas] = useState<string | null>(null);
  const [fechaOfertas, setFechaOfertas] = useState<string>();
  const [filtroOferta, setFiltroOferta] = useState('');
  const [cantidadOferta, setCantidadOferta] = useState(1);
  const [horasOferta, setHorasOferta] = useState(730);

  const countFor = (id: string) => id === 'ec2' ? inventory.data?.instances.length : id === 'rds' ? inventory.data?.databases.length : id === 's3' ? buckets.data?.length : id === 'vpc' ? network.data?.vpcs.length : id === 'iam' ? (security.data ? security.data.identities.length + security.data.roles.length : undefined) : usage.data?.resources[id]?.items.length;
  const catalogo = serviciosAWS.map((s) => ({ ...s, enUso: (countFor(s.id) ?? 0) > 0 }));

  const inspeccionar = async (s: ServicioAWS) => {
    setServicioSeleccionado(s); setOfertas(null); setErrorOfertas(null); setFiltroOferta('');
    const code = codes[s.id];
    if (!code) return;
    const query = new URLSearchParams({ serviceCode: code });
    if (s.id !== 'cloudfront' && s.id !== 'route53') query.set('regionCode', regionPrincipal);
    if (s.id === 'ec2') Object.entries({ instanceType: 't3.medium', operatingSystem: 'Linux', tenancy: 'Shared', capacitystatus: 'Used', preInstalledSw: 'NA' }).forEach(([key, value]) => query.set(key, value));
    if (s.id === 'rds') { query.set('instanceType', 'db.t3.medium'); query.set('databaseEngine', 'PostgreSQL'); }
    setCargandoOfertas(true);
    try { const result = await api<AwsResponse<Quote[]>>(`/aws/pricing?${query}`); setOfertas(result.data); setFechaOfertas(result.observedAt); }
    catch (error) { setErrorOfertas(error instanceof Error ? error.message : String(error)); }
    finally { setCargandoOfertas(false); }
  };

  const agregarOferta = async (s: ServicioAWS, q: Quote) => {
    if (Number(q.beginRange) > 0) { setErrorOfertas('Selecciona una tarifa del primer tramo.'); return; }
    try {
      await agregarItemCosto({ servicioId: s.id, cantidad: cantidadOferta, horasMes: q.unit === 'Hrs' ? horasOferta : 1, configuracion: q.description,
        precioUnitario: q.priceUsd, unidadPrecio: q.unit, skuPrecio: q.sku, codigoServicioPrecio: q.serviceCode, regionPrecio: q.regionCode, fechaPrecio: fechaOfertas });
      setMensajeToast(`${s.nombre}: oferta ${q.sku} añadida a Costos.`);
      setErrorOfertas(null);
    } catch (error) { setErrorOfertas(error instanceof Error ? error.message : String(error)); }
  };

  const alternarComparar = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (serviciosComparar.includes(id)) {
      setServiciosComparar(serviciosComparar.filter((x) => x !== id));
    } else {
      if (serviciosComparar.length >= 3) return;
      setServiciosComparar([...serviciosComparar, id]);
    }
  };

  const copiarComando = (cmd: string) => {
    navigator.clipboard.writeText(cmd);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  const visibles = catalogo.filter((s) => {
    const coincideTexto =
      s.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
      s.descripcion.toLowerCase().includes(busqueda.toLowerCase()) ||
      s.funcionPrincipal.toLowerCase().includes(busqueda.toLowerCase());
    const coincideCategoria = categoria === 'Todas' || s.categoria === categoria;
    const coincideEnUso = !soloEnUso || s.enUso;
    const coincideGratis = !soloGratis || s.gratisTier;
    return coincideTexto && coincideCategoria && coincideEnUso && coincideGratis;
  });

  const serviciosParaComparar = catalogo.filter((s) => serviciosComparar.includes(s.id));

  const getPrecio = (s: ServicioAWS) => precios[s.id] ?? { precio: null, fuente: 'sin_cotizacion' as const };

  const BadgePrecio = ({ servicioId }: { servicioId: string }) => {
    const info = precios[servicioId];
    if (cargandoPrecios) return (
      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-slate-500/10 text-muted border border-line animate-pulse">cargando…</span>
    );
    if (!info) return (
      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-600 border border-blue-500/20">Sin cotización</span>
    );
    return (
      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 border border-emerald-500/30 flex items-center gap-0.5">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
        API · En vivo
      </span>
    );
  };

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-line pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-ink flex items-center gap-2">
              <Server size={22} className="text-blue-600" /> Catálogo Oficial de Servicios AWS
            </h2>
            <InfoTooltip
              titulo="Catálogo de Servicios Cloud"
              descripcion="Directorio exhaustivo de los servicios clave del ecosistema AWS con información sobre niveles de servicio (SLAs), modelos de precios bajo demanda y comandos CLI de aprovisionamiento."
            />
          </div>
          <p className="text-xs text-muted mt-0.5">
            Explora {serviciosAWS.length} servicios documentados con SLAs de disponibilidad, comandos CLI de muestra y modelos de responsabilidad.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {!cargandoPrecios && (
            <span className="flex items-center gap-1.5 text-xs text-emerald-600 font-semibold bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-xl">
              <Wifi size={13} />
              Ofertas verificadas cuando estén disponibles
              <InfoTooltip
                titulo="AWS Pricing API"
                descripcion="Conexión en tiempo real con los endpoints oficiales del API de Precios de AWS para cotizaciones actualizadas según la región."
              />
            </span>
          )}
          <button
            onClick={refrescarPrecios}
            className="grid h-8 w-8 place-items-center rounded-xl border border-line bg-card text-muted hover:text-blue-600 hover:border-blue-500/30 transition-colors"
            title="Actualizar precios desde AWS Pricing API"
          >
            <RefreshCw size={13} className={cargandoPrecios ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {serviciosComparar.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-muted">
            {serviciosComparar.length} seleccionados
          </span>
          <button
            onClick={() => setModalComparacion(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white shadow-md hover:bg-blue-500 transition-all cursor-pointer"
          >
            <ArrowRightLeft size={14} /> Comparar Servicios
          </button>
          <button
            onClick={() => setServiciosComparar([])}
            className="text-xs text-muted hover:text-ink font-semibold"
          >
            Limpiar
          </button>
        </div>
      )}

      {mensajeToast && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs font-bold text-emerald-600 flex items-center justify-between animate-fade-up">
          <span className="flex items-center gap-2">
            <CheckCircle2 size={16} /> {mensajeToast}
          </span>
          <button
            onClick={() => navigate('/costs')}
            className="text-blue-600 underline hover:text-blue-700"
          >
            Ver en Costos →
          </button>
        </div>
      )}

      {/* ── Filter Bar ─────────────────────────────────────── */}
      <div className="rounded-2xl border border-line bg-card/60 backdrop-blur-sm p-4 space-y-4 shadow-sm">

        {/* Row 1: Search + toggles */}
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Search */}
          <div className="relative flex-1 group">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted group-focus-within:text-blue-500 transition-colors" />
            <input
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar servicio, comando CLI o categoría..."
              className="w-full rounded-xl border border-line bg-canvas pl-10 pr-4 py-2.5 text-xs text-ink outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 transition-all placeholder:text-muted"
            />
            {busqueda && (
              <button
                type="button"
                onClick={() => setBusqueda('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 grid place-items-center rounded-full bg-muted/20 text-muted hover:bg-muted/40 hover:text-ink transition-colors"
              >
                <X size={10} />
              </button>
            )}
          </div>

          {/* Toggle pills */}
          <div className="flex items-center gap-2 text-xs shrink-0">
            <button
              type="button"
              onClick={() => setSoloEnUso((v) => !v)}
              className={`flex items-center gap-2 rounded-xl px-3 py-2.5 border font-semibold transition-all duration-200 cursor-pointer select-none ${
                soloEnUso
                  ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-600/30'
                  : 'bg-canvas border-line text-muted hover:border-blue-400/50 hover:text-blue-500 hover:bg-blue-500/5'
              }`}
              aria-pressed={soloEnUso}
            >
              <Activity size={13} className={soloEnUso ? 'text-white' : 'text-blue-500'} />
              <span>En uso</span>
              {soloEnUso && <span className="h-1.5 w-1.5 rounded-full bg-white/70 animate-pulse" />}
            </button>

            <button
              type="button"
              onClick={() => setSoloGratis((v) => !v)}
              className={`flex items-center gap-2 rounded-xl px-3 py-2.5 border font-semibold transition-all duration-200 cursor-pointer select-none ${
                soloGratis
                  ? 'bg-emerald-600 border-emerald-500 text-white shadow-lg shadow-emerald-600/30'
                  : 'bg-canvas border-line text-muted hover:border-emerald-400/50 hover:text-emerald-500 hover:bg-emerald-500/5'
              }`}
              aria-pressed={soloGratis}
            >
              <Tag size={13} className={soloGratis ? 'text-white' : 'text-emerald-500'} />
              <span>Free Tier</span>
              {soloGratis && <span className="h-1.5 w-1.5 rounded-full bg-white/70 animate-pulse" />}
            </button>
          </div>
        </div>

        {/* Row 2: Category pills */}
        <div className="flex flex-wrap gap-2">
          {[
            { id: 'Todas',                  label: 'Todas',              Icono: LayoutGrid },
            { id: 'Cómputo',               label: 'Cómputo',            Icono: Server     },
            { id: 'Almacenamiento',         label: 'Almacenamiento',     Icono: HardDrive  },
            { id: 'Base de datos',          label: 'Base de datos',      Icono: Database   },
            { id: 'Redes',                  label: 'Redes',              Icono: Network    },
            { id: 'Seguridad e identidad',  label: 'Seguridad',          Icono: ShieldCheck},
            { id: 'Entrega de contenido',   label: 'CDN',                Icono: Zap        },
          ].map(({ id, label, Icono }) => {
            const activa = categoria === id;
            return (
              <button
                key={id}
                onClick={() => setCategoria(id)}
                className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[11px] font-semibold transition-all duration-150 cursor-pointer border ${
                  activa
                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white border-blue-500 shadow-md shadow-blue-600/25'
                    : 'bg-canvas border-line text-muted hover:border-blue-400/50 hover:text-blue-500 hover:bg-blue-500/5'
                }`}
              >
                <Icono size={12} className={activa ? 'text-white/80' : ''} />
                {label}
                {activa && id !== 'Todas' && (
                  <span className="ml-0.5 bg-white/20 text-white text-[9px] font-bold px-1 py-0.5 rounded-md">
                    {visibles.length}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-muted">
        <span>Mostrando {visibles.length} de {serviciosAWS.length} servicios disponibles</span>
        <span>Selecciona hasta 3 servicios para ver comparativa técnica</span>
      </div>

      {visibles.length === 0 ? (
        <Card className="py-16 text-center text-muted text-xs">
          <Search size={36} className="mx-auto mb-2 text-muted opacity-40" />
          No se encontraron servicios que coincidan con los criterios de búsqueda.
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibles.map((servicio) => {
            const estaEnComparar = serviciosComparar.includes(servicio.id);
            return (
              <ServiceCard
                key={servicio.id}
                servicio={servicio}
                onClick={() => void inspeccionar(servicio)}
                precioInfo={getPrecio(servicio)}
                cargandoPrecio={cargandoPrecios}
                enComparar={estaEnComparar}
                onComparar={(e) => alternarComparar(servicio.id, e)}
                onAnadirCosto={(e) => {
                  e.stopPropagation();
                  void inspeccionar(servicio);
                }}
              />
            );
          })}
        </div>
      )}

      <Modal
        abierto={!!servicioSeleccionado}
        onCerrar={() => setServicioSeleccionado(null)}
        titulo={servicioSeleccionado?.nombre ?? ''}
        subtitulo={`Categoría: ${servicioSeleccionado?.categoria}`}
        tamano="lg"
      >
        {servicioSeleccionado && (
          <div className="space-y-4 text-xs">
            <div className="rounded-xl bg-canvas p-4 border border-line">
              <p className="font-bold text-ink mb-1">Descripción del Servicio</p>
              <p className="text-muted leading-relaxed">{servicioSeleccionado.descripcion}</p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="p-3 rounded-xl bg-canvas border border-line">
                <div className="flex items-center gap-1.5 mb-1">
                  <p className="text-[10px] text-muted">Precio de Referencia</p>
                  <BadgePrecio servicioId={servicioSeleccionado.id} />
                  <InfoTooltip
                    titulo="Tarificación por Unidad"
                    descripcion="Costo unitario por recurso consumido (hora de cómputo, GB almacenado o millón de peticiones) basado en la región predeterminada."
                  />
                </div>
                <p className="font-bold text-amber-600 text-sm">
                  {getPrecio(servicioSeleccionado).precio === null ? 'Sin cotización' : usd(getPrecio(servicioSeleccionado).precio!)}
                </p>
                <p className="text-[10px] text-muted">por {servicioSeleccionado.unidad}</p>
              </div>

              <div className="p-3 rounded-xl bg-canvas border border-line">
                <div className="flex items-center gap-1 mb-1">
                  <p className="text-[10px] text-muted">SLA</p>
                  <InfoTooltip
                    titulo="SLA Oficial"
                    descripcion="Compromiso contractual de disponibilidad mensual garantizado por AWS con créditos de servicio si no se cumple el umbral."
                  />
                </div>
                <p className="font-bold text-emerald-600 text-sm">Por verificar</p>
                <p className="text-[10px] text-muted">Consulta el acuerdo del servicio AWS</p>
              </div>

              <div className="p-3 rounded-xl bg-canvas border border-line">
                <div className="flex items-center gap-1 mb-1">
                  <p className="text-[10px] text-muted">Responsabilidad</p>
                  <InfoTooltip
                    titulo="Modelo Compartido"
                    descripcion="Define si la administración del recurso recae íntegramente en AWS (SaaS/Serverless), o si es compartida con el cliente (IaaS como EC2)."
                  />
                </div>
                <p className="font-bold text-blue-600 text-sm">{servicioSeleccionado.responsabilidad}</p>
                <p className="text-[10px] text-muted">Modelo compartido</p>
              </div>
            </div>

            {servicioSeleccionado.casoUso && (
              <div className="p-3.5 rounded-xl bg-blue-500/5 border border-blue-500/20">
                <p className="font-bold text-blue-600 mb-1 flex items-center gap-1.5">
                  <Sparkles size={14} /> Mejor Caso de Uso Arquitectónico
                </p>
                <p className="text-ink leading-relaxed">{servicioSeleccionado.casoUso}</p>
              </div>
            )}

            {servicioSeleccionado.comandoCli && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-ink flex items-center gap-1.5">
                    <Terminal size={14} className="text-blue-600" /> Comando AWS CLI de Muestra
                  </span>
                  <button
                    onClick={() => copiarComando(servicioSeleccionado.comandoCli!)}
                    className="text-blue-600 font-bold hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    {copiado ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
                    {copiado ? '¡Copiado!' : 'Copiar'}
                  </button>
                </div>
                <pre className="p-3 rounded-xl bg-slate-950 text-emerald-400 font-mono text-[11px] overflow-x-auto border border-slate-800 shadow-inner">
                  {servicioSeleccionado.comandoCli}
                </pre>
              </div>
            )}

            <div className="border-t border-line pt-4 space-y-3">
              <p className="font-bold text-ink">Ofertas AWS para {regionPrincipal}</p>
              {cargandoOfertas && <p className="text-muted">Consultando AWS Price List...</p>}
              {errorOfertas && <p className="text-rose-600">{errorOfertas}</p>}
              {ofertas && <>
                <div className="flex flex-wrap gap-2">
                  <input type="number" min="1" value={cantidadOferta} onChange={(e) => setCantidadOferta(Number(e.target.value))} aria-label="Cantidad" className="w-24 rounded border border-line bg-canvas p-2 text-ink" />
                  <input type="number" min="0" max="744" value={horasOferta} onChange={(e) => setHorasOferta(Number(e.target.value))} aria-label="Horas mensuales" className="w-24 rounded border border-line bg-canvas p-2 text-ink" />
                  <input value={filtroOferta} onChange={(e) => setFiltroOferta(e.target.value)} placeholder="Filtrar ofertas" className="min-w-36 flex-1 rounded border border-line bg-canvas p-2 text-ink" />
                </div>
                <div className="max-h-64 overflow-y-auto space-y-2">
                  {ofertas.filter((q) => `${q.product} ${q.description} ${q.sku}`.toLowerCase().includes(filtroOferta.toLowerCase())).map((q) => <div key={q.rateCode} className="rounded-xl border border-line p-3">
                    <p className="font-bold text-ink">{usd(q.priceUsd)} / {q.unit} · {q.description}</p>
                    <p className="text-muted">SKU {q.sku} · rango {q.beginRange}–{q.endRange}</p>
                    <button onClick={() => void agregarOferta(servicioSeleccionado, q)} className="mt-1 text-blue-600 font-bold">Usar en Costos</button>
                  </div>)}
                  {!ofertas.length && <p className="text-muted">No hay ofertas para esta consulta.</p>}
                </div>
              </>}
            </div>

            <div className="flex items-center justify-end pt-4 border-t border-line">

              <button
                onClick={() => setServicioSeleccionado(null)}
                className="text-xs text-muted hover:text-ink font-semibold"
              >
                Cerrar
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        abierto={modalComparacion}
        onCerrar={() => setModalComparacion(false)}
        titulo="Comparativa Técnica de Servicios AWS"
        subtitulo="Análisis lado a lado para toma de decisiones arquitectónicas"
        tamano="xl"
      >
        <div className="overflow-x-auto text-xs">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-line text-muted">
                <th className="pb-3 font-semibold min-w-[140px]">Atributo Técnico</th>
                {serviciosParaComparar.map((s) => (
                  <th key={s.id} className="pb-3 font-bold text-ink min-w-[180px]">
                    {s.nombre}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              <tr>
                <td className="py-3 font-semibold text-muted">Categoría</td>
                {serviciosParaComparar.map((s) => (
                  <td key={s.id} className="py-3 font-medium text-ink">{s.categoria}</td>
                ))}
              </tr>
              <tr>
                <td className="py-3 font-semibold text-muted">Precio Unitario</td>
                {serviciosParaComparar.map((s) => (
                  <td key={s.id} className="py-3">
                    <span className="font-mono font-bold text-amber-600">
                      {getPrecio(s).precio === null ? 'Sin cotización' : usd(getPrecio(s).precio!)}
                    </span>
                    <span className="text-[10px] text-muted font-normal"> / {s.unidad}</span>
                    <div className="mt-1">
                      <BadgePrecio servicioId={s.id} />
                    </div>
                  </td>
                ))}
              </tr>
              <tr>
                <td className="py-3 font-semibold text-muted">SLA Oficial</td>
                {serviciosParaComparar.map((s) => (
                  <td key={s.id} className="py-3 font-semibold text-muted">Por verificar</td>
                ))}
              </tr>
              <tr>
                <td className="py-3 font-semibold text-muted">Responsabilidad</td>
                {serviciosParaComparar.map((s) => (
                  <td key={s.id} className="py-3">
                    <StatusBadge
                      nivel={s.responsabilidad === 'AWS' ? 'correcto' : 'revision'}
                      texto={s.responsabilidad}
                    />
                  </td>
                ))}
              </tr>
              <tr>
                <td className="py-3 font-semibold text-muted">Free Tier</td>
                {serviciosParaComparar.map((s) => (
                  <td key={s.id} className="py-3 font-medium text-ink">
                    {s.gratisTier ? 'Disponible (12 meses o permanente)' : 'Solo pago por uso'}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="py-3 font-semibold text-muted">Mejor Uso</td>
                {serviciosParaComparar.map((s) => (
                  <td key={s.id} className="py-3 text-muted leading-relaxed">{s.casoUso || s.funcionPrincipal}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </Modal>
    </div>
  );
}
