import { useState } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import {
  DollarSign,
  Plus,
  Minus,
  Trash2,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Download,
  RotateCcw,
  Lightbulb,
  Server,
  Calculator,
  Clock,
  Layers,
  Percent,
  Terminal,
  PieChart as PieChartIcon,
} from 'lucide-react';
import { useCloud } from '../context/CloudContext';
import { serviciosAWS } from '../data/awsServices';
import { useAws } from '../hooks/useAws';
import { CostCard } from '../components/CostCard';
import { Card } from '../components/ui/Card';
import { StatCard } from '../components/StatCard';
import { InfoTooltip } from '../components/ui/InfoTooltip';
import { Select } from '../components/ui/Select';
import { usd } from '../lib/format';

const COLORES = ['#2563EB', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4', '#EC4899'];

type Quote = { sku: string; serviceCode: string; regionCode: string | null; description: string; unit: string; priceUsd: number; beginRange: string; rateCode: string };
const priceCodes: Record<string, string> = { ec2: 'AmazonEC2', ebs: 'AmazonEC2', s3: 'AmazonS3', rds: 'AmazonRDS', lambda: 'AWSLambda', dynamodb: 'AmazonDynamoDB', cloudfront: 'AmazonCloudFront', route53: 'AmazonRoute53', cloudwatch: 'AmazonCloudWatch', vpc: 'AmazonVPC', kms: 'awskms', waf: 'awswaf', elb: 'AWSELB' };

export default function Costs() {
  const {
    itemsCosto,
    agregarItemCosto,
    eliminarItemCosto,
    limpiarCostos,
    cargarPresetCostos,
    costoMensual,
    presupuestoLimite,
    setPresupuestoLimite,
    exportarEstadoJson,
    ambiente,
    regionPrincipal,
  } = useCloud();

  const costs = useAws<{ start: string; total: number; services: { service: string; amount: number }[]; estimated: boolean }[]>('/aws/costs');
  const finops = useAws<{ budgets: { name: string; limit?: string; actual?: string; currency?: string }[] | null; budgetsError: string | null; recommendations: { arn?: string; currentType?: string; finding?: string; options: { type?: string; savingsUsd?: number }[] }[] | null; recommendationsError: string | null }>('/aws/finops');

  const [servicioId, setServicioId] = useState('ec2');
  const [cantidad, setCantidad] = useState(1);
  const [horasMes, setHorasMes] = useState(730);
  const [mensajeExito, setMensajeExito] = useState(false);
  const [categoriaFiltro, setCategoriaFiltro] = useState<string>('Todas');
  const [skuSeleccionado, setSkuSeleccionado] = useState('');
  const priceCode = priceCodes[servicioId];
  const priceQuery = priceCode ? `/aws/pricing?serviceCode=${priceCode}${servicioId === 'cloudfront' || servicioId === 'route53' ? '' : `&regionCode=${regionPrincipal}`}${servicioId === 'ec2' ? '&instanceType=t3.medium&operatingSystem=Linux&tenancy=Shared&capacitystatus=Used&preInstalledSw=NA' : servicioId === 'rds' ? '&instanceType=db.t3.medium&databaseEngine=PostgreSQL' : ''}` : null;
  const ofertas = useAws<Quote[]>(priceQuery);
  const oferta = ofertas.data?.find((q) => q.rateCode === skuSeleccionado) ?? null;

  const categoriasFiltro = ['Todas', 'Cómputo', 'Almacenamiento', 'Base de datos', 'Redes', 'Seguridad e identidad'];

  const serviciosDisponibles = categoriaFiltro === 'Todas'
    ? serviciosAWS
    : serviciosAWS.filter((s) => s.categoria === categoriaFiltro);

  const servicioActual = serviciosAWS.find((s) => s.id === servicioId) || serviciosAWS[0];
  const itemSubtotalSinDescuento = oferta ? oferta.priceUsd * cantidad * (oferta.unit === 'Hrs' ? horasMes : 1) : 0;
  const itemSubtotalCalculado = itemSubtotalSinDescuento;
  const costoMensualAjustado = costoMensual;
  const costoAnualAjustado = costoMensualAjustado * 12;
  const porcentajePresupuesto = Math.min(150, Math.round((costoMensualAjustado / (presupuestoLimite || 1)) * 100));

  const itemsConSubtotal = itemsCosto.map((item) => {
    const s = serviciosAWS.find((x) => x.id === item.servicioId);
    const subtotal = s && item.precioUnitario != null ? item.precioUnitario * item.cantidad * (item.unidadPrecio === 'Hrs' ? item.horasMes : 1) : 0;
    return { item, servicio: s!, subtotal };
  }).filter((x) => Boolean(x.servicio));

  const distribucion = itemsConSubtotal.reduce<{ nombre: string; valor: number }[]>((acc, { servicio, subtotal }) => {
    const existente = acc.find((x) => x.nombre === servicio.categoria);
    if (existente) {
      existente.valor = Math.round((existente.valor + subtotal) * 100) / 100;
    } else {
      acc.push({ nombre: servicio.categoria, valor: Math.round(subtotal * 100) / 100 });
    }
    return acc;
  }, []);

  const gastoReal = costs.data?.reduce((sum, day) => sum + day.total, 0) ?? null;
  const recomendacionesAhorro = finops.data?.recommendations?.flatMap((r) => r.options.map((option) => ({ id: `${r.arn}:${option.type}`, titulo: `${r.currentType ?? 'EC2'} → ${option.type ?? 'tipo recomendado'}`, desc: `${r.arn ?? 'Instancia EC2'} · ${r.finding ?? 'Recomendación'}`, ahorroMensual: option.savingsUsd ?? 0 }))) ?? [];
  const comparativaCapexOpex = [
    { concepto: 'Inversión inicial en hardware', onPremises: 'Sin datos locales', awsCloud: 'No evaluado' },
    { concepto: 'Gasto operativo mensual', onPremises: 'Sin datos locales', awsCloud: gastoReal === null ? 'Consultando Cost Explorer' : `${usd(gastoReal)} registrado en el periodo` },
  ];

  const manejarAgregar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!oferta) return;
    await agregarItemCosto({
      servicioId,
      cantidad,
      horasMes: oferta.unit === 'Hrs' ? horasMes : 1,
      configuracion: oferta.description,
      precioUnitario: oferta.priceUsd, unidadPrecio: oferta.unit, skuPrecio: oferta.sku,
      codigoServicioPrecio: oferta.serviceCode, regionPrecio: oferta.regionCode, fechaPrecio: ofertas.observedAt,
    });
    setMensajeExito(true);
    setTimeout(() => setMensajeExito(false), 3000);
  };

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          titulo="Costo mensual estimado"
          valor={usd(costoMensualAjustado)}
          detalle={`Ofertas AWS seleccionadas · ${ambiente}`}
          icono={DollarSign}
          tono="cost"
          tendencia="Estimación local"
          info={{
            titulo: "Cómo se calcula el costo",
            descripcion: "Fórmula: precio de la oferta AWS seleccionada × cantidad × horas mensuales cuando la unidad es Hrs. No incluye otras dimensiones de cobro."
          }}
        />
        <StatCard
          titulo="Proyección anual (OpEx)"
          valor={usd(costoAnualAjustado)}
          detalle={`12 meses · Región ${regionPrincipal}`}
          icono={DollarSign}
          tono="brand"
          info={{
            titulo: "Gasto Operativo Anual (OpEx)",
            descripcion: "OpEx (Operational Expenditure) es el modelo de gasto de AWS: pagas por lo que usas sin inversión inicial. Contrario al CapEx (comprar hardware), el OpEx en la nube es predecible, escalable y deducible fiscalmente."
          }}
        />
        <StatCard
          titulo="Límite de Estimación Local"
          valor={usd(presupuestoLimite)}
          detalle={`${porcentajePresupuesto}% consumido del límite`}
          icono={AlertTriangle}
          tono={porcentajePresupuesto > 90 ? 'alert' : 'safe'}
          info={{
            titulo: "Límite local",
            descripcion: "Este límite se guarda en PostgreSQL local. Los presupuestos AWS se consultan por separado."
          }}
        />
        <StatCard
          titulo="Ítems en Cotización"
          valor={`${itemsCosto.length} recursos`}
          detalle={`${distribucion.length} categorías activas`}
          icono={Sparkles}
          tono="purple"
          info={{
            titulo: "Ítems de Costo en la Estimación",
            descripcion: "Cada ítem representa un recurso AWS configurado con servicio, cantidad y horas de uso. La suma de todos los ítems forma el presupuesto total de la arquitectura propuesta."
          }}
        />
      </div>

      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h3 className="text-base font-bold text-ink">Gasto real de AWS</h3><p className="text-xs text-muted">Cost Explorer · mes actual · {costs.observedAt ? new Date(costs.observedAt).toLocaleString('es-PE') : 'consultando'}</p></div>
          <span className="text-xl font-extrabold text-ink">{gastoReal === null ? '—' : usd(gastoReal)}</span>
        </div>
        {costs.error && <p className="mt-2 text-xs text-rose-600">{costs.error}</p>}
        <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted">
          {finops.data?.budgets?.map((budget) => <span key={budget.name} className="rounded-lg border border-line px-2 py-1">AWS Budget {budget.name}: {budget.actual ?? '—'} / {budget.limit ?? '—'} {budget.currency ?? ''}</span>)}
          {finops.data?.budgets?.length === 0 && <span>No hay presupuestos AWS configurados.</span>}
          {finops.data?.budgetsError && <span className="text-amber-600">Budgets: {finops.data.budgetsError}</span>}
        </div>
      </Card>

      <Card className="p-5 border-amber-500/20 bg-gradient-to-br from-card to-amber-500/5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-600">
                Límite de Estimación Mensual
              </span>
              <InfoTooltip
                titulo="Cómo funciona el monitoreo de presupuesto"
                descripcion="Compara la estimación local con el límite guardado en este proyecto. No crea alertas en AWS."
              />
              {porcentajePresupuesto > 100 ? (
                <span className="bg-rose-500/10 text-rose-600 text-[10px] font-bold px-2 py-0.5 rounded-full border border-rose-500/20">
                  Límite Excedido
                </span>
              ) : (
                <span className="bg-emerald-500/10 text-emerald-600 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-500/20">
                  Dentro del Margen
                </span>
              )}
            </div>
            <p className="text-sm font-bold text-ink">
              Estimación local: {usd(costoMensualAjustado)} de {usd(presupuestoLimite)} USD
            </p>
          </div>

          <div className="flex items-center gap-3">
            <label className="text-xs text-muted font-medium">Ajustar Límite:</label>
            <input
              type="number"
              min={50}
              max={5000}
              step={50}
              value={presupuestoLimite}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (!isNaN(val)) setPresupuestoLimite(Math.min(5000, Math.max(50, val)));
              }}
              className="h-9 w-28 rounded-xl border border-line bg-card px-3 text-xs font-bold text-ink outline-none focus:border-blue-600"
            />
          </div>
        </div>

        <div className="mt-4">
          <div className="h-2.5 w-full rounded-full bg-slate-200 overflow-hidden">
            <div
              className={`h-full transition-all duration-700 rounded-full ${
                porcentajePresupuesto > 100
                  ? 'bg-rose-500'
                  : porcentajePresupuesto > 80
                  ? 'bg-amber-500'
                  : 'bg-emerald-500'
              }`}
              style={{ width: `${Math.min(100, porcentajePresupuesto)}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[11px] text-muted mt-1.5 font-medium">
            <span>0%</span>
            <span>80% Alerta preventiva</span>
            <span>100% Límite mensual</span>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1 border border-brand/20 bg-gradient-to-b from-card via-card to-brand/[0.04] shadow-xl relative overflow-hidden flex flex-col justify-between">
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-blue-500 via-indigo-500 to-cyan-400" />

          <div>
            <div className="border-b border-line pb-3.5 mb-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 text-white shadow-md shadow-blue-500/20">
                    <Calculator size={18} />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <h3 className="text-base font-bold text-ink leading-tight">
                        Calculadora de Servicios AWS
                      </h3>
                      <InfoTooltip
                        titulo="Cómo usar la calculadora"
                        descripcion="Selecciona una oferta AWS y define cantidad y horas mensuales de uso. El subtotal emplea únicamente la tarifa de esa oferta."
                        size="md"
                      />
                    </div>
                    <p className="text-[11px] text-muted">Dimensionamiento y estimación de presupuesto FinOps</p>
                  </div>
                </div>
                <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-blue-500/10 text-blue-500 border border-blue-500/20">
                  v2.0 FinOps
                </span>
              </div>
            </div>

            <form onSubmit={manejarAgregar} className="space-y-4 text-xs">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="font-bold text-ink flex items-center gap-1">
                    <Server size={13} className="text-blue-500" />
                    Servicio AWS
                  </label>
                  <span className="text-[10.5px] text-muted">
                    {serviciosDisponibles.length} disponible{serviciosDisponibles.length !== 1 ? 's' : ''}
                  </span>
                </div>

                <div className="flex items-center gap-1 overflow-x-auto pb-1.5 mb-1.5 scrollbar-none text-[10px]">
                  {categoriasFiltro.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => {
                        setCategoriaFiltro(cat);
                        const match = cat === 'Todas' ? serviciosAWS[0] : serviciosAWS.find((s) => s.categoria === cat);
                        if (match) {
                          setServicioId(match.id);
                        }
                      }}
                      className={`px-2 py-0.5 rounded-lg font-medium whitespace-nowrap transition-all cursor-pointer ${
                        categoriaFiltro === cat
                          ? 'bg-blue-600 text-white font-bold shadow-xs'
                          : 'bg-canvas text-muted hover:text-ink border border-line'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>

                <Select
                  value={servicioId}
                  onChange={(value) => { setServicioId(value); setSkuSeleccionado(''); }}
                  opciones={serviciosDisponibles.map((s) => ({
                    value: s.id,
                    label: s.nombre,
                    sublabel: s.categoria,
                  }))}
                  icono={Server}
                  buscable={true}
                  className="w-full"
                  placeholder="Seleccionar servicio AWS..."
                />
              </div>

              {servicioActual && (
                <div className="p-3 rounded-xl border border-line bg-canvas/60 backdrop-blur-xs space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold border bg-blue-500/10 text-blue-500 border-blue-500/20">
                        {servicioActual.categoria}
                      </span>
                      <span className="text-[10px] font-mono text-muted">
                        SLA por verificar
                      </span>
                    </div>
                    {servicioActual.gratisTier && (
                      <span className="text-[9.5px] font-bold text-emerald-600 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                        Free Tier
                      </span>
                    )}
                  </div>
                  <div className="flex items-baseline justify-between text-[11px] pt-0.5">
                    <span className="text-muted">Tarifa seleccionada:</span>
                    <span className="font-mono font-bold text-ink">
                      {oferta ? usd(oferta.priceUsd) : 'Sin oferta'} <span className="text-[10px] text-muted font-normal">{oferta ? `/ ${oferta.unit}` : ''}</span>
                    </span>
                  </div>
                  <p className="text-[10px] text-muted leading-relaxed border-t border-line/60 pt-1.5 line-clamp-2">
                    {servicioActual.casoUso || servicioActual.descripcion}
                  </p>
                  {servicioActual.comandoCli && (
                    <div className="flex items-center gap-1.5 pt-1 text-[9.5px] font-mono text-muted overflow-hidden">
                      <Terminal size={11} className="text-blue-500 shrink-0" />
                      <span className="truncate opacity-80" title={servicioActual.comandoCli}>
                        {servicioActual.comandoCli}
                      </span>
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-1">
                <label className="font-bold text-ink">Oferta AWS Price List</label>
                {ofertas.loading && <p className="text-muted">Consultando ofertas...</p>}
                {ofertas.error && <p className="text-rose-600">{ofertas.error}</p>}
                <select value={skuSeleccionado} onChange={(e) => setSkuSeleccionado(e.target.value)} className="w-full rounded-xl border border-line bg-canvas p-2.5 text-xs text-ink">
                  <option value="">Selecciona una tarifa real</option>
                  {ofertas.data?.filter((q) => Number(q.beginRange) === 0).map((q) => <option key={q.rateCode} value={q.rateCode}>{usd(q.priceUsd)} / {q.unit} · {q.description.slice(0, 85)}</option>)}
                </select>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-ink flex items-center gap-1.5">
                    <Layers size={13} className="text-blue-500" />
                    Cantidad / Instancias
                  </label>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setCantidad(Math.max(1, cantidad - 1))}
                      className="h-6 w-6 rounded-lg bg-canvas border border-line flex items-center justify-center hover:bg-card hover:border-brand/40 text-muted hover:text-ink transition-colors cursor-pointer"
                      title="Disminuir unidad"
                    >
                      <Minus size={11} />
                    </button>
                    <input
                      type="number"
                      min={1}
                      max={50}
                      value={cantidad || ''}
                      onChange={(e) => {
                        const valStr = e.target.value;
                        if (valStr === '') {
                          setCantidad(0);
                          return;
                        }
                        const val = parseInt(valStr, 10);
                        if (isNaN(val)) return;
                        setCantidad(Math.min(50, Math.max(0, val)));
                      }}
                      onBlur={() => {
                        if (cantidad < 1) setCantidad(1);
                      }}
                      className="w-12 text-center font-mono font-bold text-xs text-blue-600 bg-blue-500/10 px-1 py-0.5 rounded-md border border-blue-500/20 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <button
                      type="button"
                      onClick={() => setCantidad(Math.min(50, cantidad + 1))}
                      className="h-6 w-6 rounded-lg bg-canvas border border-line flex items-center justify-center hover:bg-card hover:border-brand/40 text-muted hover:text-ink transition-colors cursor-pointer"
                      title="Aumentar unidad"
                    >
                      <Plus size={11} />
                    </button>
                  </div>
                </div>

                <input
                  type="range"
                  min={1}
                  max={50}
                  value={Math.min(50, Math.max(1, cantidad || 1))}
                  onChange={(e) => setCantidad(Number(e.target.value))}
                  style={{
                    background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${Math.min(100, Math.max(0, ((cantidad - 1) / 49) * 100))}%, var(--color-line-2) ${Math.min(100, Math.max(0, ((cantidad - 1) / 49) * 100))}%, var(--color-line-2) 100%)`,
                  }}
                  className="w-full h-2 rounded-lg cursor-pointer accent-blue-600 appearance-none bg-canvas"
                />

                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-muted mr-1">Rápido:</span>
                  {[1, 2, 4, 8, 16].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setCantidad(n)}
                      className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-semibold transition-all cursor-pointer ${
                        cantidad === n
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'bg-canvas text-muted hover:text-ink border border-line hover:border-brand/30'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-ink flex items-center gap-1.5">
                    <Clock size={13} className="text-blue-500" />
                    Horas de Operación al Mes
                  </label>
                  <div className="flex items-center bg-blue-500/10 px-2 py-0.5 rounded-md border border-blue-500/20 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500/30 transition-all">
                    <input
                      type="number"
                      min={1}
                      max={730}
                      value={horasMes || ''}
                      onChange={(e) => {
                        const valStr = e.target.value;
                        if (valStr === '') {
                          setHorasMes(0);
                          return;
                        }
                        const val = parseInt(valStr, 10);
                        if (isNaN(val)) return;
                        setHorasMes(Math.min(730, Math.max(0, val)));
                      }}
                      onBlur={() => {
                        if (horasMes < 1) setHorasMes(1);
                      }}
                      className="w-12 bg-transparent font-mono font-bold text-xs text-blue-600 outline-none text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <span className="text-[11px] font-bold text-blue-600 select-none ml-1">h/mes</span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-1.5 text-[10px]">
                  <button
                    type="button"
                    onClick={() => setHorasMes(160)}
                    className={`p-1.5 rounded-xl border text-center transition-all cursor-pointer ${
                      horasMes === 160
                        ? 'bg-blue-500/15 border-blue-500/40 text-blue-600 font-bold shadow-xs'
                        : 'bg-canvas border-line text-muted hover:text-ink hover:border-line-2'
                    }`}
                  >
                    <div className="font-bold text-[11px]">160h</div>
                    <div className="opacity-75">Laboral (8h)</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setHorasMes(360)}
                    className={`p-1.5 rounded-xl border text-center transition-all cursor-pointer ${
                      horasMes === 360
                        ? 'bg-blue-500/15 border-blue-500/40 text-blue-600 font-bold shadow-xs'
                        : 'bg-canvas border-line text-muted hover:text-ink hover:border-line-2'
                    }`}
                  >
                    <div className="font-bold text-[11px]">360h</div>
                    <div className="opacity-75">Semi-continuo</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setHorasMes(730)}
                    className={`p-1.5 rounded-xl border text-center transition-all cursor-pointer ${
                      horasMes === 730
                        ? 'bg-blue-500/15 border-blue-500/40 text-blue-600 font-bold shadow-xs'
                        : 'bg-canvas border-line text-muted hover:text-ink hover:border-line-2'
                    }`}
                  >
                    <div className="font-bold text-[11px]">730h</div>
                    <div className="opacity-75">24/7 Continuo</div>
                  </button>
                </div>

                <input
                  type="range"
                  min={1}
                  max={730}
                  step={1}
                  value={horasMes}
                  onChange={(e) => setHorasMes(Number(e.target.value))}
                  style={{
                    background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${((horasMes - 1) / 729) * 100}%, var(--color-line-2) ${((horasMes - 1) / 729) * 100}%, var(--color-line-2) 100%)`,
                  }}
                  className="w-full h-2 rounded-lg cursor-pointer accent-blue-600 appearance-none bg-canvas"
                />
              </div>

              <div className="p-3 rounded-xl border border-line bg-canvas text-xs text-muted flex items-center gap-2">
                <Percent size={14} /> Savings Plans: consulta una oferta contratada para aplicar su tarifa. No hay descuento supuesto.
              </div>

              <div className="p-3.5 rounded-xl border border-brand/30 bg-gradient-to-br from-brand/8 via-card to-indigo-500/10 space-y-2 shadow-xs">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-muted font-medium flex items-center gap-1">
                    <Sparkles size={12} className="text-brand" /> Estimación en tiempo real:
                  </span>
                  <span className="font-mono text-[10px] text-muted">
                    {cantidad} × {horasMes}h
                  </span>
                </div>

                <div className="flex items-baseline justify-between">
                  <div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-black font-mono tracking-tight text-brand">{oferta ? usd(itemSubtotalSinDescuento) : 'Sin oferta'}</span>
                      <span className="text-[11px] text-muted font-medium">/ mes</span>
                    </div>
                  </div>

                  {oferta && <span className="text-[10px] font-mono text-muted">~{usd(itemSubtotalSinDescuento * 12)} / año</span>}
                </div>
              </div>

              <button
                type="submit"
                disabled={!oferta}
                className="w-full rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-500 py-3 text-xs font-bold text-white shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 hover:-translate-y-0.5 active:translate-y-0 transition-all flex items-center justify-between px-4 cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <Plus size={15} className="stroke-[3]" />
                  <span>Añadir a la Cotización</span>
                </div>
                <span className="bg-white/20 text-white font-mono text-[11px] px-2.5 py-0.5 rounded-lg backdrop-blur-xs font-bold">
                  +{usd(itemSubtotalCalculado)}/mes
                </span>
              </button>

              {mensajeExito && (
                <div className="p-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 text-[11px] font-bold text-center flex items-center justify-center gap-1.5 animate-fade-up">
                  <CheckCircle2 size={15} /> Componente con oferta AWS guardado localmente.
                </div>
              )}
            </form>
          </div>

          <div className="mt-5 pt-3.5 border-t border-line flex items-center justify-between text-xs">
            <button
              onClick={cargarPresetCostos}
              type="button"
              className="px-3 py-1.5 rounded-xl border border-line bg-canvas hover:bg-card text-blue-600 font-semibold transition-all flex items-center gap-1.5 cursor-pointer hover:shadow-xs"
            >
              <RotateCcw size={12} /> Consultar ofertas AWS
            </button>
            <button
              onClick={limpiarCostos}
              type="button"
              className="px-3 py-1.5 rounded-xl border border-rose-500/20 bg-rose-500/5 hover:bg-rose-500/10 text-rose-500 font-semibold transition-all flex items-center gap-1.5 cursor-pointer hover:shadow-xs"
            >
              <Trash2 size={12} /> Vaciar todo
            </button>
          </div>
        </Card>

        <Card className="lg:col-span-2 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-ink">Distribución de Costos por Categoría</h3>
                <p className="text-xs text-muted">Proporción del gasto mensual según el tipo de servicio</p>
              </div>
              <button
                onClick={exportarEstadoJson}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:underline"
              >
                <Download size={14} /> Descargar cotización
              </button>
            </div>

            {distribucion.length === 0 ? (
              <div className="py-14 px-4 text-center flex flex-col items-center justify-center">
                <div className="grid h-12 w-12 place-items-center rounded-2xl bg-canvas border border-line text-blue-500 mb-3 shadow-inner">
                  <PieChartIcon size={24} className="opacity-80" />
                </div>
                <p className="font-bold text-ink text-sm">Sin servicios en la cotización</p>
                <p className="text-xs text-muted max-w-xs mt-1 leading-relaxed">
                  Agrega componentes locales y selecciona ofertas reales de AWS para cotizarlos.
                </p>
                <button
                  type="button"
                  onClick={cargarPresetCostos}
                  className="mt-4 px-3.5 py-1.5 rounded-xl bg-blue-600/10 border border-blue-500/20 text-blue-500 font-bold text-xs hover:bg-blue-600 hover:text-white transition-all cursor-pointer flex items-center gap-1.5 shadow-xs"
                >
                  <RotateCcw size={13} /> Consultar ofertas AWS
                </button>
              </div>
            ) : (
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={distribucion}
                      dataKey="valor"
                      nameKey="nombre"
                      innerRadius={65}
                      outerRadius={95}
                      paddingAngle={3}
                    >
                      {distribucion.map((_, i) => (
                        <Cell key={`cell-${i}`} fill={COLORES[i % COLORES.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: any) => `$${Number(v || 0).toFixed(2)} USD`} />
                    <Legend verticalAlign="bottom" iconType="circle" />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="rounded-xl bg-canvas p-3 border border-line text-xs flex items-center justify-between mt-4">
            <span className="text-muted">Total mensual consolidado:</span>
            <span className="text-base font-extrabold text-amber-600">{usd(costoMensualAjustado)}</span>
          </div>
        </Card>
      </div>

      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-bold text-ink">Desglose Detallado de Ítems ({itemsCosto.length})</h3>
            <p className="text-xs text-muted">Modifica o elimina componentes individuales</p>
          </div>
        </div>

        {itemsConSubtotal.length === 0 ? (
          <Card className="py-10 text-center text-muted text-xs">
            La lista de costos está vacía. Selecciona una oferta AWS para agregar un servicio.
          </Card>
        ) : (
          <div className="space-y-2.5">
            {itemsConSubtotal.map(({ item, servicio, subtotal }) => (
              <CostCard
                key={item.id}
                servicio={servicio}
                item={item}
                subtotal={subtotal}
                onEliminar={() => eliminarItemCosto(item.id)}
              />
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <div className="border-b border-line pb-3 mb-4">
            <h3 className="text-base font-bold text-ink flex items-center gap-2">
              Fundamentos Económicos: OpEx vs CapEx en la Nube
              <InfoTooltip
                titulo="OpEx vs CapEx: ¿Cuál es la diferencia?"
                descripcion="CapEx (Capital Expenditure) es comprar hardware propio: inversión alta, depreciación lenta. OpEx (Operational Expenditure) es pagar por servicios cloud: sin inversión inicial, escala instantánea y costo proporcional al uso real."
                size="md"
              />
            </h3>
            <p className="text-xs text-muted">Comparativa estratégica entre centros de datos locales y AWS</p>
          </div>

          <div className="hidden md:block overflow-x-auto text-xs">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-line text-muted">
                  <th className="pb-2.5 font-semibold">Criterio Financiero</th>
                  <th className="pb-2.5 font-semibold">On-Premises (CapEx)</th>
                  <th className="pb-2.5 font-semibold">AWS Cloud (OpEx)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60">
                {comparativaCapexOpex.map((fila, idx) => (
                  <tr key={idx} className="hover:bg-canvas/40">
                    <td className="py-2.5 font-bold text-ink">{fila.concepto}</td>
                    <td className="py-2.5 text-muted">{fila.onPremises}</td>
                    <td className="py-2.5 font-semibold text-emerald-600">{fila.awsCloud}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="md:hidden space-y-2.5 text-xs">
            {comparativaCapexOpex.map((fila, idx) => (
              <div key={idx} className="rounded-xl bg-canvas border border-line p-3 space-y-2">
                <p className="font-bold text-ink text-sm">{fila.concepto}</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-muted font-semibold uppercase tracking-wide text-[10px] mb-0.5">On-Premises (CapEx)</p>
                    <p className="text-muted">{fila.onPremises}</p>
                  </div>
                  <div>
                    <p className="text-emerald-600 font-semibold uppercase tracking-wide text-[10px] mb-0.5">AWS Cloud (OpEx)</p>
                    <p className="font-semibold text-emerald-600">{fila.awsCloud}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-2 mb-3">
            <Lightbulb size={18} className="text-amber-500" />
            <h3 className="text-base font-bold text-ink">Recomendaciones FinOps</h3>
            <InfoTooltip
              titulo="AWS Compute Optimizer — FinOps"
              descripcion="FinOps (Financial Operations) es la práctica de optimizar el gasto cloud. AWS Compute Optimizer analiza el uso histórico de tus recursos y sugiere cambios de tipo de instancia, modelos de precios y configuraciones para reducir el costo sin sacrificar rendimiento."
              size="md"
            />
          </div>
          <p className="text-xs text-muted mb-4">
            Optimizaciones sugeridas por AWS Compute Optimizer para reducir el gasto mensual:
          </p>

          <div className="space-y-3">
            {finops.data?.recommendationsError && <p className="text-xs text-amber-600">Compute Optimizer: {finops.data.recommendationsError}</p>}
            {!recomendacionesAhorro.length && !finops.loading && <p className="text-xs text-muted">No hay recomendaciones disponibles para esta cuenta.</p>}
            {recomendacionesAhorro.map((rec) => (
              <div key={rec.id} className="p-3 rounded-xl bg-canvas border border-line text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-ink">{rec.titulo}</span>
                  <span className="font-mono font-bold text-emerald-600">
                    -{usd(rec.ahorroMensual)}/mes
                  </span>
                </div>
                <p className="text-[11px] text-muted leading-relaxed">{rec.desc}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
