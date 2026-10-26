import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { IacCoveragePanel } from '../src/components/projects/IacCoveragePanel';
import { FindingCard } from '../src/components/security/FindingCard';
import type { EvaluacionSeguridad } from '../src/types/cloud';

const assessment: EvaluacionSeguridad = { id: 'assessment', projectId: 'project', assessmentType: 'code', status: 'completed', region: 'us-east-1',
  score: 85, coverage: 50, confidence: 'low', startedAt: '2026-10-23T00:00:00Z', summary: {} };
describe('infraestructura declarada', () => {
  it('históricos y AWS no se presentan como IaC ya evaluada', () => {
    expect(renderToStaticMarkup(<IacCoveragePanel assessment={assessment} />)).toContain('anterior al perfil IaC');
    expect(renderToStaticMarkup(<IacCoveragePanel assessment={{ ...assessment, assessmentType: 'aws-account' }} />)).toBe('');
  });
  it('cobertura parcial y condiciones no resueltas permanecen visibles', () => {
    const html = renderToStaticMarkup(<IacCoveragePanel assessment={{ ...assessment, summary: { iac: {
      state: 'partial', reason: 'Módulos no resueltos.', filesCandidate: 2, filesSubmitted: 1, filesSkipped: 1, targetsAnalyzed: 1,
      catalog: { version: '2026.10.iac1', rulesSource: 'embedded', engineVersion: '0.76.1', image: 'pinned', deployment: 'not-verified' },
      engine: { mode: 'docker', image: 'pinned', vendorInvoked: true }, checks: { successes: 10, failures: 0, exceptions: 1 }, kinds: ['terraform', 'compose'],
      reportedKinds: ['terraform'], skipped: [{ path: 'compose.yaml', reason: 'No soportado' }], unresolved: [{ path: 'infra/main.tf', reason: 'Referencia externa.' }],
    } } }} />);
    expect(html).toContain('Parcial');
    expect(html).toContain('Referencia externa.');
    expect(html).toContain('No son recursos desplegados');
  });
  it('hallazgo IaC y referencias relacionadas no certifican despliegue o cumplimiento', () => {
    const html = renderToStaticMarkup(<FindingCard projectId="project" onUpdated={() => {}} finding={{ id: 'finding', assessmentId: 'assessment',
      source: 'trivy-config', category: 'iac', title: 'Acceso público declarado', description: 'Declaración insegura', severity: 'HIGH', status: 'open',
      recommendation: 'Restringir el origen.', createdAt: '2026-10-23T00:00:00Z', evidence: { frameworkReferences: [{ framework: 'AWS FSBP', control: 'EC2.13', relation: 'related' }] } }} />);
    expect(html).toContain('despliegue no verificado');
    expect(html).toContain('no acredita cumplimiento');
  });
});
