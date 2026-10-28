import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { SecurityReportDocument } from '../src/components/reports/SecurityReportDocument';
import type { AssessmentAdvice, ComparacionEvaluacion, EvaluacionSeguridad, Proyecto } from '../src/types/cloud';

Object.assign(globalThis, { React });
const project = { id: 'project', name: 'Proyecto real', environment: 'Sandbox' } as Proyecto;
const assessment = { id: 'assessment', assessmentType: 'code', region: 'us-east-1', score: 20, coverage: 70, confidence: 'medium', summary: { counts: { HIGH: 30, INFORMATIONAL: 100 } }, findings: Array.from({ length: 30 }, (_, index) => ({ id: String(index), title: `Riesgo visible ${index}`, severity: 'HIGH', category: 'code', source: 'semgrep', evidence: {}, priority: { rank: 60 } })) } as EvaluacionSeguridad;
const advice = { state: 'draft', stale: false, content: { summary: 'Texto de IA pendiente' } } as AssessmentAdvice;

it('informe ejecutivo limita el detalle y no publica borradores ni IA desactualizada', () => {
  const render = (value: AssessmentAdvice) => renderToStaticMarkup(<SecurityReportDocument proyecto={project} evaluacion={assessment} comparacion={null} advice={value} />);
  const draft = render(advice);
  expect(draft).toContain('Primeros 25 de 30');
  expect(draft).toContain('Riesgo visible 24'); expect(draft).not.toContain('Riesgo visible 25');
  expect(draft).not.toContain('Texto de IA pendiente');
  expect(render({ ...advice, state: 'approved', stale: true })).not.toContain('Texto de IA pendiente');
  expect(render({ ...advice, state: 'approved' })).toContain('Texto de IA pendiente');
});

it('comparación incompatible no publica falsas correcciones', () => {
  const comparison = { previous: { id: 'old' }, summary: { comparable: false, resolvedCount: 90, newCount: 0 } } as ComparacionEvaluacion;
  const html = renderToStaticMarkup(<SecurityReportDocument proyecto={project} evaluacion={assessment} comparacion={comparison} />);
  expect(html).toContain('No hay una evaluación anterior comparable');
  expect(html).not.toContain('Corregidos:');
});
