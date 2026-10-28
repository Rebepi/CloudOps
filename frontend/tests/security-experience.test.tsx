import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { securityAreas } from '../src/lib/securityPresentation';
import { ProtectionWorkspace } from '../src/components/projects/ProtectionWorkspace';
import { FindingsWorkspace } from '../src/components/projects/FindingsWorkspace';
import { ArchitectureWorkspace } from '../src/components/projects/ArchitectureWorkspace';
import type { EvaluacionSeguridad, HallazgoSeguridad, DimensionSeguridad } from '../src/types/cloud';

Object.assign(globalThis, { React, IS_REACT_ACT_ENVIRONMENT: true });
vi.mock('../src/components/security/FindingCard', () => ({ FindingCard: ({ finding }: { finding: HallazgoSeguridad }) => <p>Detalle seleccionado: {finding.id}</p> }));
const risk = { id: 'risk', dimension: 'dependencies', category: 'dependency', severity: 'CRITICAL', source: 'osv', status: 'open', title: 'Biblioteca vulnerable', resource: 'backend/uv.lock', recommendation: 'Actualizar', evidence: {} } as HallazgoSeguridad;
const dim = (id: string, controls: unknown[], score: number | null = null) => ({ id, controls, score, coverage: 50, state: 'partial', counts: {}, label: id }) as DimensionSeguridad;
const assessment = { id: 'assessment', projectId: 'project', assessmentType: 'code', score: 0, coverage: 75, summary: { counts: {} }, findings: [risk], dimensionScores: [dim('dependencies', [{ id: 'osv', label: 'Dependencias', state: 'partial', detail: 'Versión no resuelta' }]), dim('application', [{ id: 'sast', label: 'Reglas SAST', state: 'pass', detail: 'Catálogo limitado' }], 100)] } as EvaluacionSeguridad;
const container = document.createElement('div');
let root = createRoot(container);
afterEach(async () => { await act(async () => root.unmount()); root = createRoot(container); });

it('agrupa seis dimensiones sin inventar una media o seguridad en áreas sin evidencia', () => {
  const areas = securityAreas(assessment);
  expect(areas).toHaveLength(5);
  const software = areas.find((area) => area.id === 'software')!;
  expect(software.status).toBe('Riesgo crítico');
  expect(software.dimensions.map((dimension) => dimension.score)).toEqual([null, 100]);
  expect(software.passed).toBe(1); expect(software.unverified).toBe(1);
  expect(areas.find((area) => area.id === 'identity')?.status).toBe('Evidencia incompleta');
});

it('el área muestra controles y permite navegar a su evidencia', async () => {
  const onFinding = vi.fn();
  await act(async () => root.render(<ProtectionWorkspace assessment={assessment} onFinding={onFinding} onCoverage={() => {}} />));
  const software = [...container.querySelectorAll('button')].find((button) => button.textContent?.includes('Aplicación'))!;
  await act(async () => software.click());
  expect(container.textContent).toContain('Versión no resuelta');
  const finding = [...container.querySelectorAll('button')].find((button) => button.textContent?.includes('Biblioteca vulnerable'))!;
  await act(async () => finding.click()); expect(onFinding).toHaveBeenCalledWith('risk');
});

it('hallazgos abre referencias de páginas posteriores y filtra sin mezclar informativos', async () => {
  const findings = Array.from({ length: 20 }, (_, index) => ({ ...risk, id: String(index) }));
  await act(async () => root.render(<FindingsWorkspace assessment={{ ...assessment, findings: [...findings, { ...risk, id: 'info', severity: 'INFORMATIONAL' }] }} projectId="project" initialFindingId="17" onUpdated={() => {}} />));
  expect(container.textContent).toContain('Detalle seleccionado: 17'); expect(container.textContent).toContain('3 de 3');
  const layer = container.querySelector('select[aria-label="Capa del sistema"]')! as HTMLSelectElement;
  expect(layer.querySelector('option[value="all"]')).not.toBeNull();
  const search = container.querySelector('input[aria-label="Buscar hallazgos"]')! as HTMLInputElement;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(search, 'inexistente'); search.dispatchEvent(new Event('input', { bubbles: true })); });
  expect(container.textContent).toContain('No hay hallazgos que coincidan');
});

it('AWS distingue los seis pilares y no inventa mediciones de rendimiento o costos', async () => {
  await act(async () => root.render(<ArchitectureWorkspace assessment={assessment} onFinding={() => {}} initialView="framework" />));
  expect(container.textContent).toContain('AWS Well-Architected tiene seis pilares');
  expect(container.textContent?.match(/Sin medición en esta evaluación/g)).toHaveLength(5);
  expect(container.textContent).toContain('Sostenibilidad');
});
