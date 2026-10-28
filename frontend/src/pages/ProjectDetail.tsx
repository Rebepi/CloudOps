import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Play, FileDown, LayoutDashboard, Fingerprint, Layers3, ShieldAlert, ScanSearch, BrainCircuit, History, LoaderCircle } from 'lucide-react';
import { api } from '../lib/api';
import { useAws } from '../hooks/useAws';
import type { AwsConnectionStatus, ComparacionEvaluacion, EvaluacionSeguridad, Proyecto } from '../types/cloud';
import { assessmentLabel } from '../lib/assessmentLabels';
import { SecurityReportModal } from '../components/reports/SecurityReportModal';
import { NewAssessmentModal } from '../components/projects/NewAssessmentModal';
import { SecuritySummary } from '../components/projects/SecuritySummary';
import { ProtectionWorkspace } from '../components/projects/ProtectionWorkspace';
import { ArchitectureWorkspace } from '../components/projects/ArchitectureWorkspace';
import { FindingsWorkspace } from '../components/projects/FindingsWorkspace';
import { CoverageWorkspace } from '../components/projects/CoverageWorkspace';
import { AdvisoryPanel } from '../components/projects/AdvisoryPanel';
import { AssessmentOverview } from '../components/projects/AssessmentOverview';
import { AssessmentComparisonPanel } from '../components/projects/AssessmentComparisonPanel';

type WorkspaceTab = 'overview' | 'protection' | 'architecture' | 'findings' | 'coverage' | 'advisor' | 'evolution';
export default function ProjectDetail() {
  const { projectId = '' } = useParams();
  const awsConnection = useAws<AwsConnectionStatus>('/aws/connection');
  const [project, setProject] = useState<Proyecto | null>(null);
  const [assessments, setAssessments] = useState<EvaluacionSeguridad[]>([]);
  const [selected, setSelected] = useState<EvaluacionSeguridad | null>(null);
  const [comparison, setComparison] = useState<ComparacionEvaluacion | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [runningRepository, setRunningRepository] = useState<false | 'code' | 'full'>(false);
  const [assessmentMenuOpen, setAssessmentMenuOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>('overview');
  const [protectionArea, setProtectionArea] = useState('identity');
  const [architectureView, setArchitectureView] = useState('system');
  const [targetFinding, setTargetFinding] = useState<string>();
  const loadAssessment = useCallback(async (assessmentId: string) => {
    const result = await api<{ data: EvaluacionSeguridad }>(`/projects/${projectId}/security/assessments/${assessmentId}`);
    setSelected(result.data);
    if (result.data.status !== 'completed') {
      setComparison(null);
      return;
    }
    try {
      const compared = await api<{ data: ComparacionEvaluacion }>(`/projects/${projectId}/security/assessments/${assessmentId}/comparison`);
      setComparison(compared.data);
    } catch {
      setComparison(null);
    }
  }, [projectId]);

  const load = useCallback(async () => {
    try {
      const [projectResult, assessmentResult] = await Promise.all([
        api<{ data: Proyecto }>(`/projects/${projectId}`),
        api<{ data: EvaluacionSeguridad[] }>(`/projects/${projectId}/security/assessments`),
      ]);
      setProject(projectResult.data);
      setAssessments(assessmentResult.data);
      if (assessmentResult.data[0]) {
        await loadAssessment(assessmentResult.data[0].id);
      } else {
        setSelected(null);
        setComparison(null);
      }
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, [loadAssessment, projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!selected || !['pending', 'running'].includes(selected.status)) return;
    const timer = window.setInterval(() => { void load(); }, 2500);
    return () => window.clearInterval(timer);
  }, [load, selected]);

  const runAwsAssessment = async () => {
    setRunning(true);
    setError(null);
    try {
      const result = await api<{ data: EvaluacionSeguridad }>(`/projects/${projectId}/security/assessments/aws`, { method: 'POST' });
      setSelected(result.data);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      await load();
    } finally {
      setRunning(false);
    }
  };

  const runRepositoryAssessment = async (scope: 'code' | 'full') => {
    setRunningRepository(scope);
    setError(null);
    try {
      await api(`/projects/${projectId}/security/assessments/repository`, {
        method: 'POST',
        body: JSON.stringify({ ref: project?.repoDefaultBranch || 'main', scope }),
      });
      setAssessmentMenuOpen(false);
      setWorkspaceTab('overview');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setRunningRepository(false);
    }
  };

  const runArchiveAssessment = async (scope: 'code' | 'full', archive: File) => {
    setRunningRepository(scope);
    setError(null);
    try {
      const body = new FormData();
      body.append('archive', archive);
      await api(`/projects/${projectId}/security/assessments/${scope}`, { method: 'POST', body });
      await load();
    } catch (cause) {
      setError(cause instanceof TypeError ? 'Se interrumpió la carga del ZIP. Reintenta desde Nueva evaluación; este proyecto se conserva.' : cause instanceof Error ? cause.message : String(cause));
    } finally { setRunningRepository(false); }
  };


  const evaluationBusy = running || Boolean(runningRepository) || selected?.status === 'pending' || selected?.status === 'running';
  const repositoryAssessmentActive = assessments.some((assessment) => ['code', 'full'].includes(assessment.assessmentType) && ['pending', 'running'].includes(assessment.status));
  const onFinding = (id: string) => { setTargetFinding(id); setWorkspaceTab('findings'); };
  if (loading) return <p role="status" className="p-6 text-sm text-muted">Cargando la evidencia del proyecto…</p>;
  if (!project) return <div className="space-y-3"><p role="alert" className="text-sm text-rose-600">{error ?? 'Proyecto no encontrado'}</p><Link to="/projects" className="text-sm text-blue-600">Volver a proyectos</Link></div>;
  const tabs = [
    { id: 'overview', label: 'Resumen', icon: LayoutDashboard }, { id: 'protection', label: 'Protección', icon: Fingerprint },
    { id: 'architecture', label: 'Arquitectura', icon: Layers3 }, { id: 'findings', label: 'Hallazgos', icon: ShieldAlert },
    { id: 'coverage', label: 'Medición', icon: ScanSearch }, { id: 'advisor', label: 'Asesor IA', icon: BrainCircuit },
    { id: 'evolution', label: 'Evolución e informes', icon: History },
  ] as const;
  return <div className="space-y-5 pb-6">
    <header className="rounded-2xl border border-line bg-card px-4 py-4 sm:px-6">
      <Link to="/projects" className="inline-flex items-center gap-1 text-xs font-semibold text-muted hover:text-blue-500"><ArrowLeft size={14} />Portafolio de proyectos</Link>
      <div className="mt-3 flex flex-col justify-between gap-4 lg:flex-row lg:items-center"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold text-muted"><span>{project.environment}</span><span>·</span><span>{project.region}</span><span>·</span><span>{project.repoOwner && project.repoName ? `${project.repoOwner}/${project.repoName}` : 'Proyecto local'}</span></div><h1 className="mt-1 break-words text-xl font-black tracking-tight text-ink sm:text-2xl">{project.name}</h1></div><div className="flex shrink-0 gap-2"><button disabled={evaluationBusy || repositoryAssessmentActive} onClick={() => setAssessmentMenuOpen(true)} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">{evaluationBusy ? <LoaderCircle size={15} className="animate-spin" /> : <Play size={15} />}{evaluationBusy ? 'Evaluación en curso' : 'Nueva evaluación'}</button><button onClick={() => setReportOpen(true)} disabled={selected?.status !== 'completed'} className="inline-flex items-center gap-2 rounded-xl border border-line px-3 py-2.5 text-xs font-bold text-ink disabled:opacity-40"><FileDown size={15} />Informe PDF</button></div></div>
      {selected && <div className="mt-4 flex flex-col gap-2 border-t border-line pt-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs text-muted"><strong className="text-ink">{assessmentLabel(selected, project)}</strong> · {selected.completedAt ? new Date(selected.completedAt).toLocaleString('es-PE') : 'En preparación'}<span className="mt-1 block">Las conclusiones corresponden únicamente a esta ejecución.</span></p><label className="text-[11px] font-semibold text-muted">Cambiar evaluación<select aria-label="Cambiar evaluación" value={selected.id} onChange={(event) => { setTargetFinding(undefined); void loadAssessment(event.target.value); }} className="mt-1 block max-w-full rounded-lg border border-line bg-canvas px-3 py-2 text-xs text-ink">{assessments.map((assessment) => <option key={assessment.id} value={assessment.id}>{new Date(assessment.startedAt).toLocaleString('es-PE')} · {assessmentLabel(assessment, project)}</option>)}</select></label></div>}
    </header>
    {error && <p role="alert" className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4 text-sm text-rose-600 dark:text-rose-400">{error}</p>}
    <nav aria-label="Secciones de evaluación" className="grid grid-cols-2 gap-1 rounded-2xl border border-line bg-card p-1.5 sm:grid-cols-4 xl:flex xl:flex-wrap">{tabs.map(({ id, label, icon: Icon }) => <button key={id} aria-current={workspaceTab === id ? 'page' : undefined} onClick={() => { setWorkspaceTab(id); if (id === 'architecture') setArchitectureView('system'); if (id === 'findings') setTargetFinding(undefined); }} className={`inline-flex items-center gap-2 rounded-xl px-3 py-3 text-xs font-bold transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 ${workspaceTab === id ? 'bg-blue-600 text-white' : 'text-muted hover:bg-canvas hover:text-ink'}`}><Icon size={15} />{label}</button>)}</nav>
    {evaluationBusy ? <section role="status" aria-live="polite" className="rounded-2xl border border-line bg-card p-8 text-center"><LoaderCircle size={30} className="mx-auto animate-spin text-blue-500" /><h2 className="mt-4 text-xl font-bold text-ink">Estamos reuniendo la evidencia</h2><p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-muted">El análisis está en curso. Los controles, las tecnologías y los hallazgos aparecerán al terminar; aún no hay una conclusión nueva.</p><p className="mt-3 text-xs text-muted">Esta vista consulta el estado automáticamente.</p></section> : selected?.status === 'failed' ? <p role="alert" className="rounded-xl border border-line p-6 text-sm text-rose-600">No se completó la evaluación. {selected.errorMessage} Inicia otra desde Nueva evaluación.</p> : selected?.status === 'completed' ? <>
      {workspaceTab === 'overview' && <SecuritySummary key={selected.id} assessment={selected} onFinding={onFinding} onCoverage={() => setWorkspaceTab('coverage')} onAdvisor={() => setWorkspaceTab('advisor')} onArchitecture={() => { setArchitectureView('framework'); setWorkspaceTab('architecture'); }} onArea={(id) => { setProtectionArea(id); setWorkspaceTab('protection'); }} />}
      {workspaceTab === 'protection' && <ProtectionWorkspace key={`${selected.id}:${protectionArea}`} initialArea={protectionArea} assessment={selected} onFinding={onFinding} onCoverage={() => setWorkspaceTab('coverage')} />}
      {workspaceTab === 'architecture' && <ArchitectureWorkspace key={`${selected.id}:${architectureView}`} assessment={selected} onFinding={onFinding} initialView={architectureView} />}
      {workspaceTab === 'findings' && <FindingsWorkspace key={`${selected.id}:${targetFinding ?? 'list'}`} assessment={selected} projectId={projectId} initialFindingId={targetFinding} onUpdated={() => void loadAssessment(selected.id)} />}
      {workspaceTab === 'coverage' && <CoverageWorkspace key={selected.id} assessment={selected} />}
      {workspaceTab === 'advisor' && <section className="rounded-2xl border border-line bg-card p-4 sm:p-6"><p className="text-xs font-bold uppercase tracking-widest text-violet-600 dark:text-violet-400">De la evidencia a un plan</p><h2 className="mt-1 text-xl font-bold text-ink">Asesor de seguridad y arquitectura</h2><p className="mt-2 text-sm leading-relaxed text-muted">Prioridades, criterios para validar correcciones y decisiones de arquitectura basadas en lo observado. Cada propuesta requiere revisión antes de publicarse.</p><AdvisoryPanel key={selected.id} assessment={selected} onNavigateToFinding={onFinding} /></section>}
      {workspaceTab === 'evolution' && <div className="space-y-4"><section className="rounded-2xl border border-line bg-card p-5"><h2 className="text-xl font-bold text-ink">¿Qué cambió entre evaluaciones?</h2><p className="mt-2 text-sm text-muted">Solo se comparan ejecuciones del mismo tipo, motor y metodología. El detalle completo se puede descargar en Asesor IA.</p><AssessmentOverview assessment={selected} history={assessments} mode="trend" /></section><AssessmentComparisonPanel comparison={comparison} onNavigateToFinding={onFinding} /></div>}
    </> : <section className="rounded-2xl border border-line bg-card p-8 text-center"><h2 className="text-xl font-bold text-ink">Primero necesitamos evidencia</h2><p className="mt-2 text-sm text-muted">Inicia una evaluación del código, la cuenta AWS o ambas para conocer los riesgos de este proyecto.</p><button onClick={() => setAssessmentMenuOpen(true)} className="mt-4 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white">Elegir qué evaluar</button></section>}
    {assessmentMenuOpen && <NewAssessmentModal onClose={() => setAssessmentMenuOpen(false)} hasRepo={Boolean(project.repoOwner && project.repoName)} awsReady={Boolean(awsConnection.data?.readyForAssessment)} awsReason={awsConnection.data?.recommendation} busy={evaluationBusy} onRun={(scope, archive) => { setAssessmentMenuOpen(false); setWorkspaceTab('overview'); if (scope === 'aws') void runAwsAssessment(); else if (archive) void runArchiveAssessment(scope, archive); else void runRepositoryAssessment(scope); }} />}
    {reportOpen && selected && <SecurityReportModal abierto onCerrar={() => setReportOpen(false)} proyecto={project} evaluacion={selected} comparacion={comparison} />}
  </div>;
}
