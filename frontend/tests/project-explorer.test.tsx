import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { projectExplorerModel } from '../src/lib/projectExplorer';
import { platformCandidates } from '../src/lib/platformCandidates';
import { ProjectExplorer } from '../src/components/projects/ProjectExplorer';
import { ProjectSupplyInventory } from '../src/components/projects/ProjectSupplyInventory';
import { apiText } from '../src/lib/api';
import type { EvaluacionSeguridad } from '../src/types/cloud';

Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true });
vi.mock('../src/lib/api', () => ({ apiText: vi.fn() }));
const assessment = { id: 'a', projectId: 'p', assessmentType: 'code', summary: { repositoryInventory: { complete: true, entries: [ { path: 'repo/backend/main.py', kind: 'file', sizeBytes: 120, analysisStatus: 'analyzed' }, { path: 'repo/frontend/package.json', kind: 'file', sizeBytes: 100, analysisStatus: 'analyzed' } ] }, detectedArchitecture: { components: [ { id: 'react', name: 'React', category: 'client', confidence: 'high', evidence: ['repo/frontend/package.json'] }, { id: 'fastapi', name: 'FastAPI', category: 'api', confidence: 'medium', evidence: ['repo/backend/main.py'], evidenceDetails: [{ path: 'repo/backend/main.py', kind: 'reference' }] } ] } }, findings: [ { id: 'risk', resource: 'repo/backend/main.py', source: 'semgrep', severity: 'HIGH', title: 'Validación pendiente', evidence: { file: 'repo/backend/main.py' } } ] } as unknown as EvaluacionSeguridad;
const container = document.createElement('div'); let root = createRoot(container);
afterEach(async () => { await act(async () => root.unmount()); root = createRoot(container); vi.resetAllMocks(); });
const click = async (test: (button: HTMLButtonElement) => boolean) => { const button = [...container.querySelectorAll('button')].find(test)!; expect(button).toBeTruthy(); await act(async () => button.click()); };

it('builds actual containment without counting one risk twice or attributing AWS to code', () => {
  const model = projectExplorerModel(assessment);
  expect(model.root).toBe('repo'); expect(model.nodes.get('repo')?.files).toBe(2);
  expect(model.nodes.get('repo/backend')?.risks.size).toBe(1);
  expect(model.nodes.get('repo/frontend')?.risks.size).toBe(0);
});
it('connects folder selection, metadata and its exact finding; preserves unclassified legacy evidence', async () => {
  const onFinding = vi.fn();
  await act(async () => root.render(<ProjectExplorer assessment={assessment} onFinding={onFinding} />));
  expect(container.textContent).toContain('Evidencia histórica sin clasificar');
  expect(container.querySelector('[aria-label="Detalle de la selección"]')).toBeNull();
  await click((button) => button.textContent === 'backend1');
  expect(container.textContent).toContain('1 archivos');
  await click((button) => button.textContent?.includes('Validación pendiente') ?? false);
  expect(onFinding).toHaveBeenCalledWith('risk');
});
it('reference-only technologies cannot produce a service recommendation', () => {
  const components = projectExplorerModel(assessment).components;
  expect(platformCandidates([{ ...components[0], evidenceDetails: [{ path: 'scanner.ts', kind: 'reference' }] }])).toEqual([]);
});
it('reads and paginates the real SBOM only on supply view; failure is not an empty inventory', async () => {
  vi.mocked(apiText).mockRejectedValue(new Error('SBOM no disponible'));
  const supplied = { ...assessment, summary: { ...assessment.summary, supplyChain: { componentCount: 1, specVersion: '1.6', manifestCount: 1, licenseCount: 0, sha256: 'hash', inventoryComplete: true, issues: [], images: [], trivy: { state: 'skipped', results: [] } } } } as EvaluacionSeguridad;
  await act(async () => root.render(<ProjectSupplyInventory assessment={supplied} onFinding={() => {}} />));
  expect(container.textContent).toContain('SBOM no disponible');
  vi.mocked(apiText).mockResolvedValue(JSON.stringify({ components: [{ name: 'react', version: '19.0.0', type: 'library', purl: 'pkg:npm/react@19.0.0', properties: [{ name: 'cloudops:manifest', value: 'repo/frontend/package-lock.json' }] }] }));
  await click((button) => button.textContent === 'Reintentar');
  expect(container.textContent).toContain('19.0.0');
  expect(container.textContent).toContain('repo/frontend/package-lock.json');
});
