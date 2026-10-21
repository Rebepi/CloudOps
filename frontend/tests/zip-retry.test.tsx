import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import { CreateProjectModal } from '../src/components/projects/CreateProjectModal';
import { api } from '../src/lib/api';

vi.mock('../src/lib/api', () => ({ api: vi.fn() }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true, React });

it('reintenta la carga fallida sobre el proyecto ya creado', async () => {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const request = vi.mocked(api);
  request.mockImplementation(async (path) => {
    if (path === '/projects') return { data: { id: 'existing-project', name: 'ZIP project' } };
    throw new TypeError('Failed to fetch');
  });
  try {
    await act(async () => root.render(<MemoryRouter><CreateProjectModal abierto onCerrar={() => {}} onCreated={() => {}} /></MemoryRouter>));
    const file = new File(['PK'], 'project.zip', { type: 'application/zip' });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
    const form = container.querySelector('form')!;
    await act(async () => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(container.textContent).toContain('Reintentar carga / conexión');
    await act(async () => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(request.mock.calls.filter(([path]) => path === '/projects')).toHaveLength(1);
    const uploads = request.mock.calls.filter(([path]) => path.endsWith('/security/assessments/code'));
    expect(uploads).toHaveLength(2);
    expect(uploads[1][0]).toBe('/projects/existing-project/security/assessments/code');
    expect(uploads[1][1]?.body).toBeInstanceOf(FormData);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    request.mockReset();
  }
});
