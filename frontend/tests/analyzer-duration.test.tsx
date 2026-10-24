import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { SecurityDimensions } from '../src/components/projects/SecurityDimensions';
import { FindingCard } from '../src/components/security/FindingCard';
import type { AnalizadorEvaluacion, DimensionSeguridad } from '../src/types/cloud';

const dimensions: DimensionSeguridad[] = [{ id: 'dependencies', label: 'Dependencias', description: 'Paquetes', score: null,
  coverage: 50, state: 'partial', controls: [], counts: {}, scoreExcludedFindings: 0 }];
const analyzer: AnalizadorEvaluacion = { analyzerId: 'osv', dimension: 'dependencies', state: 'partial', itemsAnalyzed: 1,
  findingsCount: 1, durationMs: 0, detail: { timingScope: 'elapsed-service', metrics: { requests: 3, retries: 2 } } };

describe('duración y reintentos de analizadores', () => {
  it('conserva cero milisegundos como medición válida y muestra solicitudes reales', () => {
    const html = renderToStaticMarkup(<SecurityDimensions dimensions={dimensions} analyzers={[analyzer]} />);
    expect(html).toContain('0 ms');
    expect(html).toContain('3 solicitudes, 2 reintentos');
  });
  it('no inventa una duración para ejecuciones históricas', () => {
    const html = renderToStaticMarkup(<SecurityDimensions dimensions={dimensions} analyzers={[{ ...analyzer, durationMs: null }]} />);
    expect(html).not.toContain('0 ms');
    expect(html).toContain('ausencia de medición');
  });
  it('identifica la severidad de respaldo OSV como estimada', () => {
    const html = renderToStaticMarkup(<FindingCard projectId="project" onUpdated={() => {}} finding={{
      id: 'finding', assessmentId: 'assessment', source: 'osv', category: 'dependency', title: 'GHSA-observed',
      description: 'Paquete afectado', severity: 'MEDIUM', status: 'open', recommendation: 'Actualizar paquete.',
      evidence: { severityEstimated: true }, createdAt: '2026-10-23T00:00:00Z',
    }} />);
    expect(html).toContain('Severidad estimada');
  });
});
