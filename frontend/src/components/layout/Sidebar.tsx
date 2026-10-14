import { NavLink } from 'react-router-dom';
import { useState, useRef, useEffect } from 'react';
import {
  LayoutDashboard,
  ClipboardList,
  DollarSign,
  Globe2,
  ShieldCheck,
  Network,
  Server,
  X,
  Cpu,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
  Search,
  Zap,
  Activity,
  Settings,
} from 'lucide-react';
import { useCloud } from '../../context/CloudContext';
import { useTheme } from '../../context/ThemeContext';
import { usd } from '../../lib/format';
import { Logo } from '../ui/Logo';

interface SidebarProps {
  abierto: boolean;
  onCerrar: () => void;
  colapsado: boolean;
  onToggleColapsar: () => void;
}

interface NavItem {
  to: string;
  texto: string;
  icono: typeof LayoutDashboard;
  badge: string | null;
  descripcion: string;
  colorTono: string;
  gradientFrom: string;
  gradientTo: string;
}

interface GrupoNav {
  categoria: string;
  icono: typeof LayoutDashboard;
  items: NavItem[];
}

const grupos: GrupoNav[] = [
  {
    categoria: 'Operaciones',
    icono: Activity,
    items: [
      {
        to: '/dashboard',
        texto: 'Dashboard',
        icono: LayoutDashboard,
        badge: 'KPIs',
        descripcion: 'Telemetría y KPIs ejecutivos',
        colorTono: 'from-blue-500 to-indigo-500',
        gradientFrom: '#3b82f6',
        gradientTo: '#6366f1',
      },
      {
        to: '/infrastructure',
        texto: 'Infraestructura',
        icono: Globe2,
        badge: 'AWS',
        descripcion: 'Regiones y zonas de disponibilidad AWS',
        colorTono: 'from-cyan-400 to-blue-600',
        gradientFrom: '#22d3ee',
        gradientTo: '#2563eb',
      },
    ],
  },
  {
    categoria: 'Arquitectura',
    icono: Zap,
    items: [
      {
        to: '/planning',
        texto: 'Planificación Cloud',
        icono: ClipboardList,
        badge: null,
        descripcion: 'Formulador de propuestas locales',
        colorTono: 'from-violet-500 to-purple-600',
        gradientFrom: '#8b5cf6',
        gradientTo: '#9333ea',
      },
      {
        to: '/network',
        texto: 'Red & VPC',
        icono: Network,
        badge: 'VPC',
        descripcion: 'Topología 3 capas y flujo de paquetes',
        colorTono: 'from-emerald-400 to-teal-600',
        gradientFrom: '#34d399',
        gradientTo: '#0d9488',
      },
    ],
  },
  {
    categoria: 'Gobernanza',
    icono: Settings,
    items: [
      {
        to: '/costs',
        texto: 'Costos & FinOps',
        icono: DollarSign,
        badge: 'Calc',
        descripcion: 'Calculadora dinámica y OpEx vs CapEx',
        colorTono: 'from-amber-400 to-orange-500',
        gradientFrom: '#fbbf24',
        gradientTo: '#f97316',
      },
      {
        to: '/security',
        texto: 'Seguridad & IAM',
        icono: ShieldCheck,
        badge: 'PoLP',
        descripcion: 'Políticas IAM y responsabilidad compartida',
        colorTono: 'from-fuchsia-500 to-pink-600',
        gradientFrom: '#d946ef',
        gradientTo: '#db2777',
      },
      {
        to: '/services',
        texto: 'Servicios AWS',
        icono: Server,
        badge: '14+',
        descripcion: 'Catálogo de especificaciones y APIs',
        colorTono: 'from-rose-400 to-red-600',
        gradientFrom: '#fb7185',
        gradientTo: '#dc2626',
      },
    ],
  },
];

function NavTooltip({ item, visible }: { item: NavItem; visible: boolean; esOscuro?: boolean }) {
  return (
    <div
      className={`absolute left-[calc(100%+14px)] top-1/2 -translate-y-1/2 z-[200] pointer-events-none transition-all duration-200 ${
        visible ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-2'
      }`}
      style={{ minWidth: 210 }}
    >
      <div
        className="rounded-2xl border p-3 shadow-2xl transition-colors duration-200"
        style={{
          background: 'rgba(15,23,42,0.97)',
          backdropFilter: 'blur(20px)',
          boxShadow: '0 25px 50px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.06)',
          borderColor: 'rgba(255,255,255,0.12)',
        }}
      >
        <div className="flex items-center gap-2 mb-1.5">
          <div
            className={`h-6 w-6 rounded-lg bg-gradient-to-tr ${item.colorTono} grid place-items-center shadow-md`}
          >
            <item.icono size={13} className="text-white" aria-hidden />
          </div>
          <p className="text-xs font-bold tracking-tight text-white">{item.texto}</p>
          {item.badge && (
            <span className="ml-auto rounded-md px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wide bg-white/10 border border-white/15 text-white/70">
              {item.badge}
            </span>
          )}
        </div>
        <p className="text-[10px] leading-relaxed pl-8 text-slate-400">{item.descripcion}</p>
      </div>
      <div
        className="absolute -left-[5px] top-1/2 -translate-y-1/2 h-2.5 w-2.5 rotate-45 border-l border-b"
        style={{
          background: 'rgba(15,23,42,0.97)',
          borderColor: 'rgba(255,255,255,0.12)',
        }}
      />
    </div>
  );
}

function NavItemRow({
  item,
  colapsado,
  onCerrar,
}: {
  item: NavItem;
  colapsado: boolean;
  onCerrar: () => void;
  esOscuro: boolean;
}) {
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const handleMouseEnter = () => {
    if (colapsado) {
      timeoutRef.current = setTimeout(() => setTooltipVisible(true), 80);
    }
  };

  const handleMouseLeave = () => {
    clearTimeout(timeoutRef.current);
    setTooltipVisible(false);
  };

  useEffect(() => {
    return () => clearTimeout(timeoutRef.current);
  }, []);

  return (
    <div
      className="relative group"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <NavLink
        to={item.to}
        onClick={onCerrar}
        className={({ isActive }) =>
          `relative flex items-center overflow-hidden rounded-xl transition-all duration-300 outline-none ${
            colapsado
              ? 'justify-center h-11 w-11 mx-auto'
              : 'gap-3 px-3 py-2.5 w-full'
          } ${
            isActive
              ? 'text-white'
              : 'text-slate-400 hover:text-white'
          }`
        }
      >
        {({ isActive }) => (
          <>
            {isActive && (
              <span
                className="absolute inset-0 rounded-xl opacity-100 transition-opacity duration-300"
                style={{
                  background: `linear-gradient(135deg, ${item.gradientFrom}28 0%, ${item.gradientTo}14 100%)`,
                  border: `1px solid ${item.gradientFrom}50`,
                  boxShadow: `0 0 20px ${item.gradientFrom}20, inset 0 1px 0 ${item.gradientFrom}30`,
                }}
              />
            )}

            {!isActive && (
              <span
                className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                style={{
                  background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              />
            )}

            {isActive && !colapsado && (
              <span
                className="absolute left-0 top-2 bottom-2 w-0.5 rounded-r-full"
                style={{
                  background: `linear-gradient(to bottom, ${item.gradientFrom}, ${item.gradientTo})`,
                  boxShadow: `0 0 12px ${item.gradientFrom}cc`,
                }}
              />
            )}

            <div
              className={`relative z-10 grid shrink-0 place-items-center rounded-xl transition-all duration-300 h-8 w-8 ${
                isActive ? 'scale-110' : 'group-hover:scale-105'
              }`}
              style={
                isActive
                  ? {
                      background: `linear-gradient(135deg, ${item.gradientFrom}, ${item.gradientTo})`,
                      boxShadow: `0 4px 15px ${item.gradientFrom}55`,
                    }
                  : {
                      background: 'rgba(255,255,255,0.05)',
                    }
              }
            >
              <item.icono
                size={16}
                aria-hidden
                className={`transition-all duration-300 ${
                  isActive
                    ? 'text-white'
                    : 'text-slate-400 group-hover:text-white'
                }`}
              />
            </div>

            {!colapsado && (
              <span
                className={`relative z-10 flex-1 min-w-0 text-xs font-semibold tracking-tight truncate ${
                  isActive
                    ? 'text-white font-bold'
                    : 'text-slate-400 group-hover:text-white'
                }`}
              >
                {item.texto}
              </span>
            )}

            {!colapsado && item.badge && (
              <span
                className="relative z-10 shrink-0 rounded-lg px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider transition-all duration-300"
                style={
                  isActive
                    ? {
                        background: `${item.gradientFrom}25`,
                        border: `1px solid ${item.gradientFrom}50`,
                        color: item.gradientFrom,
                      }
                    : {
                        background: 'rgba(255,255,255,0.06)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        color: 'rgb(148,163,184)',
                      }
                }
              >
                {item.badge}
              </span>
            )}
          </>
        )}
      </NavLink>

      {colapsado && <NavTooltip item={item} visible={tooltipVisible} />}
    </div>
  );
}

export function Sidebar({ abierto, onCerrar, colapsado, onToggleColapsar }: SidebarProps) {
  const { esOscuro } = useTheme();
  const { costoMensual, presupuestoLimite, propuestas } = useCloud();
  const porcentaje = Math.min(100, Math.round((costoMensual / (presupuestoLimite || 1)) * 100));
  const [pulseSearch, setPulseSearch] = useState(false);

  const handleSearchClick = () => {
    setPulseSearch(true);
    setTimeout(() => setPulseSearch(false), 600);
  };

  return (
    <>
      <div
        className={`fixed inset-0 z-40 lg:hidden transition-opacity duration-300 ${
          abierto ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        style={{
          background: esOscuro
            ? 'radial-gradient(ellipse at left center, rgba(59,130,246,0.08) 0%, rgba(0,0,0,0.75) 60%)'
            : 'radial-gradient(ellipse at left center, rgba(59,130,246,0.05) 0%, rgba(15,23,42,0.4) 60%)',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
        }}
        onClick={onCerrar}
        aria-hidden
      />

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex flex-col transition-[transform,width] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${
          colapsado ? 'w-[72px]' : 'w-64'
        } ${
          abierto ? 'translate-x-0 shadow-2xl' : '-translate-x-full lg:translate-x-0'
        } text-slate-300`}
        style={{
          background: esOscuro
            ? 'linear-gradient(180deg, #07091a 0%, #0a0e24 40%, #060818 100%)'
            : 'linear-gradient(180deg, #0F172A 0%, #1E293B 60%, #0F172A 100%)',
          borderRight: esOscuro
            ? '1px solid rgba(255,255,255,0.06)'
            : '1px solid rgba(255,255,255,0.08)',
          boxShadow: esOscuro
            ? '4px 0 40px rgba(0,0,0,0.7), inset -1px 0 0 rgba(255,255,255,0.04)'
            : '4px 0 32px rgba(0,0,0,0.4), inset -1px 0 0 rgba(255,255,255,0.04)',
        }}
      >
        <div
          className="absolute inset-0 pointer-events-none overflow-hidden"
          aria-hidden
        >
          <div
            className={`absolute -top-20 -left-20 h-64 w-64 rounded-full transition-opacity duration-500 ${
              esOscuro ? 'opacity-20' : 'opacity-8'
            }`}
            style={{
              background: 'radial-gradient(circle, rgba(99,102,241,0.4) 0%, transparent 70%)',
              filter: 'blur(40px)',
            }}
          />
          <div
            className={`absolute top-1/2 -left-10 h-40 w-40 rounded-full transition-opacity duration-500 ${
              esOscuro ? 'opacity-10' : 'opacity-5'
            }`}
            style={{
              background: 'radial-gradient(circle, rgba(59,130,246,0.5) 0%, transparent 70%)',
              filter: 'blur(30px)',
            }}
          />
          <div
            className={`absolute bottom-0 -left-10 h-52 w-52 rounded-full transition-opacity duration-500 ${
              esOscuro ? 'opacity-15' : 'opacity-6'
            }`}
            style={{
              background: 'radial-gradient(circle, rgba(139,92,246,0.3) 0%, transparent 70%)',
              filter: 'blur(35px)',
            }}
          />
          <div
            className={`absolute inset-y-0 right-0 w-px transition-opacity duration-500 ${
              esOscuro ? 'opacity-40' : 'opacity-20'
            }`}
            style={{
              background: esOscuro
                ? 'linear-gradient(to bottom, transparent, rgba(99,102,241,0.4) 30%, rgba(59,130,246,0.3) 60%, transparent)'
                : 'linear-gradient(to bottom, transparent, rgba(99,102,241,0.2) 30%, rgba(59,130,246,0.15) 60%, transparent)',
            }}
          />
        </div>

        <div
          className={`relative z-10 flex items-center border-b py-4 transition-all duration-[380ms] ${
            colapsado ? 'justify-center px-3' : 'justify-between px-4'
          }`}
          style={{ borderColor: 'rgba(255,255,255,0.07)' }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="relative shrink-0 cursor-pointer"
              onClick={onToggleColapsar}
              title="Alternar vista compacta (Ctrl+B)"
            >
              <Logo size={40} animado={true} conPing={true} />
            </div>

            <div
              className={`min-w-0 overflow-hidden transition-all duration-[380ms] ${
                colapsado ? 'w-0 opacity-0' : 'w-auto opacity-100'
              }`}
            >
              <div className="flex items-baseline gap-1.5 whitespace-nowrap">
                <div className="flex items-center text-[15px] font-black tracking-tight select-none">
                  <span className="text-white">Cloud</span>
                  <span className="text-blue-400">Ops</span>
                </div>
                <span
                  className="rounded-lg px-1.5 py-0.5 text-[8.5px] font-black uppercase tracking-widest"
                  style={{
                    background: 'rgba(99,102,241,0.15)',
                    border: '1px solid rgba(99,102,241,0.35)',
                    color: '#93c5fd',
                  }}
                >
                  AWS
                </span>
              </div>
              <p
                className="text-[10px] font-medium tracking-wide whitespace-nowrap text-slate-500"
              >
                Enterprise Architecture
              </p>
            </div>
          </div>

          {!colapsado && (
            <button
              onClick={onCerrar}
              className="grid h-7 w-7 place-items-center rounded-xl transition-all duration-200 lg:hidden text-slate-500 hover:text-white hover:bg-white/10"
              aria-label="Cerrar navegación"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {!colapsado && (
          <div className="relative z-10 px-3 pt-3">
            <button
              onClick={handleSearchClick}
              className={`group flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs transition-all duration-300 ${
                pulseSearch ? 'scale-[0.97]' : 'hover:scale-[1.01]'
              }`}
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.08)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
              }}
            >
              <Search
                size={13}
                className="transition-colors duration-200 shrink-0 text-slate-400 group-hover:text-blue-400"
              />
              <span className="flex-1 text-left text-[11px] font-medium transition-colors duration-200 text-slate-400 group-hover:text-slate-200">
                Acceso rápido...
              </span>
              <kbd
                className="inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-mono text-[9px] font-bold transition-colors text-slate-400 group-hover:text-slate-300"
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.1)',
                }}
              >
                ⌃B
              </kbd>
            </button>
          </div>
        )}

        <nav className="relative z-10 flex-1 overflow-y-auto overflow-x-visible px-3 py-3 space-y-5 scrollbar-none">
          {grupos.map((grupo) => {
            const GrupoIcono = grupo.icono;
            return (
              <div key={grupo.categoria} className="space-y-1">
                {!colapsado ? (
                  <div className="flex items-center gap-2 px-2 pb-1.5 pt-0.5">
                    <GrupoIcono
                      size={10}
                      className="shrink-0 text-slate-400"
                      aria-hidden
                    />
                    <p className="text-[9.5px] font-black uppercase tracking-[0.12em] text-slate-400">
                      {grupo.categoria}
                    </p>
                    <div
                      className="flex-1 h-px"
                      style={{
                        background: 'linear-gradient(to right, rgba(255,255,255,0.08), transparent)',
                      }}
                    />
                  </div>
                ) : (
                  <div
                    className="mx-auto my-2 h-px w-8 rounded-full"
                    style={{ background: 'rgba(255,255,255,0.08)' }}
                  />
                )}

                <div className="space-y-0.5">
                  {grupo.items.map((item) => (
                    <NavItemRow
                      key={item.to}
                      item={item}
                      colapsado={colapsado}
                      onCerrar={onCerrar}
                      esOscuro={esOscuro}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </nav>

        <div
          className="relative z-10 p-3"
          style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}
        >
          {!colapsado ? (
            <div
              className="rounded-2xl p-3.5 space-y-3 overflow-hidden relative"
              style={{
                background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)',
                border: '1px solid rgba(255,255,255,0.08)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
              }}
            >
              <div
                className="absolute -top-6 -right-6 h-20 w-20 rounded-full pointer-events-none"
                style={{
                  background: `radial-gradient(circle, ${porcentaje > 85 ? 'rgba(239,68,68,0.15)' : 'rgba(59,130,246,0.12)'} 0%, transparent 70%)`,
                  filter: 'blur(10px)',
                }}
              />

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrendingUp
                    size={13}
                    className={`${porcentaje > 85 ? 'text-rose-400' : 'text-amber-400'} transition-colors`}
                  />
                  <span className="text-[11px] font-bold text-slate-200">
                    Estimación cotizada
                  </span>
                </div>
                <span
                  className={`text-[10px] font-mono font-black px-2 py-0.5 rounded-lg transition-all ${
                    porcentaje > 85 ? 'text-rose-400' : 'text-emerald-400'
                  }`}
                  style={{
                    background: porcentaje > 85
                      ? 'rgba(239,68,68,0.12)'
                      : 'rgba(52,211,153,0.12)',
                    border: `1px solid ${
                      porcentaje > 85
                        ? 'rgba(239,68,68,0.25)'
                        : 'rgba(52,211,153,0.25)'
                    }`,
                  }}
                >
                  {porcentaje}%
                </span>
              </div>

              <div
                className="h-1.5 w-full rounded-full overflow-hidden"
                style={{ background: 'rgba(255,255,255,0.08)' }}
              >
                <div
                  className="h-full rounded-full transition-all duration-1000 ease-out relative overflow-hidden"
                  style={{
                    width: `${porcentaje}%`,
                    background: porcentaje > 85
                      ? 'linear-gradient(90deg, #f59e0b, #ef4444)'
                      : 'linear-gradient(90deg, #3b82f6, #6366f1, #8b5cf6)',
                    boxShadow: porcentaje > 85
                      ? '0 0 10px rgba(239,68,68,0.6)'
                      : '0 0 10px rgba(99,102,241,0.5)',
                  }}
                />
              </div>

              <div className="flex items-center justify-between text-[10px]">
                <span className="font-mono font-bold text-slate-200">
                  {usd(costoMensual)}
                </span>
                <span className="text-slate-400">
                  de {usd(presupuestoLimite)}
                </span>
              </div>

              <div
                className="flex items-center justify-between pt-2"
                style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
              >
                <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                  <Cpu size={11} className="text-blue-400 shrink-0" />
                  <span>{propuestas.length} Propuestas guardadas</span>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] font-semibold text-emerald-400">
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"
                    style={{ boxShadow: '0 0 8px rgba(52,211,153,0.9)' }}
                  />
                  <span>Local</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 py-1">
              <div className="relative group cursor-pointer">
                <div
                  className="grid h-11 w-11 place-items-center rounded-2xl transition-all duration-300 group-hover:scale-105"
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}
                >
                  <TrendingUp
                    size={16}
                    className={`transition-colors ${
                      porcentaje > 85
                        ? 'text-rose-400'
                        : 'text-emerald-400'
                    }`}
                  />
                </div>
                <div
                  className="absolute left-[calc(100%+14px)] top-1/2 -translate-y-1/2 z-[200] pointer-events-none opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200"
                  style={{ minWidth: 190 }}
                >
                  <div
                    className="rounded-2xl p-3 shadow-2xl transition-colors duration-200"
                    style={{
                      background: 'rgba(15,23,42,0.98)',
                      border: '1px solid rgba(255,255,255,0.12)',
                      backdropFilter: 'blur(20px)',
                      boxShadow: '0 25px 50px rgba(0,0,0,0.6)',
                    }}
                  >
                    <p className="text-xs font-bold mb-2 text-white">
                      Presupuesto Mensual
                    </p>
                    <p className="text-[11px] font-mono font-bold mb-2 text-slate-300">
                      {usd(costoMensual)} / {usd(presupuestoLimite)}
                    </p>
                    <div
                      className="h-1.5 w-full rounded-full overflow-hidden mb-1"
                      style={{ background: 'rgba(255,255,255,0.1)' }}
                    >
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${porcentaje}%`,
                          background: 'linear-gradient(90deg, #3b82f6, #6366f1)',
                          boxShadow: '0 0 8px rgba(99,102,241,0.5)',
                        }}
                      />
                    </div>
                    <p className="text-[9px] text-right font-mono text-slate-400">
                      {porcentaje}%
                    </p>
                  </div>
                  <div
                    className="absolute -left-[5px] top-1/2 -translate-y-1/2 h-2.5 w-2.5 rotate-45 border-l border-b"
                    style={{
                      background: 'rgba(15,23,42,0.98)',
                      borderColor: 'rgba(255,255,255,0.12)',
                    }}
                  />
                </div>
              </div>

              <div className="flex flex-col items-center">
                <button
                  onClick={onToggleColapsar}
                  className="group grid h-9 w-9 place-items-center rounded-xl transition-all duration-200 hover:scale-105 text-slate-400 hover:text-white hover:bg-white/10"
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}
                  title="Expandir barra lateral (Ctrl+B)"
                >
                  <ChevronRight size={15} />
                </button>
              </div>
            </div>
          )}

          {!colapsado && (
            <div
              className="mt-3 pt-3 flex items-center gap-3"
              style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}
            >
              <div className="relative shrink-0">
                <div
                  className="grid h-9 w-9 place-items-center rounded-xl text-[11px] font-black text-white"
                  style={{
                    background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
                    boxShadow: '0 0 0 2px rgba(99,102,241,0.2), 0 4px 12px rgba(99,102,241,0.3)',
                  }}
                >
                  CO
                </div>
                <span
                  className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 border-2"
                  style={{
                    borderColor: '#0F172A',
                    boxShadow: '0 0 8px rgba(52,211,153,0.8)',
                  }}
                />
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-bold truncate text-slate-200">
                  Admin CloudOps
                </p>
                <p className="text-[9.5px] truncate text-slate-400">
                  DevOps Lead · Pro
                </p>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={onToggleColapsar}
                  className="hidden lg:grid h-7 w-7 place-items-center rounded-xl transition-all duration-200 hover:scale-105 text-slate-400 hover:text-white hover:bg-white/10"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
                  title="Minimizar (Ctrl+B)"
                  aria-label="Minimizar barra lateral"
                >
                  <ChevronLeft size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
