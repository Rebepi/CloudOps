import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, FileCode2, Folder, FolderOpen, Search } from 'lucide-react';
import type { RepositoryEntry } from '../../types/cloud';

type TreeNode = {
  path: string;
  name: string;
  directory: boolean;
  entry?: RepositoryEntry;
  children: Map<string, TreeNode>;
  fileCount: number;
};

function buildTree(entries: RepositoryEntry[]) {
  const root: TreeNode = { path: '', name: '', directory: true, children: new Map(), fileCount: 0 };
  for (const entry of entries) {
    const parts = entry.path.replace(/\\/g, '/').split('/').filter(Boolean);
    let parent = root;
    for (let index = 0; index < parts.length; index++) {
      const name = parts[index];
      const path = parts.slice(0, index + 1).join('/');
      let node = parent.children.get(name);
      if (!node) {
        node = { path, name, directory: index < parts.length - 1 || entry.kind === 'directory', children: new Map(), fileCount: 0 };
        parent.children.set(name, node);
      }
      if (entry.kind === 'file') parent.fileCount++;
      if (index === parts.length - 1) node.entry = entry;
      parent = node;
    }
  }
  return root;
}

const statusLabels: Record<RepositoryEntry['analysisStatus'], string> = {
  analyzed: 'Analizado', unsupported: 'Formato no analizado', 'text-limit': 'Omitido por límite de lectura', binary: 'Binario', directory: 'Carpeta',
};
const generatedPath = /(?:^|\/)(?:__pycache__|node_modules|\.git|\.venv|venv|dist|build|\.next)(?:\/|$)|\.pyc$/i;

function Branch({ node, depth, expanded, toggle, searching }: {
  node: TreeNode; depth: number; expanded: Set<string>; toggle: (path: string) => void; searching: boolean;
}) {
  const open = searching || expanded.has(node.path);
  const children = [...node.children.values()].sort((a, b) => Number(b.directory) - Number(a.directory) || a.name.localeCompare(b.name));
  const Icon = node.directory ? open ? FolderOpen : Folder : FileCode2;
  return <li>
    <div className="flex min-w-max items-center gap-2 rounded-lg py-1.5 pr-3 text-xs hover:bg-blue-500/5" style={{ paddingLeft: `${depth * 18 + 8}px` }}>
      {node.directory ? <button type="button" aria-expanded={open} aria-label={`${open ? 'Contraer' : 'Expandir'} ${node.name}`} onClick={() => toggle(node.path)} className="flex min-w-0 items-center gap-2 text-left text-ink cursor-pointer">
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}<Icon size={15} className="text-blue-400" /><span className="font-mono font-semibold">{node.name}</span>
      </button> : <><span className="w-[13px]" /><Icon size={14} className="text-muted" /><span className="font-mono text-ink" title={node.path}>{node.name}</span></>}
      {node.directory ? <span className="text-[10px] text-muted">{node.fileCount} archivos</span> : <>
        <span className={`text-[10px] ${node.entry?.analysisStatus === 'analyzed' ? 'text-emerald-400' : 'text-muted'}`}>{node.entry ? statusLabels[node.entry.analysisStatus] : ''}</span>
        <span className="text-[10px] text-muted">{((node.entry?.sizeBytes ?? 0) / 1024).toLocaleString('es-PE', { maximumFractionDigits: 1 })} KB</span>
      </>}
    </div>
    {node.directory && open && <ul>{children.map((child) => <Branch key={child.path} node={child} depth={depth + 1} expanded={expanded} toggle={toggle} searching={searching} />)}</ul>}
  </li>;
}

export function RepositoryTree({ entries, complete }: { entries: RepositoryEntry[]; complete: boolean }) {
  const [query, setQuery] = useState('');
  const [showGenerated, setShowGenerated] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const top = new Set(entries.map((entry) => entry.path.split('/')[0]));
    return top.size === 1 ? top : new Set();
  });
  const term = query.trim().toLowerCase();
  const visible = useMemo(() => entries.filter((entry) => (showGenerated || !generatedPath.test(entry.path)) && (!term || entry.path.toLowerCase().includes(term))), [entries, showGenerated, term]);
  const tree = useMemo(() => buildTree(visible), [visible]);
  const roots = [...tree.children.values()].sort((a, b) => Number(b.directory) - Number(a.directory) || a.name.localeCompare(b.name));
  const toggle = (path: string) => setExpanded((previous) => {
    const next = new Set(previous);
    if (next.has(path)) next.delete(path); else next.add(path);
    return next;
  });
  return <section className="mt-5 rounded-2xl border border-line bg-canvas/40 p-4">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-sm font-bold text-ink">Estructura de carpetas y módulos</h3><p className="mt-1 text-[11px] text-muted">Expande una carpeta para recorrer sus submódulos y archivos del artefacto evaluado.</p></div><span className="text-[11px] text-muted">{visible.filter((entry) => entry.kind === 'file').length} archivos visibles</span></div>
    <div className="mt-4 flex flex-wrap items-center gap-3"><label className="relative min-w-48 flex-1"><Search size={14} className="absolute left-3 top-2.5 text-muted" /><input aria-label="Buscar carpeta o archivo" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar módulo, carpeta o archivo…" className="w-full rounded-xl border border-line bg-card py-2 pl-9 pr-3 text-xs text-ink" /></label><label className="flex items-center gap-2 text-[11px] text-muted"><input type="checkbox" checked={showGenerated} onChange={(event) => setShowGenerated(event.target.checked)} />Mostrar generados y dependencias instaladas</label><button type="button" onClick={() => { setQuery(''); setExpanded(new Set()); }} className="text-xs font-semibold text-blue-400 cursor-pointer">Contraer todo</button></div>
    {!complete && <p className="mt-3 text-[11px] text-amber-400">Inventario parcial de esta evaluación.</p>}
    <div className="mt-4 max-h-[560px] overflow-auto rounded-xl border border-line bg-card p-2">
      {roots.length ? <ul aria-label="Carpetas y archivos del proyecto">{roots.map((node) => <Branch key={node.path} node={node} depth={0} expanded={expanded} toggle={toggle} searching={Boolean(term)} />)}</ul> : <p className="p-4 text-xs text-muted">No hay archivos que coincidan con la búsqueda.</p>}
    </div>
    <p className="mt-3 text-[10px] text-muted">“Analizado” indica que se leyó el archivo durante esta ejecución. Los formatos no compatibles y los archivos omitidos conservan su estado visible.</p>
  </section>;
}
