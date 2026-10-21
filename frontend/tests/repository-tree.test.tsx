import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { RepositoryTree } from '../src/components/projects/RepositoryTree';
import type { RepositoryEntry } from '../src/types/cloud';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true, React });

it('expande módulos, busca archivos y permite ver archivos generados', async () => {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const entries: RepositoryEntry[] = [
    { path: 'project/backend/modules/ventas/api.py', kind: 'file', sizeBytes: 120, analysisStatus: 'analyzed' },
    { path: 'project/backend/__pycache__/api.pyc', kind: 'file', sizeBytes: 80, analysisStatus: 'unsupported' },
  ];
  try {
    await act(async () => root.render(<RepositoryTree entries={entries} complete />));
    expect(container.textContent).not.toContain('api.py');
    const backend = container.querySelector('button[aria-label="Expandir backend"]') as HTMLButtonElement;
    await act(async () => backend.click());
    const modules = container.querySelector('button[aria-label="Expandir modules"]') as HTMLButtonElement;
    await act(async () => modules.click());
    const ventas = container.querySelector('button[aria-label="Expandir ventas"]') as HTMLButtonElement;
    await act(async () => ventas.click());
    expect(container.textContent).toContain('api.py');
    expect(container.textContent).toContain('Analizado');
    expect(container.textContent).not.toContain('__pycache__');
    await act(async () => (container.querySelector('input[type="checkbox"]') as HTMLInputElement).click());
    expect(container.textContent).toContain('__pycache__');
    const search = container.querySelector('input[aria-label="Buscar carpeta o archivo"]') as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(search, 'api.pyc');
      search.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(container.textContent).toContain('api.pyc');
    expect(container.textContent).toContain('Formato no analizado');
    expect(container.textContent).not.toContain('ventas');
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
