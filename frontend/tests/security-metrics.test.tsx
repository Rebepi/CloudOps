import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { SecurityMetrics, validPercentage } from '../src/components/projects/SecurityMetrics';
import type { DimensionSeguridad, EvaluacionSeguridad, HallazgoSeguridad } from '../src/types/cloud';

Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true });
vi.stubGlobal('matchMedia', () => ({ matches: true }));
const finding = { severity: 'CRITICAL', category: 'dependency', evidence: {} } as HallazgoSeguridad;
const assessment = { id: 'test', score: 5, coverage: 79, summary: { counts: {} }, dimensionScores: [
  { id: 'identity', label: 'Accesos', score: 0, state: 'measured', controls: [{ state: 'pass' }, { state: 'fail' }] },
  { id: 'dependencies', label: 'Dependencias', score: null, state: 'partial', controls: [{ state: 'partial' }, { state: 'not_applicable' }] },
] as DimensionSeguridad[], findings: [finding, { ...finding, severity: 'HIGH' }, { ...finding, severity: 'INFORMATIONAL' }, { ...finding, evidence: { scoreExcluded: true } }] } as EvaluacionSeguridad;
const container = document.createElement('div');
let root = createRoot(container);
afterEach(async () => { await act(async () => root.unmount()); root = createRoot(container); });

it('porcentajes conservan el índice del motor y distinguen cero de valores desconocidos', async () => {
  await act(async () => root.render(<SecurityMetrics assessment={assessment} />));
  const dimensionsButton = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Índice por dimensión')!;
  await act(async () => dimensionsButton.click());
  expect(container.querySelector('[role="img"]')?.getAttribute('aria-label')).toContain('5% (5 de 100 puntos)');
  expect(container.querySelector('[aria-label="Cobertura 79%"]')?.textContent).toBe('79%');
  expect(container.querySelector('[role="progressbar"][aria-label="Índice de Accesos"]')?.getAttribute('aria-valuenow')).toBe('0');
  expect(container.querySelector('[role="progressbar"][aria-label="Índice de Dependencias"]')).toBeNull();
  expect(container.textContent).toContain('Sin puntaje concluyente');
  expect(container.textContent).toContain('No representa una probabilidad de estar protegido');
});

it('distribuciones excluyen informativos del riesgo y conservan controles pendientes', async () => {
  await act(async () => root.render(<SecurityMetrics assessment={assessment} />));
  const choose = async (name: string) => { const button = [...container.querySelectorAll('button')].find((item) => item.textContent === name)!; await act(async () => button.click()); };
  await choose('Gravedad de alertas');
  expect(container.textContent).toContain('las 2 alertas puntuables');
  expect(container.textContent).toContain('50%');
  await choose('Estado de controles');
  expect(container.textContent).toContain('Distribución de 4 controles');
  expect(container.textContent).toContain('25%');
  expect(container.textContent).toContain('Parcial o sin verificar');
});

it('no genera porcentajes con datos inválidos ni reemplaza históricos sin puntuación por cero', async () => {
  for (const value of [null, undefined, NaN, Infinity, -1, 101]) expect(validPercentage(value)).toBeNull();
  await act(async () => root.render(<SecurityMetrics assessment={{ ...assessment, score: null, dimensionScores: [], findings: [] }} />));
  expect(container.querySelector('[role="img"]')?.getAttribute('aria-label')).toContain('sin medición');
  expect(container.textContent).toContain('No hay un puntaje registrado');
});
