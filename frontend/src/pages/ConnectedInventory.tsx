import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useBackend } from '../context/BackendContext';
import { requestAll, type InventoryStatus, type NetworkResource, type Resource } from '../services/backend';

interface Inventory {
  connections: InventoryStatus[]; network: NetworkResource[]; resources: Resource[];
}

const source = (mode: 'aws' | 'floci') => mode === 'aws' ? 'AWS real' : 'FLOCI emulado';
const observedDate = (value: string | null) => value ? new Date(value).toLocaleString() : 'Sin fecha informada';
const booleanLabel = (value: boolean | null) => value === null ? 'No informado' : value ? 'Sí' : 'No';

function Cidrs({ resource }: { resource: NetworkResource }) {
  return <div>{resource.cidr_blocks.length === 0 ? 'CIDR no informado' : resource.cidr_blocks.map(block =>
    <p key={block.cidr} className="font-mono">{block.cidr}
      {block.association_state && <span className="text-muted text-xs ml-2">{block.association_state}</span>}
    </p>)}</div>;
}

function Subnets({ resources }: { resources: NetworkResource[] }) {
  return resources.length === 0 ? <p className="text-sm text-muted">Sin subnets observadas para esta VPC en el snapshot.</p> :
    <div className="overflow-x-auto"><table className="w-full text-sm text-left">
      <thead><tr><th>Subnet</th><th>VPC referenciada</th><th>CIDR</th><th>Zona observada</th><th>IPs disponibles</th><th>IP pública automática</th></tr></thead>
      <tbody>{resources.map(r => <tr key={r.id} className="border-t border-line align-top">
        <td className="p-2"><p className="font-mono">{r.external_id}</p>{r.name && <p>{r.name}</p>}
          <p className="text-muted">Estado reportado: {r.status}</p></td>
        <td className="p-2 font-mono">{r.vpc_external_id ?? 'No informada'}</td>
        <td className="p-2"><Cidrs resource={r} /></td><td className="p-2">{r.availability_zone ?? 'No informada'}</td>
        <td className="p-2">{r.available_ip_address_count ?? 'No informado'}</td>
        <td className="p-2">{booleanLabel(r.map_public_ip_on_launch)}</td>
      </tr>)}</tbody>
    </table></div>;
}

export default function ConnectedInventory({ view }: { view: 'network' | 'infrastructure' }) {
  const { projectId, token } = useBackend();
  const [loaded, setLoaded] = useState<{ projectId: string; data: Inventory } | null>(null);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [connectionId, setConnectionId] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    const root = `/projects/${projectId}`;
    Promise.all([
      requestAll<InventoryStatus>(`${root}/inventory-status`, token),
      requestAll<NetworkResource>(`${root}/network/resources`, token),
      view === 'infrastructure' ? requestAll<Resource>(`${root}/resources`, token) : Promise.resolve([]),
    ]).then(([connections, network, resources]) => {
      if (!cancelled) setLoaded({ projectId, data: { connections, network, resources } });
    }).catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : 'No se pudo consultar el inventario'); });
    return () => { cancelled = true; };
  }, [projectId, token, refresh, view]);

  const data = loaded?.projectId === projectId ? loaded.data : null;
  const selected = data?.connections.filter(c => !connectionId || c.id === connectionId) ?? [];
  const selectedIds = new Set(selected.map(c => c.id));
  const network = data?.network.filter(r => selectedIds.has(r.connection_id)) ?? [];
  const resources = data?.resources.filter(r => selectedIds.has(r.connection_id) &&
    `${r.external_id} ${r.service_code} ${r.resource_type} ${r.region_code}`.toLowerCase().includes(search.toLowerCase())) ?? [];
  const vpcs = network.filter(r => r.resource_type === 'vpc');
  const subnets = network.filter(r => r.resource_type === 'subnet');
  const orphaned = subnets.filter(r => !r.parent_observed || !vpcs.some(vpc => vpc.id === r.vpc_resource_id));
  const refreshView = () => { setLoaded(null); setError(''); setRefresh(n => n + 1); setPage(0); };
  const changeConnection = (id: string) => { setConnectionId(id); setPage(0); };

  if (!projectId) return <p className="text-ink">No tienes proyectos asignados.</p>;
  return <div className="space-y-6 text-ink">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-xl font-bold">{view === 'network' ? 'Red observada' : 'Infraestructura observada'}</h2>
        <p className="text-sm text-muted">Snapshots persistidos del último inventario completo de cada conexión; no es monitoreo en vivo.</p></div>
      <button className="px-4 py-2 bg-blue-600 text-white rounded-lg" onClick={refreshView}>Actualizar inventario</button>
    </div>
    <section className="p-4 bg-card border border-line rounded-xl space-y-2 text-sm">
      <p>Actualizar consulta PostgreSQL, no ejecuta llamadas AWS ni aprovisiona recursos.</p>
      <p className="text-muted">No se recopilan aún rutas, gateways, ACLs, security groups ni tráfico. La asignación automática de IP pública no demuestra que una subnet tenga salida a Internet. Los estados AWS no certifican salud, SLA ni alta disponibilidad.</p>
      <Link to="/operations" className="text-blue-500 underline">Ver sincronizaciones y auditoría</Link>
    </section>
    {error && <p role="alert" className="text-rose-500">{error}</p>}
    {!data && !error && <p role="status">Consultando inventario del backend…</p>}
    {data && !error && <>
      <label className="block text-sm">Fuente de observación
        <select aria-label="Conexión observada" value={connectionId} onChange={e => changeConnection(e.target.value)}
          className="ml-3 p-2 bg-card border border-line rounded-lg max-w-full">
          <option value="">Todas las conexiones · fuentes separadas</option>
          {data.connections.map(c => <option key={c.id} value={c.id}>{c.name} · {source(c.mode)} · {c.region_code}</option>)}
        </select>
      </label>
      {selected.length === 0 && <p className="text-muted">No hay conexiones registradas para esta selección.</p>}
      <div className="grid sm:grid-cols-2 gap-4">{selected.map(c => <section key={c.id} className="p-4 bg-card border border-line rounded-xl space-y-1 text-sm">
        <h3 className="font-bold">{c.name} · {source(c.mode)}</h3><p>{c.account_id} · {c.region_code}</p>
        <p>Último inventario completo: {c.last_success ? observedDate(c.last_success.finished_at) : 'Sin sincronizar'}</p>
        {c.last_success && <><p>{c.last_success.records_processed} recursos en esa ejecución</p>
          <p className="font-mono text-xs break-all">Correlación: {c.last_success.correlation_id}</p></>}
        {c.last_attempt && <p>Último intento: {c.last_attempt.status}
          {c.last_attempt.error_code && ` · ${c.last_attempt.error_code}`}</p>}
        {c.last_attempt?.status === 'failed' && <p className="text-amber-500">El último intento falló; se conserva el último inventario completo, si existe.</p>}
        {c.last_success?.records_processed === 0 && <p>Inventario completado sin recursos; no se añaden datos ficticios.</p>}
      </section>)}</div>
      {view === 'network' ? <>
        <p className="text-sm">{vpcs.length} VPCs y {subnets.length} subnets observadas en la selección.</p>
        {network.length === 0 && <p>Sin recursos observados de red. Revisa si la conexión está sincronizada; un resultado vacío no prueba ausencia global de recursos.</p>}
        {vpcs.map(vpc => <section key={vpc.id} className="bg-card border border-line rounded-xl p-5 space-y-4">
          <div className="space-y-1"><h3 className="font-bold font-mono">{vpc.external_id}</h3>{vpc.name && <p>{vpc.name}</p>}
            <p className="text-sm">{source(vpc.mode)} · {vpc.account_id} · {vpc.region_code} · Estado reportado: {vpc.status}</p>
            <p className="text-sm">VPC predeterminada: {booleanLabel(vpc.is_default)} · Tenancy: {vpc.tenancy ?? 'No informado'}</p>
            <Cidrs resource={vpc} /><p className="text-xs text-muted">Observado: {observedDate(vpc.observed_at)}</p></div>
          <Subnets resources={subnets.filter(s => s.vpc_resource_id === vpc.id && s.parent_observed)} />
        </section>)}
        {orphaned.length > 0 && <section className="bg-card border border-amber-500 rounded-xl p-5 space-y-3">
          <h3 className="font-bold">Subnets sin VPC observada en el mismo inventario</h3>
          <p className="text-sm text-muted">No se mezclan configuraciones históricas para completar una topología. La referencia puede no estar resuelta o la VPC no haber sido observada en esa ejecución.</p>
          <Subnets resources={orphaned} />
        </section>}
      </> : <>
        <section className="bg-card border border-line rounded-xl p-4 space-y-2">
          <h3 className="font-bold">Cobertura observada, no cobertura global AWS</h3>
          <p>{new Set(selected.map(c => c.region_code)).size} regiones configuradas · {vpcs.length} VPCs · {subnets.length} subnets</p>
          <p className="text-sm text-muted">Las zonas listadas proceden de subnets, no de un catálogo global. No se infieren conectividad, capacidad, latencias ni conmutación por error.</p>
          {selected.map(c => <p key={c.id} className="text-sm">{source(c.mode)} · {c.account_id} · {c.region_code}: {
            [...new Set(network.filter(r => r.connection_id === c.id && r.availability_zone).map(r => r.availability_zone))].join(', ') || 'Zonas no observadas'}</p>)}
        </section>
        <label className="block text-sm">Filtrar recursos observados
          <input aria-label="Buscar recurso observado" value={search} onChange={e => { setSearch(e.target.value); setPage(0); }}
            className="ml-3 p-2 bg-card border border-line rounded-lg" placeholder="Identificador, servicio, tipo o región" />
        </label>
        <section className="bg-card border border-line rounded-xl p-4 overflow-auto space-y-3">
          <h3 className="font-bold">Inventario observado · {resources.length} resultados</h3>
          {resources.length === 0 ? <p>Sin recursos observados para esta selección.</p> : <>
            <table className="w-full text-sm text-left"><thead><tr><th>Recurso</th><th>Tipo</th><th>Fuente</th><th>Región</th><th>Estado reportado</th><th>Observación</th></tr></thead>
              <tbody>{resources.slice(page * 25, (page + 1) * 25).map(r => <tr key={r.id} className="border-t border-line">
                <td className="p-2 font-mono">{r.external_id}</td><td className="p-2">{r.service_code} · {r.resource_type}</td>
                <td className="p-2">{source(data.connections.find(c => c.id === r.connection_id)!.mode)}</td>
                <td className="p-2">{r.region_code}</td><td className="p-2">{r.status}</td><td className="p-2">{observedDate(r.observed_at)}</td>
              </tr>)}</tbody></table>
            <div className="flex gap-3 items-center"><button disabled={page === 0} onClick={() => setPage(n => n - 1)} className="disabled:opacity-40">Anterior</button>
              <span>Página {page + 1} de {Math.ceil(resources.length / 25)}</span>
              <button disabled={(page + 1) * 25 >= resources.length} onClick={() => setPage(n => n + 1)} className="disabled:opacity-40">Siguiente</button></div>
          </>}
        </section>
      </>}
    </>}
  </div>;
}
