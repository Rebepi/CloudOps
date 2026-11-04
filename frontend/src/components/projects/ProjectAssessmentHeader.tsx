import { ArrowLeft, CalendarClock, Cloud, FileArchive, FileDown, GitBranch, History, LoaderCircle, Play } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { EvaluacionSeguridad, Proyecto } from '../../types/cloud';
import { assessmentLabel } from '../../lib/assessmentLabels';

const date = (value: string) => new Intl.DateTimeFormat('es-PE', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
export function ProjectAssessmentHeader({ project, selected, assessments, busy, onEvaluate, onExport, onHistory, onSelect }: {
  project: Proyecto; selected: EvaluacionSeguridad | null; assessments: EvaluacionSeguridad[]; busy: boolean;
  onEvaluate: () => void; onExport: () => void; onHistory: () => void; onSelect: (id: string) => void;
}) {
  const label = selected ? assessmentLabel(selected, project) : 'Sin evaluación';
  const SourceIcon = selected?.assessmentType === 'aws-account' ? Cloud : label.includes('ZIP') ? FileArchive : GitBranch;
  return <header className="project-assessment-header">
    <div className="project-heading-line">
      <div className="project-heading-name"><Link to="/projects" aria-label="Volver al portafolio de proyectos" className="project-back-button"><ArrowLeft size={19} aria-hidden="true" /></Link><h1>{project.name}</h1><span className="project-environment">{project.environment}</span></div>
      <div className="project-heading-actions"><button type="button" disabled={busy} onClick={onEvaluate} className="diagnostic-primary">{busy ? <LoaderCircle size={16} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}{busy ? 'Evaluación en curso' : 'Nueva evaluación'}</button><button type="button" disabled={selected?.status !== 'completed'} onClick={onExport} className="diagnostic-secondary"><FileDown size={16} aria-hidden="true" />Exportar</button></div>
    </div>
    <div className="project-heading-context"><div className="project-source-context"><SourceIcon size={15} aria-hidden="true" /><span>{label}</span><span className="project-region">{project.region}</span></div>
      {selected ? <div className="project-assessment-picker"><label><CalendarClock size={15} className="project-picker-icon" aria-hidden="true" /><span className="sr-only">Cambiar evaluación</span><select aria-label="Cambiar evaluación" value={selected.id} onChange={(event) => onSelect(event.target.value)}>{assessments.map((item) => <option key={item.id} value={item.id}>{date(item.completedAt ?? item.startedAt)} · {assessmentLabel(item, project)}</option>)}</select></label><button type="button" onClick={onHistory} className="project-history-button" aria-label="Evaluaciones anteriores"><History size={16} aria-hidden="true" /><span>Historial</span></button></div> : <span className="text-sm text-muted">Inicia un análisis para obtener el diagnóstico.</span>}
    </div>
  </header>;
}
