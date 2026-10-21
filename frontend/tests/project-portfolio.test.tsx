import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import Projects from '../src/pages/Projects';

vi.mock('../src/lib/api', () => ({ api: vi.fn(async () => ({ data: [{ id: 'project-1', name: 'SalesIA', technologyStack: [], status: 'active', latestScore: 45 }] })) }));
vi.mock('../src/components/projects/CreateProjectModal', () => ({ CreateProjectModal: () => null }));
vi.mock('../src/components/projects/ManageProjectModal', () => ({ ManageProjectModal: () => <div role="dialog">Gestionar SalesIA</div> }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true, React });

it('abre por doble clic y permite gestionar sin navegar', async () => {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<MemoryRouter initialEntries={['/projects']}><Routes><Route path="/projects" element={<Projects />} /><Route path="/projects/:id" element={<p>Proyecto abierto</p>} /></Routes></MemoryRouter>));
    expect(container.textContent).not.toContain('Proyectos Activos');
    const project = container.querySelector('[role="link"]')!;
    await act(async () => project.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(container.textContent).not.toContain('Proyecto abierto');
    const manage = [...container.querySelectorAll('button')].find((button) => button.textContent?.includes('Gestionar proyecto'))!;
    await act(async () => manage.click());
    expect(document.body.querySelector('[role="dialog"]')?.textContent).toContain('Gestionar SalesIA');
    await act(async () => manage.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
    expect(container.textContent).not.toContain('Proyecto abierto');
    await act(async () => project.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
    expect(container.textContent).toContain('Proyecto abierto');
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
