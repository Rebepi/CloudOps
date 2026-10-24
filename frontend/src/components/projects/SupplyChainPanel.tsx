import { useState } from 'react';
import { Download } from 'lucide-react';
import { apiText } from '../../lib/api';
import type { EvaluacionSeguridad } from '../../types/cloud';

const states: Record<string, string> = { completed: 'Completado', partial: 'Parcial', failed: 'Fallido', skipped: 'Omitido' };

export function SupplyChainPanel({ assessment }: { assessment: EvaluacionSeguridad }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supply = assessment.summary.supplyChain;
  if (assessment.assessmentType === 'aws-account') return null;
  if (!supply) return <section className="mt-5 border-t border-line pt-4 text-xs text-muted">Esta evaluación no contiene un SBOM. Ejecuta un nuevo análisis para generar el inventario CycloneDX.</section>;

  const download = async () => {
    setLoading(true);
    setError(null);
    try {
      const bom = await apiText(`/projects/${assessment.projectId}/security/assessments/${assessment.id}/sbom`);
      const url = URL.createObjectURL(new Blob([bom], { type: 'application/vnd.cyclonedx+json' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `cloudops-${assessment.id}.cdx.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'No se pudo descargar el SBOM.'); }
    finally { setLoading(false); }
  };

  return <section className="mt-6 border-t border-line pt-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h3 className="text-sm font-bold text-ink">Cadena de suministro y SBOM</h3><p className="mt-1 text-xs text-muted">CycloneDX {supply.specVersion} · {supply.componentCount} componentes · {supply.manifestCount} manifiestos · {supply.licenseCount} componentes con licencia observada.</p></div>
      <button type="button" disabled={loading} onClick={() => void download()} className="inline-flex items-center gap-2 rounded-xl border border-blue-500/30 px-3 py-2 text-xs font-bold text-blue-400 disabled:opacity-50"><Download size={14} />{loading ? 'Descargando…' : 'Descargar SBOM'}</button>
    </div>
    <p className="mt-3 text-xs text-muted">Inventario de versiones observadas; no demuestra instalación, ejecución ni un grafo completo de dependencias. Licencias inventariadas sin dictamen legal.</p>
    <p className="mt-2 text-xs text-muted">Cobertura del inventario: {supply.inventoryComplete ? 'sin omisiones detectadas en los manifiestos procesados' : 'parcial; revisar observaciones y límites'}.</p>
    <p className="mt-2 break-all font-mono text-[10px] text-muted">SHA-256 del JSON canónico: {supply.sha256}</p>
    {error && <p role="alert" className="mt-2 text-xs text-rose-400">{error}</p>}
    {supply.issues.length > 0 && <details className="mt-3 rounded-xl border border-line p-3"><summary className="cursor-pointer text-xs font-bold text-amber-400">Observaciones del inventario ({supply.issues.length})</summary><div className="mt-2 space-y-2">{supply.issues.map((issue, index) => <div key={`${issue.manifest}:${index}`}><p className="break-all font-mono text-[10px] text-ink">{issue.manifest}</p><p className="text-[11px] text-muted">{issue.detail}</p></div>)}</div></details>}
    {supply.images.length > 0 && <details className="mt-3 rounded-xl border border-line p-3"><summary className="cursor-pointer text-xs font-bold text-ink">Imágenes y Trivy: {states[supply.trivy.state] ?? supply.trivy.state}</summary>
      {supply.trivy.reason && <p className="mt-2 text-[11px] text-muted">{supply.trivy.reason}</p>}
      <div className="mt-2 space-y-2">{supply.images.map((image, index) => <p key={`${image.manifest}:${index}`} className="break-all text-[11px] text-muted"><strong className="text-ink">{image.reference}</strong> · {image.pinned ? 'digest fijado' : 'sin digest inmutable'} · {image.manifest}</p>)}</div>
      {supply.trivy.results.map((result) => <p key={result.reference} className="mt-2 text-[11px] text-muted">{result.reference}: {states[result.state] ?? result.state}. {result.detail}</p>)}
    </details>}
  </section>;
}
