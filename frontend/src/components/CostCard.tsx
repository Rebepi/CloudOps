import type { ServicioAWS, ItemCosto } from '../types/cloud';
import { Card } from './ui/Card';
import { usd } from '../lib/format';
import { Trash2, Calculator } from 'lucide-react';

interface Props {
  servicio: ServicioAWS;
  item: ItemCosto;
  subtotal: number;
  onEliminar: () => void;
}

export function CostCard({ servicio, item, subtotal, onEliminar }: Props) {
  return (
    <Card hover className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 py-3.5 px-4 transition-all">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-500/10 text-amber-600 font-semibold">
          <Calculator size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-bold text-ink">{servicio.nombre}</p>
            <span className="text-[10px] bg-canvas border border-line text-muted px-1.5 py-0.5 rounded-md font-medium shrink-0">
              {servicio.categoria}
            </span>
          </div>
          <p className="text-xs text-muted mt-0.5">
            {item.cantidad} × {item.horasMes} h/mes · {usd(servicio.precioUnitario)} por {servicio.unidad}
            {item.configuracion ? ` · ${item.configuracion}` : ''}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0">
        <div className="text-left sm:text-right">
          <p className="text-base font-extrabold text-amber-600">{usd(subtotal)}</p>
          <p className="text-[10px] text-muted">/mes</p>
        </div>
        <button
          onClick={onEliminar}
          className="grid h-8 w-8 place-items-center rounded-xl text-muted hover:bg-rose-500/10 hover:text-rose-600 transition-colors"
          aria-label={`Eliminar ${servicio.nombre}`}
        >
          <Trash2 size={16} />
        </button>
      </div>
    </Card>
  );
}
