import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Menu, Bell, Download, ShieldCheck, CheckCircle2, AlertTriangle, Globe2, FileText } from 'lucide-react';
import { useCloud } from '../../context/CloudContext';
import { useBackend } from '../../context/BackendContext';
import { regiones } from '../../data/regions';
import { Modal } from '../ui/Modal';
import { ThemeToggle } from '../ui/ThemeToggle';
import { Select } from '../ui/Select';
import { ReportModal } from '../reports/ReportModal';
import { Logo } from '../ui/Logo';

const titulos: Record<string, { titulo: string; descripcion: string }> = {
  '/dashboard': { titulo: 'Dashboard General', descripcion: 'Telemetría y KPIs ejecutivos de la arquitectura Cloud' },
  '/planning': { titulo: 'Planificación Cloud', descripcion: 'Formulador de propuestas según Well-Architected Framework' },
  '/costs': { titulo: 'Costos y Presupuesto', descripcion: 'Calculadora dinámica de infraestructura y análisis OpEx vs CapEx' },
  '/infrastructure': { titulo: 'Infraestructura Global', descripcion: 'Regiones, zonas de disponibilidad y resiliencia multi-AZ' },
  '/security': { titulo: 'Seguridad y Cumplimiento', descripcion: 'Modelo de responsabilidad compartida, políticas IAM y auditoría' },
  '/network': { titulo: 'Topología de Red (VPC)', descripcion: 'Flujo de tráfico desde Internet hasta la capa de persistencia' },
  '/services': { titulo: 'Catálogo de Servicios AWS', descripcion: 'Especificaciones, SLAs, comandos CLI y comparador técnico' },
};

const notificacionesIniciales = [
  {
    id: 1,
    titulo: 'Snapshot automático de RDS completado',
    tiempo: 'Hace 8 min',
    tipo: 'exito',
    desc: 'Copia de seguridad cifrada completada en us-east-1 para postgres-prod.',
  },
  {
    id: 2,
    titulo: 'Alerta de presupuesto CloudWatch',
    tiempo: 'Hace 45 min',
    tipo: 'alerta',
    desc: 'El consumo proyectado del mes alcanzó el 68% del umbral asignado ($250 USD).',
  },
  {
    id: 3,
    titulo: 'Regla AWS WAF activada',
    tiempo: 'Hace 2 horas',
    tipo: 'alerta',
    desc: 'Se bloquearon 14 peticiones con patrones SQLi dirigidas al Application Load Balancer.',
  },
];

export function Header({ onAbrirMenu }: { onAbrirMenu: () => void }) {
  const backend = useBackend();
  const roleLabel = ({ admin: 'Administrador', viewer: 'Lector', analyst: 'Analista', owner: 'Propietario' } as Record<string, string>)[backend.projectRole ?? ''] ?? 'Sin rol de proyecto';
  const { pathname } = useLocation();
  const baseInfo = titulos[pathname] ?? { titulo: 'CloudOps Dashboard', descripcion: 'Operaciones en la nube' };
  const info = backend.mode === 'demo' ? baseInfo : { ...baseInfo, descripcion:
    ['/dashboard', '/operations', '/network', '/infrastructure'].includes(pathname) ? 'Inventario y auditoría consultados al backend'
    : pathname === '/planning' ? 'Propuestas persistidas y estimaciones de arquitectura'
    : 'Vista educativa; integración AWS pendiente' };
  const { regionPrincipal, setRegionPrincipal, ambiente, setAmbiente, exportarEstadoJson } = useCloud();
  const [panelNotificaciones, setPanelNotificaciones] = useState(false);
  const [notificaciones, setNotificaciones] = useState(backend.mode === 'demo' ? notificacionesIniciales : []);
  const [modalReporte, setModalReporte] = useState(false);
  const [visible, setVisible] = useState(true);

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
                {backend.mode === 'api' ? 'Sesión local · API' : 'Demo · simulación'}
              </span>
            </div>
            <p className="hidden truncate text-xs text-muted sm:block">{info.descripcion}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {(backend.mode === 'demo' || pathname === '/planning' || pathname === '/costs') && <div className="hidden lg:flex items-center gap-1.5 rounded-xl border border-line bg-canvas p-1 text-xs" title={backend.mode === 'api' ? 'Escenario estimado; no cambia recursos AWS' : undefined}>
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
          </div>}

          {(backend.mode === 'demo' || pathname === '/planning' || pathname === '/costs') && <div className="hidden sm:block">
            <Select
              value={regionPrincipal}
              onChange={setRegionPrincipal}
              opciones={regiones.map((r) => ({
                value: r.id,
                label: r.nombre,
                badge: r.id,
                sublabel: `${r.latenciaMs}ms latencia · ${r.zonasDisponibilidad} AZs`,
              }))}
              icono={Globe2}
              buscable={true}
              alineacionDropdown="derecha"
              anchoMinimo="190px"
              ariaLabel={backend.mode === 'demo' ? 'Seleccionar región AWS activa' : 'Región de estimación'}
            />
          </div>}

          <ThemeToggle />

          <button
            onClick={() => setModalReporte(true)}
            disabled={backend.mode === 'api'}
            className="flex items-center gap-1.5 rounded-xl border border-line bg-card hover:bg-canvas px-3 py-1.5 text-xs font-semibold text-ink shadow-xs transition-colors cursor-pointer"
            title={backend.mode === 'api' ? 'Reporte operativo pendiente; no se exportan métricas simuladas como reales' : 'Generar reporte educativo en PDF'}
            aria-label="Generar reporte PDF"
          >
            <FileText size={15} className="text-blue-600" />
            <span className="hidden md:inline">Reporte PDF</span>
          </button>

          <button
            onClick={exportarEstadoJson}
            disabled={backend.mode === 'api'}
            title={backend.mode === 'api' ? 'Exportación operativa pendiente; no se incluyen costos demo como reales' : 'Exportar configuración de demostración en JSON'}
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
            {notificaciones.length > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-blue-600 text-[9px] font-bold text-white">
                {notificaciones.length}
              </span>
            )}
          </button>

          <div className="flex items-center gap-2 pl-1 border-l border-line">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 font-bold text-white text-xs shadow-xs">
              CO
            </div>
            <div className="hidden xl:block text-left">
              <p className="text-xs font-bold text-ink leading-tight">{backend.mode === 'api' ? backend.identity?.email : 'Usuario demo'}</p>
              <p className="text-[10px] text-muted">{backend.mode === 'api' ? roleLabel : 'Sin autenticación'}</p>
            </div>
          </div>
        </div>
      </header>

      <Modal
        abierto={panelNotificaciones}
        onCerrar={() => setPanelNotificaciones(false)}
        titulo="Centro de Eventos y Notificaciones"
        subtitulo={backend.mode === 'api' ? 'Integración de alertas AWS pendiente; no se muestran eventos simulados.' : 'Eventos simulados para demostración'}
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-muted pb-2 border-b border-line">
            <span>{notificaciones.length} alertas recientes</span>
            {notificaciones.length > 0 && (
              <button
                onClick={() => setNotificaciones([])}
                className="text-blue-600 hover:underline font-medium"
              >
                Marcar todas como leídas
              </button>
            )}
          </div>

          {notificaciones.length === 0 ? (
            <div className="py-8 text-center text-muted text-xs">
              <ShieldCheck size={32} className="mx-auto mb-2 text-emerald-500 opacity-60" />
              {backend.mode === 'api' ? 'No hay una fuente de alertas AWS conectada. Esto no significa que la infraestructura esté libre de alertas.' : 'Sin notificaciones de demostración pendientes.'}
            </div>
          ) : (
            notificaciones.map((n) => (
              <div
                key={n.id}
                className="flex items-start gap-3 rounded-xl border border-line bg-canvas p-3 transition-colors hover:bg-card"
              >
                {n.tipo === 'exito' ? (
                  <CheckCircle2 size={18} className="text-emerald-500 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-bold text-ink">{n.titulo}</p>
                    <span className="text-[10px] text-muted shrink-0">{n.tiempo}</span>
                  </div>
                  <p className="text-xs text-muted mt-1 leading-relaxed">{n.desc}</p>
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
