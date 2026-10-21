import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { NewAssessmentModal } from '../src/components/projects/NewAssessmentModal';
import { ProjectArchitectureAdvisor } from '../src/components/projects/ProjectArchitectureAdvisor';
import type { EvaluacionSeguridad, Proyecto } from '../src/types/cloud';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true, React });

it('muestra carga durante la evaluación en vez de ausencia de evidencia', async () => {
  const container = document.createElement('div');
  const root = createRoot(container);
  try {
    await act(async () => root.render(<ProjectArchitectureAdvisor project={{ name: 'SalesIA' } as Proyecto} assessment={{ status: 'running', assessmentType: 'code' } as EvaluacionSeguridad} findings={[]} view="architecture" />));
    expect(container.textContent).toContain('Evaluación en curso');
    expect(container.textContent).not.toContain('Todavía no existe evidencia');
    expect(container.querySelector('[role="progressbar"]')).not.toBeNull();
  } finally { await act(async () => root.unmount()); }
});

it('seleccionar alcance muestra acciones y solo inicia cuando se confirma', async () => {
  const container = document.createElement('div');
  const root = createRoot(container);
  const onRun = vi.fn();
  try {
    await act(async () => root.render(<NewAssessmentModal hasRepo awsReady busy={false} onClose={() => {}} onRun={onRun} />));
    expect(document.body.textContent).toContain('Contrastar dependencias');
    const radios = document.body.querySelectorAll('[role="radio"]');
    await act(async () => (radios[1] as HTMLButtonElement).click());
    expect(onRun).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('Consultar recursos AWS');
    expect(document.body.textContent).not.toContain('Contrastar dependencias');
    const start = [...document.body.querySelectorAll('button')].find((button) => button.textContent?.includes('Iniciar evaluación'))!;
    await act(async () => start.click());
    expect(onRun).toHaveBeenCalledWith('aws');
  } finally { await act(async () => root.unmount()); }
});

it('permite subir un ZIP al evaluar un proyecto existente sin repositorio', async () => {
  const container = document.createElement('div');
  const root = createRoot(container);
  const onRun = vi.fn();
  try {
    await act(async () => root.render(<NewAssessmentModal hasRepo={false} awsReady={false} busy={false} onClose={() => {}} onRun={onRun} />));
    const start = [...document.body.querySelectorAll('button')].find((button) => button.textContent?.includes('Iniciar evaluación'))!;
    expect(start.disabled).toBe(true);
    const input = document.body.querySelector('input[type="file"]') as HTMLInputElement;
    const archive = new File(['PK'], 'retry.zip', { type: 'application/zip' });
    Object.defineProperty(input, 'files', { value: [archive], configurable: true });
    await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
    expect(start.disabled).toBe(false);
    await act(async () => start.click());
    expect(onRun).toHaveBeenCalledWith('code', archive);
  } finally { await act(async () => root.unmount()); }
});
