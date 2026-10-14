import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { Menu, Bell, Download, Globe2, FileText, LogOut, ExternalLink, ShieldCheck, ChevronDown } from 'lucide-react';
import { useCloud } from '../../context/CloudContext';
import { useAuth } from '../../context/AuthContext';
import { useAws } from '../../hooks/useAws';
import { Modal } from '../ui/Modal';
import { ThemeToggle } from '../ui/ThemeToggle';
import { Select } from '../ui/Select';
import { ReportModal } from '../reports/ReportModal';
import { Logo } from '../ui/Logo';

const titulos: Record<string, { titulo: string; descripcion: string }> = {
  '/dashboard': { titulo: 'Dashboard General', descripcion: 'Telemetría y KPIs ejecutivos de la arquitectura Cloud' },
  '/projects': { titulo: 'Portafolio de Proyectos', descripcion: 'Arquitectura, costos, seguridad e historial por proyecto' },
  '/planning': { titulo: 'Planificación Cloud', descripcion: 'Formulador de propuestas según Well-Architected Framework' },
  '/costs': { titulo: 'Costos y Presupuesto', descripcion: 'Calculadora dinámica de infraestructura y análisis OpEx vs CapEx' },
  '/infrastructure': { titulo: 'Infraestructura Global', descripcion: 'Regiones, zonas de disponibilidad y resiliencia multi-AZ' },
  '/security': { titulo: 'Seguridad y Cumplimiento', descripcion: 'Modelo de responsabilidad compartida, políticas IAM y auditoría' },
  '/network': { titulo: 'Topología de Red (VPC)', descripcion: 'Flujo de tráfico desde Internet hasta la capa de persistencia' },
  '/services': { titulo: 'Catálogo de Servicios AWS', descripcion: 'Especificaciones, SLAs, comandos CLI y comparador técnico' },
};

export function Header({ onAbrirMenu }: { onAbrirMenu: () => void }) {
  const { pathname } = useLocation();
  const info = pathname.startsWith('/projects/')
    ? { titulo: 'Espacio del Proyecto', descripcion: 'Evaluación contextual de arquitectura, costos y seguridad' }
    : titulos[pathname] ?? { titulo: 'CloudOps Dashboard', descripcion: 'Operaciones en la nube' };
  const { regionPrincipal, setRegionPrincipal, ambiente, setAmbiente, exportarEstadoJson } = useCloud();
  const { user, logout } = useAuth();
  const [panelNotificaciones, setPanelNotificaciones] = useState(false);
  const [menuUsuario, setMenuUsuario] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const identity = useAws<{ account: string }>('/aws/identity');
  const regions = useAws<{ id: string; status: string }[]>('/aws/regions');
  const events = useAws<{ id: string; name: string; time: string; username: string }[]>(`/aws/events?region=${regionPrincipal}`);
  const [modalReporte, setModalReporte] = useState(false);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuUsuario(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    setVisible(true);
  }, [pathname]);

  useEffect(() => {
    let ultimoScrollY = typeof window !== 'undefined' ? window.scrollY : 0;
    let ticking = false;

    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const scrollYActual = window.scrollY;
          const diferencia = scrollYActual - ultimoScrollY;

          if (panelNotificaciones || modalReporte) {
            setVisible(true);
          } else if (scrollYActual <= 20) {
            setVisible(true);
          } else if (diferencia > 8) {
            setVisible(false);
          } else if (diferencia < -6) {
            setVisible(true);
          }

          ultimoScrollY = Math.max(0, scrollYActual);
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [panelNotificaciones, modalReporte]);

  return (
    <>
      <header
        className={`sticky top-0 z-30 flex items-center justify-between gap-2 sm:gap-4 border-b border-line bg-card/85 px-3 py-3 sm:px-5 lg:px-6 backdrop-blur-md shadow-sm transition-transform duration-300 ease-in-out ${
          visible ? 'translate-y-0' : '-translate-y-full lg:translate-y-0'
        }`}
      >
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <button
            onClick={onAbrirMenu}
            className="grid h-9 w-9 place-items-center rounded-xl border border-line text-muted hover:bg-canvas hover:text-ink lg:hidden transition-colors shrink-0"
            aria-label="Abrir menú de navegación"
          >
            <Menu size={18} />
          </button>

          <div className="flex items-center lg:hidden shrink-0">
            <Logo size={30} linkTo="/dashboard" />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-base sm:text-lg font-bold text-ink">{info.titulo}</h1>
              <span className="hidden md:inline-flex items-center gap-1 text-[10px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                {identity.data ? `AWS · ${identity.data.account}` : 'AWS · sin conexión'}
              </span>
            </div>
            <p className="hidden truncate text-xs text-muted sm:block">{info.descripcion}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <div className="hidden lg:flex items-center gap-1.5 rounded-xl border border-line bg-canvas p-1 text-xs">
            {(['Producción', 'Staging', 'Sandbox'] as const).map((amb) => (
              <button
                key={amb}
                onClick={() => setAmbiente(amb)}
                className={`rounded-lg px-2.5 py-1 font-medium transition-all ${
                  ambiente === amb
                    ? 'bg-card text-blue-600 shadow-xs border border-line'
                    : 'text-muted hover:text-ink'
                }`}
              >
                {amb}
              </button>
            ))}
          </div>

          <div className="hidden sm:block">
            <Select
              value={regionPrincipal}
              onChange={setRegionPrincipal}
              opciones={(regions.data ?? [{ id: regionPrincipal, status: 'consultando' }]).filter((r) => r.status !== 'not-opted-in').map((r) => ({
                value: r.id,
                label: r.id,
                badge: r.id,
                sublabel: r.status ?? 'región AWS',
              }))}
              icono={Globe2}
              buscable={true}
              alineacionDropdown="derecha"
              anchoMinimo="190px"
              ariaLabel="Seleccionar región AWS activa"
            />
          </div>

          <ThemeToggle />

          <button
            onClick={() => setModalReporte(true)}
            className="flex items-center gap-1.5 rounded-xl border border-line bg-card hover:bg-canvas px-3 py-1.5 text-xs font-semibold text-ink shadow-xs transition-colors cursor-pointer"
            title="Generar informe de la cuenta"
            aria-label="Informe de la cuenta"
          >
            <FileText size={15} className="text-blue-600" />
            <span className="hidden md:inline">Informe de la cuenta</span>
          </button>

          <button
            onClick={exportarEstadoJson}
            title="Exportar configuración Cloud en JSON"
            className="hidden sm:grid h-9 w-9 place-items-center rounded-xl border border-line text-muted hover:bg-canvas hover:text-ink transition-colors cursor-pointer"
            aria-label="Descargar reporte JSON"
          >
            <Download size={16} />
          </button>

          <button
            onClick={() => setPanelNotificaciones(true)}
            className="relative grid h-9 w-9 place-items-center rounded-xl border border-line text-muted hover:bg-canvas hover:text-ink transition-colors"
            aria-label="Notificaciones de infraestructura"
          >
            <Bell size={16} />
            {(events.data?.length ?? 0) > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-blue-600 text-[9px] font-bold text-white">
                {events.data?.length}
              </span>
            )}
          </button>

          <div className="relative pl-1 border-l border-line" ref={menuRef}>
            <button
              onClick={() => setMenuUsuario((prev) => !prev)}
              className="flex items-center gap-2 rounded-xl p-1 hover:bg-canvas transition-colors cursor-pointer text-left"
              aria-label="Menú de usuario"
            >
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 font-bold text-white text-xs shadow-xs">
                {user?.nombre
                  ? user.nombre
                      .split(' ')
                      .map((w) => w[0])
                      .slice(0, 2)
                      .join('')
                      .toUpperCase()
                  : 'CO'}
              </div>
              <div className="hidden xl:block text-left">
                <p className="text-xs font-bold text-ink leading-tight truncate max-w-[130px]">
                  {user?.nombre ?? 'Usuario CloudOps'}
                </p>
                <div className="flex items-center gap-1 text-[10px] text-emerald-600 font-semibold">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="capitalize">{user?.rol === 'super_admin' ? 'Super Admin' : user?.rol ?? 'Autenticado'}</span>
                </div>
              </div>
              <ChevronDown size={14} className="hidden sm:block text-muted" />
            </button>

            {menuUsuario && (
              <div className="absolute right-0 mt-2 w-64 rounded-2xl border border-line bg-card/95 backdrop-blur-md shadow-2xl p-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                <div className="p-2.5 border-b border-line mb-1">
                  <p className="text-xs font-bold text-ink truncate">{user?.nombre ?? 'Usuario CloudOps'}</p>
                  <p className="text-[11px] text-muted truncate">{user?.email ?? ''}</p>
                  <div className="mt-2 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-blue-500/10 border border-blue-500/20 text-[10px] font-semibold text-blue-600">
                    <ShieldCheck size={12} />
                    <span>Rol: {user?.rol ?? ''}</span>
                  </div>
                </div>

                <div className="space-y-1">
                  <a
                    href="http://localhost:21400"
                    target="_blank"
                    rel="noreferrer"
                    className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-xs font-medium text-ink hover:bg-canvas transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      <ExternalLink size={14} className="text-muted" />
                      Portal Central NexusHub
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-line/60 text-muted">21400</span>
                  </a>

                  <button
                    onClick={() => {
                      setMenuUsuario(false);
                      logout();
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-rose-600 hover:bg-rose-500/10 transition-colors cursor-pointer text-left"
                  >
                    <LogOut size={14} />
                    <span>Cerrar Sesión</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      <Modal
        abierto={panelNotificaciones}
        onCerrar={() => setPanelNotificaciones(false)}
        titulo="Centro de Eventos y Notificaciones"
        subtitulo="Eventos recientes consultados en CloudTrail"
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-muted pb-2 border-b border-line">
            <span>{events.data?.length ?? 0} eventos recientes</span>
          </div>

          {events.error ? <p className="text-sm text-rose-600">{events.error}</p> : !events.data?.length ? (
            <div className="py-8 text-center text-muted text-xs">
              {events.loading ? 'Consultando CloudTrail…' : 'CloudTrail no devolvió eventos recientes en esta región.'}
            </div>
          ) : (
            events.data.map((n) => (
              <div
                key={n.id}
                className="flex items-start gap-3 rounded-xl border border-line bg-canvas p-3 transition-colors hover:bg-card"
              >
                <Bell size={18} className="text-blue-500 shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-bold text-ink">{n.name}</p>
                    <span className="text-[10px] text-muted shrink-0">{n.time ? new Date(n.time).toLocaleString('es-PE') : 'Sin fecha'}</span>
                  </div>
                  <p className="text-xs text-muted mt-1 leading-relaxed">{n.username ?? 'Actor no indicado por AWS'}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </Modal>

      <ReportModal abierto={modalReporte} onCerrar={() => setModalReporte(false)} />
    </>
  );
}
