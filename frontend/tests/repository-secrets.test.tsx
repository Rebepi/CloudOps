import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { RepositorySecretsPanel } from '../src/components/projects/RepositorySecretsPanel';
import { FindingCard } from '../src/components/security/FindingCard';
import type { EvaluacionSeguridad } from '../src/types/cloud';

const assessment: EvaluacionSeguridad = { id: 'assessment', projectId: 'project', assessmentType: 'code', status: 'completed', region: 'us-east-1',
  score: 85, coverage: 50, confidence: 'low', startedAt: '2026-10-23T00:00:00Z', summary: {} };

describe('secretos de repositorio', () => {
  it('históricos requieren un nuevo análisis y AWS no muestra Gitleaks ficticio', () => {
    expect(renderToStaticMarkup(<RepositorySecretsPanel assessment={assessment} />)).toContain('anterior al análisis Gitleaks');
    expect(renderToStaticMarkup(<RepositorySecretsPanel assessment={{ ...assessment, assessmentType: 'aws-account' }} />)).toBe('');
  });
  it('estado omitido y ausencia de verificación activa quedan explícitos', () => {
    const html = renderToStaticMarkup(<RepositorySecretsPanel assessment={{ ...assessment, summary: { secrets: {
      state: 'skipped', reason: 'No habilitado', filesCandidate: 1, filesAnalyzed: 0, filesSkipped: 1, detections: 0,
      catalog: { version: '2026.10.1', sha256: null, extendsDefault: true }, engine: { name: 'gitleaks', mode: 'docker', image: 'pinned-image', version: '8.30.1' }, skipped: [],
    } } }} />);
    expect(html).toContain('Omitido');
    expect(html).toContain('No se comprueba actividad');
    expect(html).toContain('redacción 100 %');
  });
  it('sugiere responsable sin afirmar asignación o rotación automática', () => {
    const html = renderToStaticMarkup(<FindingCard projectId="project" onUpdated={() => {}} finding={{ id: 'finding', assessmentId: 'assessment',
      source: 'gitleaks', category: 'secret', title: 'Posible credencial', description: 'Valor descartado', severity: 'HIGH', status: 'open', recommendation: 'Rotar en origen.',
      createdAt: '2026-10-23T00:00:00Z', evidence: { confidence: 'generic-entropy', ownerSuggested: 'Equipo backend' } }} />);
    expect(html).toContain('Equipo backend');
    expect(html).toContain('No asignado automáticamente');
    expect(html).toContain('no se verifica');
  });
});
