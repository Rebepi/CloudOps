import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useBackend } from '../context/BackendContext';
import { request, requestAll, type AuditEvent, type Connection, type ProposalDto, type Resource, type SyncRun } from '../services/backend';

interface ObservedData {
  resources: Resource[]; connections: Connection[]; proposals: ProposalDto[];
  jobs: SyncRun[]; audit: AuditEvent[];
}

export default function ConnectedDashboard() {
  const { projectId, token } = useBackend();
  const [data, setData] = useState<ObservedData | null>(null);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    setData(null); setError('');
    const path = `/projects/${projectId}`;
    Promise.all([
      requestAll<Resource>(`${path}/resources`, token), request<Connection[]>(`${path}/connections`, token),
      requestAll<ProposalDto>(`${path}/proposals`, token), request<SyncRun[]>(`${path}/sync-runs`, token),
      request<AuditEvent[]>(`${path}/audit-events`, token),
    ]).then(([resources, connections, proposals, jobs, audit]) => {
      if (!cancelled) setData({ resources, connections, proposals, jobs, audit });
    }).catch(err => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [projectId, token, refresh]);

  if (!projectId) return <p className="text-ink">No tienes proyectos asignados.</p>;
  const aws = data?.connections.filter(c => c.mode === 'aws') ?? [];
  const lastComplete = data?.jobs.find(j => j.status === 'succeeded');
  return <div className="space-y-6 text-ink">
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <div><h2 className="text-xl font-bold">Dashboard conectado</h2>
        <p className="text-sm text-muted">Datos persistidos del proyecto. No se inventan CPU, tráfico, costos ni puntuaciones de seguridad.</p></div>
      <button className="px-3 py-2 bg-blue-600 text-white rounded-lg" onClick={() => setRefresh(n => n + 1)}>Actualizar dashboard</button>
    </div>
    {error && <p role="alert" className="text-rose-500">{error}</p>}
    {!data && !error && <p role="status">Consultando backend…</p>}
    {data && <>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          ['Conexiones registradas', data.connections.length],
          ['Propuestas persistidas', data.proposals.length],
          ['Recursos del último inventario completo', lastComplete ? data.resources.length : 'Sin sincronizar'],
        ].map(([label, value]) => <section key={label} className="bg-card border border-line p-5 rounded-xl">
          <p className="text-sm text-muted">{label}</p><p className="text-2xl font-bold mt-2">{value}</p>
        </section>)}
      </div>
      <section className="bg-card border border-line p-5 rounded-xl space-y-2">
        <h3 className="font-bold">Procedencia de los datos</h3>
        {aws.length === 0 && <p className="text-amber-500">No hay ninguna conexión AWS real registrada. El laboratorio FLOCI no demuestra el estado de una cuenta AWS.</p>}
        {data.connections.map(c => <p key={c.id} className="text-sm">{c.name} · {c.mode === 'aws' ? 'AWS real' : 'FLOCI emulado'} · {c.account_id} · {c.region_code}</p>)}
        <Link className="text-blue-500 underline" to="/operations">Configurar conexiones y sincronizar</Link>
      </section>
      <section className="bg-card border border-line p-5 rounded-xl overflow-auto space-y-3">
        <h3 className="font-bold">Muestra del inventario observado · hasta 20 recursos</h3>
        {data.resources.length === 0 ? <p className="text-sm text-muted">Sin recursos observados. Consulta el estado de sincronización: no se añaden recursos ficticios.</p> :
          <table className="w-full text-left text-sm"><thead><tr><th>Recurso</th><th>Servicio</th><th>Fuente</th><th>Observación</th></tr></thead>
            <tbody>{data.resources.slice(0, 20).map(r => <tr key={r.id} className="border-t border-line">
              <td className="py-2">{r.external_id}</td><td>{r.service_code}</td>
              <td>{data.connections.find(c => c.id === r.connection_id)?.mode === 'aws' ? 'AWS real' : 'FLOCI emulado'}</td>
              <td>{new Date(r.observed_at).toLocaleString()}</td></tr>)}</tbody></table>}
      </section>
      <section className="bg-card border border-line p-5 rounded-xl space-y-2">
        <h3 className="font-bold">Auditoría local reciente</h3>
        {data.audit.slice(0, 10).map(a => <p key={a.id} className="text-sm">{a.action} · {a.result} · {new Date(a.created_at).toLocaleString()}</p>)}
      </section>
    </>}
    <section className="bg-card border border-line p-5 rounded-xl space-y-2">
      <h3 className="font-bold">Integraciones todavía pendientes</h3>
      <p className="text-sm text-muted">CloudWatch (métricas), Cost Explorer (facturación), CloudTrail (eventos AWS) y evaluación de seguridad. No se muestran importes ni porcentajes simulados en este dashboard.</p>
      <p className="text-sm text-muted">Red e Infraestructura consultan el inventario persistido. Costos y seguridad siguen pendientes de conexión; los cálculos de planificación son estimaciones, no mediciones ni certificaciones AWS.</p>
    </section>
  </div>;
}
