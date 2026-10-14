import { useId } from 'react';
import { Link } from 'react-router-dom';

interface LogoProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | number;
  conTexto?: boolean;
  conSubtitulo?: boolean;
  className?: string;
  linkTo?: string;
  animado?: boolean;
  conPing?: boolean;
  variante?: 'badge' | 'icono';
}

const sizeMap = {
  xs: 22,
  sm: 28,
  md: 36,
  lg: 44,
  xl: 56,
};

export function Logo({
  size = 'md',
  conTexto = false,
  conSubtitulo = false,
  className = '',
  linkTo,
  animado = true,
  conPing = true,
  variante = 'badge',
}: LogoProps) {
  const pixelSize = typeof size === 'number' ? size : sizeMap[size];
  const reactId = useId();
  const uniqueId = `cloudops-logo-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;

  const iconoSvg = (
    <svg
      viewBox="0 0 64 64"
      width={pixelSize}
      height={pixelSize}
      className={`shrink-0 transition-transform duration-300 ${
        animado ? 'group-hover:scale-105 group-hover:rotate-1' : ''
      }`}
      aria-label="CloudOps AWS Logo"
      role="img"
    >
      <defs>
        <linearGradient id={`${uniqueId}-bg`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#0B1120" />
          <stop offset="50%" stopColor="#080E1E" />
          <stop offset="100%" stopColor="#020617" />
        </linearGradient>

        <linearGradient id={`${uniqueId}-border`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#38BDF8" stopOpacity={0.75} />
          <stop offset="50%" stopColor="#6366F1" stopOpacity={0.5} />
          <stop offset="100%" stopColor="#FF9900" stopOpacity={0.9} />
        </linearGradient>

        <linearGradient id={`${uniqueId}-cloud`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#38BDF8" />
          <stop offset="45%" stopColor="#3B82F6" />
          <stop offset="100%" stopColor="#818CF8" />
        </linearGradient>

        <linearGradient id={`${uniqueId}-cloud-fill`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#38BDF8" stopOpacity={0.22} />
          <stop offset="100%" stopColor="#6366F1" stopOpacity={0.04} />
        </linearGradient>

        <linearGradient id={`${uniqueId}-aws`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#FF9900" />
          <stop offset="65%" stopColor="#F59E0B" />
          <stop offset="100%" stopColor="#FBBF24" />
        </linearGradient>

        <linearGradient id={`${uniqueId}-cube-top`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#7DD3FC" />
          <stop offset="100%" stopColor="#38BDF8" />
        </linearGradient>
        <linearGradient id={`${uniqueId}-cube-left`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#2563EB" />
          <stop offset="100%" stopColor="#1D4ED8" />
        </linearGradient>
        <linearGradient id={`${uniqueId}-cube-right`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#4F46E5" />
          <stop offset="100%" stopColor="#3730A3" />
        </linearGradient>

        <radialGradient id={`${uniqueId}-glow`} cx="50%" cy="48%" r="48%">
          <stop offset="0%" stopColor="#38BDF8" stopOpacity={0.32} />
          <stop offset="100%" stopColor="#38BDF8" stopOpacity={0} />
        </radialGradient>
      </defs>

      {variante === 'badge' && (
        <>
          <rect x="2.5" y="2.5" width="59" height="59" rx="15" fill={`url(#${uniqueId}-bg)`} />
          <rect
            x="2.5"
            y="2.5"
            width="59"
            height="59"
            rx="15"
            fill="none"
            stroke={`url(#${uniqueId}-border)`}
            strokeWidth="1.5"
          />
        </>
      )}

      <circle cx="32" cy="29" r="16" fill={`url(#${uniqueId}-glow)`} />

      <path
        d="M 20.5 34 C 16.5 34 13.8 30.5 14.8 26.5 C 15.6 22.8 19 21.2 22.5 21.4 C 24 16.8 28.5 14.2 33.5 14.6 C 38.2 15 42 18.5 43.2 23.2 C 46.8 23.8 49.8 26.8 49.2 30.8 C 48.8 34 45.8 35 42 35"
        fill={`url(#${uniqueId}-cloud-fill)`}
        stroke={`url(#${uniqueId}-cloud)`}
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      <line
        x1="20.5"
        y1="34"
        x2="26"
        y2="31.2"
        stroke="#38BDF8"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeDasharray="1.5 2"
        opacity={0.8}
      />
      <line
        x1="42"
        y1="35"
        x2="38"
        y2="31.2"
        stroke="#818CF8"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeDasharray="1.5 2"
        opacity={0.8}
      />
      <line
        x1="33.5"
        y1="15"
        x2="32"
        y2="21"
        stroke="#60A5FA"
        strokeWidth="1.1"
        strokeLinecap="round"
        strokeDasharray="1.5 2"
        opacity={0.6}
      />

      <g transform="translate(32, 28)">
        <polygon points="0,-7 6.2,-3.4 0,0.2 -6.2,-3.4" fill={`url(#${uniqueId}-cube-top)`} />
        <polygon points="-6.2,-3.4 0,0.2 0,7.4 -6.2,3.8" fill={`url(#${uniqueId}-cube-left)`} />
        <polygon points="6.2,-3.4 0,0.2 0,7.4 6.2,3.8" fill={`url(#${uniqueId}-cube-right)`} />
        <circle cx="0" cy="0.2" r="1.3" fill="#FFFFFF" opacity={0.95} />
      </g>

      <path
        d="M 17 41.5 C 24 48 39.5 48 46.5 41.5"
        fill="none"
        stroke={`url(#${uniqueId}-aws)`}
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <path
        d="M 42.5 42 L 47 41.2 L 44.2 37.2"
        fill="none"
        stroke={`url(#${uniqueId}-aws)`}
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      <circle cx="16.8" cy="41.5" r="2.2" fill="#FF9900" />
      <circle cx="14.6" cy="26.5" r="1.6" fill="#38BDF8" />
      <circle cx="49" cy="30.6" r="1.6" fill="#818CF8" />
      <circle cx="33.5" cy="14.8" r="1.8" fill="#60A5FA" />
    </svg>
  );

  const contenido = (
    <div className={`inline-flex items-center gap-2.5 group select-none ${className}`}>
      <div className="relative shrink-0">
        {iconoSvg}
        {conPing && (
          <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500 border border-slate-900 shadow-xs" />
          </span>
        )}
      </div>

      {conTexto && (
        <div className="min-w-0 text-left">
          <div className="flex items-center gap-1.5 whitespace-nowrap">
            <span className="font-black text-sm tracking-tight text-ink">
              Cloud<span className="text-blue-500">Ops</span>
            </span>
            <span className="rounded-md px-1.5 py-0.5 text-[8.5px] font-black uppercase tracking-wider bg-amber-500/10 text-amber-500 border border-amber-500/25">
              AWS
            </span>
          </div>
          {conSubtitulo && (
            <p className="text-[10px] font-medium tracking-wide text-muted truncate">
              Enterprise Architecture
            </p>
          )}
        </div>
      )}
    </div>
  );

  if (linkTo) {
    return (
      <Link to={linkTo} className="inline-flex outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-xl">
        {contenido}
      </Link>
    );
  }

  return contenido;
}
