import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Cloud, FolderKanban, Plus, ShieldCheck } from 'lucide-react';
import { api } from '../lib/api';
import type { Proyecto } from '../types/cloud';
import { Card } from '../components/ui/Card';
import { Modal } from '../components/ui/Modal';

const initialForm = {
  name: '', clientName: '', description: '', applicationType: 'Web', environment: 'Sandbox',
  region: 'us-east-1', technologyStack: '', sourceMode: 'aws',
};

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
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(initialForm);

  const load = async () => {
    try {
      const result = await api<{ data: Proyecto[] }>('/projects');
      setProjects(result.data);
      setError(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const createProject = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await api('/projects', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          technologyStack: form.technologyStack.split(',').map((item) => item.trim()).filter(Boolean),
        }),
      });
      setForm(initialForm);
      setModalOpen(false);
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setSaving(false); }
  };

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

    {error && <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-600">{error}</div>}
    {loading && <p className="text-xs text-muted">Cargando proyectos…</p>}

    {!loading && !projects.length && <Card className="py-14 text-center">
      <FolderKanban size={34} className="mx-auto text-blue-600" />
      <h3 className="mt-3 text-base font-bold text-ink">Aún no hay proyectos</h3>
      <p className="mx-auto mt-1 max-w-md text-xs text-muted">Crea el primer proyecto para guardar evaluaciones AWS y construir su historial de seguridad.</p>
      <button onClick={() => setModalOpen(true)} className="mt-4 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white">Crear proyecto</button>
    </Card>}

    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {projects.map((project) => <Card key={project.id} hover className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-blue-600">{project.clientName || 'Proyecto interno'}</p>
            <h3 className="truncate text-base font-bold text-ink">{project.name}</h3>
            <p className="mt-1 line-clamp-2 text-xs text-muted">{project.description || 'Sin descripción.'}</p>
          </div>
          <div className={`shrink-0 rounded-xl border px-3 py-2 text-center ${scoreTone(project.latestScore)}`}>
            <strong className="block text-xl leading-none">{project.latestScore ?? '—'}</strong>
            <span className="text-[9px] font-bold uppercase">seguridad</span>
          </div>
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

    <Modal abierto={modalOpen} onCerrar={() => setModalOpen(false)} titulo="Crear proyecto" subtitulo="Será el contexto común para costos, arquitectura y seguridad." tamano="lg">
      <form onSubmit={createProject} className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
        <label className="sm:col-span-1 font-semibold text-ink">Nombre del proyecto<input required minLength={3} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="mt-1.5 w-full rounded-xl border border-line bg-canvas px-3 py-2.5 font-normal" /></label>
        <label className="sm:col-span-1 font-semibold text-ink">Cliente u organización<input value={form.clientName} onChange={(event) => setForm({ ...form, clientName: event.target.value })} className="mt-1.5 w-full rounded-xl border border-line bg-canvas px-3 py-2.5 font-normal" /></label>
        <label className="sm:col-span-2 font-semibold text-ink">Descripción<textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} rows={3} className="mt-1.5 w-full rounded-xl border border-line bg-canvas px-3 py-2.5 font-normal" /></label>
        <label className="font-semibold text-ink">Tipo de aplicación<select value={form.applicationType} onChange={(event) => setForm({ ...form, applicationType: event.target.value })} className="mt-1.5 w-full rounded-xl border border-line bg-canvas px-3 py-2.5 font-normal">{['Web','Móvil','API','Analítica','Interna'].map((value) => <option key={value}>{value}</option>)}</select></label>
        <label className="font-semibold text-ink">Ambiente<select value={form.environment} onChange={(event) => setForm({ ...form, environment: event.target.value })} className="mt-1.5 w-full rounded-xl border border-line bg-canvas px-3 py-2.5 font-normal">{['Producción','Staging','Sandbox'].map((value) => <option key={value}>{value}</option>)}</select></label>
        <label className="font-semibold text-ink">Región AWS<input required pattern="[a-z]{2}(-gov)?-[a-z]+-[0-9]" value={form.region} onChange={(event) => setForm({ ...form, region: event.target.value })} className="mt-1.5 w-full rounded-xl border border-line bg-canvas px-3 py-2.5 font-normal" /></label>
        <label className="font-semibold text-ink">Fuente inicial<select value={form.sourceMode} onChange={(event) => setForm({ ...form, sourceMode: event.target.value })} className="mt-1.5 w-full rounded-xl border border-line bg-canvas px-3 py-2.5 font-normal"><option value="aws">Cuenta AWS actual</option><option value="repository">Repositorio</option><option value="zip">Archivo ZIP</option><option value="none">Se definirá después</option></select></label>
        <label className="sm:col-span-2 font-semibold text-ink">Tecnologías, separadas por coma<input value={form.technologyStack} onChange={(event) => setForm({ ...form, technologyStack: event.target.value })} placeholder="PHP, PostgreSQL, React" className="mt-1.5 w-full rounded-xl border border-line bg-canvas px-3 py-2.5 font-normal" /></label>
        <div className="sm:col-span-2 flex justify-end gap-2 border-t border-line pt-4">
          <button type="button" onClick={() => setModalOpen(false)} className="rounded-xl border border-line px-4 py-2 font-bold text-muted">Cancelar</button>
          <button disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 font-bold text-white disabled:opacity-50"><Cloud size={14} />{saving ? 'Guardando…' : 'Crear proyecto'}</button>
        </div>
      </form>
    </Modal>
  </div>;
}
