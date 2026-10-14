import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import Infrastructure from '../src/pages/Infrastructure';
import { ProposalComparison } from '../src/components/ProposalComparison';
import type { PropuestaCloud } from '../src/types/cloud';

const fixtures = vi.hoisted(() => ({
  regions: [{ id: 'us-east-1', status: 'opt-in-not-required' }, { id: 'us-west-2', status: 'opt-in-not-required' }],
  inventory: { instances: [{ id: 'project-node', zone: 'us-east-1a', name: 'Proyecto de prueba' }], databases: [], zones: [{ id: 'a', name: 'us-east-1a' }, { id: 'b', name: 'us-east-1b' }] },
  detail: { inventory: { instances: [], databases: [], zones: [{ id: 'wrong', name: 'eu-west-1a' }] }, errors: {} },
}));
vi.mock('../src/context/CloudContext', () => ({ useCloud: () => ({ regionPrincipal: 'us-east-1' }) }));
vi.mock('../src/hooks/useAws', () => ({ useAws: (path: string) => ({ data: path === '/aws/regions' ? fixtures.regions : path?.includes('/inventory') ? fixtures.inventory : path?.includes('/detail') ? fixtures.detail : null, loading: false }) }));
vi.mock('../src/hooks/useLatencia', () => ({ useLatencia: () => ({ latenciaMs: null, estadoPing: 'idle', esDatoReal: false, medir: () => {} }) }));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true, React });
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => {});
  Element.prototype.scrollIntoView = vi.fn();
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); });
async function click(text: string) {
  const button = [...container.querySelectorAll('button')].find((el) => el.textContent?.trim() === text);
  expect(button, text).toBeTruthy();
  await act(async () => button!.click());
}

it('omits links to missing nodes and hidden hemispheres, and anchors flat-map endpoints to region nodes', async () => {
  await act(async () => root.render(<Infrastructure />));
  expect(container.querySelectorAll('.aws-backbone-network path')).toHaveLength(0);
  for (const projection of ['Planisferio', 'Mercator']) {
    await click(projection);
    await click('Troncal Fibra');
    const paths = [...container.querySelectorAll('.aws-backbone-network path')];
    expect(paths.length).toBeGreaterThan(0);
    const points = [...container.querySelectorAll('[data-node-id]')].map((el) => el.getAttribute('transform')!.match(/-?\d+(?:\.\d+)?/g)!.map(Number));
    for (const path of paths) {
      const coordinates = path.getAttribute('d')!.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
      for (const point of [coordinates.slice(0, 2), coordinates.slice(-2)]) {
        expect(points.some(([x, y]) => Math.hypot(x - point[0], y - point[1]) < 0.01)).toBe(true);
      }
    }
  }
});

it('animates directly between the geographic nodes and resets without an overlay card', async () => {
  await act(async () => root.render(<Infrastructure />));
  await click('Simular Fallo de Servidor');
  // A flat projection also verifies the marker stays attached when projection changes mid-simulation.
  await click('Planisferio');
  expect(container.querySelector('[role="status"]')?.textContent).toContain('Fallo detectado');
  expect(container.querySelectorAll('foreignObject')).toHaveLength(0);
  const marker = () => container.querySelector('[data-project-marker]')!.getAttribute('transform');
  const origin = container.querySelector('[data-node-id="us-east-1"]')!.getAttribute('transform');
  const destination = container.querySelector('[data-node-id="us-west-2"]')!.getAttribute('transform');
  const coords = (transform: string | null) => transform!.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
  const near = (a: string | null, b: string | null) => { const [x,y] = coords(a); const [u,v] = coords(b); return Math.hypot(x-u,y-v) < 0.01; };
  expect(near(marker(), origin)).toBe(true);
  await act(async () => vi.advanceTimersByTime(2600));
  await act(async () => vi.advanceTimersByTime(2500));
  expect(near(marker(), origin)).toBe(false);
  expect(near(marker(), destination)).toBe(false);
  expect(container.querySelector('.migration-route')?.getAttribute('aria-label')).toContain('us-east-1 hacia us-west-2');
  await act(async () => vi.advanceTimersByTime(2500));
  expect(near(marker(), destination)).toBe(true);
  expect(container.querySelector('[role="status"]')?.textContent).toContain('Proyecto activo');
  await click('Reiniciar simulación');
  expect(container.querySelector('.migration-route')).toBeNull();
  await click('Simular Fallo de Servidor');
  expect(container.querySelector('[role="status"]')?.textContent).toContain('Fallo detectado');
});

const base: PropuestaCloud = { id: 'cheap', nombre: 'Económica', tipoAplicacion: 'Web', descripcion: '', regionId: 'us-east-1', usuariosEstimados: 1000, disponibilidad: 'basica', serviciosSeleccionados: ['ec2'], objetivoMigracion: '', creadaEn: '', presupuestoMaximo: 500, rtoHoras: 12, rpoMinutos: 120 };
it('compares selected plans, changes recommendation with priority, detects ties and removes deleted selections', async () => {
  const robust = { ...base, id: 'robust', nombre: 'Resiliente', disponibilidad: 'critica' as const, serviciosSeleccionados: ['ec2', 'rds', 'elb', 'iam', 'kms', 'waf', 'cloudwatch'], rtoHoras: 1, rpoMinutos: 0 };
  const twin = { ...base, id: 'twin', nombre: 'Económica alternativa' };
  await act(async () => root.render(<ProposalComparison propuestas={[base, robust, twin]} />));
  await click('Comparar propuestas');
  await act(async () => { (container.querySelectorAll('input')[0] as HTMLInputElement).click(); });
  expect(container.querySelector('table')).toBeNull();
  await act(async () => { (container.querySelectorAll('input')[1] as HTMLInputElement).click(); });
  expect(container.querySelector('[role="status"]')?.textContent).toContain('Resiliente');
  await act(async () => { const select = container.querySelector('select')!; select.value = 'costo'; select.dispatchEvent(new Event('change', { bubbles: true })); });
  expect(container.querySelector('[role="status"]')?.textContent).toContain('Económica');
  await act(async () => { (container.querySelectorAll('input')[2] as HTMLInputElement).click(); });
  expect(container.querySelector('[role="status"]')?.textContent).toContain('Empate');
  await act(async () => root.render(<ProposalComparison propuestas={[robust]} />));
  expect(container.querySelector('table')).toBeNull();
});
