import { Activity, DollarSign, Network, Server, ShieldCheck } from 'lucide-react';
import { useCloud } from '../../context/CloudContext';
import { useAws } from '../../hooks/useAws';
import { serviciosAWS } from '../../data/awsServices';
import { usd } from '../../lib/format';
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

interface Overview { inventory?: { instances: { id: string; state?: string; zone?: string }[]; databases: { id: string; status?: string; zone?: string }[] }; buckets?: { name: string }[] }
interface Security { accountSummary: Record<string, number>; identities: { name: string; mfa: boolean }[]; roles: { name: string }[]; trails: { name: string; isLogging: boolean | null }[]; findings: { id: string; title: string; severity: string }[]; findingsError: string | null }
interface NetworkData { vpcs: { id: string; cidr: string; state: string }[]; subnets: { id: string; vpcId: string; cidr: string; zone: string }[]; internetGateways: { id: string }[]; natGateways: { id: string }[]; securityGroups: { id: string; name: string; publicIngress: boolean }[] }

export function ExecutiveReportDocument({ config }: { config: ReportConfig }) {
  const { propuestas, costoMensual, costoAnual, regionPrincipal, ambiente, itemsCosto } = useCloud();
  const overview = useAws<Overview>(`/aws/overview?region=${regionPrincipal}`);
  const security = useAws<Security>(`/aws/security?region=${regionPrincipal}`);
  const network = useAws<NetworkData>(`/aws/network?region=${regionPrincipal}`);
  const costs = useAws<{ start: string; total: number; estimated: boolean }[]>('/aws/costs');
  const gastoReal = costs.data?.reduce((sum, day) => sum + day.total, 0);
  const fecha = new Date().toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric' });
  const titulo = 'text-xs sm:text-sm font-bold text-slate-900 uppercase tracking-wide';
  const seccion = 'mb-5 print-avoid-break';

  return <div id="executive-report-document" className="bg-white text-slate-900 font-sans p-6 sm:p-10 max-w-4xl mx-auto">
    <div className="border-b-2 border-blue-600 pb-4 mb-5 print-avoid-break">
      <div className="flex items-center justify-between gap-4 mb-3"><div className="flex items-center gap-3"><Logo size={38} animado={false} conPing={false} /><div><p className="text-lg font-black">Cloud<span className="text-blue-600">Ops</span></p><p className="text-[10px] text-slate-500">Informe de cuenta AWS y planificación local</p></div></div><span className="text-[10px] rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">{ambiente}</span></div>
      <h1 className="text-xl sm:text-2xl font-black">Informe de arquitectura y costos</h1>
      <p className="mt-1 text-xs text-slate-600">Región consultada: {regionPrincipal} · Emitido: {fecha}</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-4 p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs"><div><span className="text-slate-500 block">Organización</span><strong>{config.empresa || 'No indicada'}</strong></div><div><span className="text-slate-500 block">Autor</span><strong>{config.autor || 'No indicado'}</strong></div><div><span className="text-slate-500 block">Cargo</span><strong>{config.cargo || 'No indicado'}</strong></div></div>
    </div>

    {config.incluirResumen && <section className={seccion}><h2 className={titulo}><Activity size={15} className="inline mr-2 text-blue-600" />1. Resumen Ejecutivo</h2><div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 text-xs">
      <div className="rounded-xl border border-slate-200 p-3"><span className="text-slate-500 block">EC2 en región</span><strong className="text-base">{overview.data?.inventory?.instances.length ?? '—'}</strong></div>
      <div className="rounded-xl border border-slate-200 p-3"><span className="text-slate-500 block">RDS en región</span><strong className="text-base">{overview.data?.inventory?.databases.length ?? '—'}</strong></div>
      <div className="rounded-xl border border-slate-200 p-3"><span className="text-slate-500 block">S3 en cuenta</span><strong className="text-base">{overview.data?.buckets?.length ?? '—'}</strong></div>
      <div className="rounded-xl border border-slate-200 p-3"><span className="text-slate-500 block">VPC en región</span><strong className="text-base">{network.data?.vpcs.length ?? '—'}</strong></div>
    </div><p className="mt-2 text-[10px] text-slate-500">Inventario consultado: {overview.observedAt ? new Date(overview.observedAt).toLocaleString('es-PE') : 'pendiente'}.</p></section>}

    {config.incluirPropuesta && <section className={seccion}><h2 className={titulo}>2. Propuesta local</h2>{propuestas.length ? <div className="mt-2 space-y-2">{propuestas.map((p) => <div key={p.id} className="rounded-xl border border-slate-200 p-3 text-xs"><strong className="text-sm">{p.nombre}</strong><p className="mt-1 text-slate-600">{p.descripcion}</p><p className="mt-1">{p.regionId} · {p.tipoAplicacion} · {p.usuariosEstimados.toLocaleString()} usuarios previstos · disponibilidad deseada {p.disponibilidad}</p><p>Servicios previstos: {p.serviciosSeleccionados.join(', ')}</p><p>Presupuesto objetivo: {p.presupuestoMaximo == null ? 'sin definir' : usd(p.presupuestoMaximo)} / mes</p></div>)}</div> : <p className="mt-2 text-xs text-slate-600">No hay propuestas guardadas.</p>}</section>}

    {config.incluirFinOps && <section className={seccion}><h2 className={titulo}><DollarSign size={15} className="inline mr-2 text-blue-600" />3. FinOps</h2><div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2 text-xs"><div className="rounded-xl border border-slate-200 p-3"><span className="block text-slate-500">Cost Explorer · mes actual</span><strong className="text-base">{gastoReal === undefined ? 'Sin consulta' : usd(gastoReal)}</strong></div><div className="rounded-xl border border-slate-200 p-3"><span className="block text-slate-500">Estimación local · mes</span><strong className="text-base">{usd(costoMensual)}</strong></div><div className="rounded-xl border border-slate-200 p-3"><span className="block text-slate-500">Estimación local · año</span><strong className="text-base">{usd(costoAnual)}</strong></div></div>
      {costs.error && <p className="mt-2 text-xs text-rose-700">Cost Explorer: {costs.error}</p>}
      <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr className="border-b border-slate-200"><th className="py-2">Servicio</th><th>Oferta</th><th>Cantidad</th><th>Subtotal mensual</th></tr></thead><tbody>{itemsCosto.map((item) => { const service = serviciosAWS.find((s) => s.id === item.servicioId); const subtotal = item.precioUnitario == null ? null : item.precioUnitario * item.cantidad * (item.unidadPrecio === 'Hrs' ? item.horasMes : 1); return <tr key={item.id} className="border-b border-slate-100"><td className="py-2">{service?.nombre ?? item.servicioId}</td><td>{item.skuPrecio ?? 'Sin oferta'}</td><td>{item.cantidad}</td><td>{subtotal === null ? 'Sin cotización' : usd(subtotal)}</td></tr>; })}</tbody></table>{!itemsCosto.length && <p className="py-3 text-slate-500">No hay ítems cotizados.</p>}</div><p className="mt-2 text-[10px] text-slate-500">La estimación usa las ofertas seleccionadas y no representa una factura ni incluye dimensiones adicionales de cada servicio.</p></section>}

    {config.incluirSeguridad && <section className={seccion}><h2 className={titulo}><ShieldCheck size={15} className="inline mr-2 text-blue-600" />4. Seguridad observada</h2>{security.data ? <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2 text-xs"><p className="rounded-xl border border-slate-200 p-3">MFA root: <strong>{security.data.accountSummary.AccountMFAEnabled === 1 ? 'habilitado' : 'no habilitado o sin dato'}</strong></p><p className="rounded-xl border border-slate-200 p-3">Usuarios IAM: <strong>{security.data.identities.length}</strong> · roles: <strong>{security.data.roles.length}</strong></p><p className="rounded-xl border border-slate-200 p-3">Trails registrando: <strong>{security.data.trails.filter((t) => t.isLogging).length}</strong> de {security.data.trails.length}</p><p className="rounded-xl border border-slate-200 p-3">Security Hub: <strong>{security.data.findingsError ? 'sin consulta disponible' : `${security.data.findings.length} hallazgos devueltos`}</strong></p></div> : <p className="mt-2 text-xs text-slate-600">{security.error ?? 'Consultando IAM, CloudTrail y Security Hub...'}</p>}<p className="mt-2 text-[10px] text-slate-500">Estos datos son observaciones puntuales; no constituyen una evaluación Well-Architected ni una certificación.</p></section>}

    {config.incluirRed && <section className={seccion}><h2 className={titulo}><Network size={15} className="inline mr-2 text-blue-600" />5. Red en {regionPrincipal}</h2>{network.data ? <div className="mt-2 text-xs"><p>{network.data.vpcs.length} VPC · {network.data.subnets.length} subredes · {network.data.internetGateways.length} Internet Gateways · {network.data.natGateways.length} NAT Gateways</p><div className="mt-2 space-y-1">{network.data.vpcs.map((vpc) => <p key={vpc.id} className="rounded-lg border border-slate-200 p-2">{vpc.id} · {vpc.cidr} · {vpc.state}</p>)}</div></div> : <p className="mt-2 text-xs text-slate-600">{network.error ?? 'Consultando red...'}</p>}</section>}

    {config.incluirServicios && <section className={seccion}><h2 className={titulo}><Server size={15} className="inline mr-2 text-blue-600" />6. Recursos detectados</h2><div className="mt-2 text-xs space-y-1">{overview.data?.inventory?.instances.map((item) => <p key={item.id} className="rounded-lg border border-slate-200 p-2">EC2 {item.id} · {item.state} · {item.zone}</p>)}{overview.data?.inventory?.databases.map((item) => <p key={item.id} className="rounded-lg border border-slate-200 p-2">RDS {item.id} · {item.status} · {item.zone}</p>)}{overview.data?.buckets?.map((item) => <p key={item.name} className="rounded-lg border border-slate-200 p-2">S3 {item.name}</p>)}{overview.data && !overview.data.inventory?.instances.length && !overview.data.inventory?.databases.length && !overview.data.buckets?.length && <p>No se detectaron recursos de estos tipos.</p>}</div></section>}

    {config.notasAdicionales && <section className={seccion}><h2 className={titulo}>Notas</h2><p className="mt-2 text-xs text-slate-600 whitespace-pre-wrap">{config.notasAdicionales}</p></section>}
    <footer className="border-t border-slate-200 pt-3 text-[10px] text-slate-500">CloudOps · datos AWS consultados en modo lectura · propuestas y estimaciones guardadas localmente.</footer>
  </div>;
}
