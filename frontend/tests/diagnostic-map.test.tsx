import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { controlDistribution, diagnosticModel } from '../src/lib/diagnosticPresentation';
import { DiagnosticControls } from '../src/components/projects/DiagnosticControls';
import { DiagnosticCoverage } from '../src/components/projects/DiagnosticCoverage';
import type { ControlDimensionSeguridad, EvaluacionSeguridad } from '../src/types/cloud';

Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true });
const controls = ['pass', 'fail', 'partial', 'failed', 'skipped', 'not_supported', 'not_applicable'].map((state) => ({ id: state, state, label: `Prueba ${state}`, detail: `Evidencia ${state}` })) as ControlDimensionSeguridad[];
const assessment = { id: 'a', assessmentType: 'code', score: 0, coverage: 75, summary: {}, findings: [{ id: 'risk', severity: 'HIGH', status: 'open', dimension: 'identity', title: 'Permiso excesivo', evidence: {} }], dimensionScores: [{ id: 'identity', label: 'Identidad', state: 'partial', score: 0, coverage: 50, controls }], analyzers: [{ analyzerId: 'semgrep:sast', state: 'completed' }, { analyzerId: 'osv', state: 'partial', detail: { reason: 'Quedan versiones por comprobar' } }, { analyzerId: 'trivy:images', state: 'failed', error: 'Registro inaccesible' }] } as unknown as EvaluacionSeguridad;
const container = document.createElement('div');
let root = createRoot(container);
afterEach(async () => { await act(async () => root.unmount()); root = createRoot(container); });

it('no cuenta no aplicables como aprobados ni transforma omisiones en resultados seguros', () => {
  expect(controlDistribution(controls)).toEqual({ pass: 1, fail: 1, partial: 1, pending: 3, notApplicable: 1, total: 7, applicable: 6 });
  const model = diagnosticModel(assessment);
  expect(model.dimensions).toHaveLength(6);
  expect(model.dimensions[0].measured?.score).toBe(0);
  expect(model.dimensions[1].measured).toBeUndefined();
  expect(model.complete).toHaveLength(1);
  expect(model.partial).toHaveLength(1);
  expect(model.unavailable).toHaveLength(1);
});

it('el mapa distingue sin evidencia y abre la prueba original y su hallazgo', async () => {
  const onFinding = vi.fn();
  await act(async () => root.render(<DiagnosticControls dimensions={diagnosticModel(assessment).dimensions} onFinding={onFinding} />));
  expect(container.textContent).toContain('Sin comprobaciones');
  expect(container.textContent).not.toContain('Evidencia failed');
  const details = container.querySelector('details')!;
  await act(async () => { details.open = true; details.dispatchEvent(new Event('toggle')); });
  expect(container.textContent).toContain('Evidencia failed');
  expect(container.textContent).toContain('No se pudo verificar');
  expect(container.textContent).toContain('Índice registrado: 0/100.');
  const button = [...container.querySelectorAll('button')].find((item) => item.textContent?.includes('Permiso excesivo'))!;
  await act(async () => button.click());
  expect(onFinding).toHaveBeenCalledWith('risk');
});

it('cobertura conserva el porcentaje del método sin derivarlo del conteo de herramientas', async () => {
  const onCoverage = vi.fn();
  await act(async () => root.render(<DiagnosticCoverage assessment={assessment} model={diagnosticModel(assessment)} onCoverage={onCoverage} />));
  expect(container.textContent).toContain('75%');
  expect(container.textContent).toContain('Quedan versiones por comprobar');
  expect(container.textContent).toContain('Registro inaccesible');
  expect(container.querySelector('[aria-label="1 completados, 1 parciales, 1 fallidos u omitidos"]')).not.toBeNull();
  await act(async () => [...container.querySelectorAll('button')].find((button) => button.textContent?.includes('Ver comprobaciones'))!.click());
  expect(onCoverage).toHaveBeenCalledOnce();
});
