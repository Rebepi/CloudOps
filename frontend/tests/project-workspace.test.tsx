import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { CoverageWorkspace } from '../src/components/projects/CoverageWorkspace';
import { OverviewWorkspace } from '../src/components/projects/OverviewWorkspace';
import type { EvaluacionSeguridad } from '../src/types/cloud';

Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true });
vi.mock('../src/components/projects/AssessmentStatistics', () => ({ AssessmentStatistics: () => <p>Gráfico por capa</p> }));
vi.mock('../src/components/projects/AssessmentOverview', () => ({ AssessmentOverview: ({ mode }: { mode?: string }) => <p>{mode === 'trend' ? 'Tendencia' : 'Distribución'}</p> }));
vi.mock('../src/components/projects/AdvisoryPanel', () => ({ AdvisoryPanel: () => <p>Revisión IA</p> }));
vi.mock('../src/components/projects/SastCoveragePanel', () => ({ SastCoveragePanel: () => <p>Detalle Semgrep</p> }));
vi.mock('../src/components/projects/RepositorySecretsPanel', () => ({ RepositorySecretsPanel: () => <p>Detalle Gitleaks</p> }));
const assessment = { id: 'current', projectId: 'project', assessmentType: 'full', startedAt: '2026-10-28T00:00:00Z', score: 5, coverage: 79, findings: [], analyzers: [], summary: { counts: {}, awsServiceCoverage: [{ service: 's3', state: 'partial', observed: 2, unit: 'buckets', scope: 'global', region: null, reason: 'Inspección incompleta' }] } } as EvaluacionSeguridad;
const container = document.createElement('div');
let root = createRoot(container);
afterEach(async () => { await act(async () => root.unmount()); root = createRoot(container); });

it('cobertura muestra una fuente a la vez y conserva estados parciales', async () => {
  await act(async () => root.render(<CoverageWorkspace assessment={assessment} />));
  expect(container.textContent).toContain('Qué limita la conclusión');
  expect(container.textContent).not.toContain('Detalle Semgrep');
  const select = container.querySelector('select')!;
  await act(async () => { select.value = 'sast'; select.dispatchEvent(new Event('change', { bubbles: true })); });
  expect(container.textContent).toContain('Detalle Semgrep');
  expect(container.textContent).not.toContain('Gráfico por capa');
  await act(async () => { select.value = 'secrets'; select.dispatchEvent(new Event('change', { bubbles: true })); });
  expect(container.textContent).toContain('Detalle Gitleaks');
  expect(container.textContent).not.toContain('Detalle Semgrep');
  await act(async () => { select.value = 'aws'; select.dispatchEvent(new Event('change', { bubbles: true })); });
  expect(container.textContent).toContain('Parcial'); expect(container.textContent).toContain('Inspección incompleta');
});

it('AWS no ofrece analizadores de código y no presenta históricos sin inventario como medidos', async () => {
  await act(async () => root.render(<CoverageWorkspace assessment={{ ...assessment, assessmentType: 'aws-account', summary: { counts: {} } }} />));
  expect(container.querySelector('option[value="sast"]')).toBeNull();
  const select = container.querySelector('select')!;
  await act(async () => { select.value = 'aws'; select.dispatchEvent(new Event('change', { bubbles: true })); });
  expect(container.textContent).toContain('no conserva el inventario');
});

it('IA y tendencia se muestran bajo Evolución; cambiar evaluación conserva esa vista', async () => {
  const onSelectAssessment = vi.fn();
  const render = (selected: EvaluacionSeguridad) => <OverviewWorkspace assessment={selected} findings={[]} history={[assessment, { ...assessment, id: 'other' }]} comparison={null} onNavigateToFinding={() => {}} onSelectAssessment={onSelectAssessment} />;
  await act(async () => root.render(render(assessment)));
  expect(container.textContent).not.toContain('Revisión IA');
  const button = [...container.querySelectorAll('button')].find((item) => item.textContent === 'Evolución e informes')!;
  await act(async () => button.click());
  expect(button.getAttribute('aria-pressed')).toBe('true');
  expect(container.textContent).toContain('Revisión IA'); expect(container.textContent).toContain('Tendencia');
  const select = container.querySelector('select')!;
  await act(async () => { select.value = 'other'; select.dispatchEvent(new Event('change', { bubbles: true })); });
  expect(onSelectAssessment).toHaveBeenCalledWith('other');
  await act(async () => root.render(render({ ...assessment, id: 'other' })));
  expect(container.textContent).toContain('Revisión IA');
});
