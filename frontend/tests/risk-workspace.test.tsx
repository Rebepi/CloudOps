import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { defaultRiskFilters, filterRisks } from '../src/lib/riskPresentation';
import { FindingsWorkspace } from '../src/components/projects/FindingsWorkspace';
import { RiskDetailDrawer } from '../src/components/projects/RiskDetailDrawer';
import { api } from '../src/lib/api';
import type { EvaluacionSeguridad, HallazgoSeguridad } from '../src/types/cloud';

Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true });
vi.mock('../src/lib/api', () => ({ api: vi.fn() }));
const risk = { id: 'risk', status: 'open', title: 'Biblioteca vulnerable', description: 'Versión observada afectada', recommendation: 'Actualizar versión compatible', severity: 'HIGH', source: 'osv', category: 'dependency', dimension: 'dependencies', resource: 'backend/uv.lock', evidence: { package: 'example-library', advisory: 'GHSA-example' } } as HallazgoSeguridad;
const assessment = { id: 'a', projectId: 'p', findings: [risk], summary: {} } as EvaluacionSeguridad;
const container = document.createElement('div');
let root = createRoot(container);
beforeEach(() => {
  document.body.append(container);
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); root = createRoot(container); vi.resetAllMocks(); });
const click = async (name: string) => { const button = [...document.body.querySelectorAll('button')].find((item) => item.textContent === name || item.getAttribute('aria-label') === name)!; expect(button).toBeTruthy(); await act(async () => button.click()); };
const change = async (label: string, value: string) => {
  const wrapper = [...document.body.querySelectorAll('label')].find((item) => item.textContent?.startsWith(label))!;
  const field = wrapper.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input,select,textarea')!;
  await act(async () => { Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field), 'value')!.set!.call(field, value); field.dispatchEvent(new Event(field.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); });
};

it('pendientes excluye decisiones cerradas y contexto; busca identificadores sin sumar duplicados de observaciones', () => {
  const risks = [risk, { ...risk, id: 'closed', status: 'resolved' }, { ...risk, id: 'accepted', status: 'risk_accepted' }, { ...risk, id: 'info', severity: 'INFORMATIONAL' }, { ...risk, id: 'excluded', evidence: { scoreExcluded: true } }] as HallazgoSeguridad[];
  expect(filterRisks(risks, defaultRiskFilters).map((item) => item.id)).toEqual(['risk']);
  expect(filterRisks(risks, { ...defaultRiskFilters, query: 'GHSA-example' })).toHaveLength(1);
  expect(filterRisks(risks, { ...defaultRiskFilters, state: 'all' })).toHaveLength(3);
  expect(filterRisks(risks, { ...defaultRiskFilters, context: true })).toHaveLength(3);
});

it('usa el ancho de la lista sin abrir detalle hasta revisar, y conserva los filtros al cerrar', async () => {
  await act(async () => root.render(<FindingsWorkspace assessment={assessment} projectId="p" onUpdated={() => {}} />));
  expect(document.body.querySelector('dialog')).toBeNull();
  await change('Dimensión', 'dependencies');
  await click('Revisar riesgo: Biblioteca vulnerable');
  expect(document.body.querySelector('dialog[open]')).not.toBeNull();
  await click('Cerrar detalle del riesgo');
  expect(container.querySelector<HTMLSelectElement>('[aria-label="Dimensión de seguridad"]')!.value).toBe('dependencies');
  expect(api).not.toHaveBeenCalled();
});

it('abrir seguimiento no escribe; exige justificación y conserva errores antes de guardar explícitamente', async () => {
  const onUpdated = vi.fn();
  await act(async () => root.render(<RiskDetailDrawer finding={risk} projectId="p" onClose={() => {}} onUpdated={onUpdated} />));
  await click('Actualizar seguimiento');
  await change('Estado', 'risk_accepted');
  expect(api).not.toHaveBeenCalled();
  await act(async () => document.body.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  expect(api).not.toHaveBeenCalled();
  expect(document.body.textContent).toContain('Explica el motivo');
  await change('Justificación', 'Control compensatorio documentado');
  vi.mocked(api).mockRejectedValueOnce(new Error('No se pudo guardar'));
  await act(async () => document.body.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  expect(document.body.textContent).toContain('No se pudo guardar');
  expect(onUpdated).not.toHaveBeenCalled();
  vi.mocked(api).mockResolvedValueOnce({ data: {} });
  await act(async () => document.body.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  expect(onUpdated).toHaveBeenCalledOnce();
  expect(JSON.parse(vi.mocked(api).mock.calls.at(-1)![1]!.body as string)).toMatchObject({ status: 'risk_accepted', justification: 'Control compensatorio documentado' });
});

it('protege cambios sin guardar al cerrar el detalle y no confunde fallo de historial con historial vacío', async () => {
  const onClose = vi.fn();
  await act(async () => root.render(<RiskDetailDrawer finding={risk} projectId="p" onClose={onClose} onUpdated={() => {}} />));
  await click('Actualizar seguimiento');
  await change('Responsable', 'equipo');
  await click('Cerrar detalle del riesgo');
  expect(onClose).not.toHaveBeenCalled();
  expect(document.body.textContent).toContain('Hay cambios sin guardar');
  await click('Seguir editando');
  expect(document.body.querySelector<HTMLInputElement>('input[name="risk-owner"]')!.value).toBe('equipo');
  vi.mocked(api).mockRejectedValueOnce(new Error('Historial no disponible'));
  const history = document.body.querySelector<HTMLDetailsElement>('.risk-history')!;
  await act(async () => { history.open = true; await new Promise((resolve) => setTimeout(resolve, 0)); });
  expect(document.body.textContent).toContain('Historial no disponible');
  expect(document.body.textContent).not.toContain('No hay eventos registrados');
});
