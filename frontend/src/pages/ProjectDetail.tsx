import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Cloud,
  FileArchive,
  FileDown,
  Filter,
  GitBranch,
  History,
  LoaderCircle,
  Play,
  Plus,
  Search,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { api } from '../lib/api';
import type {
  AwsConnectionStatus,
  ComparacionEvaluacion,
  EvaluacionSeguridad,
  Proyecto,
  ProgramacionEvaluacion,
} from '../types/cloud';
import { Card } from '../components/ui/Card';
import { useAws } from '../hooks/useAws';
import { SecurityReportModal } from '../components/reports/SecurityReportModal';
import { FindingCard } from '../components/security/FindingCard';
import { NewFindingsComparison } from '../components/security/NewFindingsComparison';
import { detectAwsService } from '../components/security/findingServiceHelper';
import { SecurityAnalyticsWidget } from '../components/security/SecurityAnalyticsWidget';
import { ManageProjectModal } from '../components/projects/ManageProjectModal';

function assessmentTypeLabel(type: string) {
  if (type === 'full') return 'Completa (AWS + código)';
  if (type === 'code') return 'Código / ZIP';
  return 'Cuenta AWS';
}

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
  const navigate = useNavigate();
  const awsConnection = useAws<AwsConnectionStatus>('/aws/connection');
  const [project, setProject] = useState<Proyecto | null>(null);
  const [assessments, setAssessments] = useState<EvaluacionSeguridad[]>([]);
  const [selected, setSelected] = useState<EvaluacionSeguridad | null>(null);
  const [comparison, setComparison] = useState<ComparacionEvaluacion | null>(null);
  const [schedules, setSchedules] = useState<ProgramacionEvaluacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [archive, setArchive] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [manageModalOpen, setManageModalOpen] = useState(false);
  const [scheduleCadence, setScheduleCadence] = useState<'daily' | 'weekly' | 'monthly'>('weekly');
  const [scheduleEmail, setScheduleEmail] = useState('');
  const [repoForm, setRepoForm] = useState({ provider: 'github', owner: '', name: '', defaultBranch: 'main' });
  const [repoBusy, setRepoBusy] = useState(false);
  const [showRepoEdit, setShowRepoEdit] = useState(false);
  const [showZipUpload, setShowZipUpload] = useState(false);

  // Filters and Pagination for Hallazgos Normalizados
  const [severityFilter, setSeverityFilter] = useState<'all' | 'critical_high' | 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW_INFO'>('critical_high');
  const [serviceFilter, setServiceFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  const loadAssessment = useCallback(async (assessmentId: string) => {
    const result = await api<{ data: EvaluacionSeguridad }>(`/projects/${projectId}/security/assessments/${assessmentId}`);
    setSelected(result.data);
    try {
      const compared = await api<{ data: ComparacionEvaluacion }>(`/projects/${projectId}/security/assessments/${assessmentId}/comparison`);
      setComparison(compared.data);
    } catch {
      setComparison(null);
    }
  }, [projectId]);

  const loadSchedules = useCallback(async () => {
    try {
      const result = await api<{ data: ProgramacionEvaluacion[] }>(`/projects/${projectId}/security/schedules`);
      setSchedules(result.data);
    } catch {
      setSchedules([]);
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
    void loadSchedules();
  }, [load, loadSchedules]);

  const pollAssessment = async (assessmentId: string) => {
    let current: EvaluacionSeguridad | null = null;
    for (let attempt = 0; attempt < 180; attempt += 1) {
      const result = await api<{ data: EvaluacionSeguridad }>(`/projects/${projectId}/security/assessments/${assessmentId}`);
      current = result.data;
      setSelected(current);
      if (current.status === 'completed' || current.status === 'failed') break;
      await new Promise((resolve) => window.setTimeout(resolve, 1500));
    }
    return current;
  };

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

  const uploadArchive = async () => {
    if (!archive) return setError('Selecciona un archivo ZIP para analizar.');
    if (!archive.name.toLowerCase().endsWith('.zip')) return setError('El archivo debe tener extensión .zip.');
    if (archive.size > 100 * 1024 * 1024) return setError('El ZIP supera el límite de 100 MB.');
    setUploading(true);
    setError(null);
    try {
      const body = new FormData();
      body.append('archive', archive);
      const started = await api<{ data: { assessmentId: string } }>(`/projects/${projectId}/security/assessments/code`, { method: 'POST', body });
      const current = await pollAssessment(started.data.assessmentId);
      if (!current || !['completed', 'failed'].includes(current.status)) throw new Error('El análisis continúa en segundo plano. Actualiza el proyecto en unos minutos.');
      if (current.status === 'failed') throw new Error(current.errorMessage ?? 'No se pudo analizar el ZIP.');
      setArchive(null);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      await load();
    } finally {
      setUploading(false);
    }
  };

  const runFullAssessment = async () => {
    if (!archive) return setError('Selecciona un archivo ZIP para la evaluación completa.');
    if (!archive.name.toLowerCase().endsWith('.zip')) return setError('El archivo debe tener extensión .zip.');
    if (archive.size > 100 * 1024 * 1024) return setError('El ZIP supera el límite de 100 MB.');
    setUploading(true);
    setError(null);
    try {
      const body = new FormData();
      body.append('archive', archive);
      const started = await api<{ data: { assessmentId: string } }>(`/projects/${projectId}/security/assessments/full`, { method: 'POST', body });
      const current = await pollAssessment(started.data.assessmentId);
      if (!current || !['completed', 'failed'].includes(current.status)) throw new Error('La evaluación completa continúa en segundo plano. Actualiza el proyecto en unos minutos.');
      if (current.status === 'failed') throw new Error(current.errorMessage ?? 'No se pudo completar la evaluación completa.');
      setArchive(null);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      await load();
    } finally {
      setUploading(false);
    }
  };

  const connectRepository = async () => {
    if (!repoForm.owner.trim() || !repoForm.name.trim()) return setError('Indica propietario y nombre del repositorio.');
    setRepoBusy(true);
    setError(null);
    try {
      await api(`/projects/${projectId}/repository`, { method: 'POST', body: JSON.stringify(repoForm) });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setRepoBusy(false);
    }
  };

  const runRepositoryAssessment = async (ref?: string) => {
    setUploading(true);
    setError(null);
    try {
      const started = await api<{ data: { assessmentId: string } }>(`/projects/${projectId}/security/assessments/repository`, { method: 'POST', body: JSON.stringify({ ref: ref || undefined }) });
      const current = await pollAssessment(started.data.assessmentId);
      if (!current || current.status === 'failed') throw new Error(current?.errorMessage ?? 'No se pudo analizar el repositorio.');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      await load();
    } finally {
      setUploading(false);
    }
  };

  const createSchedule = async () => {
    setError(null);
    try {
      await api(`/projects/${projectId}/security/schedules`, { method: 'POST', body: JSON.stringify({ cadence: scheduleCadence, ...(scheduleEmail ? { notifyEmail: scheduleEmail } : {}) }) });
      setScheduleEmail('');
      await loadSchedules();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const toggleSchedule = async (schedule: ProgramacionEvaluacion) => {
    try {
      await api(`/projects/${projectId}/security/schedules/${schedule.id}`, { method: 'PATCH', body: JSON.stringify({ enabled: !schedule.enabled }) });
      await loadSchedules();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const runScheduleNow = async (schedule: ProgramacionEvaluacion) => {
    setRunning(true);
    setError(null);
    try {
      await api(`/projects/${projectId}/security/schedules/${schedule.id}/run`, { method: 'POST' });
      await Promise.all([load(), loadSchedules()]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setRunning(false);
    }
  };

  const deleteSchedule = async (schedule: ProgramacionEvaluacion) => {
    try {
      await api(`/projects/${projectId}/security/schedules/${schedule.id}`, { method: 'DELETE' });
      await loadSchedules();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
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

  // Dynamic realistic score calculation for display (resolving historical 0/100)
  const displayScore = useMemo(() => {
    if (!selected) return null;
    if (selected.score != null && selected.score > 0) return selected.score;
    if (!findings || findings.length === 0) return selected.score ?? 100;

    const penalties: Record<string, number> = { CRITICAL: 20, HIGH: 12, MEDIUM: 6, LOW: 2, INFORMATIONAL: 0 };
    const rawSum = findings.reduce((sum, f) => sum + (f.category === 'coverage' ? 0 : (penalties[f.severity] ?? 0)), 0);
    if (rawSum <= 50) return Math.max(0, 100 - rawSum);
    const excess = rawSum - 50;
    const decayed = 50 / (1 + (excess / 180));
    return Math.max(5, Math.round(decayed));
  }, [selected, findings]);

  // Project lifecycle actions: Archive & Delete
  const handleArchiveProject = async () => {
    if (!project) return;
    const nextStatus = project.status === 'archived' ? 'active' : 'archived';
    const updated = await api<{ data: Proyecto }>(`/projects/${projectId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: nextStatus }),
    });
    setProject(updated.data);
  };

  const handleDeleteProject = async () => {
    await api(`/projects/${projectId}`, { method: 'DELETE' });
    navigate('/projects');
  };

  // Extract distinct services present in current findings
  const availableServices = useMemo(() => {
    const map = new Map<string, { id: string; name: string; shortName: string; count: number }>();
    for (const f of findings) {
      const s = detectAwsService(f);
      const existing = map.get(s.id);
      if (existing) {
        existing.count += 1;
      } else {
        map.set(s.id, { id: s.id, name: s.name, shortName: s.shortName, count: 1 });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [findings]);

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
  }, [findings, severityFilter, serviceFilter, statusFilter, searchQuery]);

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
    setStatusFilter('all');
    setSearchQuery('');
    setCurrentPage(1);
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

  const counts = selected?.summary.counts ?? {};
  const repoOwner = project?.repoOwner || (project?.name.includes('/') ? project.name.split('/')[0].trim() : null);
  const repoName = project?.repoName || (project?.name.includes('/') ? project.name.split('/')[1].trim() : null);
  const repoProvider = project?.repoProvider || 'github';
  const repoBranch = project?.repoDefaultBranch || 'main';
  const hasRepo = Boolean(repoOwner && repoName);

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

      {/* Manage Project Modal */}
      {manageModalOpen && project && (
        <ManageProjectModal
          abierto={manageModalOpen}
          onCerrar={() => setManageModalOpen(false)}
          proyecto={project}
          onArchivar={handleArchiveProject}
          onEliminar={handleDeleteProject}
        />
      )}

      {/* Unified Executive Command Hero */}
      <div className="relative overflow-hidden rounded-3xl border border-line bg-gradient-to-b from-card via-card/95 to-canvas shadow-xl backdrop-blur-xl">
        {/* Ambient lighting glows */}
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-blue-600/10 blur-3xl" />
        <div className="pointer-events-none absolute -left-24 -bottom-24 h-96 w-96 rounded-full bg-indigo-600/10 blur-3xl" />

        {/* Top Header Bar */}
        <div className="p-6 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/60 pb-4 mb-6">
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
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold border ${
                    awsConnection.data.roleActive
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                      : 'border-amber-500/30 bg-amber-500/10 text-amber-400'
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      awsConnection.data.roleActive ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
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

              <button
                type="button"
                onClick={() => setManageModalOpen(true)}
                className="inline-flex items-center gap-1 rounded-full border border-line bg-canvas hover:bg-card px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-muted hover:text-ink cursor-pointer transition-colors shadow-sm"
                title="Archivar o eliminar proyecto"
              >
                <Settings2 size={12} /> Gestionar
              </button>
            </div>
          </div>

          {/* Main Hero Row: Project Metadata & Action Buttons */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
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

              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight text-ink">
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
            <div className="flex shrink-0 flex-col sm:flex-row lg:flex-col gap-2.5">
              <button
                onClick={runAwsAssessment}
                disabled={running || awsConnection.loading || !awsConnection.data?.readyForAssessment}
                title={awsConnection.data?.recommendation}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-xs font-bold text-white shadow-lg shadow-blue-600/30 hover:bg-blue-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer transition-all"
              >
                {running ? <LoaderCircle size={15} className="animate-spin" /> : <Play size={15} />}
                {running ? 'Evaluando IAM, CloudTrail, Config…' : 'Ejecutar evaluación AWS'}
              </button>
              <button
                onClick={() => setReportOpen(true)}
                disabled={!selected || selected.status !== 'completed'}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-canvas/80 px-5 py-3 text-xs font-bold text-ink hover:bg-card hover:border-blue-500/40 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer transition-all shadow-sm"
              >
                <FileDown size={15} className="text-blue-500" /> Informe PDF
              </button>
            </div>
          </div>
        </div>

        {/* Integrated Executive Metric Strip (Unified 4-Col Dock) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 border-t border-line/70 bg-canvas/60 backdrop-blur divide-y sm:divide-y-0 sm:divide-x divide-line/60">
          {/* 1. Puntaje */}
          <div className="p-5 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted">Puntaje Global</span>
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
            <div className="mt-3 flex items-baseline gap-2">
              <span
                className={`text-3xl font-black ${
                  displayScore == null
                    ? 'text-muted'
                    : displayScore >= 85
                    ? 'text-emerald-500'
                    : displayScore >= 65
                    ? 'text-amber-500'
                    : 'text-rose-500'
                }`}
              >
                {displayScore ?? '—'}/100
              </span>
            </div>
            <span className="mt-1 text-[11px] text-muted">
              {displayScore == null
                ? 'Sin evaluación'
                : displayScore >= 85
                ? 'Postura óptima'
                : displayScore >= 65
                ? 'Atención moderada'
                : displayScore >= 30
                ? 'Riesgo alto · Requiere mitigación'
                : 'Postura crítica · Remediación urgente'}
            </span>
          </div>

          {/* 2. Cobertura */}
          <div className="p-5 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted">Cobertura</span>
              <Activity size={18} className="text-blue-500" />
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-black text-ink">{selected?.coverage ?? 0}%</span>
            </div>
            <div className="mt-2 w-full bg-line/60 h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-blue-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, selected?.coverage ?? 0)}%` }}
              />
            </div>
            <span className="mt-1 text-[11px] text-muted truncate">
              IAM · CloudTrail · Config · Inspector
            </span>
          </div>

          {/* 3. Críticos y Altos */}
          <div
            className={`p-5 flex flex-col justify-between ${
              criticalHighTotal > 0 ? 'bg-rose-500/5' : ''
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted">Críticos y Altos</span>
              <AlertTriangle
                size={18}
                className={criticalHighTotal > 0 ? 'text-rose-500' : 'text-emerald-500'}
              />
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span
                className={`text-3xl font-black ${
                  criticalHighTotal > 0 ? 'text-rose-500' : 'text-ink'
                }`}
              >
                {(counts.CRITICAL ?? 0) + (counts.HIGH ?? 0)}
              </span>
              <span className="text-xs text-muted">de {findings.length} total</span>
            </div>
            <span className="mt-1 text-[11px] text-muted">
              {criticalHighTotal > 0 ? 'Requieren remediación' : 'Sin hallazgos críticos'}
            </span>
          </div>

          {/* 4. Evaluaciones Registradas */}
          <div className="p-5 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted">Historial</span>
              <History size={18} className="text-violet-500" />
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-black text-ink">{assessments.length}</span>
              <span className="text-xs text-muted">guardadas</span>
            </div>
            <span className="mt-1 text-[11px] text-muted truncate">
              {selected?.completedAt
                ? `Última: ${new Date(selected.completedAt).toLocaleDateString('es-PE')}`
                : 'Línea base activa'}
            </span>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-500/25 bg-rose-500/10 p-4 text-xs text-rose-400">
          <AlertTriangle size={15} className="mr-1.5 inline text-rose-500" />
          {error}
        </div>
      )}

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
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Hallazgos Normalizados */}
        <Card className="lg:col-span-2 space-y-5">
          {/* Section Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-line pb-4">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-ink">Hallazgos normalizados</h3>
                <span className="rounded-full bg-blue-500/10 px-2.5 py-0.5 text-xs font-bold text-blue-500 border border-blue-500/20">
                  {findings.length}
                </span>
              </div>
              <p className="text-xs text-muted mt-0.5">
                Resultados de AWS, análisis estático y dependencias organizados por servicio y nivel de riesgo.
              </p>
            </div>
            {selected?.completedAt && (
              <span className="text-[11px] text-muted self-start sm:self-auto font-mono">
                Evaluado: {new Date(selected.completedAt).toLocaleString('es-PE')}
              </span>
            )}
          </div>

          {/* Quick Filters Toolbar */}
          <div className="space-y-3 rounded-2xl bg-canvas/70 p-3 sm:p-4 border border-line">
            {/* Row 1: Search & Quick Severity Filter */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
              <div className="relative flex-1">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
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
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Service filter dropdown */}
              <div className="flex items-center gap-2">
                <div className="relative min-w-[160px]">
                  <select
                    value={serviceFilter}
                    onChange={(e) => handleServiceFilter(e.target.value)}
                    className="w-full rounded-xl border border-line bg-card px-3 py-2 text-xs text-ink focus:outline-none focus:border-blue-500 cursor-pointer"
                  >
                    <option value="all">Todos los servicios ({findings.length})</option>
                    {availableServices.map((svc) => (
                      <option key={svc.id} value={svc.id}>
                        {svc.shortName} ({svc.count})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Status filter dropdown */}
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
            </div>

            {/* Row 2: Servicios Core del Módulo (Destacados: IAM, Security Hub, AWS Config, Amazon Inspector) */}
            <div className="rounded-2xl border border-blue-500/25 bg-blue-500/5 p-2.5 sm:p-3">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <ShieldCheck size={14} className="text-blue-500" />
                  <span className="text-[11px] font-black uppercase tracking-wider text-blue-400">
                    Servicios Implementados en el Módulo
                  </span>
                  <span className="rounded-full bg-blue-500/15 px-2 py-0.5 text-[9px] font-extrabold text-blue-300 border border-blue-500/30">
                    4 Core AWS
                  </span>
                </div>
                <span className="text-[10.5px] text-muted hidden sm:inline">
                  Click para filtrar hallazgos por servicio en tiempo real
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {/* 1. IAM */}
                <button
                  type="button"
                  onClick={() => handleServiceFilter('iam')}
                  className={`flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-xs font-bold border transition-all cursor-pointer ${
                    serviceFilter === 'iam'
                      ? 'border-indigo-500 bg-indigo-500/20 text-indigo-300 ring-2 ring-indigo-500/30 shadow-md shadow-indigo-500/10'
                      : 'border-line/70 bg-card hover:border-indigo-500/40 text-muted hover:text-ink hover:bg-canvas'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="h-2.5 w-2.5 rounded-full bg-indigo-500 shrink-0" />
                    <span className="truncate">IAM</span>
                  </div>
                  <span className="rounded-md bg-indigo-500/15 px-2 py-0.5 text-[10px] font-mono font-black text-indigo-300">
                    {coreServiceCounts.iam}
                  </span>
                </button>

                {/* 2. AWS Security Hub */}
                <button
                  type="button"
                  onClick={() => handleServiceFilter('security-hub')}
                  className={`flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-xs font-bold border transition-all cursor-pointer ${
                    serviceFilter === 'security-hub'
                      ? 'border-rose-500 bg-rose-500/20 text-rose-300 ring-2 ring-rose-500/30 shadow-md shadow-rose-500/10'
                      : 'border-line/70 bg-card hover:border-rose-500/40 text-muted hover:text-ink hover:bg-canvas'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="h-2.5 w-2.5 rounded-full bg-rose-500 shrink-0" />
                    <span className="truncate">Security Hub</span>
                  </div>
                  <span className="rounded-md bg-rose-500/15 px-2 py-0.5 text-[10px] font-mono font-black text-rose-300">
                    {coreServiceCounts['security-hub']}
                  </span>
                </button>

                {/* 3. AWS Config */}
                <button
                  type="button"
                  onClick={() => handleServiceFilter('aws-config')}
                  className={`flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-xs font-bold border transition-all cursor-pointer ${
                    serviceFilter === 'aws-config' || serviceFilter === 'config'
                      ? 'border-sky-500 bg-sky-500/20 text-sky-300 ring-2 ring-sky-500/30 shadow-md shadow-sky-500/10'
                      : 'border-line/70 bg-card hover:border-sky-500/40 text-muted hover:text-ink hover:bg-canvas'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="h-2.5 w-2.5 rounded-full bg-sky-500 shrink-0" />
                    <span className="truncate">AWS Config</span>
                  </div>
                  <span className="rounded-md bg-sky-500/15 px-2 py-0.5 text-[10px] font-mono font-black text-sky-300">
                    {coreServiceCounts['aws-config']}
                  </span>
                </button>

                {/* 4. Amazon Inspector */}
                <button
                  type="button"
                  onClick={() => handleServiceFilter('amazon-inspector')}
                  className={`flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-xs font-bold border transition-all cursor-pointer ${
                    serviceFilter === 'amazon-inspector' || serviceFilter === 'inspector'
                      ? 'border-emerald-500 bg-emerald-500/20 text-emerald-300 ring-2 ring-emerald-500/30 shadow-md shadow-emerald-500/10'
                      : 'border-line/70 bg-card hover:border-emerald-500/40 text-muted hover:text-ink hover:bg-canvas'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 shrink-0" />
                    <span className="truncate">Amazon Inspector</span>
                  </div>
                  <span className="rounded-md bg-emerald-500/15 px-2 py-0.5 text-[10px] font-mono font-black text-emerald-300">
                    {coreServiceCounts['amazon-inspector']}
                  </span>
                </button>
              </div>
            </div>

            {/* Row 3: Severity Tabs (Prioritizing Critical / High) */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted mr-1 flex items-center gap-1">
                <Filter size={11} /> Severidad:
              </span>

              {/* Solo Críticos y Altos Button - Highlighted */}
              <button
                type="button"
                onClick={() => handleSeverityFilter('critical_high')}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold border transition-all cursor-pointer ${
                  severityFilter === 'critical_high'
                    ? 'border-rose-500/50 bg-rose-500/20 text-rose-300 ring-2 ring-rose-500/30'
                    : 'border-rose-500/30 bg-rose-500/10 text-rose-400 hover:bg-rose-500/15'
                }`}
              >
                <ShieldAlert size={14} className="text-rose-500" />
                Solo Críticos & Altos ({criticalHighTotal})
              </button>

              <button
                type="button"
                onClick={() => handleSeverityFilter('all')}
                className={`rounded-xl px-2.5 py-1 text-xs font-semibold border transition-colors cursor-pointer ${
                  severityFilter === 'all'
                    ? 'border-blue-500/50 bg-blue-500/20 text-blue-300'
                    : 'border-line bg-card text-muted hover:text-ink'
                }`}
              >
                Todos ({findings.length})
              </button>

              {severityCounts.CRITICAL > 0 && (
                <button
                  type="button"
                  onClick={() => handleSeverityFilter('CRITICAL')}
                  className={`rounded-xl px-2.5 py-1 text-xs font-bold border transition-colors cursor-pointer ${
                    severityFilter === 'CRITICAL'
                      ? 'border-rose-600 bg-rose-600 text-white'
                      : 'border-line bg-card text-rose-400 hover:text-rose-300'
                  }`}
                >
                  Crítico ({severityCounts.CRITICAL})
                </button>
              )}

              {severityCounts.HIGH > 0 && (
                <button
                  type="button"
                  onClick={() => handleSeverityFilter('HIGH')}
                  className={`rounded-xl px-2.5 py-1 text-xs font-bold border transition-colors cursor-pointer ${
                    severityFilter === 'HIGH'
                      ? 'border-orange-500 bg-orange-500/20 text-orange-300'
                      : 'border-line bg-card text-orange-400 hover:text-orange-300'
                  }`}
                >
                  Alto ({severityCounts.HIGH})
                </button>
              )}

              {severityCounts.MEDIUM > 0 && (
                <button
                  type="button"
                  onClick={() => handleSeverityFilter('MEDIUM')}
                  className={`rounded-xl px-2.5 py-1 text-xs font-semibold border transition-colors cursor-pointer ${
                    severityFilter === 'MEDIUM'
                      ? 'border-amber-500/50 bg-amber-500/20 text-amber-300'
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
                  className={`rounded-xl px-2.5 py-1 text-xs font-semibold border transition-colors cursor-pointer ${
                    severityFilter === 'LOW_INFO'
                      ? 'border-slate-500/50 bg-slate-500/20 text-slate-300'
                      : 'border-line bg-card text-muted hover:text-ink'
                  }`}
                >
                  Bajo & Info ({lowInfoTotal})
                </button>
              )}

              {(severityFilter !== 'all' || serviceFilter !== 'all' || statusFilter !== 'all' || searchQuery) && (
                <button
                  type="button"
                  onClick={resetAllFilters}
                  className="ml-auto text-[11px] font-semibold text-blue-500 hover:underline cursor-pointer"
                >
                  Limpiar filtros
                </button>
              )}
            </div>
          </div>

          {/* Results Summary Bar & Page Size Selector */}
          <div className="flex items-center justify-between text-xs text-muted px-1">
            <span>
              Mostrando{' '}
              <strong className="text-ink">
                {filteredFindings.length === 0 ? 0 : (safePage - 1) * pageSize + 1} -{' '}
                {Math.min(safePage * pageSize, filteredFindings.length)}
              </strong>{' '}
              de <strong className="text-ink">{filteredFindings.length}</strong> hallazgos encontrados
              {filteredFindings.length < findings.length && ` (filtrados de ${findings.length} totales)`}
            </span>

            <div className="flex items-center gap-2">
              <span className="text-[11px]">Ver:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="rounded-lg border border-line bg-card px-2 py-1 text-xs text-ink cursor-pointer focus:outline-none"
              >
                <option value={10}>10 por pág.</option>
                <option value={20}>20 por pág.</option>
                <option value={50}>50 por pág.</option>
              </select>
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

          {/* Enhanced Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-line pt-4 text-xs">
              <div className="flex items-center gap-3 text-muted">
                <span>
                  Página <strong className="text-ink">{safePage}</strong> de{' '}
                  <strong className="text-ink">{totalPages}</strong>
                </span>
                {/* Real-time Mini Distribution Indicator next to pagination */}
                <div className="hidden md:flex items-center gap-2 pl-3 border-l border-line text-[11px]">
                  <span className="flex items-center gap-1 font-semibold text-rose-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                    {criticalHighTotal} críticas/altas
                  </span>
                  <span className="text-muted/40">·</span>
                  <span className="flex items-center gap-1 font-semibold text-amber-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                    {severityCounts.MEDIUM} medias
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1.5 self-center sm:self-auto">
                <button
                  type="button"
                  disabled={safePage <= 1}
                  onClick={() => setCurrentPage(1)}
                  className="rounded-xl border border-line p-2 text-muted hover:text-ink disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                  title="Primera página"
                >
                  <ChevronLeft size={14} className="-mr-1" />
                  <ChevronLeft size={14} />
                </button>
                <button
                  type="button"
                  disabled={safePage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="rounded-xl border border-line px-3 py-1.5 text-xs font-bold text-muted hover:text-ink disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                >
                  Anterior
                </button>

                {/* Page numbers chips */}
                <div className="hidden sm:flex items-center gap-1">
                  {getVisiblePages(safePage, totalPages).map((pageNum) => (
                    <button
                      key={pageNum}
                      type="button"
                      onClick={() => setCurrentPage(pageNum)}
                      className={`h-8 w-8 rounded-xl text-xs font-bold transition-all cursor-pointer ${
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
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="rounded-xl border border-line px-3 py-1.5 text-xs font-bold text-muted hover:text-ink disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                >
                  Siguiente
                </button>
                <button
                  type="button"
                  disabled={safePage >= totalPages}
                  onClick={() => setCurrentPage(totalPages)}
                  className="rounded-xl border border-line p-2 text-muted hover:text-ink disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                  title="Última página"
                >
                  <ChevronRight size={14} />
                  <ChevronRight size={14} className="-ml-1" />
                </button>
              </div>
            </div>
          )}
        </Card>

        {/* Right Column: Context, Git, Schedules, History */}
        <div className="space-y-5">
          {/* Real-time Statistical Analytics Widget (Alongside Pagination / Findings) */}
          <SecurityAnalyticsWidget
            findings={findings}
            activeServiceFilter={serviceFilter}
            onSelectServiceFilter={handleServiceFilter}
          />

          {/* Linked Source & Cloud Context */}
          {hasRepo ? (
            <Card>
              <div className="flex items-center justify-between border-b border-line pb-3">
                <div className="flex items-center gap-2">
                  <GitBranch size={17} className="text-violet-500" />
                  <h3 className="font-bold text-sm text-ink">Repositorio Conectado</h3>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] font-bold text-violet-400 border border-violet-500/20">
                  <span className="h-1.5 w-1.5 rounded-full bg-violet-400 animate-pulse" />
                  {repoProvider === 'gitlab' ? 'GitLab' : 'GitHub'}
                </span>
              </div>

              <div className="mt-3.5 space-y-3 text-xs">
                <div className="rounded-xl bg-canvas p-3 border border-line">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-bold text-muted">Origen</span>
                    <span className="font-mono text-[10px] text-muted">rama: {repoBranch}</span>
                  </div>
                  <strong className="block text-ink text-sm font-black mt-1 break-all">
                    {repoOwner}/{repoName}
                  </strong>
                </div>

                <button
                  onClick={() => void runRepositoryAssessment(repoBranch)}
                  disabled={uploading}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-3.5 py-2.5 text-xs font-bold text-white hover:bg-violet-500 disabled:opacity-50 cursor-pointer transition-all shadow-md shadow-violet-600/20 active:scale-95"
                >
                  {uploading ? <LoaderCircle size={14} className="animate-spin" /> : <Play size={14} />}
                  {uploading ? 'Analizando repositorio…' : 'Escanear código del repositorio'}
                </button>

                <div className="pt-1 flex items-center justify-between text-[11px]">
                  <button
                    onClick={() => setShowRepoEdit(!showRepoEdit)}
                    className="font-semibold text-blue-500 hover:text-blue-400 cursor-pointer transition-colors"
                  >
                    {showRepoEdit ? 'Ocultar ajustes' : 'Modificar repositorio'}
                  </button>
                  <button
                    onClick={() => setShowZipUpload(!showZipUpload)}
                    className="font-semibold text-muted hover:text-ink cursor-pointer transition-colors"
                  >
                    {showZipUpload ? 'Ocultar ZIP' : 'Cargar ZIP alternativo'}
                  </button>
                </div>

                {showRepoEdit && (
                  <div className="mt-2 space-y-2 rounded-xl bg-canvas p-3 border border-line animate-fade-in">
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        value={repoForm.provider}
                        onChange={(event) => setRepoForm({ ...repoForm, provider: event.target.value })}
                        className="rounded-xl border border-line bg-card px-2.5 py-1.5 text-xs text-ink"
                      >
                        <option value="github">GitHub</option>
                        <option value="gitlab">GitLab</option>
                      </select>
                      <input
                        value={repoForm.defaultBranch}
                        onChange={(event) => setRepoForm({ ...repoForm, defaultBranch: event.target.value })}
                        placeholder="rama"
                        className="rounded-xl border border-line bg-card px-2.5 py-1.5 text-xs text-ink"
                      />
                    </div>
                    <input
                      value={repoForm.owner}
                      onChange={(event) => setRepoForm({ ...repoForm, owner: event.target.value })}
                      placeholder="propietario"
                      className="w-full rounded-xl border border-line bg-card px-2.5 py-1.5 text-xs text-ink"
                    />
                    <input
                      value={repoForm.name}
                      onChange={(event) => setRepoForm({ ...repoForm, name: event.target.value })}
                      placeholder="repositorio"
                      className="w-full rounded-xl border border-line bg-card px-2.5 py-1.5 text-xs text-ink"
                    />
                    <button
                      onClick={() => void connectRepository()}
                      disabled={repoBusy}
                      className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-line bg-card px-3 py-2 text-xs font-bold text-ink hover:border-blue-500/40 disabled:opacity-50 cursor-pointer"
                    >
                      {repoBusy ? <LoaderCircle size={14} className="animate-spin" /> : <GitBranch size={14} />} Guardar cambios
                    </button>
                  </div>
                )}

                {showZipUpload && (
                  <div className="mt-2 space-y-2 rounded-xl bg-canvas p-3 border border-line animate-fade-in">
                    <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-line bg-card px-3 py-2 text-[11px] font-bold text-muted hover:border-violet-500/60 transition-colors">
                      <FileArchive size={15} /> {archive ? archive.name : 'Seleccionar ZIP…'}
                      <input
                        type="file"
                        accept=".zip,application/zip"
                        className="hidden"
                        onChange={(event) => setArchive(event.target.files?.[0] ?? null)}
                      />
                    </label>
                    <div className="flex gap-2">
                      <button
                        onClick={() => void uploadArchive()}
                        disabled={!archive || uploading}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-violet-600 px-2.5 py-2 text-[11px] font-bold text-white hover:bg-violet-500 disabled:opacity-50 cursor-pointer"
                      >
                        {uploading ? <LoaderCircle size={13} className="animate-spin" /> : <Upload size={13} />} Analizar ZIP
                      </button>
                      <button
                        onClick={() => void runFullAssessment()}
                        disabled={!archive || uploading}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-violet-500/40 bg-card px-2.5 py-2 text-[11px] font-bold text-violet-400 hover:bg-violet-500/10 disabled:opacity-50 cursor-pointer"
                      >
                        {uploading ? <LoaderCircle size={13} className="animate-spin" /> : <ShieldCheck size={13} />} AWS + ZIP
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </Card>
          ) : (
            /* AWS Cloud Scope Context Card */
            <Card>
              <div className="flex items-center justify-between border-b border-line pb-3">
                <div className="flex items-center gap-2">
                  <Cloud size={17} className="text-blue-500" />
                  <h3 className="font-bold text-sm text-ink">Alcance Cloud AWS</h3>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400 border border-emerald-500/20">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Conectado
                </span>
              </div>

              <div className="mt-3.5 space-y-3 text-xs">
                <div className="rounded-xl bg-canvas p-3 border border-line space-y-1.5">
                  <div className="flex items-center justify-between text-muted">
                    <span>Región AWS:</span>
                    <strong className="font-mono text-ink">{project.region}</strong>
                  </div>
                  <div className="flex items-center justify-between text-muted">
                    <span>Rol IAM:</span>
                    <strong className="font-mono text-ink text-[11px]">CloudOpsAuditRole</strong>
                  </div>
                  <div className="flex items-center justify-between text-muted">
                    <span>Servicios:</span>
                    <span className="text-ink font-semibold">IAM, Config, Hub, Insp.</span>
                  </div>
                </div>

                <div className="pt-1 flex items-center justify-between text-[11px]">
                  <button
                    onClick={() => setShowRepoEdit(!showRepoEdit)}
                    className="font-semibold text-blue-500 hover:text-blue-400 cursor-pointer transition-colors"
                  >
                    {showRepoEdit ? 'Ocultar conexión Git' : '+ Vincular repositorio Git'}
                  </button>
                  <button
                    onClick={() => setShowZipUpload(!showZipUpload)}
                    className="font-semibold text-muted hover:text-ink cursor-pointer transition-colors"
                  >
                    {showZipUpload ? 'Ocultar ZIP' : '+ Cargar ZIP'}
                  </button>
                </div>

                {showRepoEdit && (
                  <div className="mt-2 space-y-2 rounded-xl bg-canvas p-3 border border-line animate-fade-in">
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        value={repoForm.provider}
                        onChange={(event) => setRepoForm({ ...repoForm, provider: event.target.value })}
                        className="rounded-xl border border-line bg-card px-2.5 py-1.5 text-xs text-ink"
                      >
                        <option value="github">GitHub</option>
                        <option value="gitlab">GitLab</option>
                      </select>
                      <input
                        value={repoForm.defaultBranch}
                        onChange={(event) => setRepoForm({ ...repoForm, defaultBranch: event.target.value })}
                        placeholder="rama"
                        className="rounded-xl border border-line bg-card px-2.5 py-1.5 text-xs text-ink"
                      />
                    </div>
                    <input
                      value={repoForm.owner}
                      onChange={(event) => setRepoForm({ ...repoForm, owner: event.target.value })}
                      placeholder="propietario / organización"
                      className="w-full rounded-xl border border-line bg-card px-2.5 py-1.5 text-xs text-ink"
                    />
                    <input
                      value={repoForm.name}
                      onChange={(event) => setRepoForm({ ...repoForm, name: event.target.value })}
                      placeholder="repositorio"
                      className="w-full rounded-xl border border-line bg-card px-2.5 py-1.5 text-xs text-ink"
                    />
                    <button
                      onClick={() => void connectRepository()}
                      disabled={repoBusy}
                      className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-500 disabled:opacity-50 cursor-pointer"
                    >
                      {repoBusy ? <LoaderCircle size={14} className="animate-spin" /> : <GitBranch size={14} />} Conectar
                    </button>
                  </div>
                )}

                {showZipUpload && (
                  <div className="mt-2 space-y-2 rounded-xl bg-canvas p-3 border border-line animate-fade-in">
                    <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-line bg-card px-3 py-2 text-[11px] font-bold text-muted hover:border-violet-500/60 transition-colors">
                      <FileArchive size={15} /> {archive ? archive.name : 'Seleccionar ZIP…'}
                      <input
                        type="file"
                        accept=".zip,application/zip"
                        className="hidden"
                        onChange={(event) => setArchive(event.target.files?.[0] ?? null)}
                      />
                    </label>
                    <div className="flex gap-2">
                      <button
                        onClick={() => void uploadArchive()}
                        disabled={!archive || uploading}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-violet-600 px-2.5 py-2 text-[11px] font-bold text-white hover:bg-violet-500 disabled:opacity-50 cursor-pointer"
                      >
                        {uploading ? <LoaderCircle size={13} className="animate-spin" /> : <Upload size={13} />} Analizar ZIP
                      </button>
                      <button
                        onClick={() => void runFullAssessment()}
                        disabled={!archive || uploading}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-violet-500/40 bg-card px-2.5 py-2 text-[11px] font-bold text-violet-400 hover:bg-violet-500/10 disabled:opacity-50 cursor-pointer"
                      >
                        {uploading ? <LoaderCircle size={13} className="animate-spin" /> : <ShieldCheck size={13} />} AWS + ZIP
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </Card>
          )}

          <Card>
            <div className="flex items-center gap-2">
              <Clock size={18} className="text-blue-500" />
              <h3 className="font-bold text-ink">Evaluaciones programadas</h3>
            </div>
            <div className="mt-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={scheduleCadence}
                  onChange={(event) => setScheduleCadence(event.target.value as 'daily' | 'weekly' | 'monthly')}
                  className="rounded-xl border border-line bg-card px-2.5 py-1.5 text-xs text-ink cursor-pointer"
                >
                  <option value="daily">Diaria</option>
                  <option value="weekly">Semanal</option>
                  <option value="monthly">Mensual</option>
                </select>
                <input
                  value={scheduleEmail}
                  onChange={(event) => setScheduleEmail(event.target.value)}
                  placeholder="email alerta (opcional)"
                  className="min-w-0 flex-1 rounded-xl border border-line bg-card px-2.5 py-1.5 text-xs text-ink"
                />
                <button
                  onClick={() => void createSchedule()}
                  className="inline-flex items-center gap-1 rounded-xl bg-blue-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-blue-500 cursor-pointer"
                >
                  <Plus size={13} /> Añadir
                </button>
              </div>
              {schedules.map((schedule) => (
                <div key={schedule.id} className="rounded-xl border border-line bg-canvas p-3 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <strong className="text-ink">
                      {{ daily: 'Diaria', weekly: 'Semanal', monthly: 'Mensual' }[schedule.cadence]} ·{' '}
                      {schedule.assessmentType === 'aws-account' ? 'AWS' : schedule.assessmentType}
                    </strong>
                    <span className={schedule.enabled ? 'text-emerald-500 font-bold' : 'text-muted'}>
                      {schedule.enabled ? 'activa' : 'pausada'}
                    </span>
                  </div>
                  <p className="mt-1 text-[10px] text-muted">
                    Próxima: {new Date(schedule.nextRunAt).toLocaleString('es-PE')} · {schedule.timezone}
                    {schedule.notifyEmail ? ` · ${schedule.notifyEmail}` : ''}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      onClick={() => void runScheduleNow(schedule)}
                      className="rounded-lg border border-line px-2 py-1 text-[10px] font-bold text-ink hover:border-blue-500/40 cursor-pointer"
                    >
                      Ejecutar ahora
                    </button>
                    <button
                      onClick={() => void toggleSchedule(schedule)}
                      className="rounded-lg border border-line px-2 py-1 text-[10px] font-bold text-ink hover:border-blue-500/40 cursor-pointer"
                    >
                      {schedule.enabled ? 'Pausar' : 'Activar'}
                    </button>
                    <button
                      onClick={() => void deleteSchedule(schedule)}
                      className="inline-flex items-center gap-1 rounded-lg border border-rose-500/20 px-2 py-1 text-[10px] font-bold text-rose-500 hover:bg-rose-500/10 cursor-pointer"
                    >
                      <Trash2 size={11} /> Eliminar
                    </button>
                  </div>
                </div>
              ))}
              {!schedules.length && <p className="text-xs text-muted">Sin programaciones configuradas.</p>}
            </div>
          </Card>

          {/* Historial de Evaluaciones Card */}
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
                        {assessmentTypeLabel(assessment.assessmentType)}
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
      </div>
    </div>
  );
}
