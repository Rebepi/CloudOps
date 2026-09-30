import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { dataMode, request, requestAll, type Identity, type Project } from '../services/backend';

interface BackendState {
  mode: 'demo' | 'api'; token: string | null; identity: Identity | null; projects: Project[];
  projectId: string; setProjectId: (id: string) => void; logout: () => Promise<void>;
  permissions: string[]; projectRole: string | null;
}
const Context = createContext<BackendState | null>(null);

export function BackendProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => sessionStorage.getItem('cloudops_session'));
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProject] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState('admin');

  useEffect(() => {
    if (dataMode !== 'api' || !token) return;
    let cancelled = false;
    Promise.all([
      request<Identity>('/auth/me', token), requestAll<Project>('/projects', token),
    ]).then(([who, list]) => {
      if (cancelled) return;
      setIdentity(who); setProjects(list);
      const previous = sessionStorage.getItem('cloudops_project');
      setProject(list.find(p => p.id === previous)?.id ?? list[0]?.id ?? '');
    }).catch((err: Error) => {
      if (!cancelled) {
        setError(err.message); setToken(null); setIdentity(null);
        sessionStorage.removeItem('cloudops_session');
      }
    });
    return () => { cancelled = true; };
  }, [token]);

  const login = async () => {
    setBusy(true); setError(null);
    try {
      const result = await request<{ access_token: string }>('/auth/mock/login', null, {
        method: 'POST', body: JSON.stringify({ profile }),
      });
      sessionStorage.setItem('cloudops_session', result.access_token);
      setToken(result.access_token);
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo iniciar sesión'); }
    finally { setBusy(false); }
  };

  const logout = async () => {
    if (token) await request('/auth/logout', token, { method: 'POST' });
    sessionStorage.removeItem('cloudops_session');
    setToken(null); setIdentity(null); setProjects([]); setProject('');
  };

  if (dataMode === 'api' && (!token || !identity)) {
    return <main className="min-h-screen bg-canvas flex items-center justify-center p-6">
      <div className="bg-card border border-line rounded-2xl p-8 space-y-4 max-w-md w-full text-ink">
        <h1 className="text-xl font-bold">CloudOps · Laboratorio local</h1>
        <p className="text-sm text-muted">Acceso temporal de desarrollo. Nexus SSO se integrará en una siguiente etapa.</p>
        <label className="block text-sm">Perfil local
          <select value={profile} onChange={e => setProfile(e.target.value)} className="mt-2 w-full bg-canvas border border-line p-2 rounded-lg">
            <option value="admin">Administrador</option><option value="viewer">Lector</option>
          </select>
        </label>
        {error && <p role="alert" className="text-sm text-rose-500">{error}</p>}
        <button disabled={busy || !!token} onClick={() => void login()} className="bg-blue-600 text-white p-3 rounded-lg w-full disabled:opacity-50">
          {token ? 'Cargando proyectos…' : busy ? 'Conectando…' : 'Entrar al laboratorio'}
        </button>
      </div>
    </main>;
  }

  return <Context.Provider value={{ mode: dataMode, token, identity, projects, projectId,
    permissions: identity?.project_permissions?.[projectId] ?? [],
    projectRole: identity?.project_roles?.[projectId] ?? null,
    setProjectId: id => { if (projects.some(p => p.id === id)) { setProject(id); sessionStorage.setItem('cloudops_project', id); } }, logout }}>
    {children}
  </Context.Provider>;
}

export function useBackend() {
  const value = useContext(Context);
  if (!value) throw new Error('useBackend requiere BackendProvider');
  return value;
}
