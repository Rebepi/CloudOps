import { Boxes, Layers3, LoaderCircle, ScanSearch, SearchX } from 'lucide-react';
import type { ComparacionEvaluacion, EvaluacionSeguridad, HallazgoSeguridad, Proyecto } from '../../types/cloud';
import { OverviewWorkspace } from './OverviewWorkspace';
import { CoverageWorkspace } from './CoverageWorkspace';
import { Card } from '../ui/Card';
import { RepositoryTree } from './RepositoryTree';

type EvidenceView = 'overview' | 'architecture' | 'coverage';
type ArchitectureComponent = { id: string; name: string; category: 'client' | 'api' | 'data' | 'runtime' | 'delivery' | 'security' | 'observability' | 'integration'; confidence: 'high' | 'medium'; evidence: string[] };
type PlatformCandidate = { service: string; purpose: string; basedOn: string; evidence: string[] };

const categoryLabels: Record<ArchitectureComponent['category'], string> = {
  client: 'Cliente / frontend', api: 'API / backend', data: 'Datos', runtime: 'Ejecución y contenedores',
  delivery: 'Entrega e infraestructura', security: 'Identidad y seguridad', observability: 'Observabilidad', integration: 'Integraciones',
};

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }

function architectureFrom(assessment: EvaluacionSeguridad | null) {
  const raw = assessment?.summary.detectedArchitecture;
  if (!isRecord(raw) || !Array.isArray(raw.components)) return [];
  return raw.components.filter((component): component is ArchitectureComponent => isRecord(component)
    && typeof component.id === 'string' && typeof component.name === 'string'
    && typeof component.category === 'string' && Array.isArray(component.evidence));
}

function isCodeAssessment(assessment: EvaluacionSeguridad | null) {
  return assessment?.status === 'completed' && (assessment.assessmentType === 'code' || assessment.assessmentType === 'full');
}

function platformCandidates(components: ArchitectureComponent[]): PlatformCandidate[] {
  const byId = new Map(components.map((component) => [component.id, component]));
  const candidates: PlatformCandidate[] = [];
  const add = (ids: string[], service: string, purpose: string) => {
    const basis = ids.map((id) => byId.get(id)).find(Boolean);
    if (basis) candidates.push({ service, purpose, basedOn: basis.name, evidence: basis.evidence });
  };
  add(['postgresql'], 'Amazon RDS for PostgreSQL / Aurora PostgreSQL', 'Alternativa administrada para la base PostgreSQL detectada; permite Multi-AZ, backups y cifrado gestionado.');
  add(['docker', 'compose'], 'Amazon ECR + ECS Fargate', 'Destino compatible con las imágenes y servicios de contenedor detectados, sin administrar servidores EC2.');
  add(['redis'], 'Amazon ElastiCache for Redis', 'Alternativa administrada para la caché o broker Redis evidenciado.');
  add(['worker'], 'Amazon SQS + ECS/Lambda', 'Desacopla los trabajos en segundo plano detectados y permite medir reintentos y mensajes fallidos.');
  add(['react'], 'Amazon S3 + CloudFront', 'Opción de publicación para el cliente React detectado cuando su compilación sea estática.');
  add(['email'], 'Amazon SES', 'Servicio administrado para el flujo de correo evidenciado en la aplicación.');
  add(['telemetry'], 'Amazon CloudWatch + AWS Distro for OpenTelemetry', 'Centraliza métricas, logs y trazas para la instrumentación encontrada.');
  add(['token-auth'], 'Amazon Cognito o un IdP OIDC corporativo', 'Opción para externalizar identidad y ciclo de vida de tokens detectados en el código.');
  return candidates;
}

function EmptyEvidence({ project }: { project: Proyecto }) {
  return <Card className="py-12 text-center">
    <SearchX size={34} className="mx-auto text-muted" />
    <h2 className="mt-3 text-sm font-bold text-ink">Todavía no existe evidencia de código</h2>
    <p className="mx-auto mt-1 max-w-xl text-xs leading-relaxed text-muted">La arquitectura y la cobertura no se estimarán usando etiquetas. Ejecuta un análisis del ZIP o del repositorio {project.repoOwner && project.repoName ? `${project.repoOwner}/${project.repoName}` : 'conectado'} para construirlas desde archivos reales.</p>
  </Card>;
}

export function ProjectArchitectureAdvisor({ project, assessment, findings, view, processing = false, history = [], comparison, onNavigateToFinding = () => {}, onSelectAssessment = () => {} }: { project: Proyecto; assessment: EvaluacionSeguridad | null; findings: HallazgoSeguridad[]; view: EvidenceView; processing?: boolean; history?: EvaluacionSeguridad[]; comparison?: ComparacionEvaluacion | null; onNavigateToFinding?: (id: string) => void; onSelectAssessment?: (id: string) => void }) {
  if (processing || assessment?.status === 'pending' || assessment?.status === 'running') return <Card className="py-12" >
    <div role="status" aria-live="polite" className="mx-auto max-w-xl text-center"><div className="relative mx-auto mb-5 w-fit"><ScanSearch size={38} className="text-blue-400" /><LoaderCircle size={18} className="absolute -bottom-1 -right-3 animate-spin text-blue-500" /></div><h2 className="text-base font-bold text-ink">Evaluación en curso</h2><p className="mt-2 text-sm text-muted">Estamos procesando la evidencia de {project.name}. Los resultados, la arquitectura y la cobertura aparecerán al finalizar.</p><div role="progressbar" aria-label="Procesando evaluación" className="mt-6 h-1.5 overflow-hidden rounded-full bg-blue-500/10"><div className="h-full w-full animate-pulse bg-blue-500/60" /></div><p className="mt-3 text-[11px] text-muted">{assessment?.status === 'pending' ? 'En cola para iniciar el análisis.' : 'Procesando comprobaciones. Esta vista se actualiza automáticamente.'}</p></div>
  </Card>;
  if (assessment?.status === 'failed') return <Card><h2 className="font-bold text-rose-400">No se pudo completar la evaluación</h2><p className="mt-2 text-xs text-muted">{assessment.errorMessage ?? 'Revisa la conexión y vuelve a intentarlo desde Nueva evaluación.'}</p></Card>;
  if (assessment?.status === 'completed' && assessment.assessmentType === 'aws-account' && view !== 'overview') {
    return view === 'architecture' ? <EmptyEvidence project={project} /> : <CoverageWorkspace key={assessment.id} assessment={assessment} />;
  }
  if (!isCodeAssessment(assessment) && assessment?.assessmentType !== 'aws-account') return <EmptyEvidence project={project} />;
  const components = architectureFrom(assessment);

  if (view === 'overview') return <OverviewWorkspace assessment={assessment!} findings={findings} history={history} comparison={comparison ?? null} onNavigateToFinding={onNavigateToFinding} onSelectAssessment={onSelectAssessment} />;

  if (view === 'architecture') {
    const groups = Object.entries(categoryLabels).map(([category, label]) => ({ category, label, components: components.filter((component) => component.category === category) })).filter((group) => group.components.length);
    const candidates = platformCandidates(components);
    return <Card><div className="flex items-start gap-3 border-b border-line pb-4"><Layers3 size={19} className="mt-0.5 text-blue-500" /><div><h2 className="text-base font-black text-ink">Arquitectura detectada en el repositorio</h2><p className="mt-1 text-xs text-muted">Cada componente incluye los archivos que prueban su presencia. No se dibujan conexiones que el análisis no pueda demostrar.</p></div></div>
      {assessment?.summary.repositoryInventory ? <RepositoryTree key={assessment.id} entries={assessment.summary.repositoryInventory.entries} complete={assessment.summary.repositoryInventory.complete} /> : <p className="mt-5 rounded-xl border border-line bg-canvas/50 p-4 text-xs text-muted">Ejecuta nuevamente el análisis del código para generar el árbol completo de carpetas, módulos y archivos.</p>}
      <div className="mt-5 grid items-start gap-5 border-t border-line pt-4 lg:grid-cols-2">
        <details><summary className="cursor-pointer text-sm font-bold text-ink">Tecnologías detectadas ({components.length})</summary>
          <div className="mt-3 max-h-[420px] overflow-y-auto pr-2"><div className="grid gap-x-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">{groups.map((group) => <section key={group.category} className="min-w-0 border-b border-line py-3"><h3 className="flex items-center gap-2 text-xs font-bold text-blue-400"><Boxes size={14} />{group.label}</h3>{group.components.map((component) => <div key={component.id} className="mt-3 min-w-0"><div className="flex items-center justify-between gap-2"><strong className="text-xs text-ink">{component.name}</strong><span className="text-[10px] text-muted">{component.confidence === 'high' ? 'Alta' : 'Media'}</span></div><details className="mt-1"><summary className="cursor-pointer text-[10px] text-muted">{component.evidence.length} archivos de evidencia</summary><div className="mt-2 space-y-1">{component.evidence.map((file) => <p key={file} className="break-all font-mono text-[10px] text-muted">{file}</p>)}</div></details></div>)}</section>)}</div></div>
          {!groups.length && <p className="mt-3 text-xs text-muted">No se identificaron componentes mediante las firmas actuales.</p>}
        </details>
        {candidates.length > 0 && <details><summary className="cursor-pointer text-sm font-bold text-ink">Servicios AWS sugeridos ({candidates.length})</summary><p className="mt-2 text-[11px] text-muted">Opciones derivadas de tecnologías detectadas; valida capacidad, costos y operación.</p><div className="mt-3 max-h-[420px] divide-y divide-line overflow-y-auto pr-2">{candidates.map((candidate) => <div key={candidate.service} className="py-3"><strong className="text-xs text-blue-400">{candidate.service}</strong><p className="mt-1 text-[11px] leading-relaxed text-muted">{candidate.purpose}</p><details className="mt-2"><summary className="cursor-pointer text-[10px] text-muted">Evidencia: {candidate.basedOn}</summary><p className="mt-1 break-all font-mono text-[10px] text-muted">{candidate.evidence[0]}</p></details></div>)}</div></details>}
      </div>
    </Card>;
  }

  return <CoverageWorkspace key={assessment!.id} assessment={assessment!} />;
}
