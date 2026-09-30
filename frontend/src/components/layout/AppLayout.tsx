import { useState, useEffect } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { useBackend } from '../../context/BackendContext';

export function AppLayout() {
  const backend = useBackend();
  const { pathname } = useLocation();
  const [sessionError, setSessionError] = useState('');
  const [abierto, setAbierto] = useState(false);
  const [colapsado, setColapsado] = useState(() => {
    try {
      return localStorage.getItem('cloudops_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const toggleColapsar = () => {
    setColapsado((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('cloudops_sidebar_collapsed', String(next));
      } catch {}
      return next;
    });
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        toggleColapsar();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (abierto && window.innerWidth < 1024) {
      const handleResize = () => {
        if (window.innerWidth >= 1024) setAbierto(false);
      };
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }
  }, [abierto]);

  return (
    <div className="min-h-screen bg-canvas">
      <Sidebar
        abierto={abierto}
        onCerrar={() => setAbierto(false)}
        colapsado={colapsado}
        onToggleColapsar={toggleColapsar}
      />
      <div
        className={`w-full min-w-0 transition-[padding-left] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${
          colapsado ? 'lg:pl-[72px]' : 'lg:pl-64'
        }`}
      >
        <Header onAbrirMenu={() => setAbierto(true)} />
        <main className="w-full px-4 py-6 sm:px-6 lg:px-8">
          <div className="mb-5 p-3 rounded-xl border border-line bg-card text-sm text-ink flex gap-3 items-center flex-wrap">
            <span>{backend.mode === 'api' ? 'Backend conectado · sesión mock' : 'Modo demo · datos simulados'}</span>
            {backend.mode === 'api' && <span>Perfil del proyecto: {backend.projectRole === 'viewer' ? 'Lector' : backend.projectRole === 'admin' ? 'Administrador' : backend.projectRole ?? 'Sin rol'}</span>}
            <Link to="/operations" className="text-blue-500 underline">Operaciones e inventario</Link>
            {backend.mode === 'api' && <>
              <select aria-label="Proyecto" value={backend.projectId} onChange={e => backend.setProjectId(e.target.value)} className="bg-canvas p-2 rounded-lg">
                {backend.projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <button onClick={() => void backend.logout().catch(err => setSessionError(err.message))}>Cerrar sesión</button>
              <span className="text-xs text-muted">{['/dashboard', '/operations', '/network', '/infrastructure'].includes(pathname)
                ? 'Datos del backend; cada conexión identifica AWS real o FLOCI emulado.'
                : pathname === '/planning'
                ? 'Propuestas persistidas; cálculos y scores estimados, no mediciones ni certificaciones AWS.'
                : 'Vista educativa: esta pantalla todavía no está conectada a AWS real.'}</span>
            </>}
            {sessionError && <span role="alert" className="text-rose-500">{sessionError}</span>}
          </div>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
