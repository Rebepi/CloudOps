import { Boxes, Layers3, LoaderCircle, ScanSearch, SearchX } from 'lucide-react';
import type { EvaluacionSeguridad, HallazgoSeguridad, Proyecto } from '../../types/cloud';
import { Card } from '../ui/Card';
import { RepositoryTree } from './RepositoryTree';
import { AssessmentStatistics } from './AssessmentStatistics';
import { AssessmentOverview } from './AssessmentOverview';
import { SecurityDimensions } from './SecurityDimensions';
import { SupplyChainPanel } from './SupplyChainPanel';

type EvidenceView = 'overview' | 'architecture' | 'coverage';
type ArchitectureComponent = { id: string; name: string; category: 'client' | 'api' | 'data' | 'runtime' | 'delivery' | 'security' | 'observability' | 'integration'; confidence: 'high' | 'medium'; evidence: string[] };
type CoverageDomain = { id: string; label: string; status: 'measured' | 'partial' | 'not-detected'; files: number; detail: string };
type LayerBreakdown = { id: 'backend' | 'frontend' | 'infrastructure' | 'dependencies' | 'shared'; label: string; candidateFiles: number; analyzedFiles: number; readCoverage: number; findings: number; counts: Record<string, number> };
type PlatformCandidate = { service: string; purpose: string; basedOn: string; evidence: string[] };

const categoryLabels: Record<ArchitectureComponent['category'], string> = {
  client: 'Cliente / frontend', api: 'API / backend', data: 'Datos', runtime: 'Ejecución y contenedores',
  delivery: 'Entrega e infraestructura', security: 'Identidad y seguridad', observability: 'Observabilidad', integration: 'Integraciones',
};
const statusLabels: Record<CoverageDomain['status'], string> = { measured: 'Medido', partial: 'Parcial', 'not-detected': 'No detectado' };

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }

function architectureFrom(assessment: EvaluacionSeguridad | null) {
  const raw = assessment?.summary.detectedArchitecture;
  if (!isRecord(raw) || !Array.isArray(raw.components)) return [];
  return raw.components.filter((component): component is ArchitectureComponent => isRecord(component)
    && typeof component.id === 'string' && typeof component.name === 'string'
    && typeof component.category === 'string' && Array.isArray(component.evidence));
}

function coverageFrom(assessment: EvaluacionSeguridad | null) {
  const raw = assessment?.summary.coverageMatrix;
  if (!Array.isArray(raw)) return [];
  return raw.filter((domain): domain is CoverageDomain => isRecord(domain)
    && typeof domain.id === 'string' && typeof domain.label === 'string'
    && typeof domain.status === 'string' && typeof domain.files === 'number');
}

function layersFrom(assessment: EvaluacionSeguridad | null) {
  const raw = assessment?.summary.layerBreakdown;
  if (!Array.isArray(raw)) return [];
  return raw.filter((layer): layer is LayerBreakdown => isRecord(layer)
    && typeof layer.id === 'string' && typeof layer.label === 'string'
    && typeof layer.candidateFiles === 'number' && typeof layer.analyzedFiles === 'number'
    && typeof layer.readCoverage === 'number' && typeof layer.findings === 'number');
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

function AwsCoverage({ assessment }: { assessment: EvaluacionSeguridad }) {
  const summary = assessment.summary;
  const services = [
    { name: 'IAM', available: true, detail: `${summary.users ?? 0} usuario(s) y ${summary.roles ?? 0} rol(es) inventariados` },
    { name: 'CloudTrail', available: true, detail: summary.trails == null ? 'Control consultado; inventario no registrado en esta ejecución histórica' : `${summary.trails} trail(s) observados` },
    { name: 'Amazon S3', available: summary.s3Available === true, detail: summary.s3Available ? `${summary.s3Buckets ?? 0} bucket(s) inspeccionados` : summary.s3Error ?? 'Sin permisos o servicio no observable' },
    { name: 'Security Groups', available: summary.networkAvailable === true, detail: summary.networkAvailable ? `${summary.securityGroups ?? 0} grupo(s) inspeccionados` : summary.networkError ?? 'Sin permisos o servicio no observable' },
    { name: 'Amazon RDS', available: summary.rdsAvailable === true, detail: summary.rdsAvailable ? `${summary.rdsInstances ?? 0} instancia(s) inspeccionadas` : summary.rdsError ?? 'Sin permisos o servicio no observable' },
    { name: 'Security Hub', available: summary.securityHubAvailable === true, detail: summary.securityHubAvailable ? 'Hallazgos CSPM consultados' : summary.securityHubError ?? 'No disponible' },
    { name: 'AWS Config', available: summary.configAvailable === true, detail: summary.configAvailable ? `${summary.configRules ?? 0} regla(s) y ${summary.configRecorders ?? 0} recorder(s)` : summary.configError ?? 'No disponible' },
    { name: 'Amazon Inspector', available: summary.inspectorAvailable === true && summary.inspectorStatus !== 'DISABLED', detail: summary.inspectorStatus === 'DISABLED' ? 'Servicio deshabilitado en la cuenta/región' : summary.inspectorAvailable ? `${summary.inspectorCoveredResources ?? 0} recurso(s) cubiertos` : summary.inspectorError ?? 'No disponible' },
  ];
  return <Card>
    <AssessmentStatistics assessment={assessment} />
    <SecurityDimensions dimensions={assessment.dimensionScores} analyzers={assessment.analyzers} />
    <div className="mt-5 border-t border-line pt-5"><h3 className="text-sm font-bold text-ink">Fuentes AWS consultadas</h3>
      <div className="mt-3 divide-y divide-line">{services.map((service) => <div key={service.name} className="grid gap-2 py-3 text-xs sm:grid-cols-[150px_90px_1fr]"><strong className="text-ink">{service.name}</strong><span className={service.available ? 'text-blue-400' : 'text-amber-400'}>{service.available ? 'Medido' : 'No medido'}</span><span className="text-muted">{service.detail}</span></div>)}</div>
    </div>
    <p className="mt-4 border-t border-line pt-4 text-[11px] text-muted">Las fuentes sin permisos o deshabilitadas reducen la cobertura. Cero recursos observados no demuestra que el sistema sea seguro.</p>
  </Card>;
}

function FindingPriority({ findings }: { findings: HallazgoSeguridad[] }) {
  const order = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFORMATIONAL'];
  const prioritized = [...findings].filter((finding) => ['open', 'in_progress'].includes(finding.status))
    .sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity)).slice(0, 5);
  if (!prioritized.length) return <p className="text-xs text-muted">No hay remediaciones abiertas en esta evaluación.</p>;
  return <div className="divide-y divide-line">{prioritized.map((finding, index) => <div key={finding.id} className="py-3">
    <div className="flex items-start gap-2"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-rose-500/10 text-[10px] font-black text-rose-400">{index + 1}</span><div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2"><strong className="text-xs text-ink">{finding.title}</strong><span className="text-[9px] font-bold text-rose-400">{finding.severity}</span></div>
      <p className="mt-1 text-[11px] text-muted">{finding.recommendation}</p>
      {finding.resource && <p className="mt-1 truncate font-mono text-[9px] text-blue-400">{finding.resource}</p>}
    </div></div>
  </div>)}</div>;
}

export function ProjectArchitectureAdvisor({ project, assessment, findings, view, processing = false, history = [] }: { project: Proyecto; assessment: EvaluacionSeguridad | null; findings: HallazgoSeguridad[]; view: EvidenceView; processing?: boolean; history?: EvaluacionSeguridad[] }) {
  if (processing || assessment?.status === 'pending' || assessment?.status === 'running') return <Card className="py-12" >
    <div role="status" aria-live="polite" className="mx-auto max-w-xl text-center"><div className="relative mx-auto mb-5 w-fit"><ScanSearch size={38} className="text-blue-400" /><LoaderCircle size={18} className="absolute -bottom-1 -right-3 animate-spin text-blue-500" /></div><h2 className="text-base font-bold text-ink">Evaluación en curso</h2><p className="mt-2 text-sm text-muted">Estamos procesando la evidencia de {project.name}. Los resultados, la arquitectura y la cobertura aparecerán al finalizar.</p><div role="progressbar" aria-label="Procesando evaluación" className="mt-6 h-1.5 overflow-hidden rounded-full bg-blue-500/10"><div className="h-full w-full animate-pulse bg-blue-500/60" /></div><p className="mt-3 text-[11px] text-muted">{assessment?.status === 'pending' ? 'En cola para iniciar el análisis.' : 'Procesando comprobaciones. Esta vista se actualiza automáticamente.'}</p></div>
  </Card>;
  if (assessment?.status === 'failed') return <Card><h2 className="font-bold text-rose-400">No se pudo completar la evaluación</h2><p className="mt-2 text-xs text-muted">{assessment.errorMessage ?? 'Revisa la conexión y vuelve a intentarlo desde Nueva evaluación.'}</p></Card>;
  if (assessment?.status === 'completed' && assessment.assessmentType === 'aws-account' && view !== 'overview') {
    return view === 'architecture' ? <EmptyEvidence project={project} /> : <AwsCoverage assessment={assessment} />;
  }
  if (!isCodeAssessment(assessment) && assessment?.assessmentType !== 'aws-account') return <EmptyEvidence project={project} />;
  const components = architectureFrom(assessment);
  const coverage = coverageFrom(assessment);
  const layers = layersFrom(assessment).filter((layer) => layer.candidateFiles > 0 || layer.findings > 0);

  if (view === 'overview') {
    return <Card>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="min-w-0"><AssessmentOverview key={assessment!.id} assessment={assessment!} history={history} /></div>
        <div className="border-t border-line pt-5 xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0"><h2 className="mb-4 text-sm font-bold text-ink">Prioridad de remediación</h2><FindingPriority findings={findings} />
          <div className="mt-5 border-t border-line pt-4 text-[11px] text-muted"><p className="font-semibold text-ink">Artefacto evaluado</p><p className="mt-1 break-all">{assessment?.artifactName ?? 'ZIP cargado'}</p><p className="mt-2">{components.length} componentes detectados. El puntaje corresponde al riesgo observado dentro de la cobertura indicada.</p></div>
        </div>
      </div>
    </Card>;
  }

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

  const measured = coverage.filter((domain) => domain.status === 'measured').length;
  return <Card>
    <AssessmentStatistics assessment={assessment!} />
    <SecurityDimensions dimensions={assessment?.dimensionScores} analyzers={assessment?.analyzers} />
    <SupplyChainPanel assessment={assessment!} />
    <div className="mt-6 border-t border-line pt-5"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-bold text-ink">Dominios de seguridad observados</h3><span className="text-xs text-blue-400">{measured} de {coverage.length} medidos</span></div>
      <div className="mt-3 divide-y divide-line">{coverage.map((domain) => <div key={domain.id} className="flex items-start justify-between gap-4 py-3"><div><strong className="text-xs text-ink">{domain.label}</strong><p className="mt-1 text-[11px] text-muted">{domain.detail}</p></div><span className="shrink-0 text-[11px] text-blue-400">{statusLabels[domain.status]} · {domain.files} archivos</span></div>)}</div>
    </div>
    {!layers.length && <p className="mt-3 text-xs text-muted">Vuelve a ejecutar el análisis para obtener el desglose por capa.</p>}
    <p className="mt-4 border-t border-line pt-4 text-[11px] text-muted">Un dominio no detectado queda sin medir. El análisis estático se complementa con pruebas de autorización, revisión de lógica de negocio y evaluación del entorno desplegado.</p>
  </Card>;
}
