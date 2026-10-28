import { useState } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  SearchCheck,
  ArrowRight,
  TrendingUp,
  Sparkles,
  Flame,
  CheckCircle2,
  Server,
} from 'lucide-react';
import type { EvaluacionSeguridad } from '../../types/cloud';
import { isScoredFinding, securityAreas, severityNames } from '../../lib/securityPresentation';
import { computePillarScore } from './FivePillarsWorkspace';
import { SecurityMetrics, validPercentage } from './SecurityMetrics';
import { TechIcon } from '../ui/TechIcon';
import type { ArchitectureComponent } from '../../lib/platformCandidates';

export interface SecuritySummaryProps {
  assessment: EvaluacionSeguridad;
  onFinding: (id: string) => void;
  onCoverage: () => void;
  onAdvisor: () => void;
  onArchitecture?: () => void;
  onArea?: (id: string) => void;
}

export function SecuritySummary({
  assessment,
  onFinding,
  onCoverage,
  onAdvisor,
  onArchitecture,
  onArea,
}: SecuritySummaryProps) {
  const [showAdvancedStats, setShowAdvancedStats] = useState(false);

  const rawScore = validPercentage(assessment.score);
  const rawCoverage = validPercentage(assessment.coverage);
  const score = rawScore ?? 0;
  const coverage = rawCoverage ?? 0;

  const findings = (assessment.findings ?? []).filter(isScoredFinding);
  const critical = findings.filter((f) => f.severity === 'CRITICAL').length;
  const high = findings.filter((f) => f.severity === 'HIGH').length;
  const medium = findings.filter((f) => f.severity === 'MEDIUM').length;
  const low = findings.filter((f) => f.severity === 'LOW').length;

  const areas = securityAreas(assessment);
  const allControls = areas.flatMap((area) => area.controls);
  const passedControls = allControls.filter((c) => c.state === 'pass').length;
  const failedControls = allControls.filter((c) => c.state === 'fail').length;
  const pendingControls = allControls.filter((c) => !['pass', 'fail', 'not_applicable'].includes(c.state)).length;

  // Posture Level
  const postureLevel =
    rawScore === null
      ? { label: 'Sin Medición', color: 'text-muted', badge: 'bg-slate-500/10 text-muted border-slate-500/20' }
      : critical > 0 || score < 50
      ? { label: 'Riesgo Crítico', color: 'text-rose-500', badge: 'bg-rose-500/15 text-rose-500 border-rose-500/30 ring-1 ring-rose-500/20' }
      : high > 0 || score < 75
      ? { label: 'Atención Requerida', color: 'text-amber-500', badge: 'bg-amber-500/15 text-amber-500 border-amber-500/30' }
      : score < 90
      ? { label: 'Nivel Bueno', color: 'text-blue-500', badge: 'bg-blue-500/15 text-blue-500 border-blue-500/30' }
      : { label: 'Nivel Excelente', color: 'text-emerald-500', badge: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30' };

  // Benchmark Target
  const targetScore = 90;
  const gapToTarget = rawScore !== null ? Math.max(0, targetScore - score) : null;

  // Detected Tech Components
  const rawArch = assessment.summary.detectedArchitecture as { components?: ArchitectureComponent[] } | undefined;
  const components = (rawArch?.components ?? []).filter(
    (item) => item && typeof item.id === 'string' && typeof item.name === 'string'
  );

  // Top 3 Actionable Findings
  const priorityFindings = [...findings]
    .sort((a, b) => {
      const order: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
      return (order[a.severity] ?? 99) - (order[b.severity] ?? 99);
    })
    .slice(0, 3);

  const circumference = 2 * Math.PI * 45;

  return (
    <div className="space-y-6">
      {/* 1. Hero Security Posture & Target Benchmark */}
      <section
        aria-label="Diagnóstico de seguridad y postura"
        className="relative overflow-hidden rounded-3xl border border-line bg-gradient-to-br from-card via-card to-canvas/80 p-6 sm:p-8 shadow-sm"
      >
        <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr] lg:items-center">
          {/* Left Column: Headline, Status & Benchmark */}
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-black uppercase tracking-wider ${postureLevel.badge}`}>
                <span className="relative flex h-2 w-2">
                  <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${critical > 0 ? 'bg-rose-400' : 'bg-blue-400'}`} />
                  <span className={`relative inline-flex h-2 w-2 rounded-full ${critical > 0 ? 'bg-rose-500' : 'bg-blue-500'}`} />
                </span>
                {postureLevel.label}
              </span>
              <span className="text-xs font-semibold text-muted">Diagnóstico Ejecutivo de Seguridad</span>
            </div>

            <h2 className="mt-3 text-2xl font-black tracking-tight text-ink sm:text-3xl lg:text-4xl leading-tight">
              {critical > 0
                ? `Existen ${critical} vulnerabilidades críticas que comprometen el sistema`
                : high > 0
                ? `Hay ${high} alertas de severidad alta por corregir`
                : rawScore !== null && score >= 85
                ? 'El sistema presenta una postura sólida de protección'
                : 'Se requiere completar la evidencia técnica para certificar la seguridad'}
            </h2>

            <p className="mt-3 text-sm leading-relaxed text-muted max-w-xl">
              {rawScore !== null
                ? `Tu índice actual es ${score} de 100 puntos. Para alcanzar la certificación de producción segura recomendada (${targetScore}%), debes mitigar ${
                    critical + high
                  } alertas prioritarias en los 5 pilares.`
                : 'Inicia o consulta las pruebas realizadas para evaluar la exposición frente a estándares Well-Architected.'}
            </p>

            {/* Target Roadmap Bar */}
            <div className="mt-6 rounded-2xl border border-line bg-canvas/60 p-4 max-w-xl">
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="flex items-center gap-1.5 text-ink">
                  <TrendingUp size={15} className="text-blue-500" />
                  Rumbo a la Meta de Seguridad
                </span>
                <span className="text-blue-500">
                  {gapToTarget !== null ? `Brecha: +${gapToTarget}% para Meta Óptima` : 'Meta: 90%'}
                </span>
              </div>

              {/* Multi-step progress bar */}
              <div className="mt-2.5 relative h-3 w-full overflow-hidden rounded-full bg-line">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${rawScore !== null ? Math.min(100, score) : 0}%`,
                    backgroundColor: score >= 85 ? '#10b981' : score >= 60 ? '#f59e0b' : '#f43f5e',
                  }}
                />
                {/* 90% Target line */}
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-emerald-400 z-10"
                  style={{ left: '90%' }}
                  title="Meta de cumplimiento (90%)"
                />
              </div>

              <div className="mt-2 flex justify-between text-[11px] text-muted">
                <span>0% Crítico</span>
                <span className="font-semibold text-ink">Actual: {rawScore !== null ? `${score}%` : '—'}</span>
                <span className="font-bold text-emerald-500">Meta: 90% (Producción)</span>
                <span>100%</span>
              </div>
            </div>

            {/* CTAs */}
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                onClick={() => priorityFindings[0] && onFinding(priorityFindings[0].id)}
                disabled={!priorityFindings.length}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-xs sm:text-sm font-bold text-white shadow-sm hover:bg-blue-700 disabled:opacity-40 transition-all cursor-pointer"
              >
                <Flame size={16} />
                <span>Corregir {critical + high} Alertas Prioritarias</span>
                <ArrowRight size={15} />
              </button>

              <button
                onClick={onAdvisor}
                className="inline-flex items-center gap-2 rounded-xl border border-line bg-card px-4 py-3 text-xs sm:text-sm font-bold text-ink hover:bg-canvas hover:border-line-2 transition-all cursor-pointer shadow-xs"
              >
                <Sparkles size={16} className="text-violet-500" />
                <span>Plan IA de Remediación</span>
              </button>
            </div>
          </div>

          {/* Right Column: Score Circular Gauge + Quick Breakdown */}
          <div className="flex flex-col items-center justify-center rounded-2xl border border-line/80 bg-canvas/40 p-6 lg:p-7 text-center">
            <div className="relative h-44 w-44" role="img" aria-label={`Índice de seguridad: ${score}%`}>
              <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
                <circle cx="60" cy="60" r="45" fill="none" stroke="var(--color-line)" strokeWidth="10" />
                <circle
                  cx="60"
                  cy="60"
                  r="45"
                  fill="none"
                  stroke={score >= 80 ? '#10b981' : score >= 50 ? '#f59e0b' : '#f43f5e'}
                  strokeWidth="10"
                  strokeLinecap="round"
                  strokeDasharray={`${circumference * (score / 100)} ${circumference}`}
                  className="transition-all duration-1000 ease-out"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-4xl font-black tabular-nums tracking-tight text-ink">
                  {rawScore !== null ? `${score}%` : '—'}
                </span>
                <span className="text-[11px] font-bold text-muted uppercase tracking-wider mt-0.5">
                  Índice de Seguridad
                </span>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 w-full text-left">
              <div className="rounded-xl border border-line/60 bg-card p-3">
                <span className="text-[10px] font-bold uppercase text-muted">Cobertura Técnica</span>
                <div className="text-base font-black text-blue-500 tabular-nums">
                  {rawCoverage !== null ? `${coverage}%` : '—'}
                </div>
                <p className="text-[10px] text-muted">Pruebas concluyentes</p>
              </div>

              <div className="rounded-xl border border-line/60 bg-card p-3">
                <span className="text-[10px] font-bold uppercase text-muted">Controles Verificados</span>
                <div className="text-base font-black text-emerald-500 tabular-nums">
                  {passedControls}/{allControls.length}
                </div>
                <p className="text-[10px] text-muted">Sin fallo observado</p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer info note */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-line/60 pt-4 text-xs text-muted">
          <span>Esta medición describe evidencia observada; no constituye una certificación estática.</span>
          <button
            onClick={() => setShowAdvancedStats(!showAdvancedStats)}
            className="font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
          >
            {showAdvancedStats ? 'Ocultar desglose técnico del motor' : 'Ver desglose técnico del motor'}
          </button>
        </div>
      </section>

      {/* 2. Key Metrics Grid (4 KPI Cards) */}
      <section aria-label="Indicadores clave de seguridad" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {/* KPI 1 */}
        <div className="rounded-2xl border border-line bg-card p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-muted">Índice Global</span>
            <div className="rounded-xl bg-blue-500/10 p-2 text-blue-500">
              <ShieldCheck size={20} />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-ink tabular-nums">
              {rawScore !== null ? `${score}%` : '—'}
            </span>
            <span className="text-xs text-muted">/ 100 pts</span>
          </div>
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-line">
            <div
              className="h-full rounded-full"
              style={{
                width: `${score}%`,
                backgroundColor: score >= 80 ? '#10b981' : score >= 50 ? '#f59e0b' : '#f43f5e',
              }}
            />
          </div>
          <p className="mt-2 text-[11px] text-muted">Puntaje ponderado de control de riesgos</p>
        </div>

        {/* KPI 2 */}
        <button
          onClick={onCoverage}
          className="rounded-2xl border border-line bg-card p-5 shadow-xs text-left hover:border-purple-500/40 hover:bg-canvas/50 transition-all cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-muted">Cobertura de Auditoría</span>
            <div className="rounded-xl bg-purple-500/10 p-2 text-purple-500">
              <SearchCheck size={20} />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-ink tabular-nums">
              {rawCoverage !== null ? `${coverage}%` : '—'}
            </span>
            <span className="text-xs text-muted">del alcance</span>
          </div>
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-line">
            <div className="h-full rounded-full bg-purple-500" style={{ width: `${coverage}%` }} />
          </div>
          <p className="mt-2 text-[11px] text-muted flex items-center justify-between">
            <span>SAST, secretos, dependencias e IaC</span>
            <span className="font-bold text-purple-500">Ver alcance ➔</span>
          </p>
        </button>

        {/* KPI 3 */}
        <div className="rounded-2xl border border-line bg-card p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-muted">Alertas Prioritarias</span>
            <div className="rounded-xl bg-rose-500/10 p-2 text-rose-500">
              <ShieldAlert size={20} />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-rose-500 tabular-nums">
              {critical + high}
            </span>
            <span className="text-xs text-muted">
              ({critical} críticas, {high} altas)
            </span>
          </div>
          <div className="mt-3 flex gap-1">
            <span className="h-1.5 flex-1 rounded-full bg-rose-500" title={`${critical} Críticas`} />
            <span className="h-1.5 flex-1 rounded-full bg-orange-500" title={`${high} Altas`} />
            <span className="h-1.5 flex-1 rounded-full bg-amber-500" title={`${medium} Medias`} />
            <span className="h-1.5 flex-1 rounded-full bg-blue-500" title={`${low} Bajas`} />
          </div>
          <p className="mt-2 text-[11px] text-muted">{findings.length} vulnerabilidades puntuables</p>
        </div>

        {/* KPI 4 */}
        <div className="rounded-2xl border border-line bg-card p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-muted">Eficacia de Controles</span>
            <div className="rounded-xl bg-emerald-500/10 p-2 text-emerald-500">
              <CheckCircle2 size={20} />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-emerald-500 tabular-nums">
              {allControls.length ? Math.round((passedControls / allControls.length) * 100) : 0}%
            </span>
            <span className="text-xs text-muted">({passedControls} aprobados)</span>
          </div>
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-line">
            <div
              className="h-full rounded-full bg-emerald-500"
              style={{
                width: `${allControls.length ? (passedControls / allControls.length) * 100 : 0}%`,
              }}
            />
          </div>
          <p className="mt-2 text-[11px] text-muted">
            {failedControls} fallos · {pendingControls} pendientes
          </p>
        </div>
      </section>

      {/* 3. Los 5 Pilares de Seguridad - Executive Snapshot */}
      <section aria-label="Resumen de los 5 pilares" className="rounded-3xl border border-line bg-card p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-line pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-blue-500/10 px-2 py-0.5 text-xs font-bold text-blue-500">
                Well-Architected Security
              </span>
              <h3 className="text-lg font-black text-ink">Estado de los 5 Pilares de Seguridad</h3>
            </div>
            <p className="mt-1 text-xs text-muted">
              Haz clic en cualquier pilar para explorar sus controles y plan de remediación específico.
            </p>
          </div>

          <button
            onClick={() => onArea?.('identity')}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
          >
            <span>Ver detalle completo de los 5 Pilares</span>
            <ArrowRight size={13} />
          </button>
        </div>

        {/* 5 Pillar Mini Cards */}
        <div className="mt-5 grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-5">
          {areas.map((area, idx) => {
            const pillarScore = computePillarScore(area);
            const statusClass =
              area.critical > 0
                ? 'text-rose-500 bg-rose-500/10'
                : area.high > 0 || area.failed > 0
                ? 'text-amber-500 bg-amber-500/10'
                : area.passed > 0
                ? 'text-emerald-500 bg-emerald-500/10'
                : 'text-muted bg-slate-500/10';

            return (
              <button
                key={area.id}
                onClick={() => onArea?.(area.id)}
                className="group rounded-2xl border border-line bg-canvas/40 p-4 text-left hover:border-blue-500/50 hover:bg-card hover:shadow-md transition-all cursor-pointer"
              >
                <div className="flex items-center justify-between text-xs text-muted mb-2">
                  <span className="font-bold">Pilar {idx + 1}</span>
                  <span className="font-mono text-xs font-black text-ink">
                    {pillarScore !== null ? `${pillarScore}%` : '—'}
                  </span>
                </div>

                <strong className="block text-sm font-bold text-ink group-hover:text-blue-500 transition-colors">
                  {area.label}
                </strong>

                {/* Progress bar */}
                <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-line">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${pillarScore ?? 0}%`,
                      backgroundColor:
                        pillarScore === null
                          ? '#94a3b8'
                          : pillarScore >= 80
                          ? '#10b981'
                          : pillarScore >= 50
                          ? '#f59e0b'
                          : '#f43f5e',
                    }}
                  />
                </div>

                <div className="mt-3 flex items-center justify-between text-[11px]">
                  <span className={`rounded-md px-1.5 py-0.5 font-bold ${statusClass}`}>
                    {area.critical > 0 ? `${area.critical} críticos` : area.status}
                  </span>
                  <span className="text-muted tabular-nums">
                    {area.passed}/{area.controls.length} ok
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* 4. Top Quick Wins (Prioridades de Remediación Inmediata) */}
      {priorityFindings.length > 0 && (
        <section aria-label="Acciones prioritarias" className="rounded-3xl border border-line bg-card p-6 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-line pb-4">
            <div>
              <div className="flex items-center gap-2">
                <Flame size={18} className="text-rose-500" />
                <h3 className="text-lg font-black text-ink">Acciones de Mayor Impacto (Quick Wins)</h3>
              </div>
              <p className="mt-1 text-xs text-muted">
                Subsanar estas alertas críticas aumentará de inmediato tu índice de seguridad.
              </p>
            </div>

            <button
              onClick={() => onFinding(priorityFindings[0].id)}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
            >
              <span>Explorar todos los hallazgos ({findings.length})</span>
              <ArrowRight size={13} />
            </button>
          </div>

          <div className="mt-4 grid gap-3.5 md:grid-cols-3">
            {priorityFindings.map((finding, idx) => (
              <div
                key={finding.id}
                className="flex flex-col justify-between rounded-2xl border border-line bg-canvas/40 p-4 hover:border-blue-500/40 hover:bg-card transition-all"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`rounded-md px-2 py-0.5 text-[10px] font-black ${
                        finding.severity === 'CRITICAL'
                          ? 'bg-rose-500/15 text-rose-500'
                          : 'bg-orange-500/15 text-orange-500'
                      }`}
                    >
                      {severityNames[finding.severity] ?? finding.severity}
                    </span>
                    <span className="text-[11px] font-bold text-muted">Prioridad #{idx + 1}</span>
                  </div>

                  <strong className="mt-2.5 block text-xs font-bold text-ink leading-snug">
                    {finding.title}
                  </strong>

                  <p className="mt-1.5 text-xs text-muted line-clamp-2 leading-relaxed">
                    {finding.recommendation}
                  </p>
                </div>

                <button
                  onClick={() => onFinding(finding.id)}
                  className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-blue-500 hover:text-blue-600 cursor-pointer pt-3 border-t border-line/60"
                >
                  <span>Ver evidencia y cómo corregir</span>
                  <ArrowRight size={13} />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 5. Detected Technology Stack with Authentic Logos */}
      {components.length > 0 && (
        <section aria-label="Tecnologías detectadas" className="rounded-3xl border border-line bg-card p-6 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-line pb-4">
            <div>
              <div className="flex items-center gap-2">
                <Server size={18} className="text-blue-500" />
                <h3 className="text-lg font-black text-ink">Stack Tecnológico & Servicios Detectados</h3>
              </div>
              <p className="mt-1 text-xs text-muted">
                Componentes de software evidenciados en el artefacto con opciones de modernización en AWS.
              </p>
            </div>

            {onArchitecture && (
              <button
                onClick={onArchitecture}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
              >
                <span>Explorar arquitectura completa</span>
                <ArrowRight size={13} />
              </button>
            )}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {components.map((comp) => (
              <div
                key={comp.id}
                className="flex items-center gap-3 rounded-xl border border-line bg-canvas/40 p-3 hover:bg-card transition-colors"
              >
                <TechIcon name={comp.name} size={24} showBadge />
                <div className="min-w-0">
                  <strong className="block text-xs font-bold text-ink truncate">{comp.name}</strong>
                  <span className="text-[10px] text-muted capitalize truncate block">{comp.category}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 6. Expandable Statistical Breakdown (Satisfies SecurityMetrics contract) */}
      {showAdvancedStats && (
        <div className="animate-fade-in">
          <SecurityMetrics key={assessment.id} assessment={assessment} />
        </div>
      )}
    </div>
  );
}
