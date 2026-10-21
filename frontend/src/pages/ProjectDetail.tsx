import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Cloud,
  FileDown,
  Filter,
  GitBranch,
  History,
  Layers3,
  LayoutDashboard,
  LoaderCircle,
  Play,
  ScanSearch,
  Search,
  ShieldAlert,
  ShieldCheck,
  X,
} from 'lucide-react';
import { api } from '../lib/api';
import type {
  AwsConnectionStatus,
  ComparacionEvaluacion,
  EvaluacionSeguridad,
  Proyecto,
} from '../types/cloud';
import { Card } from '../components/ui/Card';
import { useAws } from '../hooks/useAws';
import { SecurityReportModal } from '../components/reports/SecurityReportModal';
import { FindingCard } from '../components/security/FindingCard';
import { NewFindingsComparison } from '../components/security/NewFindingsComparison';
import { detectAwsService } from '../components/security/findingServiceHelper';
import { SecurityAnalyticsWidget } from '../components/security/SecurityAnalyticsWidget';
import { NewAssessmentModal } from '../components/projects/NewAssessmentModal';
import { ProjectArchitectureAdvisor } from '../components/projects/ProjectArchitectureAdvisor';
import { detectFindingLayer, type FindingLayer } from '../components/security/findingLayerHelper';
import { assessmentLabel } from '../lib/assessmentLabels';
import { AnimatedNumber } from '../components/ui/AnimatedNumber';
import { useAnimatedNumber } from '../hooks/useMotionProgress';


function getVisiblePages(current: number, total: number, max = 5): number[] {
  if (total <= max) return Array.from({ length: total }, (_, i) => i + 1);
  let start = Math.max(1, current - Math.floor(max / 2));
  let end = start + max - 1;
  if (end > total) {
    end = total;
    start = Math.max(1, end - max + 1);
  }
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

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
  const [workspaceTab, setWorkspaceTab] = useState<'overview' | 'architecture' | 'coverage' | 'findings'>('overview');

  // Filters and Pagination for Hallazgos Normalizados
  const [severityFilter, setSeverityFilter] = useState<'all' | 'critical_high' | 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW_INFO'>('critical_high');
  const [serviceFilter, setServiceFilter] = useState<string>('all');
  const [layerFilter, setLayerFilter] = useState<FindingLayer>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  const loadAssessment = useCallback(async (assessmentId: string) => {
    const result = await api<{ data: EvaluacionSeguridad }>(`/projects/${projectId}/security/assessments/${assessmentId}`);
    setSelected(result.data);
    setLayerFilter('all');
    setServiceFilter('all');
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

  // Findings list and analysis
  const findings = useMemo(() => selected?.findings ?? [], [selected]);

  // Core 4 Services Counts for highlighted filters & stats
  const coreServiceCounts = useMemo(() => {
    let iam = 0;
    let securityHub = 0;
    let config = 0;
    let inspector = 0;
    for (const f of findings) {
      const s = detectAwsService(f);
      if (s.id === 'iam' || f.category === 'identity' || f.category === 'account') {
        iam += 1;
      } else if (f.source === 'security-hub' || f.category === 'cloud-posture') {
        securityHub += 1;
      } else if (f.source === 'aws-config' || s.id === 'config' || f.category === 'configuration' || f.category === 'compliance') {
        config += 1;
      } else if (f.source === 'amazon-inspector' || s.id === 'inspector' || f.category === 'vulnerability') {
        inspector += 1;
      }
    }
    return {
      iam,
      'security-hub': securityHub,
      'aws-config': config,
      'amazon-inspector': inspector,
    };
  }, [findings]);

  // The API score is authoritative. Recalculating it in the browser made old and
  // current methodologies look equivalent and could hide backend score caps.
  const evaluationBusy = running || Boolean(runningRepository) || selected?.status === 'pending' || selected?.status === 'running';
  const displayScore = evaluationBusy ? null : selected?.score ?? null;
  const animatedCoverage = useAnimatedNumber(evaluationBusy ? 0 : Math.min(100, selected?.coverage ?? 0), selected?.id ?? 'none');



  // Count severities
  const severityCounts = useMemo(() => {
    return findings.reduce(
      (acc, f) => {
        acc[f.severity] = (acc[f.severity] || 0) + 1;
        return acc;
      },
      { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFORMATIONAL: 0 } as Record<string, number>
    );
  }, [findings]);

  const criticalHighTotal = severityCounts.CRITICAL + severityCounts.HIGH;
  const lowInfoTotal = severityCounts.LOW + severityCounts.INFORMATIONAL;
  const layerCounts = useMemo(() => findings.reduce<Record<Exclude<FindingLayer, 'all'>, number>>((counts, finding) => {
    counts[detectFindingLayer(finding)] += 1;
    return counts;
  }, { backend: 0, frontend: 0, infrastructure: 0, dependencies: 0, shared: 0 }), [findings]);

  // Filter findings
  const filteredFindings = useMemo(() => {
    return findings.filter((f) => {
      // Severity filter
      if (severityFilter === 'critical_high') {
        if (f.severity !== 'CRITICAL' && f.severity !== 'HIGH') return false;
      } else if (severityFilter === 'LOW_INFO') {
        if (f.severity !== 'LOW' && f.severity !== 'INFORMATIONAL') return false;
      } else if (severityFilter !== 'all') {
        if (f.severity !== severityFilter) return false;
      }

      if (layerFilter !== 'all' && detectFindingLayer(f) !== layerFilter) return false;

      // Service filter with special matching for the 4 core module services
      if (serviceFilter !== 'all') {
        if (serviceFilter === 'iam') {
          const s = detectAwsService(f);
          if (s.id !== 'iam' && f.category !== 'identity' && f.category !== 'account') return false;
        } else if (serviceFilter === 'security-hub') {
          if (f.source !== 'security-hub' && f.category !== 'cloud-posture') return false;
        } else if (serviceFilter === 'aws-config') {
          const s = detectAwsService(f);
          if (f.source !== 'aws-config' && s.id !== 'config' && f.category !== 'configuration' && f.category !== 'compliance') return false;
        } else if (serviceFilter === 'amazon-inspector') {
          const s = detectAwsService(f);
          if (f.source !== 'amazon-inspector' && s.id !== 'inspector' && f.category !== 'vulnerability') return false;
        } else {
          const s = detectAwsService(f);
          if (s.id !== serviceFilter) return false;
        }
      }

      // Status filter
      if (statusFilter !== 'all') {
        if (f.status !== statusFilter) return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = f.title.toLowerCase().includes(q);
        const matchesResource = f.resource?.toLowerCase().includes(q) ?? false;
        const matchesRec = f.recommendation?.toLowerCase().includes(q) ?? false;
        if (!matchesTitle && !matchesResource && !matchesRec) return false;
      }

      return true;
    });
  }, [findings, severityFilter, layerFilter, serviceFilter, statusFilter, searchQuery]);

  // Pagination calculations
  const totalPages = Math.max(1, Math.ceil(filteredFindings.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedFindings = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredFindings.slice(start, start + pageSize);
  }, [filteredFindings, safePage, pageSize]);

  // Reset page when filters change
  const handleSeverityFilter = (filter: typeof severityFilter) => {
    setSeverityFilter(filter);
    setCurrentPage(1);
  };

  const handleServiceFilter = (serviceId: string) => {
    setServiceFilter((prev) => (prev === serviceId ? 'all' : serviceId));
    setCurrentPage(1);
  };

  const handleLayerFilter = (layer: FindingLayer) => {
    setLayerFilter((previous) => previous === layer ? 'all' : layer);
    setCurrentPage(1);
  };

  const handleStatusFilter = (status: string) => {
    setStatusFilter(status);
    setCurrentPage(1);
  };

  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    setCurrentPage(1);
  };

  const resetAllFilters = () => {
    setSeverityFilter('all');
    setServiceFilter('all');
    setLayerFilter('all');
    setStatusFilter('all');
    setSearchQuery('');
    setCurrentPage(1);
  };

  const handlePageChange = (nextPage: number | ((prev: number) => number)) => {
    setCurrentPage((prev) => (typeof nextPage === 'function' ? nextPage(prev) : nextPage));
    setTimeout(() => {
      document.getElementById('findings-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  };

  const handleNavigateToFinding = (findingId: string) => {
    resetAllFilters();
    const idx = findings.findIndex((f) => f.id === findingId);
    if (idx >= 0) {
      const targetPage = Math.floor(idx / pageSize) + 1;
      setCurrentPage(targetPage);
    }
    setTimeout(() => {
      const el = document.getElementById(`finding-${findingId}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 150);
  };

  const openWorkspaceTab = (tab: 'overview' | 'architecture' | 'coverage' | 'findings') => {
    setWorkspaceTab(tab);
    if (tab === 'architecture' && (!selected || selected.assessmentType === 'aws-account')) {
      const latestCodeAssessment = assessments.find((assessment) => assessment.status === 'completed' && ['code', 'full'].includes(assessment.assessmentType));
      if (latestCodeAssessment) void loadAssessment(latestCodeAssessment.id);
    }
  };

    if (loading) return <p className="text-xs text-muted">Cargando proyecto…</p>;
    if (!project) {
      return (
        <div className="space-y-3">
          <p className="text-sm text-rose-600">{error ?? 'Proyecto no encontrado.'}</p>
          <Link to="/projects" className="text-xs font-bold text-blue-600">
            Volver a proyectos
          </Link>
        </div>
      );
    }

    const repoOwner = project?.repoOwner || (project?.name.includes('/') ? project.name.split('/')[0].trim() : null);
    const repoName = project?.repoName || (project?.name.includes('/') ? project.name.split('/')[1].trim() : null);
    const hasRepo = Boolean(repoOwner && repoName);
    const repositoryAssessmentActive = assessments.some((assessment) => ['code', 'full'].includes(assessment.assessmentType) && ['pending', 'running'].includes(assessment.status));
    const latestCodeAssessment = assessments.find((assessment) => assessment.status === 'completed' && ['code', 'full'].includes(assessment.assessmentType));
    const scoreLabel = selected?.assessmentType === 'code'
      ? 'Seguridad del código'
      : selected?.assessmentType === 'full'
        ? 'Seguridad integral'
        : 'Postura AWS';
    const coverageLabel = selected?.assessmentType === 'code'
      ? 'Secretos · SAST · dependencias · IaC'
      : selected?.assessmentType === 'full'
        ? 'Código + controles AWS observables'
        : 'IAM · CloudTrail · S3 · red · RDS · Config · Security Hub · Inspector';

    return (
      <div className="space-y-6 animate-fade-in">
        {/* Security Report Modal */}
        {reportOpen && selected && (
          <SecurityReportModal
            abierto
            onCerrar={() => setReportOpen(false)}
            proyecto={project}
            evaluacion={selected}
            comparacion={comparison}
          />
        )}



        {/* Unified Executive Command Hero */}
        <div className="relative overflow-hidden rounded-3xl border border-line bg-gradient-to-b from-card via-card/95 to-canvas shadow-xl backdrop-blur-xl">
          {/* Ambient lighting glows */}
          <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-blue-600/10 blur-3xl" />
          <div className="pointer-events-none absolute -left-24 -bottom-24 h-96 w-96 rounded-full bg-indigo-600/10 blur-3xl" />

          {/* Top Header Bar */}
          <div className="px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/60 pb-2 mb-3">
              <Link
                to="/projects"
                className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-500 hover:text-blue-400 transition-colors"
              >
                <ArrowLeft size={14} /> Volver al Portafolio
              </Link>

              <div className="flex flex-wrap items-center gap-2">
                {/* Integrated AWS Status Pill */}
                {awsConnection.data && (
                  <div
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold border ${awsConnection.data.roleActive
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                      : 'border-amber-500/30 bg-amber-500/10 text-amber-400'
                      }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${awsConnection.data.roleActive ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
                        }`}
                    />
                    <span>
                      {awsConnection.data.roleActive ? 'Rol IAM Conectado' : 'Conexión AWS'}
                    </span>
                    <span className="opacity-40">·</span>
                    <span className="font-mono text-[10px]">
                      {awsConnection.data.arn?.split(':assumed-role/')[1]?.split('/')[0] || project.region}
                    </span>
                  </div>
                )}

                <span className="rounded-full border border-line bg-canvas px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-muted">
                  {project.status === 'active' ? 'Proyecto Activo' : project.status === 'archived' ? 'Archivado' : project.status}
                </span>

              </div>
            </div>

            {/* Main Hero Row: Project Metadata & Action Buttons */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-wider">
                  <span className="text-blue-500 font-extrabold">{project.clientName || 'Proyecto Interno'}</span>
                  <span className="text-muted">·</span>
                  <span className="rounded-md bg-blue-500/10 px-2 py-0.5 text-blue-400 border border-blue-500/20 text-[10px]">
                    {project.environment}
                  </span>
                  {hasRepo && (
                    <span className="rounded-md bg-violet-500/10 px-2 py-0.5 text-violet-400 border border-violet-500/20 text-[10px] inline-flex items-center gap-1">
                      <GitBranch size={11} /> {repoOwner}/{repoName}
                    </span>
                  )}
                </div>

                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-ink">
                  {project.name}
                </h1>

                <p className="max-w-2xl text-xs sm:text-sm leading-relaxed text-muted">
                  {project.description || 'Evaluación contextual de arquitectura, costos y seguridad en nube AWS.'}
                </p>

                <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[10px]">
                  <span className="rounded-lg border border-line bg-canvas px-2.5 py-1 font-semibold text-ink">
                    {project.applicationType}
                  </span>
                  <span className="rounded-lg border border-line bg-canvas px-2.5 py-1 font-mono text-muted">
                    {project.region}
                  </span>
                  {project.technologyStack.map((technology) => (
                    <span
                      key={technology}
                      className="rounded-lg border border-blue-500/20 bg-blue-500/10 px-2.5 py-1 text-blue-400 font-medium"
                    >
                      {technology}
                    </span>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex shrink-0 flex-col sm:flex-row gap-2">
                <button
                  onClick={() => setAssessmentMenuOpen((open) => !open)}
                  disabled={running || Boolean(runningRepository) || repositoryAssessmentActive}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-blue-600/30 hover:bg-blue-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer transition-all"
                >
                  {running || runningRepository || repositoryAssessmentActive ? <LoaderCircle size={15} className="animate-spin" /> : <Play size={15} />}
                  {evaluationBusy ? 'Evaluación en curso…' : 'Nueva evaluación'}
                </button>
                <button
                  onClick={() => setReportOpen(true)}
                  disabled={!selected || selected.status !== 'completed'}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-canvas/80 px-4 py-2 text-xs font-bold text-ink hover:bg-card hover:border-blue-500/40 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer transition-all shadow-sm"
                >
                  <FileDown size={15} className="text-blue-500" /> Informe PDF
                </button>
              </div>
            </div>
          </div>

          {/* Integrated Executive Metric Strip (Unified 4-Col Dock) */}
          <div className="grid grid-cols-2 lg:grid-cols-4 border-t border-line/70 bg-canvas/60 backdrop-blur divide-y sm:divide-y-0 sm:divide-x divide-line/60">
            {/* 1. Puntaje */}
            <div className="px-4 py-3 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted">{scoreLabel}</span>
                <ShieldCheck
                  size={18}
                  className={
                    displayScore == null
                      ? 'text-muted'
                      : displayScore >= 85
                        ? 'text-emerald-500'
                        : displayScore >= 65
                          ? 'text-amber-500'
                          : 'text-rose-500'
                  }
                />
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span
                  className={`text-2xl font-black ${displayScore == null
                    ? 'text-muted'
                    : displayScore >= 85
                      ? 'text-emerald-500'
                      : displayScore >= 65
                        ? 'text-amber-500'
                        : 'text-rose-500'
                    }`}
                >
                  {displayScore == null ? '—' : <AnimatedNumber value={displayScore} replayKey={selected?.id} />}/100
                </span>
              </div>
              <span className="mt-1 text-[11px] text-muted">
                {displayScore == null
                  ? evaluationBusy ? 'Calculando al finalizar el análisis' : 'Sin evaluación'
                  : displayScore >= 85
                    ? 'Postura óptima'
                    : displayScore >= 65
                      ? 'Atención moderada'
                      : displayScore >= 30
                        ? 'Riesgo alto · Requiere mitigación'
                        : 'Postura crítica · Remediación urgente'}
              </span>
              {selected?.summary.scoreCapsApplied?.length ? (
                <span className="mt-1 text-[10px] font-bold text-rose-400">
                  {selected.summary.scoreCapsApplied.includes('critical-secret-exposure:45')
                    ? 'Puntaje limitado por exposición crítica de secretos'
                    : 'Puntaje limitado por un hallazgo crítico'}
                </span>
              ) : null}
            </div>

            {/* 2. Cobertura */}
            <div className="px-4 py-3 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted">Cobertura</span>
                <Activity size={18} className="text-blue-500" />
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-2xl font-black text-ink">{evaluationBusy ? '—' : <>{animatedCoverage}%</>}</span>
              </div>
              <div className="mt-2 w-full bg-line/60 h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-blue-500 h-full rounded-full transition-all duration-500"
                  style={{ width: `${animatedCoverage}%` }}
                />
              </div>
              <span className="mt-1 text-[11px] text-muted truncate">
                {coverageLabel}
              </span>
            </div>

            {/* 3. Críticos y Altos */}
            <div
              className={`px-4 py-3 flex flex-col justify-between ${criticalHighTotal > 0 ? 'bg-rose-500/5' : ''
                }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted">Críticos y Altos</span>
                <AlertTriangle
                  size={18}
                  className={evaluationBusy ? 'text-muted' : criticalHighTotal > 0 ? 'text-rose-500' : 'text-muted'}
                />
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span
                  className={`text-2xl font-black ${criticalHighTotal > 0 ? 'text-rose-500' : 'text-ink'
                    }`}
                >
                  {evaluationBusy ? '—' : <AnimatedNumber value={criticalHighTotal} replayKey={selected?.id} />}
                </span>
                <span className="text-xs text-muted">{evaluationBusy ? 'por determinar' : `de ${findings.length} total`}</span>
              </div>
              <span className="mt-1 text-[11px] text-muted">
                {evaluationBusy ? 'Revisando evidencia…' : criticalHighTotal > 0 ? 'Requieren remediación' : 'Sin hallazgos críticos'}
              </span>
            </div>

            {/* 4. Evaluaciones Registradas */}
            <div className="px-4 py-3 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted">Historial</span>
                <History size={18} className="text-violet-500" />
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-2xl font-black text-ink"><AnimatedNumber value={assessments.length} replayKey={selected?.id} /></span>
                <span className="text-xs text-muted">guardadas</span>
              </div>
              <span className="mt-1 text-[11px] text-muted truncate">
                {selected?.completedAt
                  ? `Última: ${new Date(selected.completedAt).toLocaleDateString('es-PE')}`
                  : evaluationBusy ? 'En evaluación' : 'Sin evaluación completada'}
              </span>
            </div>
          </div>
        </div>

        {assessmentMenuOpen && <NewAssessmentModal
          onClose={() => setAssessmentMenuOpen(false)}
          hasRepo={hasRepo}
          awsReady={Boolean(awsConnection.data?.readyForAssessment)}
          awsReason={awsConnection.data?.recommendation}
          busy={running || Boolean(runningRepository) || repositoryAssessmentActive}
          onRun={(scope, archive) => {
            setAssessmentMenuOpen(false);
            setWorkspaceTab('overview');
            if (scope === 'aws') void runAwsAssessment();
            else if (archive) void runArchiveAssessment(scope, archive);
            else void runRepositoryAssessment(scope);
          }}
        />}


        {error && (
          <div className="rounded-2xl border border-rose-500/25 bg-rose-500/10 p-4 text-xs text-rose-400">
            <AlertTriangle size={15} className="mr-1.5 inline text-rose-500" />
            {error}
          </div>
        )}

        <nav aria-label="Secciones de evaluación" className="flex gap-1 overflow-x-auto rounded-2xl border border-line bg-card p-1.5 shadow-sm">
          {([
            { id: 'overview', label: 'Resumen medido', icon: LayoutDashboard },
            { id: 'architecture', label: 'Arquitectura detectada', icon: Layers3 },
            { id: 'coverage', label: 'Cobertura', icon: ScanSearch },
            { id: 'findings', label: `Hallazgos (${findings.length})`, icon: ShieldAlert },
          ] as const).map((tab) => {
            const Icon = tab.icon;
            return <button key={tab.id} type="button" onClick={() => openWorkspaceTab(tab.id)} className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-colors cursor-pointer ${workspaceTab === tab.id ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20' : 'text-muted hover:bg-canvas hover:text-ink'}`}><Icon size={14} />{tab.label}</button>;
          })}
        </nav>

        {selected && (
          <div className="flex flex-col gap-2 px-1 text-xs sm:flex-row sm:items-center sm:justify-between">
            <div>
              <strong className="text-ink">Resultado visible: {assessmentLabel(selected, project)}</strong>
              <span className="ml-2 text-muted">
                {selected.status === 'completed' ? `completado ${new Date(selected.completedAt ?? selected.startedAt).toLocaleString('es-PE')}` : selected.status === 'failed' ? 'No completado' : 'Evaluación en curso'}
              </span>
              <p className="mt-1 text-[11px] text-muted">El puntaje, la cobertura y los hallazgos corresponden solamente a esta ejecución.</p>
            </div>
            {selected.assessmentType === 'aws-account' && latestCodeAssessment && (
              <button type="button" onClick={() => void loadAssessment(latestCodeAssessment.id)} className="shrink-0 rounded-xl border border-violet-500/30 bg-violet-500/10 px-3 py-2 text-[11px] font-bold text-violet-400 hover:bg-violet-500/15 cursor-pointer">
                Ver hallazgos del código
              </button>
            )}
          </div>
        )}

        {workspaceTab !== 'findings' && <ProjectArchitectureAdvisor project={project} assessment={selected} findings={findings} view={workspaceTab} processing={evaluationBusy} history={assessments} />}

        <div className={workspaceTab === 'findings' ? 'space-y-6' : 'hidden'}>

        {/* Comparison with Previous Assessment */}
        {comparison && (
          <Card>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-line pb-4">
              <div>
                <h3 className="text-base font-bold text-ink">Comparación con la evaluación anterior</h3>
                <p className="text-xs text-muted">Cambios y desviaciones detectados por huella criptográfica de hallazgo.</p>
              </div>
              {comparison.previous && (
                <span className="text-[11px] font-mono text-muted bg-canvas px-2.5 py-1 rounded-lg border border-line">
                  Base: {new Date(comparison.previous.startedAt).toLocaleString('es-PE')}
                </span>
              )}
            </div>

            {comparison.previous ? (
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-center text-xs">
                <div className="rounded-xl bg-canvas p-3 border border-line/60">
                  <strong className="block text-xl font-black text-rose-500">{comparison.summary.newCount}</strong>
                  <span className="text-muted font-medium">Nuevos</span>
                </div>
                <div className="rounded-xl bg-canvas p-3 border border-line/60">
                  <strong className="block text-xl font-black text-emerald-500">{comparison.summary.resolvedCount}</strong>
                  <span className="text-muted font-medium">Corregidos</span>
                </div>
                <div className="rounded-xl bg-canvas p-3 border border-line/60">
                  <strong className="block text-xl font-black text-amber-500">{comparison.summary.recurringCount}</strong>
                  <span className="text-muted font-medium">Recurrentes</span>
                </div>
                <div className="rounded-xl bg-canvas p-3 border border-line/60">
                  <strong className="block text-xl font-black text-violet-500">{comparison.summary.severityChangedCount}</strong>
                  <span className="text-muted font-medium">Cambio severidad</span>
                </div>
                <div className="rounded-xl bg-canvas p-3 border border-line/60">
                  <strong className={`block text-xl font-black ${(comparison.summary.scoreDelta ?? 0) >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                    {(comparison.summary.scoreDelta ?? 0) > 0 ? `+${comparison.summary.scoreDelta}` : comparison.summary.scoreDelta ?? 0}
                  </strong>
                  <span className="text-muted font-medium">Δ puntaje</span>
                </div>
                <div className="rounded-xl bg-canvas p-3 border border-line/60">
                  <strong className={`block text-xl font-black ${(comparison.summary.coverageDelta ?? 0) >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                    {(comparison.summary.coverageDelta ?? 0) > 0 ? `+${comparison.summary.coverageDelta}` : comparison.summary.coverageDelta ?? 0}%
                  </strong>
                  <span className="text-muted font-medium">Δ cobertura</span>
                </div>
              </div>
            ) : (
              <p className="mt-4 text-xs text-muted">
                No hay una evaluación anterior comparable de este tipo. Esta ejecución servirá como línea base.
              </p>
            )}

            {/* Redesigned New Findings Component */}
            {comparison.previous && comparison.newFindings.length > 0 && (
              <NewFindingsComparison
                newFindings={comparison.newFindings}
                onNavigateToFinding={handleNavigateToFinding}
              />
            )}
          </Card>
        )}

        {/* Main Content Layout: Findings & Context */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* Left 2 Cols: Hallazgos Normalizados */}
          <Card id="findings-section" className="lg:col-span-2 space-y-5 scroll-mt-6">
            {/* Section Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-line pb-3.5">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-ink">Hallazgos normalizados</h3>
                <span className="rounded-full bg-blue-500/10 px-2.5 py-0.5 text-xs font-bold text-blue-400 border border-blue-500/20">
                  {filteredFindings.length === findings.length ? findings.length : `${filteredFindings.length} de ${findings.length}`}
                </span>
              </div>

              <div className="flex items-center gap-2 text-xs text-muted">
                <span>Por pág:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="rounded-xl border border-line bg-card px-2.5 py-1 text-xs text-ink cursor-pointer focus:outline-none focus:border-blue-500"
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                </select>
              </div>
            </div>

            {/* Streamlined Filters Bar */}
            <div className="space-y-2.5 rounded-2xl bg-canvas/70 p-3 sm:p-3.5 border border-line">
              {/* Row 1: Search & Status */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <div className="relative flex-1">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    placeholder="Buscar por título, recurso o recomendación…"
                    className="w-full rounded-xl border border-line bg-card pl-9 pr-8 py-2 text-xs text-ink placeholder:text-muted focus:outline-none focus:border-blue-500"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => handleSearchChange('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-ink cursor-pointer"
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>

                <select
                  value={statusFilter}
                  onChange={(e) => handleStatusFilter(e.target.value)}
                  className="rounded-xl border border-line bg-card px-3 py-2 text-xs text-ink focus:outline-none focus:border-blue-500 cursor-pointer"
                >
                  <option value="all">Cualquier estado</option>
                  <option value="open">Abierto</option>
                  <option value="in_progress">En tratamiento</option>
                  <option value="resolved">Corregido</option>
                  <option value="risk_accepted">Riesgo aceptado</option>
                  <option value="false_positive">Falso positivo</option>
                </select>
              </div>

              {selected && ['code', 'full'].includes(selected.assessmentType) && (
                <div className="flex flex-wrap items-center gap-1.5 border-t border-line/60 pt-2">
                  <span className="mr-1 text-[10.5px] font-bold uppercase tracking-wider text-muted">Capa:</span>
                  {([
                    { id: 'all', label: 'Todo', count: findings.length },
                    { id: 'backend', label: 'Backend', count: layerCounts.backend },
                    { id: 'frontend', label: 'Frontend', count: layerCounts.frontend },
                    { id: 'infrastructure', label: 'Infra / Compose', count: layerCounts.infrastructure },
                    { id: 'dependencies', label: 'Dependencias', count: layerCounts.dependencies },
                    ...(layerCounts.shared ? [{ id: 'shared' as const, label: 'Compartido', count: layerCounts.shared }] : []),
                  ] as Array<{ id: FindingLayer; label: string; count: number }>).map((layer) => (
                    <button
                      key={layer.id}
                      type="button"
                      onClick={() => handleLayerFilter(layer.id)}
                      className={`rounded-xl border px-2.5 py-1 text-xs font-semibold transition-all cursor-pointer ${layerFilter === layer.id ? 'border-violet-500 bg-violet-500/20 text-violet-300 font-bold shadow-sm' : 'border-line bg-card text-muted hover:text-ink'}`}
                    >
                      {layer.label} ({layer.count})
                    </button>
                  ))}
                </div>
              )}

              {/* AWS service filters only apply when the selected result contains AWS evidence. */}
              {selected?.assessmentType !== 'code' && (
              <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-line/60">
                <span className="text-[10.5px] font-bold uppercase tracking-wider text-muted mr-1">
                  Servicio:
                </span>
                <button
                  type="button"
                  onClick={() => handleServiceFilter('all')}
                  className={`rounded-xl px-2.5 py-1 text-xs font-semibold border transition-all cursor-pointer ${
                    serviceFilter === 'all'
                      ? 'border-blue-500 bg-blue-500/20 text-blue-300 font-bold'
                      : 'border-line bg-card text-muted hover:text-ink'
                  }`}
                >
                  Todos ({findings.length})
                </button>
                <button
                  type="button"
                  onClick={() => handleServiceFilter('iam')}
                  className={`inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1 text-xs font-semibold border transition-all cursor-pointer ${
                    serviceFilter === 'iam'
                      ? 'border-indigo-500 bg-indigo-500/20 text-indigo-300 font-bold shadow-sm'
                      : 'border-line bg-card text-muted hover:text-ink'
                  }`}
                >
                  <span className="h-2 w-2 rounded-full bg-indigo-500" />
                  IAM ({coreServiceCounts.iam})
                </button>
                <button
                  type="button"
                  onClick={() => handleServiceFilter('security-hub')}
                  className={`inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1 text-xs font-semibold border transition-all cursor-pointer ${
                    serviceFilter === 'security-hub'
                      ? 'border-rose-500 bg-rose-500/20 text-rose-300 font-bold shadow-sm'
                      : 'border-line bg-card text-muted hover:text-ink'
                  }`}
                >
                  <span className="h-2 w-2 rounded-full bg-rose-500" />
                  Security Hub ({coreServiceCounts['security-hub']})
                </button>
                <button
                  type="button"
                  onClick={() => handleServiceFilter('aws-config')}
                  className={`inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1 text-xs font-semibold border transition-all cursor-pointer ${
                    serviceFilter === 'aws-config' || serviceFilter === 'config'
                      ? 'border-sky-500 bg-sky-500/20 text-sky-300 font-bold shadow-sm'
                      : 'border-line bg-card text-muted hover:text-ink'
                  }`}
                >
                  <span className="h-2 w-2 rounded-full bg-sky-500" />
                  AWS Config ({coreServiceCounts['aws-config']})
                </button>
                <button
                  type="button"
                  onClick={() => handleServiceFilter('amazon-inspector')}
                  className={`inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1 text-xs font-semibold border transition-all cursor-pointer ${
                    serviceFilter === 'amazon-inspector' || serviceFilter === 'inspector'
                      ? 'border-emerald-500 bg-emerald-500/20 text-emerald-300 font-bold shadow-sm'
                      : 'border-line bg-card text-muted hover:text-ink'
                  }`}
                >
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  Inspector ({coreServiceCounts['amazon-inspector']})
                </button>
              </div>
              )}

              {/* Row 3: Severity Filter Pills */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-[10.5px] font-bold uppercase tracking-wider text-muted mr-1">
                  Severidad:
                </span>
                <button
                  type="button"
                  onClick={() => handleSeverityFilter('all')}
                  className={`rounded-xl px-2.5 py-1 text-xs font-semibold border transition-all cursor-pointer ${
                    severityFilter === 'all'
                      ? 'border-blue-500 bg-blue-500/20 text-blue-300 font-bold'
                      : 'border-line bg-card text-muted hover:text-ink'
                  }`}
                >
                  Todas
                </button>
                <button
                  type="button"
                  onClick={() => handleSeverityFilter('critical_high')}
                  className={`inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1 text-xs font-bold border transition-all cursor-pointer ${
                    severityFilter === 'critical_high'
                      ? 'border-rose-500/60 bg-rose-500/20 text-rose-300 font-extrabold'
                      : 'border-rose-500/30 bg-rose-500/10 text-rose-400 hover:bg-rose-500/15'
                  }`}
                >
                  <ShieldAlert size={13} className="text-rose-500" />
                  Críticos y Altos ({criticalHighTotal})
                </button>
                {severityCounts.MEDIUM > 0 && (
                  <button
                    type="button"
                    onClick={() => handleSeverityFilter('MEDIUM')}
                    className={`rounded-xl px-2.5 py-1 text-xs font-semibold border transition-all cursor-pointer ${
                      severityFilter === 'MEDIUM'
                        ? 'border-amber-500 bg-amber-500/20 text-amber-300 font-bold'
                        : 'border-line bg-card text-amber-400 hover:text-amber-300'
                    }`}
                  >
                    Medio ({severityCounts.MEDIUM})
                  </button>
                )}
                {lowInfoTotal > 0 && (
                  <button
                    type="button"
                    onClick={() => handleSeverityFilter('LOW_INFO')}
                    className={`rounded-xl px-2.5 py-1 text-xs font-semibold border transition-all cursor-pointer ${
                      severityFilter === 'LOW_INFO'
                        ? 'border-slate-500 bg-slate-500/20 text-slate-300 font-bold'
                        : 'border-line bg-card text-muted hover:text-ink'
                    }`}
                  >
                    Bajo/Info ({lowInfoTotal})
                  </button>
                )}

                {(severityFilter !== 'all' || layerFilter !== 'all' || serviceFilter !== 'all' || statusFilter !== 'all' || searchQuery) && (
                  <button
                    type="button"
                    onClick={resetAllFilters}
                    className="ml-auto text-[11px] font-semibold text-blue-400 hover:text-blue-300 hover:underline cursor-pointer"
                  >
                    Limpiar filtros
                  </button>
                )}
              </div>
            </div>

            {/* Empty States */}
            {!selected && (
              <div className="py-12 text-center">
                <Cloud size={32} className="mx-auto text-blue-500 opacity-80" />
                <p className="mt-3 text-sm font-bold text-ink">Sin evaluación registrada</p>
                <p className="mt-1 text-xs text-muted">Ejecuta la primera evaluación AWS para crear la línea base.</p>
              </div>
            )}

            {selected && ['pending', 'running'].includes(selected.status) && (
              <div className="rounded-2xl border border-blue-500/20 bg-blue-500/10 p-5 text-center text-xs text-blue-400">
                <LoaderCircle size={20} className="mx-auto mb-2 animate-spin text-blue-400" />
                La evaluación está procesándose de forma segura en segundo plano…
              </div>
            )}

            {selected?.status === 'failed' && (
              <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4 text-xs text-rose-400">
                <AlertTriangle size={16} className="mr-1 inline text-rose-500" />
                {selected.errorMessage || 'Ocurrió un error al ejecutar la evaluación.'}
              </div>
            )}

            {selected?.status === 'completed' && !findings.length && (
              <div className="py-12 text-center">
                <CheckCircle2 size={36} className="mx-auto text-emerald-500" />
                <p className="mt-3 text-sm font-bold text-ink">Sin desviaciones en los controles observados</p>
                <p className="mt-1 text-xs text-muted">Todos los controles evaluados se encuentran conformes.</p>
              </div>
            )}

            {selected?.status === 'completed' && findings.length > 0 && !paginatedFindings.length && (
              <div className="rounded-2xl border border-line bg-canvas p-8 text-center">
                <Filter size={24} className="mx-auto text-muted mb-2" />
                <p className="text-xs font-bold text-ink">No hay hallazgos que coincidan con los filtros aplicados</p>
                <p className="text-[11px] text-muted mt-1">Prueba cambiando la severidad, el servicio o el término de búsqueda.</p>
                <button
                  type="button"
                  onClick={resetAllFilters}
                  className="mt-3 inline-flex items-center gap-1 rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-500 cursor-pointer"
                >
                  Restablecer todos los filtros
                </button>
              </div>
            )}

            {/* List of Paginated Finding Cards */}
            <div className="space-y-3.5">
              {paginatedFindings.map((finding) => (
                <FindingCard
                  key={finding.id}
                  finding={finding}
                  projectId={projectId}
                  onUpdated={() => {
                    void loadAssessment(selected!.id);
                  }}
                />
              ))}
            </div>

            {/* Enhanced Pagination Controls without double chevrons */}
            {totalPages > 1 && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-line pt-4 text-xs">
                <div className="text-muted">
                  Página <strong className="text-ink">{safePage}</strong> de{' '}
                  <strong className="text-ink">{totalPages}</strong>
                </div>

                <div className="flex items-center gap-1.5 self-center sm:self-auto">
                  <button
                    type="button"
                    disabled={safePage <= 1}
                    onClick={() => handlePageChange((p) => Math.max(1, p - 1))}
                    className="inline-flex items-center gap-1 rounded-xl border border-line px-3 py-1.5 text-xs font-bold text-muted hover:text-ink disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-all"
                  >
                    <ChevronLeft size={14} />
                    <span>Anterior</span>
                  </button>

                  {/* Page numbers chips */}
                  <div className="flex items-center gap-1">
                    {getVisiblePages(safePage, totalPages).map((pageNum) => (
                      <button
                        key={pageNum}
                        type="button"
                        onClick={() => handlePageChange(pageNum)}
                        className={`h-8 min-w-[32px] px-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          safePage === pageNum
                            ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30 ring-2 ring-blue-500/20'
                            : 'border border-line bg-card text-muted hover:text-ink hover:bg-canvas'
                        }`}
                      >
                        {pageNum}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    disabled={safePage >= totalPages}
                    onClick={() => handlePageChange((p) => Math.min(totalPages, p + 1))}
                    className="inline-flex items-center gap-1 rounded-xl border border-line px-3 py-1.5 text-xs font-bold text-muted hover:text-ink disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-all"
                  >
                    <span>Siguiente</span>
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </Card>

          {/* Right Column: Sticky Context with Real-time Analytics & Assessment History */}
          <aside
            aria-label="Resumen e historial de evaluaciones"
            className="space-y-4 self-start lg:self-stretch"
          >
            {/* Real-time Statistical Analytics Widget */}
            <SecurityAnalyticsWidget
              findings={findings}
              activeServiceFilter={serviceFilter}
              onSelectServiceFilter={handleServiceFilter}
            />

            {/* Historial de Evaluaciones Card */}
            <div className="lg:sticky lg:top-20">
            <Card>
              <div className="flex items-center justify-between border-b border-line pb-3">
                <h3 className="font-bold text-ink flex items-center gap-2">
                  <History size={16} className="text-violet-500" /> Historial de Evaluaciones
                </h3>
                <span className="rounded-full bg-canvas border border-line px-2 py-0.5 text-[10px] font-bold text-muted">
                  {assessments.length} registradas
                </span>
              </div>
              <div className="mt-3 space-y-2">
                {assessments.map((assessment) => {
                  const isSelected = selected?.id === assessment.id;
                  const score = assessment.score;
                  return (
                    <button
                      key={assessment.id}
                      onClick={() => void loadAssessment(assessment.id)}
                      className={`w-full rounded-xl border p-3 text-left text-xs transition-all cursor-pointer ${
                        isSelected
                          ? 'border-blue-500/60 bg-blue-500/15 shadow-sm ring-1 ring-blue-500/30'
                          : 'border-line bg-canvas hover:border-blue-500/30 hover:bg-card'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <strong className="text-ink font-semibold flex items-center gap-1.5">
                          <span
                            className={`h-2 w-2 rounded-full ${
                              score == null
                                ? 'bg-slate-500'
                                : score >= 85
                                ? 'bg-emerald-500'
                                : score >= 65
                                ? 'bg-amber-500'
                                : 'bg-rose-500'
                            }`}
                          />
                          {assessmentLabel(assessment, project)}
                        </strong>
                        <span
                          className={`rounded-md px-1.5 py-0.5 text-[10px] font-black ${
                            score == null
                              ? 'bg-slate-500/10 text-slate-400'
                              : score >= 85
                              ? 'bg-emerald-500/10 text-emerald-400'
                              : score >= 65
                              ? 'bg-amber-500/10 text-amber-400'
                              : 'bg-rose-500/10 text-rose-400'
                          }`}
                        >
                          {score ?? '—'}/100
                        </span>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-[10.5px] text-muted">
                        <span>{new Date(assessment.startedAt).toLocaleString('es-PE')}</span>
                        <span>Cob. {assessment.coverage}%</span>
                      </div>
                    </button>
                  );
                })}
                {!assessments.length && <p className="text-xs text-muted">Todavía no hay ejecuciones registradas.</p>}
              </div>
            </Card>
            </div>
          </aside>
        </div>
        </div>
      </div>
    );
}


