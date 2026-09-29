import type { LucideIcon } from 'lucide-react';

interface NodoProps {
  icono: LucideIcon;
  titulo: string;
  subtitulo: string;
  puerto?: string;
  tono?: 'brand' | 'safe' | 'cost' | 'sidebar' | 'purple';
  activo?: boolean;
  pulsante?: boolean;
  onClick?: () => void;
}

const fondos = {
  brand: 'border-blue-500/30 bg-blue-500/5 hover:border-blue-500/60',
  safe: 'border-emerald-500/30 bg-emerald-500/5 hover:border-emerald-500/60',
  cost: 'border-amber-500/30 bg-amber-500/5 hover:border-amber-500/60',
  sidebar: 'border-slate-300 bg-slate-500/5 hover:border-slate-400 dark:border-slate-700/60 dark:bg-slate-800/40 dark:hover:border-slate-600',
  purple: 'border-purple-500/30 bg-purple-500/5 hover:border-purple-500/60',
};

const iconoTonos = {
  brand: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  safe: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  cost: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  sidebar: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  purple: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
};

export function NetworkNode({
  icono: Icono,
  titulo,
  subtitulo,
  puerto,
  tono = 'brand',
  activo = false,
  pulsante = false,
  onClick,
}: NodoProps) {
  return (
    <button
      onClick={onClick}
      className={`relative w-full rounded-2xl border p-4 text-left transition-all duration-200 cursor-pointer shadow-xs ${
        fondos[tono]
      } ${
        activo
          ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-card dark:ring-offset-[#0E1628] scale-[1.02] shadow-md'
          : 'hover:-translate-y-0.5 hover:shadow-md'
      } ${pulsante ? 'animate-pulse ring-2 ring-emerald-500' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className={`grid h-10 w-10 place-items-center rounded-xl ${iconoTonos[tono]}`}>
          <Icono size={20} aria-hidden />
        </div>
        {puerto && (
          <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-full bg-card border border-line text-muted">
            {puerto}
          </span>
        )}
      </div>

      <div className="mt-3">
        <p className="text-sm font-bold text-ink">{titulo}</p>
        <p className="text-xs text-muted mt-0.5 truncate">{subtitulo}</p>
      </div>

      {activo && (
        <span className="absolute -top-1.5 -right-1.5 flex h-3.5 w-3.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-blue-600"></span>
        </span>
      )}
    </button>
  );
}
