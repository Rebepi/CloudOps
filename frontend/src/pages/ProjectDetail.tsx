import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Activity, AlertTriangle, ArrowLeft, CheckCircle2, Cloud, Code2, DollarSign, FileArchive, FileText, History, LoaderCircle, Play, Server, ShieldCheck, Upload } from 'lucide-react';
import { api } from '../lib/api';
import type { AwsConnectionStatus, EvaluacionSeguridad, HallazgoSeguridad, Proyecto } from '../types/cloud';
import { Card } from '../components/ui/Card';
import { useAws } from '../hooks/useAws';

const severityStyle: Record<HallazgoSeguridad['severity'], string> = {
  CRITICAL: 'bg-rose-600 text-white border-rose-600', HIGH: 'bg-rose-500/10 text-rose-600 border-rose-500/20',
  MEDIUM: 'bg-amber-500/10 text-amber-600 border-amber-500/20', LOW: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  INFORMATIONAL: 'bg-slate-500/10 text-slate-600 border-slate-500/20',
};

function scoreStyle(score: number | null) {
  if (score == null) return 'from-slate-500 to-slate-700';
  if (score >= 85) return 'from-emerald-500 to-teal-700';
  if (score >= 65) return 'from-amber-500 to-orange-600';
  return 'from-rose-500 to-red-700';
}

export default function ProjectDetail() {
  const { projectId = '' } = useParams();
  const awsConnection = useAws<AwsConnectionStatus>('/aws/connection');
  const [project, setProject] = useState<Proyecto | null>(null);
  const [assessments, setAssessments] = useState<EvaluacionSeguridad[]>([]);
  const [selected, setSelected] = useState<EvaluacionSeguridad | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [archive, setArchive] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadAssessment = useCallback(async (assessmentId: string) => {
    const result = await api<{ data: EvaluacionSeguridad }>(`/projects/${projectId}/security/assessments/${assessmentId}`);
    setSelected(result.data);
  }, [projectId]);

  const load = useCallback(async () => {
    try {
      const [projectResult, assessmentResult] = await Promise.all([
        api<{ data: Proyecto }>(`/projects/${projectId}`),
        api<{ data: EvaluacionSeguridad[] }>(`/projects/${projectId}/security/assessments`),
      ]);
      setProject(projectResult.data);
      setAssessments(assessmentResult.data);
      if (assessmentResult.data[0]) await loadAssessment(assessmentResult.data[0].id);
      else setSelected(null);
      setError(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setLoading(false); }
  }, [loadAssessment, projectId]);

  useEffect(() => { void load(); }, [load]);

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
    } finally { setRunning(false); }
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
      let current: EvaluacionSeguridad | null = null;
      for (let attempt = 0; attempt < 180; attempt += 1) {
        const result = await api<{ data: EvaluacionSeguridad }>(`/projects/${projectId}/security/assessments/${started.data.assessmentId}`);
        current = result.data;
        setSelected(current);
        if (current.status === 'completed' || current.status === 'failed') break;
        await new Promise((resolve) => window.setTimeout(resolve, 1500));
      }
      if (!current || !['completed', 'failed'].includes(current.status)) throw new Error('El análisis continúa en segundo plano. Actualiza el proyecto en unos minutos.');
      if (current.status === 'failed') throw new Error(current.errorMessage ?? 'No se pudo analizar el ZIP.');
      setArchive(null);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      await load();
    } finally { setUploading(false); }
  };

  if (loading) return <p className="text-xs text-muted">Cargando proyecto…</p>;
  if (!project) return <div className="space-y-3"><p className="text-sm text-rose-600">{error ?? 'Proyecto no encontrado.'}</p><Link to="/projects" className="text-xs font-bold text-blue-600">Volver a proyectos</Link></div>;

  const counts = selected?.summary.counts ?? {};
  const findings = selected?.findings ?? [];

  return <div className="space-y-7 animate-fade-in">
    <div className="flex items-center justify-between gap-3">
      <Link to="/projects" className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:underline"><ArrowLeft size={14} /> Portafolio</Link>
      <span className="rounded-full border border-line bg-card px-3 py-1 text-[10px] font-bold uppercase text-muted">{project.status === 'active' ? 'Activo' : project.status}</span>
    </div>

    <div className="rounded-3xl bg-gradient-to-r from-slate-950 via-blue-950 to-indigo-950 p-6 text-white shadow-xl">
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-blue-300">{project.clientName || 'Proyecto interno'} · {project.environment}</p>
          <h2 className="mt-1 text-2xl font-black">{project.name}</h2>
          <p className="mt-2 max-w-2xl text-xs leading-relaxed text-slate-300">{project.description || 'Sin descripción.'}</p>
          <div className="mt-4 flex flex-wrap gap-2 text-[10px]">
            <span className="rounded-lg border border-white/15 bg-white/10 px-2 py-1">{project.applicationType}</span>
            <span className="rounded-lg border border-white/15 bg-white/10 px-2 py-1">{project.region}</span>
            {project.technologyStack.map((technology) => <span key={technology} className="rounded-lg border border-blue-400/20 bg-blue-400/10 px-2 py-1 text-blue-200">{technology}</span>)}
          </div>
        </div>
        <button onClick={runAwsAssessment} disabled={running || awsConnection.loading || !awsConnection.data?.readyForAssessment} title={awsConnection.data?.recommendation} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white shadow-lg hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50">
          <Play size={15} /> {running ? 'Evaluando IAM, CloudTrail, Security Hub, Config e Inspector…' : 'Ejecutar evaluación AWS'}
        </button>
      </div>
    </div>

    {awsConnection.error && <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-600"><AlertTriangle size={14} className="mr-1 inline" />No se pudo validar la conexión AWS: {awsConnection.error}</div>}
    {awsConnection.data && <div className={`rounded-xl border p-4 text-xs ${awsConnection.data.roleActive ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700' : awsConnection.data.readyForAssessment ? 'border-amber-500/20 bg-amber-500/10 text-amber-700' : 'border-rose-500/20 bg-rose-500/10 text-rose-700'}`}>
      <div className="flex items-start gap-2">
        {awsConnection.data.roleActive ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> : <AlertTriangle size={16} className="mt-0.5 shrink-0" />}
        <div><strong className="block">Conexión AWS: {awsConnection.data.roleActive ? 'rol de auditoría activo' : awsConnection.data.principalType === 'root' ? 'root bloqueado' : 'rol de auditoría pendiente'}</strong><span>{awsConnection.data.recommendation}</span>{awsConnection.data.arn && <span className="mt-1 block break-all opacity-80">{awsConnection.data.arn}</span>}</div>
      </div>
    </div>}
    {error && <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-600"><AlertTriangle size={14} className="mr-1 inline" />{error}</div>}

    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      <Card className={`bg-gradient-to-br ${scoreStyle(selected?.score ?? null)} text-white border-transparent`}>
        <ShieldCheck size={20} className="opacity-80" /><strong className="mt-3 block text-3xl">{selected?.score ?? '—'}</strong><span className="text-xs opacity-80">Puntaje dentro del alcance</span>
      </Card>
      <Card><Activity size={20} className="text-blue-600" /><strong className="mt-3 block text-3xl text-ink">{selected?.coverage ?? 0}%</strong><span className="text-xs text-muted">Cobertura obtenida</span></Card>
      <Card><AlertTriangle size={20} className="text-rose-500" /><strong className="mt-3 block text-3xl text-ink">{(counts.CRITICAL ?? 0) + (counts.HIGH ?? 0)}</strong><span className="text-xs text-muted">Hallazgos críticos y altos</span></Card>
      <Card><History size={20} className="text-violet-600" /><strong className="mt-3 block text-3xl text-ink">{assessments.length}</strong><span className="text-xs text-muted">Evaluaciones guardadas</span></Card>
    </div>

    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <Card className="lg:col-span-2">
        <div className="flex items-start justify-between gap-3 border-b border-line pb-4 mb-4">
          <div><h3 className="font-bold text-ink">Hallazgos normalizados</h3><p className="text-xs text-muted">Resultados de AWS, análisis estático y dependencias ordenados por severidad.</p></div>
          {selected?.completedAt && <span className="text-[10px] text-muted">{new Date(selected.completedAt).toLocaleString('es-PE')}</span>}
        </div>
        {!selected && <div className="py-10 text-center"><Cloud size={28} className="mx-auto text-blue-600" /><p className="mt-2 text-sm font-bold text-ink">Sin evaluación</p><p className="mt-1 text-xs text-muted">Ejecuta la primera evaluación AWS para crear la línea base.</p></div>}
        {selected && ['pending', 'running'].includes(selected.status) && <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 p-3 text-xs text-blue-700"><LoaderCircle size={14} className="mr-1 inline animate-spin" />La evaluación está procesándose de forma segura.</div>}
        {selected?.status === 'failed' && <p className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-600">{selected.errorMessage}</p>}
        {selected?.status === 'completed' && !findings.length && <div className="py-10 text-center"><CheckCircle2 size={28} className="mx-auto text-emerald-500" /><p className="mt-2 text-sm font-bold text-ink">Sin desviaciones en los controles observados</p><p className="mt-1 text-xs text-muted">Esto no implica certificación; revisa la cobertura del análisis.</p></div>}
        <div className="space-y-3">
          {findings.map((finding) => <div key={finding.id} className="rounded-xl border border-line bg-canvas p-4">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2"><div><p className="text-sm font-bold text-ink">{finding.title}</p><p className="mt-1 text-xs text-muted">{finding.description}</p></div><span className={`shrink-0 rounded-lg border px-2 py-1 text-[9px] font-extrabold ${severityStyle[finding.severity]}`}>{finding.severity}</span></div>
            <div className="mt-3 rounded-lg border border-line bg-card p-2.5 text-xs"><strong className="text-ink">Recomendación:</strong> <span className="text-muted">{finding.recommendation}</span></div>
            <p className="mt-2 text-[10px] uppercase tracking-wider text-muted">Fuente: {{
              'security-hub': 'AWS Security Hub', 'aws-config': 'AWS Config', 'amazon-inspector': 'Amazon Inspector', osv: 'OSV', cloudops: 'CloudOps',
            }[finding.source]}</p>
          </div>)}
        </div>
      </Card>

      <div className="space-y-5">
        <Card>
          <h3 className="font-bold text-ink">Contexto conectado</h3>
          <div className="mt-4 space-y-3 text-xs">
            <div className="flex items-center gap-3 rounded-xl border border-line bg-canvas p-3"><Cloud size={18} className="text-blue-600" /><div><strong className="block text-ink">Cuenta AWS actual</strong><span className="text-muted">SDK backend · {project.region}</span></div></div>
            <div className="rounded-xl border border-line bg-canvas p-3">
              <div className="flex items-center gap-3"><Code2 size={18} className="text-violet-600" /><div><strong className="block text-ink">Código / ZIP</strong><span className="text-muted">Sin ejecutar código · máximo 100 MB</span></div></div>
              <label className="mt-3 flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-violet-500/30 bg-card px-3 py-2 text-[11px] font-bold text-violet-700 hover:border-violet-500/60">
                <FileArchive size={15} /> {archive ? archive.name : 'Seleccionar archivo .zip'}
                <input type="file" accept=".zip,application/zip" className="hidden" onChange={(event) => setArchive(event.target.files?.[0] ?? null)} />
              </label>
              <button onClick={() => void uploadArchive()} disabled={!archive || uploading} className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 px-3 py-2 text-[11px] font-bold text-white hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50">
                {uploading ? <LoaderCircle size={14} className="animate-spin" /> : <Upload size={14} />} {uploading ? 'Analizando ZIP…' : 'Analizar código'}
              </button>
            </div>
          </div>
        </Card>

        {selected?.assessmentType === 'code' && <Card>
          <h3 className="font-bold text-ink">Alcance del ZIP</h3>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg bg-canvas p-2"><span className="block text-muted">Entradas</span><strong className="text-ink">{selected.summary.entryCount ?? '—'}</strong></div>
            <div className="rounded-lg bg-canvas p-2"><span className="block text-muted">Archivos analizados</span><strong className="text-ink">{selected.summary.filesAnalyzed ?? '—'}</strong></div>
            <div className="rounded-lg bg-canvas p-2"><span className="block text-muted">Dependencias</span><strong className="text-ink">{selected.summary.dependencyCount ?? '—'}</strong></div>
            <div className="rounded-lg bg-canvas p-2"><span className="block text-muted">Consultadas en OSV</span><strong className="text-ink">{selected.summary.vulnerabilitiesChecked ?? '—'}</strong></div>
          </div>
          {selected.artifactName && <p className="mt-3 break-all text-[10px] text-muted">{selected.artifactName} · SHA-256 {selected.artifactSha256?.slice(0, 16)}…</p>}
          <p className="mt-2 text-[10px] leading-relaxed text-muted">{selected.summary.methodology}</p>
        </Card>}

        {selected?.assessmentType === 'aws-account' && <Card>
          <h3 className="font-bold text-ink">Cobertura AWS</h3>
          <div className="mt-3 space-y-2 text-xs">
            <div className="flex items-center justify-between rounded-lg bg-canvas p-2"><span>Security Hub</span><strong className={selected.summary.securityHubAvailable ? 'text-emerald-600' : 'text-amber-600'}>{selected.summary.securityHubAvailable ? 'Consultado' : 'No disponible'}</strong></div>
            <div className="flex items-center justify-between rounded-lg bg-canvas p-2"><span>AWS Config</span><strong className={selected.summary.configAvailable ? 'text-emerald-600' : 'text-amber-600'}>{selected.summary.configAvailable ? `${selected.summary.configRules ?? 0} reglas` : 'No disponible'}</strong></div>
            <div className="flex items-center justify-between rounded-lg bg-canvas p-2"><span>Amazon Inspector</span><strong className={selected.summary.inspectorAvailable ? 'text-emerald-600' : 'text-amber-600'}>{selected.summary.inspectorAvailable ? `${selected.summary.inspectorCoveredResources ?? 0} recursos` : 'No disponible'}</strong></div>
            <div className="flex items-center justify-between rounded-lg bg-canvas p-2"><span>IAM</span><strong className="text-ink">{selected.summary.users ?? 0} usuarios</strong></div>
          </div>
          <p className="mt-3 text-[10px] leading-relaxed text-muted">La cobertura indica qué fuentes pudieron consultarse; no equivale a certificación ni garantiza ausencia de riesgos.</p>
        </Card>}

        <Card>
          <h3 className="font-bold text-ink">Módulos relacionados</h3>
          <div className="mt-3 space-y-2 text-xs">
            <Link to="/planning" className="flex items-center justify-between rounded-xl border border-line p-3 hover:border-blue-500/30"><span className="flex items-center gap-2"><FileText size={15} className="text-violet-600" /> Planificación</span><strong>{project.proposalCount ?? 0}</strong></Link>
            <Link to="/costs" className="flex items-center justify-between rounded-xl border border-line p-3 hover:border-blue-500/30"><span className="flex items-center gap-2"><DollarSign size={15} className="text-amber-600" /> Partidas de costo</span><strong>{project.costItemCount ?? 0}</strong></Link>
            <Link to="/infrastructure" className="flex items-center justify-between rounded-xl border border-line p-3 hover:border-blue-500/30"><span className="flex items-center gap-2"><Server size={15} className="text-cyan-600" /> Recursos AWS</span><span className="text-muted">Abrir</span></Link>
          </div>
        </Card>

        <Card>
          <h3 className="font-bold text-ink">Historial</h3>
          <div className="mt-3 space-y-2">
            {assessments.map((assessment) => <button key={assessment.id} onClick={() => void loadAssessment(assessment.id)} className={`w-full rounded-xl border p-3 text-left text-xs transition-colors ${selected?.id === assessment.id ? 'border-blue-500/40 bg-blue-500/10' : 'border-line bg-canvas hover:border-blue-500/20'}`}>
              <div className="flex items-center justify-between"><strong className="text-ink">{assessment.assessmentType === 'code' ? 'Código/ZIP' : 'AWS'} · {assessment.score ?? '—'}/100</strong><span className={assessment.status === 'failed' ? 'text-rose-600' : ['pending', 'running'].includes(assessment.status) ? 'text-blue-600' : 'text-emerald-600'}>{assessment.status}</span></div>
              <p className="mt-1 text-[10px] text-muted">{new Date(assessment.startedAt).toLocaleString('es-PE')} · cobertura {assessment.coverage}%</p>
            </button>)}
            {!assessments.length && <p className="text-xs text-muted">Todavía no hay ejecuciones.</p>}
          </div>
        </Card>
      </div>
    </div>
  </div>;
}
