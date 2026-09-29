import type { ControlSeguridad } from '../types/cloud';
import { Card } from './ui/Card';
import { StatusBadge } from './ui/StatusBadge';
import { ShieldAlert, ShieldCheck, Info } from 'lucide-react';

export function SecurityCard({ control }: { control: ControlSeguridad }) {
  return (
    <Card hover className="flex flex-col justify-between gap-3 relative">
      <div>
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            {control.nivel === 'correcto' ? (
              <ShieldCheck size={18} className="text-emerald-500 shrink-0" />
            ) : (
              <ShieldAlert size={18} className="text-amber-500 shrink-0" />
            )}
            <p className="text-sm font-bold text-ink leading-snug">{control.titulo}</p>
          </div>
          <StatusBadge nivel={control.nivel} pulso={control.nivel === 'problema'} />
        </div>

        <p className="text-xs text-muted leading-relaxed mb-3">{control.descripcion}</p>
      </div>

      <div className="space-y-2">
        <div className="flex items-start gap-2 rounded-xl bg-canvas p-2.5 border border-line/60">
          <Info size={14} className="shrink-0 mt-0.5 text-blue-600" aria-hidden />
          <p className="text-xs text-ink leading-relaxed">{control.recomendacion}</p>
        </div>

        {control.framework && (
          <div className="flex justify-end">
            <span className="text-[10px] font-mono text-muted bg-card px-2 py-0.5 rounded border border-line">
              {control.framework}
            </span>
          </div>
        )}
      </div>
    </Card>
  );
}
