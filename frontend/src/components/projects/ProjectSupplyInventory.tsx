import { ProjectHelp } from './ProjectHelp';
import { useEffect, useState } from 'react';
import { apiText } from '../../lib/api';
import type { EvaluacionSeguridad } from '../../types/cloud';
import { isScoredFinding } from '../../lib/securityPresentation';
import { SupplyChainPanel } from './SupplyChainPanel';

type Package = { name: string; version?: string; type?: string; purl?: string; 'bom-ref'?: string; properties?: { name: string; value: string }[] };
export function ProjectSupplyInventory({ assessment, onFinding }: { assessment: EvaluacionSeguridad; onFinding: (id: string) => void }) {
  const [items, setItems] = useState<Package[]>([]);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [state, setState] = useState('loading');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!assessment.summary.supplyChain) { setState('absent'); return; }
    let alive = true; setState('loading'); setError('');
    void apiText(`/projects/${assessment.projectId}/security/assessments/${assessment.id}/sbom`).then((text) => {
      const bom = JSON.parse(text);
      if (!Array.isArray(bom.components)) throw new Error('El inventario no contiene una lista de componentes válida.');
      if (alive) { setItems(bom.components.filter((item: Package) => item && typeof item.name === 'string')); setState('ready'); }
    }).catch((cause) => { if (alive) { setError(cause instanceof Error ? cause.message : String(cause)); setState('failed'); } });
    return () => { alive = false; };
  }, [assessment.id, assessment.projectId, assessment.summary.supplyChain, attempt]);
  const filtered = items.filter((item) => `${item.name} ${item.version ?? ''} ${item.purl ?? ''}`.toLowerCase().includes(query.toLowerCase()));
  const pages = Math.max(1, Math.ceil(filtered.length / 20));
  const current = Math.min(page, pages - 1);
  return <section className="project-supply"><h3>Dependencias e imágenes<ProjectHelp topic="inventory" /></h3><SupplyChainPanel assessment={assessment} />
    {state === 'loading' && <p role="status">Cargando el inventario guardado…</p>}
    {error && <p role="alert">{error}<button type="button" className="project-text-action" onClick={() => setAttempt(attempt + 1)}>Reintentar</button></p>}
    {state === 'ready' && <><label className="project-search-label">Buscar componente<input aria-label="Buscar componente SBOM" value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} placeholder="Nombre, versión o PURL…" /></label><p className="project-caption">{filtered.length} componentes. La presencia en el inventario no demuestra ejecución ni dependencias transitivas.</p><ul className="project-package-list">{filtered.slice(current * 20, current * 20 + 20).map((item, index) => {
      const risks = (assessment.findings ?? []).filter((finding) => isScoredFinding(finding) && typeof item.version === 'string' && finding.evidence.package === item.name && finding.evidence.version === item.version);
      const manifests = (Array.isArray(item.properties) ? item.properties : []).filter((property) => property.name === 'cloudops:manifest' && typeof property.value === 'string');
      return <li key={item['bom-ref'] ?? `${item.name}:${item.version}:${index}`}><div><strong>{item.name}</strong><span>{item.version ?? 'Versión no registrada'} · {item.type === 'container' ? 'Imagen' : 'Biblioteca'}</span>{manifests.map((property) => <small key={property.value}>{property.value}</small>)}</div>{risks.length > 0 && <button type="button" className="project-text-action" onClick={() => onFinding(risks[0].id)}>{risks.length} alertas de este paquete y versión</button>}</li>;
    })}</ul>{!filtered.length && <p>No hay componentes que coincidan.</p>}<div className="project-pagination"><button type="button" disabled={!current} onClick={() => setPage(current - 1)}>Anterior</button><span>{current + 1} de {pages}</span><button type="button" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>Siguiente</button></div></>}
  </section>;
}
