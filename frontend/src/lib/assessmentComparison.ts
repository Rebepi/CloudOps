import type { EvaluacionSeguridad } from '../types/cloud';

export function comparableHistory(assessment: EvaluacionSeguridad, history: EvaluacionSeguridad[]) {
  if (!assessment.engineVersion || !assessment.methodologyVersion) return [];
  return history.filter((item) => item.assessmentType === assessment.assessmentType && item.engineVersion === assessment.engineVersion
    && item.methodologyVersion === assessment.methodologyVersion && item.status === 'completed' && item.score != null && item.startedAt <= assessment.startedAt)
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}
