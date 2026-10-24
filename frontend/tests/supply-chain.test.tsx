import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { SupplyChainPanel } from '../src/components/projects/SupplyChainPanel';
import type { EvaluacionSeguridad } from '../src/types/cloud';
import { detectFindingLayer } from '../src/components/security/findingLayerHelper';

const assessment: EvaluacionSeguridad = { id: 'assessment', projectId: 'project', assessmentType: 'code', status: 'completed',
  region: 'us-east-1', score: 100, coverage: 50, confidence: 'low', startedAt: '2026-10-23T00:00:00Z', summary: {} };

describe('cadena de suministro y SBOM', () => {
  it('ofrece descarga CycloneDX y comunica imágenes no evaluadas sin declararlas seguras', () => {
    const html = renderToStaticMarkup(<SupplyChainPanel assessment={{ ...assessment, summary: { supplyChain: {
      format: 'CycloneDX', specVersion: '1.6', sha256: 'a'.repeat(64), componentCount: 2, manifestCount: 1, licenseCount: 1,
      inventoryComplete: false, issues: [], images: [{ reference: 'node:22', manifest: 'Dockerfile', pinned: false }],
      trivy: { state: 'skipped', reason: 'Trivy no está habilitado.', results: [] },
    } } }} />);
    expect(html).toContain('Descargar SBOM');
    expect(html).toContain('JSON canónico');
    expect(html).toContain('Omitido');
    expect(html).toContain('sin digest inmutable');
  });
  it('evaluaciones históricas requieren reanálisis y AWS no muestra un SBOM inexistente', () => {
    expect(renderToStaticMarkup(<SupplyChainPanel assessment={assessment} />)).toContain('no contiene un SBOM');
    expect(renderToStaticMarkup(<SupplyChainPanel assessment={{ ...assessment, assessmentType: 'aws-account' }} />)).toBe('');
  });
  it('distingue secretos de imagen y vulnerabilidades de paquetes', () => {
    expect(detectFindingLayer({ source: 'trivy', category: 'secret', resource: 'registry/app:1' })).toBe('infrastructure');
    expect(detectFindingLayer({ source: 'trivy', category: 'dependency', resource: 'registry/app:1' })).toBe('dependencies');
  });
});
