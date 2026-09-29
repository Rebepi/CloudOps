import { useState, useRef, useEffect, useCallback, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check, Search, type LucideIcon } from 'lucide-react';

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
  sublabel?: string;
  badge?: string;
  badgeColor?: string;
  icono?: LucideIcon | ReactNode;
  disabled?: boolean;
}

interface SelectProps<T extends string = string> {
  value: T;
  onChange: (value: T) => void;
  opciones: SelectOption<T>[];
  placeholder?: string;
  className?: string;
  tamano?: 'sm' | 'md' | 'lg';
  buscable?: boolean;
  icono?: LucideIcon;
  ariaLabel?: string;
  disabled?: boolean;
  alineacionDropdown?: 'izquierda' | 'derecha';
  anchoMinimo?: string;
}

export function Select<T extends string = string>({
  value,
  onChange,
  opciones,
  placeholder = 'Seleccionar...',
  className = '',
  tamano = 'md',
  buscable = false,
  icono: IconoGeneral,
  ariaLabel,
  disabled = false,
  alineacionDropdown = 'izquierda',
  anchoMinimo,
}: SelectProps<T>) {
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputBusquedaRef = useRef<HTMLInputElement>(null);

  const [coords, setCoords] = useState<{
    top?: number;
    bottom?: number;
    left: number;
    width: number;
    maxHeight: number;
    posicionVertical: 'abajo' | 'arriba';
  }>({
    left: 0,
    width: 220,
    maxHeight: 300,
    posicionVertical: 'abajo',
  });

  const opcionSeleccionada = opciones.find((op) => op.value === value);

  const calcularPosicion = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const GAP = 6;
    const ESTIMATED_HEIGHT = 280;
    const espacioAbajo = window.innerHeight - rect.bottom;
    const espacioArriba = rect.top;

    const abreArriba = espacioAbajo < ESTIMATED_HEIGHT && espacioArriba > espacioAbajo;
    const width = Math.max(rect.width, 220);

    let left = alineacionDropdown === 'derecha' ? rect.right - width : rect.left;
    if (left < 8) left = 8;
    if (left + width > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - width - 8);
    }

    if (abreArriba) {
      const maxHeight = Math.max(130, Math.min(360, espacioArriba - GAP - 16));
      setCoords({
        bottom: window.innerHeight - rect.top + GAP,
        left,
        width,
        maxHeight,
        posicionVertical: 'arriba',
      });
    } else {
      const maxHeight = Math.max(130, Math.min(360, espacioAbajo - GAP - 16));
      setCoords({
        top: rect.bottom + GAP,
        left,
        width,
        maxHeight,
        posicionVertical: 'abajo',
      });
    }
  }, [alineacionDropdown]);

  useEffect(() => {
    if (abierto) {
      calcularPosicion();
    }
  }, [abierto, calcularPosicion]);

  useEffect(() => {
    if (!abierto) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        menuRef.current &&
        !menuRef.current.contains(target)
      ) {
        setAbierto(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [abierto]);

  useEffect(() => {
    if (!abierto) return;
    const handleScrollOrResize = (e: Event) => {
      if (menuRef.current && menuRef.current.contains(e.target as Node)) {
        return;
      }
      calcularPosicion();
    };

    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);
    return () => {
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [abierto, calcularPosicion]);

  useEffect(() => {
    if (abierto && buscable) {
      setTimeout(() => inputBusquedaRef.current?.focus(), 50);
    } else {
      setBusqueda('');
    }
  }, [abierto, buscable]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && abierto) {
        setAbierto(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [abierto]);

  const opcionesFiltradas = buscable && busqueda.trim()
    ? opciones.filter((op) =>
        op.label.toLowerCase().includes(busqueda.toLowerCase()) ||
        (op.sublabel && op.sublabel.toLowerCase().includes(busqueda.toLowerCase())) ||
        (op.badge && op.badge.toLowerCase().includes(busqueda.toLowerCase()))
      )
    : opciones;

  const alturas = {
    sm: 'h-8 px-2.5 text-xs',
    md: 'h-9 px-3 text-xs',
    lg: 'h-10 px-3.5 text-sm',
  };

  return (
    <div
      ref={containerRef}
      className={`relative inline-block ${className.includes('w-full') ? 'w-full' : ''}`}
      style={anchoMinimo ? { minWidth: anchoMinimo } : undefined}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (!disabled) {
            calcularPosicion();
            setAbierto((prev) => !prev);
          }
        }}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        aria-label={ariaLabel ?? opcionSeleccionada?.label ?? placeholder}
        className={`group relative flex w-full items-center justify-between gap-2 rounded-xl border border-line bg-canvas font-medium text-ink transition-all duration-200 outline-none select-none ${
          alturas[tamano]
        } ${
          disabled
            ? 'opacity-50 cursor-not-allowed'
            : 'cursor-pointer hover:border-brand/40 hover:bg-card hover:shadow-xs focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/30'
        } ${abierto ? 'border-brand bg-card shadow-sm ring-2 ring-brand/20' : ''} ${className}`}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1 text-left">
          {IconoGeneral && (
            <IconoGeneral
              size={tamano === 'sm' ? 13 : 15}
              className={`shrink-0 transition-colors ${
                abierto ? 'text-brand' : 'text-muted group-hover:text-ink'
              }`}
            />
          )}

          {opcionSeleccionada ? (
            <div className="flex items-center gap-1.5 min-w-0 truncate">
              <span className="truncate font-semibold text-ink">
                {opcionSeleccionada.label}
              </span>
              {opcionSeleccionada.badge && (
                <span
                  className={`hidden sm:inline-flex shrink-0 items-center px-1.5 py-0.2 rounded-md text-[10px] font-mono font-bold border ${
                    opcionSeleccionada.badgeColor ?? 'bg-brand/10 text-brand border-brand/20'
                  }`}
                >
                  {opcionSeleccionada.badge}
                </span>
              )}
            </div>
          ) : (
            <span className="text-muted truncate">{placeholder}</span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0 text-muted group-hover:text-ink">
          <ChevronDown
            size={13}
            className={`transition-transform duration-200 ease-out ${
              abierto ? 'rotate-180 text-brand' : ''
            }`}
          />
        </div>
      </button>

      {abierto &&
        createPortal(
          <div
            ref={menuRef}
            role="listbox"
            tabIndex={-1}
            className="fixed rounded-2xl border border-line bg-card p-1.5 shadow-2xl backdrop-blur-2xl animate-fade-up select-none flex flex-col"
            style={{
              position: 'fixed',
              left: coords.left,
              ...(coords.posicionVertical === 'abajo'
                ? { top: coords.top }
                : { bottom: coords.bottom }),
              width: coords.width,
              maxHeight: coords.maxHeight,
              zIndex: 99999,
              boxShadow:
                '0 20px 50px -10px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.08), 0 8px 24px rgba(59,130,246,0.12)',
            }}
          >
            {buscable && (
              <div className="relative shrink-0 mb-1.5 px-1 pt-0.5">
                <Search
                  size={13}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
                />
                <input
                  ref={inputBusquedaRef}
                  type="text"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Filtrar opciones..."
                  className="w-full rounded-xl border border-line bg-canvas pl-7 pr-3 py-1.5 text-xs text-ink outline-none placeholder:text-muted focus:border-brand focus:bg-card transition-colors"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            )}

            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden space-y-0.5 pr-0.5">
              {opcionesFiltradas.length === 0 ? (
                <div className="px-3 py-4 text-center text-xs text-muted">
                  No se encontraron opciones
                </div>
              ) : (
                opcionesFiltradas.map((op) => {
                  const esActivo = op.value === value;
                  return (
                    <button
                      key={op.value}
                      type="button"
                      role="option"
                      aria-selected={esActivo}
                      disabled={op.disabled}
                      onClick={() => {
                        if (!op.disabled) {
                          onChange(op.value);
                          setAbierto(false);
                        }
                      }}
                      className={`group/op flex w-full items-center justify-between gap-2.5 rounded-xl px-2.5 py-2 text-xs transition-all cursor-pointer ${
                        op.disabled
                          ? 'opacity-40 cursor-not-allowed'
                          : esActivo
                          ? 'bg-brand/12 text-brand font-bold border border-brand/20 shadow-xs'
                          : 'text-ink hover:bg-canvas hover:text-brand'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1 text-left">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="truncate">{op.label}</span>
                            {op.badge && (
                              <span
                                className={`shrink-0 items-center px-1.5 py-0.2 rounded text-[9.5px] font-mono font-bold border ${
                                  op.badgeColor ??
                                  (esActivo
                                    ? 'bg-brand/20 text-brand border-brand/30'
                                    : 'bg-canvas text-muted border-line')
                                }`}
                              >
                                {op.badge}
                              </span>
                            )}
                          </div>
                          {op.sublabel && (
                            <p className="text-[10.5px] text-muted truncate mt-0.5 font-normal">
                              {op.sublabel}
                            </p>
                          )}
                        </div>
                      </div>

                      {esActivo && (
                        <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-brand text-white shadow-xs">
                          <Check size={11} className="stroke-[3]" />
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
