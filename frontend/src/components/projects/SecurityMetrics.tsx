import { useEffect, useRef, useState } from 'react';
import { ShieldCheck, Fingerprint, Database, Code2, PackageSearch, Network, Radar, ChartNoAxesCombined, CircleHelp, ListChecks } from 'lucide-react';
import type { EvaluacionSeguridad } from '../../types/cloud';
import { useMotionProgress } from '../../hooks/useMotionProgress';
import { isScoredFinding, severityNames } from '../../lib/securityPresentation';

const dimensions = [
  { id: 'identity', label: 'Accesos', icon: Fingerprint }, { id: 'data', label: 'Datos y secretos', icon: Database },
  { id: 'application', label: 'Código', icon: Code2 }, { id: 'dependencies', label: 'Dependencias', icon: PackageSearch },
  { id: 'configuration', label: 'Infraestructura', icon: Network }, { id: 'detection', label: 'Detección', icon: Radar },
];
const severityColors: Record<string, string> = { CRITICAL: '#f43f5e', HIGH: '#f97316', MEDIUM: '#eab308', LOW: '#38bdf8' };
export function validPercentage(value: number | null | undefined) { return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100 ? value : null; }

export function SecurityMetrics({ assessment }: { assessment: EvaluacionSeguridad }) {
  const [view, setView] = useState('severity');
  const section = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    if (visible || !section.current) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) { setVisible(true); observer.disconnect(); }
    }, { threshold: 0.05 });
    observer.observe(section.current);
    return () => observer.disconnect();
  }, [visible]);
  const progress = useMotionProgress(`${assessment.id}:${view}`, 900, visible);
  const metricProgress = useMotionProgress(assessment.id, 1000, visible);
  const score = validPercentage(assessment.score);
  const coverage = validPercentage(assessment.coverage);
  const findings = (assessment.findings ?? []).filter(isScoredFinding);
  const counts = findings.reduce<Record<string, number>>((result, finding) => { result[finding.severity] = (result[finding.severity] ?? 0) + 1; return result; }, {});
  const controls = (assessment.dimensionScores ?? []).flatMap((dimension) => dimension.controls ?? []);
  const states = [
    { id: 'pass', label: 'Sin fallo observado', count: controls.filter((control) => control.state === 'pass').length, color: '#3b82f6' },
    { id: 'fail', label: 'Con fallo observado', count: controls.filter((control) => control.state === 'fail').length, color: '#f43f5e' },
    { id: 'unknown', label: 'Parcial o sin verificar', count: controls.filter((control) => !['pass', 'fail', 'not_applicable'].includes(control.state)).length, color: '#f59e0b' },
    { id: 'na', label: 'No aplicable en el alcance', count: controls.filter((control) => control.state === 'not_applicable').length, color: '#94a3b8' },
  ];
  const circumference = 2 * Math.PI * 49;
  const scoreColor = score == null ? '#94a3b8' : counts.CRITICAL || score < 50 ? '#f43f5e' : counts.HIGH || score < 80 ? '#f59e0b' : '#3b82f6';
  return <section ref={section} aria-label="Porcentajes y estadísticas de seguridad" className="overflow-hidden rounded-2xl border border-line bg-card">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-4 sm:px-6"><div><p className="text-[11px] font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400">Mediciones de esta evaluación</p><h2 className="mt-1 text-lg font-bold text-ink">Seguridad en cifras</h2></div><ShieldCheck size={22} className="text-blue-500" /></div>
    <div className="grid lg:grid-cols-[260px_1fr]">
      <div className="border-b border-line bg-canvas/40 p-5 lg:border-b-0 lg:border-r">
        <div className="relative mx-auto h-36 w-36" role="img" aria-label={`Índice de seguridad del motor: ${score == null ? 'sin medición' : `${score}% (${score} de 100 puntos)`}`}>
          <svg viewBox="0 0 120 120" aria-hidden="true" className="h-full w-full -rotate-90"><circle cx="60" cy="60" r="49" fill="none" stroke="var(--color-line)" strokeWidth="9" /><circle cx="60" cy="60" r="49" fill="none" stroke={scoreColor} strokeWidth="9" strokeLinecap={score ? 'round' : 'butt'} strokeDasharray={`${circumference * (score ?? 0) / 100 * metricProgress} ${circumference}`} /></svg>
          <div aria-hidden="true" className="absolute inset-0 flex flex-col items-center justify-center"><strong className="text-4xl font-black tabular-nums" style={{ color: scoreColor }}>{score == null ? '—' : `${Math.round(score * metricProgress)}%`}</strong><ShieldCheck size={17} className="mt-1 text-muted" /></div>
        </div>
        <p className="mt-2 text-center text-sm font-bold text-ink">Índice de seguridad observado</p><p className="mt-1 text-center text-xs leading-relaxed text-muted">{score == null ? 'No hay un puntaje registrado.' : `${score} de 100 puntos del motor, expresados como porcentaje.`} No representa una probabilidad de estar protegido.</p>
        <div className="mt-5 border-t border-line pt-4"><div className="flex items-center justify-between text-xs"><span className="flex items-center gap-1.5 font-semibold text-ink"><Radar size={14} />Cobertura del análisis</span><span aria-label={`Cobertura ${coverage == null ? 'sin medición' : `${coverage}%`}`} className="font-bold tabular-nums text-blue-600 dark:text-blue-400">{coverage == null ? '—' : `${Math.round(coverage * metricProgress)}%`}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-blue-500" style={{ width: `${(coverage ?? 0) * metricProgress}%` }} /></div><p className="mt-2 text-xs leading-relaxed text-muted">Cuánto pudo comprobar el método. Una cobertura alta puede coexistir con riesgos críticos.</p></div>
      </div>
      <div className="min-w-0 p-4 sm:p-6">
        <div className="mb-4 flex flex-wrap gap-2" aria-label="Elegir estadística">{[{ id: 'dimensions', label: 'Índice por dimensión', icon: ShieldCheck }, { id: 'severity', label: 'Gravedad de alertas', icon: ChartNoAxesCombined }, { id: 'controls', label: 'Estado de controles', icon: ListChecks }].map(({ id, label, icon: Icon }) => <button key={id} type="button" aria-pressed={view === id} onClick={() => setView(id)} className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold focus-visible:outline-2 focus-visible:outline-blue-500 ${view === id ? 'border-blue-500 bg-blue-500/5 text-blue-600 dark:text-blue-400' : 'border-line text-muted hover:text-ink'}`}><Icon size={14} />{label}</button>)}</div>
        <div key={view} className="animate-fade-in">
          {view === 'dimensions' && <><p className="mb-4 text-xs leading-relaxed text-muted">Puntajes originales del motor sobre 100. Los valores sin medición suficiente se muestran vacíos; no se promedian para crear un porcentaje nuevo.</p><div className="space-y-4">{dimensions.map(({ id, label, icon: Icon }) => { const dimension = assessment.dimensionScores?.find((item) => item.id === id); const value = validPercentage(dimension?.score); const color = value == null ? '#94a3b8' : value < 50 ? '#f43f5e' : value < 80 ? '#f59e0b' : '#3b82f6'; return <div key={id} aria-label={`${label}: ${value == null ? 'sin puntaje concluyente' : `${value}%`}`}><div className="mb-1.5 flex flex-wrap items-center justify-between gap-1 text-xs"><span className="flex items-center gap-2 font-semibold text-ink"><Icon size={15} className="text-muted" />{label}</span><span className={value == null ? 'text-muted' : 'font-bold tabular-nums text-ink'}>{value == null ? 'Sin puntaje concluyente' : `${Math.round(value * progress)}%`}{dimension?.state === 'partial' && <span className="ml-2 font-normal text-amber-700 dark:text-amber-400">Medición parcial</span>}</span></div>{value == null ? <div className="flex h-2 items-center gap-1" aria-hidden="true">{Array.from({ length: 16 }, (_, index) => <span key={index} className="h-1.5 flex-1 rounded-sm bg-line" />)}</div> : <div className="h-2 overflow-hidden rounded-full bg-line" role="progressbar" aria-label={`Índice de ${label}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}><div className="h-full rounded-full" style={{ width: `${value * progress}%`, background: color }} /></div>}</div>; })}</div></>}
          {view === 'severity' && <><p className="mb-4 text-xs leading-relaxed text-muted">Porcentaje de las {findings.length} alertas puntuables de esta evaluación. Los informativos y las evidencias excluidas no entran en esta distribución.</p>{findings.length ? <div className="space-y-5">{Object.entries(severityColors).map(([severity, color]) => { const count = counts[severity] ?? 0; const share = count / findings.length * 100; return <div key={severity}><div className="mb-2 flex items-center justify-between gap-3 text-xs"><span className="flex items-center gap-2 font-semibold text-ink"><span className="h-2 w-2 rounded-full" style={{ background: color }} />{severityNames[severity]}</span><span className="tabular-nums text-muted">{count} alertas · <strong className="text-ink">{share.toLocaleString('es-PE', { maximumFractionDigits: 1 })}%</strong></span></div><div className="h-4 overflow-hidden rounded-md bg-line"><div className="h-full rounded-md" style={{ width: `${share * progress}%`, background: color }} /></div></div>; })}</div> : <p className="py-8 text-sm text-muted">No hay alertas puntuables para calcular esta distribución. Esto no acredita que todas las áreas estén protegidas.</p>}</>}
          {view === 'controls' && <><p className="mb-4 text-xs leading-relaxed text-muted">Distribución de {controls.length} controles registrados, incluyendo comprobaciones pendientes y no aplicables. No es un porcentaje de seguridad.</p>{controls.length ? <><div aria-hidden="true" className="mb-5 flex h-7 overflow-hidden rounded-lg bg-line">{states.map((state) => <div key={state.id} style={{ width: `${state.count / controls.length * 100 * progress}%`, background: state.color }} />)}</div><dl className="divide-y divide-line">{states.map((state) => <div key={state.id} className="flex items-center justify-between gap-3 py-3 text-xs"><dt className="flex items-center gap-2 text-muted"><span className="h-2 w-2 rounded-full" style={{ background: state.color }} />{state.label}</dt><dd className="whitespace-nowrap font-bold tabular-nums text-ink">{state.count} · {(state.count / controls.length * 100).toLocaleString('es-PE', { maximumFractionDigits: 1 })}%</dd></div>)}</dl></> : <p className="flex items-center gap-2 py-8 text-sm text-muted"><CircleHelp size={18} />Esta ejecución no conserva controles suficientes para mostrar la distribución.</p>}</>}
        </div>
      </div>
    </div>
  </section>;
}
