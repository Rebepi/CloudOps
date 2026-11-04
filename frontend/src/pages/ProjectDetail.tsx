import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { LayoutDashboard, Layers3, ShieldAlert, BrainCircuit, LoaderCircle } from 'lucide-react';
import { api, apiText } from '../lib/api';
import { useAws } from '../hooks/useAws';
import type { AwsConnectionStatus, ComparacionEvaluacion, EvaluacionSeguridad, Proyecto } from '../types/cloud';
import { assessmentLabel } from '../lib/assessmentLabels';
import { SecurityReportModal } from '../components/reports/SecurityReportModal';
import { NewAssessmentModal } from '../components/projects/NewAssessmentModal';
import { SecuritySummary } from '../components/projects/SecuritySummary';
import { ArchitectureWorkspace } from '../components/projects/ArchitectureWorkspace';
import { FindingsWorkspace } from '../components/projects/FindingsWorkspace';
import { CoverageWorkspace } from '../components/projects/CoverageWorkspace';
import { AdvisoryPanel } from '../components/projects/AdvisoryPanel';
import { AssessmentOverview } from '../components/projects/AssessmentOverview';
import { createPortal } from 'react-dom';
import { Modal } from '../components/ui/Modal';
import { ProjectAssessmentHeader } from '../components/projects/ProjectAssessmentHeader';
import { AssessmentComparisonPanel } from '../components/projects/AssessmentComparisonPanel';

type WorkspaceTab = 'overview' | 'architecture' | 'findings' | 'advisor';
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
  const [utility, setUtility] = useState<'coverage' | 'history' | 'exports' | null>(null);
  const [exportError, setExportError] = useState('');
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
    { id: 'overview', label: 'Diagnóstico', icon: LayoutDashboard },
    { id: 'findings', label: 'Riesgos', icon: ShieldAlert },
    { id: 'architecture', label: 'Proyecto', icon: Layers3 },
    { id: 'advisor', label: 'Plan de mejora', icon: BrainCircuit },
  ] as const;
  const downloadJson = async (sbom = false) => {
    setExportError('');
    try {
      const base = `/projects/${projectId}/security/assessments/${selected!.id}`;
      const content = sbom ? await apiText(`${base}/sbom`) : JSON.stringify(await api(`${base}/report`), null, 2);
      const url = URL.createObjectURL(new Blob([content], { type: sbom ? 'application/vnd.cyclonedx+json' : 'application/json' }));
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = `cloudops-${selected!.id}-${sbom ? 'sbom.cdx' : 'technical'}.json`; anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) { setExportError(cause instanceof Error ? cause.message : String(cause)); }
  };

  return (
    <div className="space-y-4 pb-8">
      <ProjectAssessmentHeader project={project} selected={selected} assessments={assessments}
        busy={evaluationBusy || repositoryAssessmentActive}
        onEvaluate={() => setAssessmentMenuOpen(true)}
        onExport={() => { setExportError(''); setUtility('exports'); }}
        onHistory={() => setUtility('history')}
        onSelect={(id) => { setTargetFinding(undefined); void loadAssessment(id); }}
      />

      {error && (
        <p role="alert" className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-4 text-sm text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}

      {/* Modern Navigation Ribbon */}
      <nav
        aria-label="Secciones de evaluación"
        className="project-workspace-tabs grid grid-cols-2 gap-1.5 border border-line bg-card p-2 sm:grid-cols-4 shadow-xs"
      >
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            aria-current={workspaceTab === id ? 'page' : undefined}
            onClick={() => {
              setWorkspaceTab(id);
              if (id === 'architecture') setArchitectureView('system');
              if (id === 'findings') setTargetFinding(undefined);
            }}
            className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 cursor-pointer ${
              workspaceTab === id
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-muted hover:bg-canvas hover:text-ink'
            }`}
          >
            <Icon size={16} aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </nav>



      {evaluationBusy ? (
        <section role="status" aria-live="polite" className="rounded-3xl border border-line bg-card p-12 text-center shadow-xs">
          <LoaderCircle size={36} className="mx-auto animate-spin text-blue-500" />
          <h2 className="mt-4 text-xl font-bold text-ink">Estamos reuniendo la evidencia técnica</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-muted">
            El escaneo y análisis estático están en curso. Los resultados, tecnologías y hallazgos aparecerán al
            finalizar.
          </p>
          <p className="mt-3 text-xs text-muted">Esta vista actualiza el estado automáticamente.</p>
        </section>
      ) : selected?.status === 'failed' ? (
        <p role="alert" className="rounded-2xl border border-line p-6 text-sm text-rose-600">
          No se completó la evaluación. {selected.errorMessage} Inicia otra desde Nueva evaluación.
        </p>
      ) : selected?.status === 'completed' ? (
        <>
          {workspaceTab === 'overview' && (
            <SecuritySummary
              key={selected.id}
              assessment={selected}
              onFinding={onFinding}
              onCoverage={() => setUtility('coverage')}
              onAdvisor={() => setWorkspaceTab('advisor')}
              onArchitecture={() => {
                setArchitectureView('system');
                setWorkspaceTab('architecture');
              }}
            />
          )}

          {workspaceTab === 'architecture' && (
            <ArchitectureWorkspace
              key={`${selected.id}:${architectureView}`}
              assessment={selected}
              onFinding={onFinding}
              initialView={architectureView}
            />
          )}

          {workspaceTab === 'findings' && (
            <FindingsWorkspace
              key={`${selected.id}:${targetFinding ?? 'list'}`}
              assessment={selected}
              projectId={projectId}
              initialFindingId={targetFinding}
              onUpdated={() => void loadAssessment(selected.id)}
            />
          )}


          {workspaceTab === 'advisor' && <AdvisoryPanel showExport={false} key={selected.id} assessment={selected} onNavigateToFinding={onFinding} />}

        </>
      ) : (
        <section className="rounded-3xl border border-line bg-card p-12 text-center shadow-xs">
          <h2 className="text-xl font-bold text-ink">Primero necesitamos evidencia técnica</h2>
          <p className="mt-2 text-sm text-muted max-w-md mx-auto">
            Inicia una evaluación del código fuente, la cuenta AWS o ambas para conocer los riesgos de este proyecto
            con su alcance y limitaciones.
          </p>
          <button
            onClick={() => setAssessmentMenuOpen(true)}
            className="mt-5 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-xs hover:bg-blue-700 cursor-pointer"
          >
            Elegir qué evaluar
          </button>
        </section>
      )}

      {assessmentMenuOpen && (
        <NewAssessmentModal
          onClose={() => setAssessmentMenuOpen(false)}
          hasRepo={Boolean(project.repoOwner && project.repoName)}
          awsReady={Boolean(awsConnection.data?.readyForAssessment)}
          awsReason={awsConnection.data?.recommendation}
          busy={evaluationBusy}
          onRun={(scope, archive) => {
            setAssessmentMenuOpen(false);
            setWorkspaceTab('overview');
            if (scope === 'aws') void runAwsAssessment();
            else if (archive) void runArchiveAssessment(scope, archive);
            else void runRepositoryAssessment(scope);
          }}
        />
      )}

      {utility && selected && createPortal(<Modal abierto onCerrar={() => setUtility(null)} titulo={{ coverage: 'Comprobaciones y límites', history: 'Evaluaciones anteriores', exports: 'Exportar evaluación' }[utility]} tamano="full">
        <p className="mb-4 text-xs text-muted">{assessmentLabel(selected, project)} · {new Date(selected.startedAt).toLocaleString('es-PE')}</p>
        {utility === 'coverage' && <CoverageWorkspace key={selected.id} assessment={selected} />}
        {utility === 'history' && <div className="space-y-4">
          <label className="text-sm text-ink">Consultar evaluación<select aria-label="Evaluación histórica" className="mt-2 block w-full rounded-xl border border-line bg-canvas p-3" value={selected.id} onChange={(event) => { void loadAssessment(event.target.value); }}>{assessments.map((item) => <option key={item.id} value={item.id}>{new Date(item.startedAt).toLocaleString('es-PE')} · {assessmentLabel(item, project)}</option>)}</select></label>
          <p className="text-xs text-muted">Solo se comparan evaluaciones con el mismo alcance, motor y metodología.</p>
          <AssessmentOverview assessment={selected} history={assessments} mode="trend" />
          <AssessmentComparisonPanel comparison={comparison} onNavigateToFinding={(id) => { setUtility(null); onFinding(id); }} />
        </div>}
        {utility === 'exports' && <div className="space-y-4 text-sm text-ink">
          <p>El PDF resume las prioridades; el JSON conserva el detalle técnico. La IA solo se incluye si está aprobada y vigente.</p>
          <div className="flex flex-wrap gap-3"><button className="rounded-xl bg-blue-600 px-4 py-2 text-white" onClick={() => { setUtility(null); setReportOpen(true); }}>Informe ejecutivo PDF</button><button className="rounded-xl border border-line px-4 py-2" onClick={() => void downloadJson()}>Reporte técnico JSON</button></div>
          {selected.summary.supplyChain && <button className="rounded-xl border border-line px-4 py-2" onClick={() => void downloadJson(true)}>Inventario SBOM CycloneDX</button>}
          {exportError && <p role="alert" className="text-rose-500">{exportError}</p>}
        </div>}
      </Modal>, document.body)}

      {reportOpen && selected && (
        <SecurityReportModal
          abierto
          onCerrar={() => setReportOpen(false)}
          proyecto={project}
          evaluacion={selected}
          comparacion={comparison}
        />
      )}
    </div>
  );
}
