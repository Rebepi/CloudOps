import type { Region } from '../types/cloud';
import { Card } from './ui/Card';
import { StatusBadge } from './ui/StatusBadge';
import { Wifi, Layers, MapPin } from 'lucide-react';

export function RegionCard({ region, onClick }: { region: Region; onClick?: () => void }) {
  return (
    <Card hover onClick={onClick} className="flex flex-col justify-between gap-4">
      <div>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <MapPin size={14} className="text-brand shrink-0" />
              <p className="text-base font-bold text-ink truncate">{region.nombre}</p>
            </div>
            <p className="text-xs font-mono text-muted pl-5">{region.id}</p>
            <p className="text-xs text-muted pl-5 mt-0.5">{region.ubicacion}</p>
          </div>
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <StatusBadge
              nivel={region.estado}
              texto={region.estado === 'inactivo' ? 'No habilitada' : 'Habilitada'}
              pulso={region.estado === 'activo'}
            />
            {region.principal && (
              <span className="text-[10px] font-semibold tracking-wide text-brand bg-brand/10 border border-brand/20 px-2 py-0.5 rounded-full">
                Principal
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mt-4 rounded-xl bg-canvas p-3 border border-line/60">
          <div className="flex items-center gap-2.5">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-card text-muted shadow-xs">
              <Layers size={16} />
            </div>
            <div>
              <p className="text-[11px] text-muted leading-none">Zonas (AZs)</p>
              <p className="text-sm font-bold text-ink mt-0.5">{Number.isFinite(region.zonasDisponibilidad) ? region.zonasDisponibilidad : '—'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-card text-muted shadow-xs">
              <Wifi size={16} />
            </div>
            <div>
              <p className="text-[11px] text-muted leading-none">Latencia</p>
              <p className="text-sm font-bold text-ink mt-0.5">{Number.isFinite(region.latenciaMs) ? `${region.latenciaMs} ms` : '—'}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-2 border-t border-line/60 pt-3">
        <div className="flex items-center justify-between text-xs text-muted">
          <span>Servicios desplegados ({region.datosConsultados ? region.serviciosDesplegados.length : '—'})</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {region.serviciosDesplegados.map((s) => (
            <span
              key={s}
              className="text-[11px] bg-brand/5 text-brand border border-brand/15 rounded-md px-2 py-0.5 font-medium"
            >
              {s}
            </span>
          ))}
        </div>
      </div>
    </Card>
  );
}
