import type { ServicioAWS } from '../types/cloud';
import { Card } from './ui/Card';
import { StatusBadge } from './ui/StatusBadge';
import { Server, HardDrive, Database, Network, ShieldCheck, Zap, ArrowRightLeft, Plus } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { usd } from '../lib/format';

const iconoCategoria: Record<string, LucideIcon> = {
  'Cómputo': Server,
  'Almacenamiento': HardDrive,
  'Base de datos': Database,
  'Redes': Network,
  'Seguridad e identidad': ShieldCheck,
  'Entrega de contenido': Zap,
};

interface Props {
  servicio: ServicioAWS;
  seleccionado?: boolean;
  onToggle?: () => void;
  onClick?: () => void;
  precioInfo?: { precio: number; fuente: 'live' | 'estatico' };
  cargandoPrecio?: boolean;
  // Acciones opcionales de la página Services
  enComparar?: boolean;
  onComparar?: (e: React.MouseEvent) => void;
  onAnadirCosto?: (e: React.MouseEvent) => void;
}

export function ServiceCard({
  servicio,
  seleccionado,
  onToggle,
  onClick,
  precioInfo,
  cargandoPrecio,
  enComparar,
  onComparar,
  onAnadirCosto,
}: Props) {
  const Icono = iconoCategoria[servicio.categoria] ?? Server;
  const tieneAcciones = Boolean(onComparar || onAnadirCosto);

  return (
    <Card
      className={`flex flex-col gap-3 cursor-pointer transition-all hover:shadow-md group
        ${seleccionado ? 'ring-2 ring-brand border-brand' : ''}
        ${onClick || onToggle ? 'hover:-translate-y-0.5' : ''}`}
      onClick={onToggle ?? onClick}
    >
      {/* Header: icono + nombre + acciones */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand/10 text-brand">
            <Icono size={18} aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink leading-tight truncate">{servicio.nombre}</p>
            <p className="text-xs text-muted">{servicio.categoria}</p>
          </div>
        </div>

        {/* Acciones (comparar / añadir) — visibles en hover cuando están disponibles */}
        {tieneAcciones ? (
          <div className="flex items-center gap-1 shrink-0">
            {onComparar && (
              <button
                type="button"
                onClick={onComparar}
                className={`grid h-7 w-7 place-items-center rounded-lg border text-xs shadow-xs transition-all ${
                  enComparar
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-canvas text-muted border-line hover:text-ink hover:bg-card opacity-0 group-hover:opacity-100'
                }`}
                title={enComparar ? 'Quitar de comparar' : 'Añadir a comparar'}
              >
                <ArrowRightLeft size={13} />
              </button>
            )}
            {onAnadirCosto && (
              <button
                type="button"
                onClick={onAnadirCosto}
                className="grid h-7 w-7 place-items-center rounded-lg border border-line bg-canvas text-muted hover:text-emerald-600 hover:bg-emerald-500/10 shadow-xs transition-all opacity-0 group-hover:opacity-100"
                title="Añadir a cotización de costos"
              >
                <Plus size={14} />
              </button>
            )}
            <StatusBadge
              nivel={servicio.enUso ? 'correcto' : 'revision'}
              texto={servicio.enUso ? 'En uso' : 'No utilizado'}
            />
          </div>
        ) : (
          <StatusBadge
            nivel={servicio.enUso ? 'correcto' : 'revision'}
            texto={servicio.enUso ? 'En uso' : 'No utilizado'}
          />
        )}
      </div>

      <p className="text-xs text-muted leading-relaxed line-clamp-2">{servicio.descripcion}</p>

      {precioInfo ? (
        <div className="mt-auto pt-2.5 border-t border-line/60 flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5">
            <span className="font-mono font-bold text-amber-600">
              {usd(precioInfo.precio)}
            </span>
            <span className="text-[10px] text-muted">/ {servicio.unidad}</span>
          </div>
          <div>
            {cargandoPrecio ? (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-slate-500/10 text-muted border border-line animate-pulse">
                cargando…
              </span>
            ) : precioInfo.fuente === 'live' ? (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 border border-emerald-500/30 flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                API · En vivo
              </span>
            ) : (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-600 border border-blue-500/20">
                Oficial AWS
              </span>
            )}
          </div>
        </div>
      ) : (
        <p className="text-xs font-medium text-ink">{servicio.funcionPrincipal}</p>
      )}
    </Card>
  );
}
