import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Info } from 'lucide-react';

interface InfoTooltipProps {
  titulo: string;
  descripcion: string;
  size?: 'sm' | 'md';
  maxWidth?: number;
  className?: string;
}

interface TooltipPos {
  top: number;
  left: number;
  posicion: 'arriba' | 'abajo';
  alineacion: 'izquierda' | 'derecha' | 'centro';
}

export function InfoTooltip({
  titulo,
  descripcion,
  size = 'sm',
  maxWidth = 260,
  className = '',
}: InfoTooltipProps) {
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState<TooltipPos>({
    top: 0,
    left: 0,
    posicion: 'arriba',
    alineacion: 'centro',
  });
  const btnRef = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const iconSize = size === 'sm' ? 13 : 15;
  const btnSize = size === 'sm' ? 'h-4 w-4' : 'h-5 w-5';

  const calcularCoords = useCallback(() => {
    if (!btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const tooltipH = 110;
    const tooltipW = maxWidth;
    const GAP = 10;

    // Vertical: prefer arriba, flip to abajo if not enough space
    const espacioArriba = rect.top;
    const espacioAbajo = window.innerHeight - rect.bottom;
    const posicion: 'arriba' | 'abajo' =
      espacioArriba >= tooltipH + GAP || espacioArriba >= espacioAbajo
        ? 'arriba'
        : 'abajo';

    // Vertical position in viewport coords
    const top =
      posicion === 'arriba'
        ? rect.top - tooltipH - GAP
        : rect.bottom + GAP;

    // Horizontal: center on button, clamp to viewport
    const centroX = rect.left + rect.width / 2;
    let left = centroX - tooltipW / 2;

    let alineacion: 'izquierda' | 'derecha' | 'centro' = 'centro';
    if (left < 8) {
      left = rect.left;
      alineacion = 'izquierda';
    } else if (left + tooltipW > window.innerWidth - 8) {
      left = rect.right - tooltipW;
      alineacion = 'derecha';
    }

    // Clamp to viewport
    left = Math.max(8, Math.min(left, window.innerWidth - tooltipW - 8));

    setCoords({ top, left, posicion, alineacion });
  }, [maxWidth]);

  const abrir = () => {
    clearTimeout(timerRef.current);
    calcularCoords();
    setVisible(true);
  };

  const cerrar = () => {
    timerRef.current = setTimeout(() => setVisible(false), 120);
  };

  const mantener = () => {
    clearTimeout(timerRef.current);
  };

  useEffect(() => {
    if (!visible) return;
    const handler = (e: MouseEvent) => {
      if (
        btnRef.current && !btnRef.current.contains(e.target as Node) &&
        tooltipRef.current && !tooltipRef.current.contains(e.target as Node)
      ) {
        setVisible(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [visible]);

  // Recalculate on scroll / resize
  useEffect(() => {
    if (!visible) return;
    const onUpdate = () => calcularCoords();
    window.addEventListener('scroll', onUpdate, true);
    window.addEventListener('resize', onUpdate);
    return () => {
      window.removeEventListener('scroll', onUpdate, true);
      window.removeEventListener('resize', onUpdate);
    };
  }, [visible, calcularCoords]);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  // Arrow alignment offset
  const arrowLeft = (() => {
    if (!btnRef.current) return '50%';
    const rect = btnRef.current.getBoundingClientRect();
    const btnCenterX = rect.left + rect.width / 2;
    const relX = btnCenterX - coords.left;
    return Math.max(14, Math.min(relX, maxWidth - 14));
  })();

  const tooltip = (
    <div
      ref={tooltipRef}
      role="tooltip"
      onMouseEnter={mantener}
      onMouseLeave={cerrar}
      style={{
        position: 'fixed',
        top: coords.top,
        left: coords.left,
        width: maxWidth,
        zIndex: 99999,
        pointerEvents: visible ? 'auto' : 'none',
        opacity: visible ? 1 : 0,
        transform: `scale(${visible ? 1 : 0.92}) translateY(${visible ? 0 : coords.posicion === 'arriba' ? '4px' : '-4px'})`,
        transformOrigin: coords.posicion === 'arriba' ? 'bottom center' : 'top center',
        transition: 'opacity 180ms cubic-bezier(0.34,1.12,0.64,1), transform 180ms cubic-bezier(0.34,1.12,0.64,1)',
        background: 'linear-gradient(135deg, rgba(8,12,32,0.98) 0%, rgba(5,8,22,0.98) 100%)',
        border: '1px solid rgba(255,255,255,0.10)',
        borderRadius: 14,
        padding: '10px 13px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.04), 0 4px 16px rgba(59,130,246,0.10)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
      }}
    >
      {/* Arrow */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          width: 10,
          height: 10,
          background: 'rgba(8,12,32,0.98)',
          transform: 'rotate(45deg)',
          left: typeof arrowLeft === 'number' ? arrowLeft - 5 : arrowLeft,
          ...(coords.posicion === 'arriba'
            ? { bottom: -5, borderRight: '1px solid rgba(255,255,255,0.10)', borderBottom: '1px solid rgba(255,255,255,0.10)' }
            : { top: -5, borderLeft: '1px solid rgba(255,255,255,0.10)', borderTop: '1px solid rgba(255,255,255,0.10)' }),
        }}
      />

      <div className="flex items-center gap-1.5 mb-1.5">
        <span
          className="grid h-4 w-4 shrink-0 place-items-center rounded-md"
          style={{ background: 'rgba(59,130,246,0.18)', border: '1px solid rgba(59,130,246,0.28)' }}
        >
          <Info size={9} className="text-blue-400" aria-hidden />
        </span>
        <p className="text-[11px] font-bold text-white leading-tight">{titulo}</p>
      </div>
      <p className="text-[10.5px] leading-[1.55] text-slate-400">{descripcion}</p>
    </div>
  );

  return (
    <span className={`relative inline-flex items-center ${className}`}>
      <button
        ref={btnRef}
        type="button"
        onMouseEnter={abrir}
        onMouseLeave={cerrar}
        onFocus={abrir}
        onBlur={cerrar}
        aria-label={`Información: ${titulo}`}
        className={`${btnSize} inline-flex items-center justify-center rounded-full transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 ${
          visible
            ? 'bg-blue-500/20 text-blue-400 scale-110'
            : 'text-slate-400 hover:text-blue-400 hover:bg-blue-500/15 hover:scale-110'
        }`}
      >
        <Info size={iconSize} aria-hidden />
      </button>

      {createPortal(tooltip, document.body)}
    </span>
  );
}
