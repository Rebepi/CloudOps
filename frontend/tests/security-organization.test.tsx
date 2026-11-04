import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { SecuritySummary } from '../src/components/projects/SecuritySummary';
import { AdvicePlan } from '../src/components/projects/AdvicePlan';
import ProjectDetail from '../src/pages/ProjectDetail';
import type { AssessmentAdvice, EvaluacionSeguridad } from '../src/types/cloud';

Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true });
vi.mock('../src/hooks/useMotionProgress', () => ({ useMotionProgress: () => 1 }));
vi.mock('../src/hooks/useAws', () => ({ useAws: () => ({ data: { readyForAssessment: true } }) }));
vi.mock('../src/lib/api', () => ({ api: vi.fn(async (path: string) => {
  if (path.endsWith('/comparison')) return { data: null };
  if (path.endsWith('/assessments')) return { data: [assessment] };
  if (path.includes('/assessments/')) return { data: assessment };
  return { data: { id: 'p', name: 'Proyecto de prueba', environment: 'Sandbox', region: 'us-east-1' } };
}) }));
const assessment = { id: 'a', projectId: 'p', status: 'completed', assessmentType: 'code', startedAt: '2026-11-03T10:00:00Z', score: 0, coverage: 75, summary: { counts: {} }, findings: [
  { id: 'closed', severity: 'CRITICAL', status: 'resolved', title: 'Ya corregido', evidence: {} },
  { id: 'open', severity: 'HIGH', status: 'open', title: 'Dependencia por revisar', resource: 'backend/uv.lock', source: 'osv', evidence: {} },
  { id: 'info', severity: 'INFORMATIONAL', status: 'open', title: 'Contexto', evidence: {} },
], dimensionScores: [] } as unknown as EvaluacionSeguridad;
const container = document.createElement('div');
let root = createRoot(container);
afterEach(async () => { await act(async () => root.unmount()); root = createRoot(container); });

it('diagnóstico conserva cero y separa cobertura; no promete certificación ni repite inventarios', async () => {
  const onFinding = vi.fn();
  await act(async () => root.render(<SecuritySummary assessment={assessment} onFinding={onFinding} onCoverage={() => {}} onAdvisor={() => {}} />));
  expect(container.textContent).toContain('0/100');
  expect(container.textContent).toContain('75%');
  expect(container.textContent).not.toContain('Ya corregido');
  expect(container.textContent).not.toContain('Contexto');
  expect(container.textContent).not.toMatch(/Meta:|90%|Quick Wins|Pilares|Stack Tecnológico/);
  await act(async () => [...container.querySelectorAll('button')].find((b) => b.getAttribute('aria-label')?.includes('Dependencia por revisar'))!.click());
  expect(onFinding).toHaveBeenCalledWith('open');
});

it('IA conserva evidencia y verificación sin simular puntos ni generar snippets por palabra root', async () => {
  const advice = { id: 'advice', state: 'draft', content: { summary: 'Revisar la cuenta', priorities: [{ findingRefs: ['F1'], action: 'Eliminar clave root AWS tras validar acceso alternativo', explanation: 'Clave observada', verification: 'Verificar resumen IAM', urgency: 'immediate' }], references: { F1: 'open' }, architecture: [], nextChecks: [], limitations: [] } } as unknown as AssessmentAdvice;
  const onFinding = vi.fn();
  await act(async () => root.render(<AdvicePlan advice={advice} onFinding={onFinding} />));
  expect(container.textContent).toContain('Verificar resumen IAM');
  expect(container.textContent).not.toMatch(/proyectad|simulaci|Dockerfile|npm audit fix|24-48h/);
  expect(container.querySelector('pre')).toBeNull();
  await act(async () => [...container.querySelectorAll('button')].find((b) => b.textContent?.includes('F1'))!.click());
  expect(onFinding).toHaveBeenCalledWith('open');
});

it('ofrece cuatro destinos y abre cobertura como consulta sin agregar otra pestaña', async () => {
  document.body.append(container);
  await act(async () => root.render(<MemoryRouter initialEntries={['/projects/p']}><Routes><Route path="/projects/:projectId" element={<ProjectDetail />} /></Routes></MemoryRouter>));
  const nav = container.querySelector('nav[aria-label="Secciones de evaluación"]')!;
  expect([...nav.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Diagnóstico', 'Riesgos', 'Proyecto', 'Plan de mejora']);
  await act(async () => [...container.querySelectorAll('button')].find((b) => b.textContent === 'Ver comprobaciones')!.click());
  expect(document.body.textContent).toContain('Qué se midió y hasta dónde');
  await act(async () => document.body.querySelector<HTMLButtonElement>('[aria-label="Cerrar modal"]')!.click());
  expect(nav.querySelector('[aria-current="page"]')?.textContent).toBe('Diagnóstico');
  container.remove();
});
