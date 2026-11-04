import type { EvaluacionSeguridad } from '../../types/cloud';
import { platformCandidates, type ArchitectureComponent } from '../../lib/platformCandidates';
import { ProjectExplorer } from './ProjectExplorer';
import { TechIcon } from '../ui/TechIcon';

export function ArchitectureWorkspace({ assessment, onFinding }: { assessment: EvaluacionSeguridad; onFinding: (id: string) => void; initialView?: string }) {
  return <ProjectExplorer key={assessment.id} assessment={assessment} onFinding={onFinding} />;
}
export function AWSArchitectureOptions({ assessment }: { assessment: EvaluacionSeguridad }) {
  const raw = assessment.summary.detectedArchitecture as { components?: ArchitectureComponent[] } | undefined;
  const components = (raw?.components ?? []).filter((item) => item && typeof item.id === 'string' && Array.isArray(item.evidence));
  const options = platformCandidates(components);
  return <div className="project-aws-options"><p className="project-caption">Alternativas condicionales basadas en evidencia disponible. No implican despliegues ni demuestran compatibilidad, costos o uso en producción. Las referencias nuevas sin corroboración quedan fuera del catálogo.</p><ul>{options.map((option) => <li key={`${option.service}:${option.basedOn}`}><TechIcon name={option.service} size={23} /><div><h3>{option.service}</h3><p>{option.purpose}</p><small>Base: {option.basedOn} · {option.evidence[0]}</small><p className="project-caption">Antes de decidir: validar compatibilidad, requisitos operativos, recuperación y costos.</p></div></li>)}</ul>{!options.length && <p className="project-caption">No hay opciones respaldadas por las tecnologías clasificadas de esta evaluación.</p>}</div>;
}
