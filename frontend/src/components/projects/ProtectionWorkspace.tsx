import { useState } from 'react';
import type { EvaluacionSeguridad } from '../../types/cloud';
import { securityAreas, controlNames } from '../../lib/securityPresentation';

export interface ProtectionWorkspaceProps {
  assessment: EvaluacionSeguridad;
  compact?: boolean;
  onFinding: (id: string) => void;
  onCoverage: () => void;
  onArea?: (id: string) => void;
  initialArea?: string;
}
export function ProtectionWorkspace({ assessment, onFinding, onCoverage, initialArea = 'identity' }: ProtectionWorkspaceProps) {
  const [active, setActive] = useState(initialArea);
  const areas = securityAreas(assessment);
  const selected = areas.find((area) => area.id === active) ?? areas[0];
  return <section className="space-y-4 text-sm">
    <p className="text-xs text-muted">Cinco áreas agrupan las seis dimensiones del motor. No son los pilares AWS ni generan un puntaje adicional.</p>
    <div className="flex flex-wrap gap-2" aria-label="Áreas de seguridad">{areas.map((area) => <button key={area.id} aria-pressed={area.id === active} onClick={() => setActive(area.id)} className={`rounded-xl border px-3 py-2 ${area.id === active ? 'border-blue-500 bg-blue-500/10 text-blue-500' : 'border-line text-muted'}`}>{area.label}</button>)}</div>
    <h2 className="font-bold text-ink">{selected.question}</h2><p className="text-muted">{selected.status}</p>
    {selected.dimensions.map((dimension) => <div key={dimension.id} className="border-t border-line pt-3"><h3 className="font-semibold text-ink">{dimension.label} · {dimension.score === null ? 'Sin puntaje concluyente' : `${dimension.score}/100`}</h3><p className="mt-1 text-xs text-muted">Cobertura: {dimension.coverage}% · {dimension.state}</p>
      <dl className="mt-2 divide-y divide-line">{dimension.controls?.map((control) => <div key={control.id} className="py-3"><dt className="font-semibold text-ink">{control.label} · {controlNames[control.state] ?? control.state}</dt><dd className="mt-1 text-xs text-muted">{control.detail}</dd></div>)}</dl>
    </div>)}
    {!selected.dimensions.length && <p className="text-muted">Sin medición guardada para esta área. No equivale a un resultado seguro.</p>}
    <div className="divide-y divide-line">{selected.findings.map((finding) => <button key={finding.id} onClick={() => onFinding(finding.id)} className="block w-full py-3 text-left text-blue-500">{finding.title}</button>)}</div>
    <button onClick={onCoverage} className="text-xs font-semibold text-blue-500">Consultar herramientas y límites</button>
  </section>;
}
