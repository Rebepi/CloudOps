import { AlertTriangle, Boxes, CheckCircle2, FileCode2, GitCommit, Layers3, SearchX, ShieldAlert } from 'lucide-react';
import type { EvaluacionSeguridad, HallazgoSeguridad, Proyecto } from '../../types/cloud';
import { Card } from '../ui/Card';

type EvidenceView = 'overview' | 'architecture' | 'coverage';
type ArchitectureComponent = { id: string; name: string; category: 'client' | 'api' | 'data' | 'runtime' | 'delivery' | 'security' | 'observability' | 'integration'; confidence: 'high' | 'medium'; evidence: string[] };
type CoverageDomain = { id: string; label: string; status: 'measured' | 'partial' | 'not-detected'; files: number; detail: string };
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
  return <Card><div className="flex flex-col gap-3 border-b border-line pb-4 sm:flex-row sm:items-start sm:justify-between"><div><h2 className="text-base font-black text-ink">Cobertura AWS verificada</h2><p className="mt-1 text-xs text-muted">Solo se marca como medido lo que respondió mediante las APIs de solo lectura de la cuenta y región configuradas.</p></div><span className="w-fit rounded-full border border-blue-500/25 bg-blue-500/10 px-3 py-1 text-[10px] font-bold text-blue-400">{summary.observedControls ?? 0} de {summary.totalControls ?? 0} controles observados</span></div>
    <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-2">{services.map((service) => <article key={service.name} className="rounded-2xl border border-line bg-canvas/50 p-4"><div className="flex items-center justify-between gap-3"><strong className="text-xs text-ink">{service.name}</strong><span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold ${service.available ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400' : 'border-amber-500/25 bg-amber-500/10 text-amber-400'}`}>{service.available ? 'Medido' : 'No medido'}</span></div><p className="mt-2 text-[11px] leading-relaxed text-muted">{service.detail}</p></article>)}</div>
    <p className="mt-5 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 text-[11px] leading-relaxed text-muted">Un servicio sin recursos devuelve cero elementos; un servicio sin permisos o deshabilitado aparece como no medido y reduce la cobertura. La ausencia de hallazgos no se convierte automáticamente en “seguro”.</p>
  </Card>;
}

function FindingPriority({ findings }: { findings: HallazgoSeguridad[] }) {
  const order = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFORMATIONAL'];
  const prioritized = [...findings].filter((finding) => ['open', 'in_progress'].includes(finding.status))
    .sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity)).slice(0, 5);
  if (!prioritized.length) return <p className="text-xs text-muted">No hay remediaciones abiertas en esta evaluación.</p>;
  return <div className="space-y-2">{prioritized.map((finding, index) => <div key={finding.id} className="rounded-xl border border-line bg-canvas/60 p-3">
    <div className="flex items-start gap-2"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-rose-500/10 text-[10px] font-black text-rose-400">{index + 1}</span><div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2"><strong className="text-xs text-ink">{finding.title}</strong><span className="text-[9px] font-bold text-rose-400">{finding.severity}</span></div>
      <p className="mt-1 text-[11px] text-muted">{finding.recommendation}</p>
      {finding.resource && <p className="mt-1 truncate font-mono text-[9px] text-blue-400">{finding.resource}</p>}
    </div></div>
  </div>)}</div>;
}

export function ProjectArchitectureAdvisor({ project, assessment, findings, view }: { project: Proyecto; assessment: EvaluacionSeguridad | null; findings: HallazgoSeguridad[]; view: EvidenceView }) {
  if (assessment?.status === 'completed' && assessment.assessmentType === 'aws-account') {
    return view === 'architecture' ? <EmptyEvidence project={project} /> : <AwsCoverage assessment={assessment} />;
  }
  if (!isCodeAssessment(assessment)) return <EmptyEvidence project={project} />;
  const components = architectureFrom(assessment);
  const coverage = coverageFrom(assessment);

  if (view === 'overview') {
    const critical = findings.filter((finding) => finding.severity === 'CRITICAL').length;
    const high = findings.filter((finding) => finding.severity === 'HIGH').length;
    return <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
      <Card className="xl:col-span-2"><div className="flex items-center gap-2 border-b border-line pb-3"><ShieldAlert size={17} className="text-rose-500" /><h2 className="text-sm font-bold text-ink">Prioridad de remediación medida</h2></div><div className="mt-4"><FindingPriority findings={findings} /></div></Card>
      <div className="space-y-4"><Card><h2 className="text-sm font-bold text-ink">Alcance de la evidencia</h2><dl className="mt-3 space-y-2 text-xs">
        <div className="flex justify-between"><dt className="text-muted">Archivos analizados</dt><dd className="font-bold text-ink">{assessment?.summary.filesAnalyzed ?? 0}</dd></div>
        <div className="flex justify-between"><dt className="text-muted">Dependencias inventariadas</dt><dd className="font-bold text-ink">{assessment?.summary.dependencyCount ?? 0}</dd></div>
        <div className="flex justify-between"><dt className="text-muted">Componentes evidenciados</dt><dd className="font-bold text-ink">{components.length}</dd></div>
        <div className="flex justify-between"><dt className="text-muted">Críticos / altos</dt><dd className="font-bold text-rose-500">{critical} / {high}</dd></div>
      </dl></Card><Card><div className="flex items-center gap-2"><GitCommit size={15} className="text-blue-400" /><h2 className="text-sm font-bold text-ink">Artefacto evaluado</h2></div><p className="mt-2 break-all text-[11px] text-muted">{assessment?.artifactName ?? 'ZIP cargado'}</p>{assessment?.artifactSha256 && <p className="mt-2 break-all font-mono text-[9px] text-muted">SHA-256: {assessment.artifactSha256}</p>}<p className="mt-3 text-[10px] leading-relaxed text-amber-400">El puntaje representa únicamente riesgo estático observado dentro de la cobertura indicada.</p></Card></div>
    </div>;
  }

  if (view === 'architecture') {
    const groups = Object.entries(categoryLabels).map(([category, label]) => ({ category, label, components: components.filter((component) => component.category === category) })).filter((group) => group.components.length);
    const candidates = platformCandidates(components);
    return <Card><div className="flex items-start gap-3 border-b border-line pb-4"><Layers3 size={19} className="mt-0.5 text-blue-500" /><div><h2 className="text-base font-black text-ink">Arquitectura detectada en el repositorio</h2><p className="mt-1 text-xs text-muted">Cada componente incluye los archivos que prueban su presencia. No se dibujan conexiones que el análisis no pueda demostrar.</p></div></div>
      {groups.length ? <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">{groups.map((group) => <section key={group.category} className="rounded-2xl border border-line bg-canvas/50 p-4"><div className="flex items-center gap-2"><Boxes size={15} className="text-blue-400" /><h3 className="text-xs font-bold uppercase tracking-wider text-ink">{group.label}</h3></div><div className="mt-3 space-y-2">{group.components.map((component) => <article key={component.id} className="rounded-xl border border-line bg-card p-3"><div className="flex items-center justify-between gap-2"><strong className="text-xs text-ink">{component.name}</strong><span className="text-[9px] font-bold text-emerald-400">Evidencia {component.confidence === 'high' ? 'alta' : 'media'}</span></div><div className="mt-2 space-y-1">{component.evidence.map((file) => <p key={file} className="truncate font-mono text-[9px] text-muted" title={file}>{file}</p>)}</div></article>)}</div></section>)}</div>
        : <div className="py-10 text-center"><FileCode2 size={30} className="mx-auto text-muted" /><p className="mt-2 text-xs text-muted">No se identificaron componentes mediante las firmas actuales.</p></div>}
      {candidates.length > 0 && <section className="mt-6 border-t border-line pt-5"><h3 className="text-sm font-bold text-ink">Servicios AWS candidatos basados en evidencia</h3><p className="mt-1 text-[11px] text-muted">Son opciones de implementación derivadas de tecnologías detectadas, no recursos confirmados como desplegados.</p><div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">{candidates.map((candidate) => <article key={candidate.service} className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-4"><strong className="text-xs text-blue-400">{candidate.service}</strong><p className="mt-1.5 text-[11px] leading-relaxed text-muted">{candidate.purpose}</p><div className="mt-2 border-t border-blue-500/10 pt-2"><span className="text-[9px] font-bold uppercase tracking-wider text-muted">Derivado de {candidate.basedOn}</span>{candidate.evidence.slice(0, 2).map((file) => <p key={file} className="mt-1 truncate font-mono text-[9px] text-muted" title={file}>{file}</p>)}</div></article>)}</div></section>}
    </Card>;
  }

  const measured = coverage.filter((domain) => domain.status === 'measured').length;
  return <Card><div className="flex flex-col gap-3 border-b border-line pb-4 sm:flex-row sm:items-start sm:justify-between"><div><h2 className="text-base font-black text-ink">Cobertura verificable</h2><p className="mt-1 text-xs text-muted">Un dominio no detectado no se considera seguro: significa que no hubo evidencia suficiente para medirlo.</p></div><span className="w-fit rounded-full border border-blue-500/25 bg-blue-500/10 px-3 py-1 text-[10px] font-bold text-blue-400">{measured} de {coverage.length} dominios medidos</span></div>
    <div className="mt-5 space-y-2.5">{coverage.map((domain) => <article key={domain.id} className="grid grid-cols-[auto_1fr] gap-3 rounded-2xl border border-line bg-canvas/50 p-4 sm:grid-cols-[auto_1fr_auto]">
      {domain.status === 'measured' ? <CheckCircle2 size={18} className="text-emerald-500" /> : domain.status === 'partial' ? <AlertTriangle size={18} className="text-amber-500" /> : <SearchX size={18} className="text-muted" />}
      <div><h3 className="text-xs font-bold text-ink">{domain.label}</h3><p className="mt-1 text-[11px] leading-relaxed text-muted">{domain.detail}</p></div>
      <div className="col-start-2 flex items-center gap-2 sm:col-start-auto sm:justify-end"><span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold ${domain.status === 'measured' ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400' : domain.status === 'partial' ? 'border-amber-500/25 bg-amber-500/10 text-amber-400' : 'border-line bg-card text-muted'}`}>{statusLabels[domain.status]}</span><span className="text-[10px] text-muted">{domain.files} archivo(s)</span></div>
    </article>)}</div>
    <div className="mt-5 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 text-[11px] leading-relaxed text-muted"><strong className="text-amber-400">Límites:</strong> este análisis no sustituye DAST, pentesting, revisión manual de lógica de negocio, pruebas de autorización ni verificación del entorno desplegado.</div>
  </Card>;
}
