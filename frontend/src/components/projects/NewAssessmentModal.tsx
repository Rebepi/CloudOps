import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Cloud, Code2, GitBranch, KeyRound, Layers3, LoaderCircle, PackageSearch, Play, ScanSearch, ShieldCheck } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { FileDropZone } from '../ui/FileDropZone';

export function NewAssessmentModal({ onClose, onRun, hasRepo, awsReady, awsReason, busy }: {
  onClose: () => void; onRun: (scope: 'code' | 'aws' | 'full', archive?: File) => void;
  hasRepo: boolean; awsReady: boolean; awsReason?: string; busy: boolean;
}) {
  const [scope, setScope] = useState<'code' | 'aws' | 'full'>('code');
  const [archive, setArchive] = useState<File | undefined>();
  const [dropError, setDropError] = useState('');
  const options = [
    { id: 'code' as const, title: hasRepo ? 'Código del repositorio' : 'Código de ZIP', Icon: Code2, detail: hasRepo ? 'Archivos del commit actual: backend, frontend y configuración.' : 'Sube un ZIP con backend, frontend y configuración para analizarlo.' },
    { id: 'aws' as const, title: 'Cuenta AWS', Icon: Cloud, detail: 'Recursos y controles de la cuenta y región conectadas.' },
    { id: 'full' as const, title: 'Evaluación integral', Icon: Layers3, detail: 'Código y cuenta AWS en una evaluación combinada.' },
  ];
  const code = scope !== 'aws';
  const aws = scope !== 'code';
  const reason = code && !hasRepo && !archive ? 'Selecciona el archivo ZIP que quieres evaluar.'
    : code && archive && (!archive.name.toLowerCase().endsWith('.zip') || archive.size > 100 * 1024 * 1024) ? 'Selecciona un ZIP de hasta 100 MB.'
      : aws && !awsReady ? awsReason || 'Configura una conexión AWS con un rol de auditoría válido.' : '';
  return createPortal(<Modal abierto onCerrar={onClose} titulo="Nueva evaluación" subtitulo="Selecciona el alcance, revisa las comprobaciones y ejecuta el análisis." tamano="xl">
    <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Tipo de evaluación">{options.map(({ id, title, Icon, detail }) => <button key={id} type="button" role="radio" aria-checked={scope === id} onClick={() => setScope(id)} className={`rounded-xl border p-4 text-left cursor-pointer ${scope === id ? 'border-blue-500 bg-blue-500/10' : 'border-line hover:bg-canvas'}`}><Icon size={24} className="mb-3 text-blue-400" /><strong className="block text-sm text-ink">{title}</strong><p className="mt-2 text-xs leading-relaxed text-muted">{detail}</p></button>)}</div>
    {code && !hasRepo && <FileDropZone onFile={(file) => { setArchive(file); setDropError(''); }} onError={setDropError} disabled={busy}><label className="mt-4 block rounded-xl border border-dashed border-violet-500/40 p-4 text-xs font-semibold text-ink">Selecciona o arrastra un ZIP (hasta 100 MB)<input aria-label="Archivo ZIP para evaluar" type="file" accept=".zip,application/zip" onChange={(event) => { setArchive(event.target.files?.[0]); setDropError(''); }} className="mt-2 block w-full text-xs text-muted" />{archive && <span className="mt-2 block text-violet-400">{archive.name}</span>}</label></FileDropZone>}
    {dropError && <p role="alert" className="mt-2 text-xs text-rose-400">{dropError}</p>}
    <div className="mt-5 border-y border-line py-4"><h4 className="text-xs font-bold uppercase tracking-wider text-muted">Acciones de esta evaluación</h4><ul className="mt-3 grid gap-4 sm:grid-cols-2">
      {code && <><li className="flex gap-3"><GitBranch className="shrink-0 text-violet-400" size={19} /><div><strong className="text-xs text-ink">{hasRepo ? 'Descargar e inventariar' : 'Recibir e inventariar ZIP'}</strong><p className="text-xs text-muted">{hasRepo ? 'Commit, carpetas, módulos y archivos de ambas capas.' : 'Carpetas, módulos y archivos del ZIP seleccionado.'}</p></div></li><li className="flex gap-3"><KeyRound className="shrink-0 text-violet-400" size={19} /><div><strong className="text-xs text-ink">Revisar código y secretos</strong><p className="text-xs text-muted">Reglas estáticas, credenciales y configuraciones inseguras.</p></div></li><li className="flex gap-3"><PackageSearch className="shrink-0 text-violet-400" size={19} /><div><strong className="text-xs text-ink">Contrastar dependencias</strong><p className="text-xs text-muted">Versiones fijadas en lockfiles consultadas en OSV.</p></div></li></>}
      {aws && <><li className="flex gap-3"><Cloud className="shrink-0 text-sky-400" size={19} /><div><strong className="text-xs text-ink">Consultar recursos AWS</strong><p className="text-xs text-muted">IAM, CloudTrail, S3, Security Groups y RDS.</p></div></li><li className="flex gap-3"><ShieldCheck className="shrink-0 text-sky-400" size={19} /><div><strong className="text-xs text-ink">Recoger postura y vulnerabilidades</strong><p className="text-xs text-muted">Security Hub, Config e Inspector según disponibilidad y permisos.</p></div></li></>}
      <li className="flex gap-3"><ScanSearch className="shrink-0 text-blue-400" size={19} /><div><strong className="text-xs text-ink">Calcular y guardar resultados</strong><p className="text-xs text-muted">Hallazgos priorizados, cobertura observada y puntaje del alcance elegido.</p></div></li>
    </ul></div>
    {reason && <p role="status" className="mt-3 text-xs text-amber-400">{reason}</p>}
    <div className="mt-5 flex items-center justify-between gap-3"><p className="text-[11px] text-muted">{aws ? 'Consulta AWS de solo lectura. Los servicios disponibles determinan la cobertura.' : 'La evaluación recorre los archivos sin ejecutar su código.'}</p><button disabled={busy || Boolean(reason)} onClick={() => { if (!hasRepo && code && archive) onRun(scope, archive); else onRun(scope); }} className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-40 cursor-pointer">{busy ? <LoaderCircle size={15} className="animate-spin" /> : <Play size={15} />}Iniciar evaluación</button></div>
  </Modal>, document.body);
}
