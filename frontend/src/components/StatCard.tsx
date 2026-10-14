import type { LucideIcon } from 'lucide-react';
import { Card } from './ui/Card';
import { InfoTooltip } from './ui/InfoTooltip';

type Tono = 'brand' | 'safe' | 'cost' | 'alert' | 'purple';

const tonos: Record<Tono, { bg: string; text: string; gradient: string }> = {
  brand: {
    bg: 'bg-blue-500/10',
    text: 'text-blue-600',
    gradient: 'from-blue-600 to-indigo-600',
  },
  safe: {
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-600',
    gradient: 'from-emerald-500 to-teal-600',
  },
  cost: {
    bg: 'bg-amber-500/10',
    text: 'text-amber-600',
    gradient: 'from-amber-500 to-orange-600',
  },
  alert: {
    bg: 'bg-rose-500/10',
    text: 'text-rose-600',
    gradient: 'from-rose-500 to-red-600',
  },
  purple: {
    bg: 'bg-purple-500/10',
    text: 'text-purple-600',
    gradient: 'from-purple-600 to-pink-600',
  },
};

interface Props {
  titulo: string;
  valor: string;
  detalle?: string;
  icono: LucideIcon;
  tono?: Tono;
  tendencia?: string;
  tendenciaPositiva?: boolean;
  info?: {
    titulo: string;
    descripcion: string;
  };
}

export function StatCard({
  titulo,
  valor,
  detalle,
  icono: Icono,
  tono = 'brand',
  tendencia,
  tendenciaPositiva = true,
  info,
}: Props) {
  const t = tonos[tono];
  return (
    <Card hover className="flex flex-col justify-between gap-3 relative group">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-xs font-medium uppercase tracking-wider text-muted">{titulo}</p>
            {info && <InfoTooltip titulo={info.titulo} descripcion={info.descripcion} size="sm" />}
          </div>
          <p className="mt-1.5 text-2xl sm:text-3xl font-extrabold tracking-tight text-ink">
            {valor}
          </p>
        </div>
        <div
          className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br ${t.gradient} text-white shadow-md transition-transform duration-200 group-hover:scale-105`}
        >
          <Icono size={22} aria-hidden />
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-line/60 pt-2.5">
        {detalle && <p className="text-xs text-muted truncate min-w-0">{detalle}</p>}
        {tendencia && (
          <span
            className={`inline-flex items-center shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full ${
              tendenciaPositiva
                ? 'bg-emerald-500/10 text-emerald-600'
                : 'bg-rose-500/10 text-rose-600'
            }`}
          >
            {tendencia}
          </span>
        )}
      </div>
    </Card>
  );
}
