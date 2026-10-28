import type { DimensionResult } from './dimensions.js';

export function comparableAssessments(a: { engineVersion?: string | null; methodologyVersion?: string | null; assessmentType?: string }, b: typeof a) {
  return Boolean(a.engineVersion && a.methodologyVersion && a.engineVersion === b.engineVersion && a.methodologyVersion === b.methodologyVersion && a.assessmentType === b.assessmentType);
}

export function compareDimensions(current: DimensionResult[], previous: DimensionResult[], comparable: boolean) {
  return current.map((dimension) => {
    const before = previous.find((item) => item.id === dimension.id);
    return { id: dimension.id, label: dimension.label, currentScore: dimension.score, previousScore: before?.score ?? null,
      currentCoverage: dimension.coverage, previousCoverage: before?.coverage ?? null,
      scoreDelta: comparable && before?.score != null && dimension.score != null ? dimension.score - before.score : null,
      coverageDelta: comparable && before ? dimension.coverage - before.coverage : null,
      comparable: comparable && Boolean(before), currentState: dimension.state, previousState: before?.state ?? null };
  });
}
