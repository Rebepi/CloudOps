import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { SastCoveragePanel } from '../src/components/projects/SastCoveragePanel';
import type { EvaluacionSeguridad } from '../src/types/cloud';

const assessment: EvaluacionSeguridad = { id: 'assessment', projectId: 'project', assessmentType: 'code', status: 'completed',
  region: 'us-east-1', score: 85, coverage: 50, confidence: 'low', startedAt: '2026-10-23T00:00:00Z', summary: {} };

describe('cobertura SAST', () => {
  it('históricos no se presentan como análisis de flujo ya ejecutados', () => {
    expect(renderToStaticMarkup(<SastCoveragePanel assessment={assessment} />)).toContain('anterior al SAST');
  });
  it('lenguajes no soportados y exclusiones quedan visibles', () => {
    const html = renderToStaticMarkup(<SastCoveragePanel assessment={{ ...assessment, summary: { sast: {
      state: 'partial', reason: 'Lenguajes sin reglas.', filesCandidate: 3, filesEligible: 1, filesAnalyzed: 1, filesExcluded: 1,
      filesSkipped: 0, unsupportedFiles: 1, engineVersion: '1.182.0', catalog: { version: '2026.10.1', ruleCount: 12, sha256: 'a'.repeat(64) },
      languages: [{ language: 'java', state: 'not_supported', filesCandidate: 1, filesAnalyzed: 0, filesExcluded: 0, rules: [] }], skipped: [],
    } } }} />);
    expect(html).toContain('No soportado');
    expect(html).toContain('2026.10.1');
    expect(html).toContain('intraprocedimental');
  });
  it('evaluaciones AWS no muestran un resultado SAST inexistente', () => {
    expect(renderToStaticMarkup(<SastCoveragePanel assessment={{ ...assessment, assessmentType: 'aws-account' }} />)).toBe('');
  });
});
