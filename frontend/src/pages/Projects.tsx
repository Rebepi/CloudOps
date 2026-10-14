import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, FolderKanban, Plus, ShieldCheck } from 'lucide-react';
import { api } from '../lib/api';
import type { Proyecto } from '../types/cloud';
import { Card } from '../components/ui/Card';
import { CreateProjectModal } from '../components/projects/CreateProjectModal';

function scoreTone(score?: number | null) {
  if (score == null) return 'text-muted bg-canvas border-line';
  if (score >= 85) return 'text-emerald-600 bg-emerald-500/10 border-emerald-500/20';
  if (score >= 65) return 'text-amber-600 bg-amber-500/10 border-amber-500/20';
  return 'text-rose-600 bg-rose-500/10 border-rose-500/20';
}

export default function Projects() {
  const [projects, setProjects] = useState<Proyecto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'active' | 'archived' | 'all'>('active');

  const load = async () => {
    try {
      const result = await api<{ data: Proyecto[] }>('/projects');
      setProjects(result.data);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const activeCount = projects.filter((p) => p.status !== 'archived').length;
  const archivedCount = projects.filter((p) => p.status === 'archived').length;

  const filteredProjects = projects.filter((p) => {
    if (activeTab === 'active') return p.status !== 'archived';
    if (activeTab === 'archived') return p.status === 'archived';
    return true;
  });

  return <div className="space-y-7 animate-fade-in">
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-3xl bg-gradient-to-r from-indigo-700 via-blue-700 to-cyan-700 p-6 text-white shadow-xl">
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-blue-200">Portafolio CloudOps</p>
        <h2 className="mt-1 text-2xl font-black">Proyectos, riesgo y operación en un solo contexto</h2>
        <p className="mt-1 max-w-2xl text-xs text-blue-100">Cada proyecto conecta planificación, costos, recursos AWS, evaluaciones de seguridad e historial.</p>
      </div>
      <button onClick={() => setModalOpen(true)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs font-bold text-blue-700 shadow-md hover:bg-blue-50 transition-colors">
        <Plus size={15} /> Nuevo proyecto
      </button>
    </div>

    {/* Project Portfolio Filter Tabs */}
    <div className="flex items-center justify-between border-b border-line pb-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setActiveTab('active')}
          className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'active'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
              : 'text-muted hover:text-ink hover:bg-canvas'
          }`}
        >
          Proyectos Activos ({activeCount})
        </button>
        {archivedCount > 0 && (
          <button
            type="button"
            onClick={() => setActiveTab('archived')}
            className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'archived'
                ? 'bg-slate-700 text-white shadow-md'
                : 'text-muted hover:text-ink hover:bg-canvas'
            }`}
          >
            Archivados ({archivedCount})
          </button>
        )}
        <button
          type="button"
          onClick={() => setActiveTab('all')}
          className={`rounded-xl px-3 py-1.5 text-xs font-medium transition-all cursor-pointer ${
            activeTab === 'all'
              ? 'bg-card text-ink border border-line'
              : 'text-muted hover:text-ink'
          }`}
        >
          Todos ({projects.length})
        </button>
      </div>
    </div>

    {error && <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-600">{error}</div>}
    {loading && <p className="text-xs text-muted">Cargando proyectos…</p>}

    {!loading && !filteredProjects.length && <Card className="py-14 text-center">
      <FolderKanban size={34} className="mx-auto text-blue-600" />
      <h3 className="mt-3 text-base font-bold text-ink">
        {activeTab === 'archived' ? 'No hay proyectos archivados' : 'Aún no hay proyectos'}
      </h3>
      <p className="mx-auto mt-1 max-w-md text-xs text-muted">
        {activeTab === 'archived'
          ? 'Los proyectos que archives para resguardar su auditoría aparecerán aquí.'
          : 'Crea el primer proyecto para guardar evaluaciones AWS y construir su historial de seguridad.'}
      </p>
      {activeTab !== 'archived' && (
        <button onClick={() => setModalOpen(true)} className="mt-4 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white">Crear proyecto</button>
      )}
    </Card>}

    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {filteredProjects.map((project) => <Card key={project.id} hover className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-blue-600">{project.clientName || 'Proyecto interno'}</p>
              {project.status === 'archived' && (
                <span className="rounded bg-slate-500/15 px-1.5 py-0.2 text-[9px] font-bold text-slate-400 border border-slate-500/30">
                  Archivado
                </span>
              )}
            </div>
            <h3 className="truncate text-base font-bold text-ink">{project.name}</h3>
            <p className="mt-1 line-clamp-2 text-xs text-muted">{project.description || 'Sin descripción.'}</p>
          </div>
          {(() => {
            let score = project.latestScore;
            if ((score === 0 || score == null) && project.criticalHighFindings && project.criticalHighFindings > 0) {
              const excess = (project.criticalHighFindings * 12) - 50;
              score = excess > 0 ? Math.max(10, Math.round(50 / (1 + excess / 180))) : 20;
            }
            return (
              <div className={`shrink-0 rounded-xl border px-3 py-2 text-center ${scoreTone(score)}`}>
                <strong className="block text-xl leading-none font-black">
                  {score != null ? `${score}/100` : '—'}
                </strong>
                <span className="text-[9px] font-bold uppercase tracking-wider">seguridad</span>
              </div>
            );
          })()}
        </div>

        <div className="flex flex-wrap gap-1.5 text-[10px]">
          <span className="rounded-lg border border-line bg-canvas px-2 py-1 text-muted">{project.applicationType}</span>
          <span className="rounded-lg border border-line bg-canvas px-2 py-1 text-muted">{project.environment}</span>
          <span className="rounded-lg border border-line bg-canvas px-2 py-1 text-muted">{project.region}</span>
          {project.technologyStack.slice(0, 3).map((technology) => <span key={technology} className="rounded-lg border border-blue-500/20 bg-blue-500/10 px-2 py-1 text-blue-600">{technology}</span>)}
        </div>

        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-xl border border-line bg-canvas p-2"><strong className="block text-ink">{project.assessmentCount ?? 0}</strong><span className="text-[10px] text-muted">evaluaciones</span></div>
          <div className="rounded-xl border border-line bg-canvas p-2"><strong className="block text-ink">{project.latestCoverage ?? 0}%</strong><span className="text-[10px] text-muted">cobertura</span></div>
          <div className="rounded-xl border border-line bg-canvas p-2"><strong className={project.criticalHighFindings ? 'block text-rose-600' : 'block text-ink'}>{project.criticalHighFindings ?? 0}</strong><span className="text-[10px] text-muted">riesgos altos</span></div>
        </div>

        <div className="mt-auto flex items-center justify-between border-t border-line pt-3 text-xs">
          <span className="inline-flex items-center gap-1 text-muted">{project.latestAssessmentStatus === 'failed' ? <AlertTriangle size={13} className="text-rose-500" /> : <ShieldCheck size={13} className="text-emerald-500" />}{project.latestAssessmentAt ? new Date(project.latestAssessmentAt).toLocaleDateString('es-PE') : 'Sin evaluación'}</span>
          <Link to={`/projects/${project.id}`} className="inline-flex items-center gap-1 font-bold text-blue-600 hover:underline">Abrir proyecto <ArrowRight size={13} /></Link>
        </div>
      </Card>)}
    </div>

    <CreateProjectModal
      abierto={modalOpen}
      onCerrar={() => setModalOpen(false)}
      onCreated={() => void load()}
    />
  </div>;
}
