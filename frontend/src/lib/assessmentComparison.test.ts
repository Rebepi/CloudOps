import { describe, it, expect } from 'vitest';
import type { EvaluacionSeguridad } from '../types/cloud';
import { comparableHistory } from './assessmentComparison';

describe('histórico comparable', () => {
  it('excluye motores, metodologías, alcances y ejecuciones futuras distintos', () => {
    const current = { id: 'current', assessmentType: 'code', engineVersion: '1.10.0', methodologyVersion: '2026.19', status: 'completed', score: 60, startedAt: '2026-10-28T12:00:00Z' } as EvaluacionSeguridad;
    const history: EvaluacionSeguridad[] = [current, { ...current, id: 'old', engineVersion: '1.9.0' }, { ...current, methodologyVersion: '2026.18' }, { ...current, assessmentType: 'full' }, { ...current, startedAt: '2026-10-29T00:00:00Z' }, { ...current, score: null }];
    expect(comparableHistory(current, history)).toEqual([current]);
    expect(comparableHistory({ ...current, methodologyVersion: undefined }, history)).toEqual([]);
  });
});
