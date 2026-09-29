import type { NivelSeguridad, Estado } from '../../types/cloud';

type BadgeType = NivelSeguridad | Estado | 'info' | 'purple';

const estilos: Record<BadgeType, { clase: string; texto: string; dot: string }> = {
  correcto: {
    clase: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
    texto: 'Correcto',
    dot: 'bg-emerald-500',
  },
  activo: {
    clase: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
    texto: 'Activo',
    dot: 'bg-emerald-500',
  },
  revision: {
    clase: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
    texto: 'Revisión',
    dot: 'bg-amber-500',
  },
  problema: {
    clase: 'bg-rose-500/10 text-rose-600 border-rose-500/20',
    texto: 'Problema',
    dot: 'bg-rose-500',
  },
  inactivo: {
    clase: 'bg-slate-500/10 text-slate-600 border-slate-500/20',
    texto: 'Inactivo',
    dot: 'bg-slate-500',
  },
  info: {
    clase: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
    texto: 'Información',
    dot: 'bg-blue-500',
  },
  purple: {
    clase: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
    texto: 'Destacado',
    dot: 'bg-purple-500',
  },
};

export function StatusBadge({
  nivel,
  texto,
  pulso = false,
}: {
  nivel: BadgeType;
  texto?: string;
  pulso?: boolean;
}) {
  const e = estilos[nivel] ?? estilos.info;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium tracking-wide shadow-xs ${e.clase}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${e.dot} ${pulso ? 'animate-pulse' : ''}`}
        aria-hidden
      />
      {texto ?? e.texto}
    </span>
  );
}
