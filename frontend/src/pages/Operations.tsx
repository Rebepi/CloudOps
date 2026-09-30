import { useCallback, useEffect, useState } from 'react';
import { useBackend } from '../context/BackendContext';
import { request, requestAll, type AuditEvent, type Connection, type Resource, type SyncRun } from '../services/backend';

export default function Operations() {
  const { mode, projectId, token, permissions } = useBackend();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [jobs, setJobs] = useState<SyncRun[]>([]);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const canSync = permissions.includes('cloud:sync');
  const canConnect = permissions.includes('connection:write');
  const [awsEnabled, setAwsEnabled] = useState(false);
  const [account, setAccount] = useState('');
  const [awsRegion, setAwsRegion] = useState('us-east-1');

  const load = useCallback(async () => {
    if (mode !== 'api' || !projectId) return;
    const path = `/projects/${projectId}`;
    const [c, r, j, a, runtime] = await Promise.all([
      request<Connection[]>(`${path}/connections`, token), requestAll<Resource>(`${path}/resources`, token),
      request<SyncRun[]>(`${path}/sync-runs`, token), request<AuditEvent[]>(`${path}/audit-events`, token),
      request<{ aws_enabled: boolean }>('/runtime', token),
    ]);
    setConnections(c); setResources(r); setJobs(j); setAudit(a); setError(null);
    setAwsEnabled(runtime.aws_enabled);
  }, [mode, projectId, token]);

  useEffect(() => {
    setConnections([]); setResources([]); setJobs([]); setAudit([]); setMessage('');
    void load().catch(err => setError(err.message));
    const timer = window.setInterval(() => { void load().catch(err => setError(err.message)); }, 5000);
    return () => window.clearInterval(timer);
  }, [load]);

  const action = async (fn: () => Promise<unknown>) => {
    setBusy(true); setError(null); setMessage('');
    try { await fn(); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Error de conexión'); }
    finally { setBusy(false); }
  };

  if (mode === 'demo') return <p className="text-ink">Operaciones requiere VITE_DATA_MODE=api. El modo demo sigue disponible.</p>;
  if (!projectId) return <p className="text-ink">No tienes proyectos asignados.</p>;

  const button = 'px-3 py-2 bg-blue-600 text-white rounded-lg text-sm disabled:opacity-40';
  return <div className="space-y-6 text-ink">
    <h1 className="text-2xl font-bold">Operaciones conectadas</h1>
    <p className="text-sm text-muted">Frontend, API y PostgreSQL locales. Las conexiones AWS consultan la nube real; las conexiones FLOCI son emuladas y se identifican por separado.</p>
    {error && <p role="alert" className="text-rose-500">{error}</p>}
    {message && <p role="status" className="text-emerald-500">{message}</p>}
    <form className="bg-card border border-line p-4 rounded-xl space-y-3" onSubmit={e => {
      e.preventDefault();
      if (!canConnect || !awsEnabled) return;
      void action(() => request(`/projects/${projectId}/connections`, token, {
        method: 'POST', body: JSON.stringify({ name: 'AWS real', mode: 'aws', account_id: account, region_code: awsRegion }),
      }));
    }}>
      <h2 className="font-bold">AWS real · aplicación local</h2>
      {!awsEnabled && <p className="text-sm text-amber-500">AWS aún no está habilitado en el backend. Primero configura cuenta y región autorizadas y un perfil de credenciales temporales; no envíes claves desde el navegador.</p>}
      <div className="flex gap-3 flex-wrap">
        <label className="text-sm">Cuenta AWS
          <input aria-label="Cuenta AWS" className="block bg-canvas border border-line rounded-lg p-2" value={account}
            onChange={e => setAccount(e.target.value)} required pattern="[0-9]{12}" maxLength={12} placeholder="12 dígitos" disabled={!canConnect || busy} />
        </label>
        <label className="text-sm">Región AWS
          <input aria-label="Región AWS" className="block bg-canvas border border-line rounded-lg p-2" value={awsRegion}
            onChange={e => setAwsRegion(e.target.value)} required disabled={!canConnect || busy} />
        </label>
        <button className={button} disabled={busy || !canConnect || !awsEnabled}>Registrar conexión AWS</button>
      </div>
    </form>
    <div className="flex gap-3 items-center flex-wrap">
      <span className="text-sm text-muted">FLOCI: laboratorio opcional, no AWS real.</span>
      <button className={button} disabled={busy || !canConnect}
        onClick={() => void action(() => request(`/projects/${projectId}/connections`, token, {
          method: 'POST', body: JSON.stringify({ name: 'FLOCI local', mode: 'floci', account_id: '000000000000', region_code: 'us-east-1' }),
        }))}>Conectar FLOCI</button>
      <button className={button} disabled={busy} onClick={() => void action(load)}>Actualizar</button>
    </div>
    {connections.map(c => <section key={c.id} className="bg-card border border-line p-4 rounded-xl flex gap-4 items-center flex-wrap">
      <span>{c.name} · {c.mode === 'aws' ? 'AWS real' : 'FLOCI emulado'} · {c.account_id} · {c.region_code}</span>
      <button className={button} disabled={busy || !canSync} onClick={() => void action(async () => {
        const result = await request<{ identity: { Account: string } }>(`/connections/${c.id}/test`, token, { method: 'POST' });
        setMessage(`Identidad validada: cuenta ${result.identity.Account}.`);
      })}>Validar identidad</button>
      <button className={button} disabled={busy || !canSync} onClick={() => void action(() => request(`/connections/${c.id}/sync/inventory`, token, { method: 'POST' }))}>Sincronizar inventario</button>
    </section>)}
    <section className="bg-card border border-line rounded-xl p-4 space-y-3">
      <h2 className="font-bold">Últimas 50 sincronizaciones</h2>
      {jobs.length === 0 && <p className="text-sm text-muted">Sin sincronizaciones. Crea una conexión y ejecuta inventario.</p>}
      {jobs.map(job => <p key={job.id} className="text-sm">{job.status} · {job.records_processed} recursos · {job.error_code ?? job.correlation_id}</p>)}
    </section>
    <section className="bg-card border border-line rounded-xl p-4 overflow-x-auto">
      <h2 className="font-bold mb-3">Último inventario completo</h2>
      {resources.length === 0 ? <p className="text-sm text-muted">Sin recursos observados. Una cuenta vacía devuelve un inventario vacío.</p> :
        <table className="w-full text-left text-sm"><thead><tr><th>Servicio</th><th>Recurso</th><th>Región</th><th>Estado</th></tr></thead>
          <tbody>{resources.map(r => <tr key={r.id} className="border-t border-line"><td className="py-2">{r.service_code}</td><td>{r.external_id}</td><td>{r.region_code}</td><td>{r.status}</td></tr>)}</tbody></table>}
    </section>
    <section className="bg-card border border-line rounded-xl p-4 space-y-3">
      <h2 className="font-bold">Últimos 50 eventos de auditoría</h2>
      {audit.map(event => <p key={event.id} className="text-sm">{new Date(event.created_at).toLocaleString()} · {event.action} · {event.result} · {event.correlation_id}</p>)}
    </section>
  </div>;
}
