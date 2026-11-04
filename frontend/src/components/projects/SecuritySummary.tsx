import { ProjectHelp } from './ProjectHelp';
import { memo, useMemo } from 'react';
import { ArrowRight, ArrowUpRight, CircleAlert, CircleCheck, ShieldAlert, ShieldCheck } from 'lucide-react';
import type { EvaluacionSeguridad } from '../../types/cloud';
import { severityNames } from '../../lib/securityPresentation';
import { diagnosticModel, boundedPercentage } from '../../lib/diagnosticPresentation';
import { useMotionProgress } from '../../hooks/useMotionProgress';
import { isRepositoryFinding } from '../security/findingLayerHelper';
import { DiagnosticControls } from './DiagnosticControls';
import { DiagnosticCoverage } from './DiagnosticCoverage';
import './diagnostic.css';

export interface SecuritySummaryProps {
  assessment: EvaluacionSeguridad;
  onFinding: (id: string) => void;
  onCoverage: () => void;
  onAdvisor: () => void;
  onArchitecture?: () => void;
  onArea?: (id: string) => void;
}
const ScoreIndicator = memo(function ScoreIndicator({ assessment }: { assessment: EvaluacionSeguridad }) {
  const score = boundedPercentage(assessment.score);
  const progress = useMotionProgress(assessment.id);
  return <div className="diagnostic-score">
    <span>Índice de seguridad</span>
    <strong role="img" aria-label={`Índice del motor: ${score === null ? 'sin puntaje' : `${score} de 100`}`}>{score === null ? 'Sin puntaje' : <><span aria-hidden="true">{Math.round(score * progress)}/100</span></>}</strong>
    <div className="diagnostic-score-track" aria-hidden="true"><span style={{ transform: `scaleX(${(score ?? 0) / 100})` }} /></div>
    <ProjectHelp topic="score" label="Cómo se interpreta" />
  </div>;
});

export function SecuritySummary({ assessment, onFinding, onCoverage, onAdvisor }: SecuritySummaryProps) {
  const model = useMemo(() => diagnosticModel(assessment), [assessment]);
  const failures = model.dimensions.reduce((total, dimension) => total + dimension.counts.fail, 0);
  const incomplete = model.dimensions.some((dimension) => !dimension.controls.length || dimension.measured?.state !== 'measured');
  const tone = model.critical || model.high || failures ? 'danger' : incomplete || model.incomplete.length || model.actionable.length ? 'warning' : 'ok';
  const StatusIcon = tone === 'danger' ? ShieldAlert : tone === 'warning' ? CircleAlert : ShieldCheck;
  const title = model.critical ? `${model.critical} alertas críticas requieren revisión` : model.high ? `${model.high} alertas altas requieren revisión` : model.actionable.length ? 'Hay riesgos pendientes de revisar' : failures ? 'Hay controles con fallos observados' : incomplete ? 'Falta evidencia para completar el diagnóstico' : 'No hay alertas pendientes en la evidencia disponible';
  return <div className="project-diagnostic">
    <section className="diagnostic-conclusion" aria-label="Diagnóstico de seguridad" data-tone={tone}>
      <div className="diagnostic-conclusion-main"><span className="diagnostic-status-icon"><StatusIcon size={25} aria-hidden="true" /></span><div><span className="diagnostic-result-label">Diagnóstico realizado · {assessment.assessmentType === 'aws-account' ? 'Cuenta AWS' : assessment.assessmentType === 'full' ? 'Código y cuenta AWS' : 'Código fuente'}</span><h2>{title}<ProjectHelp topic="diagnosis" /></h2><p>{assessment.assessmentType === 'aws-account' ? 'Controles de la cuenta y región consultadas. No se inspeccionó el código.' : assessment.assessmentType === 'full' ? 'Evidencia del código y de AWS. Los recursos de la cuenta no se atribuyen automáticamente al proyecto.' : 'Backend, frontend y configuración compatibles con los analizadores. El código no se ejecutó.'}</p></div></div>
      <ScoreIndicator assessment={assessment} />
    </section>
    <div className="diagnostic-grid">
      <DiagnosticControls dimensions={model.dimensions} onFinding={onFinding} />
      <DiagnosticCoverage assessment={assessment} model={model} onCoverage={onCoverage} />
    </div>
    <section className="diagnostic-panel diagnostic-priorities" aria-labelledby="diagnostic-priorities-title">
      <div className="diagnostic-panel-heading"><div><h2 id="diagnostic-priorities-title">Qué revisar primero<ProjectHelp topic="priorities" /></h2><p>Hasta tres alertas pendientes, ordenadas por severidad y prioridad registrada.</p></div><button type="button" onClick={onAdvisor} className="diagnostic-primary">Abrir plan de mejora<ArrowRight size={16} aria-hidden="true" /></button></div>
      {model.priorities.length ? <div className="diagnostic-priority-list">{model.priorities.map((finding) => <article key={finding.id} className="diagnostic-priority-row">
        <span className="diagnostic-severity" data-tone={finding.severity === 'CRITICAL' || finding.severity === 'HIGH' ? 'danger' : 'warning'}><CircleAlert size={15} aria-hidden="true" />{severityNames[finding.severity]}</span>
        <div className="diagnostic-priority-content"><div><span className="diagnostic-origin">{isRepositoryFinding(finding) ? 'Código' : 'Cuenta AWS'}</span><span className="diagnostic-priority-source">{finding.source}</span></div><h3>{finding.title}</h3>{finding.resource && <p>{finding.resource}</p>}</div>
        <button type="button" className="diagnostic-evidence-button" onClick={() => onFinding(finding.id)} aria-label={`Revisar evidencia: ${finding.title}`}>Revisar evidencia<ArrowUpRight size={15} aria-hidden="true" /></button>
      </article>)}</div> : <p className="diagnostic-no-priorities"><CircleCheck size={19} aria-hidden="true" />No hay alertas pendientes. Revisa las comprobaciones incompletas antes de concluir que la plataforma está protegida.</p>}
    </section>
  </div>;
}
