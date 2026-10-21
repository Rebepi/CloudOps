import type { EvaluacionSeguridad, Proyecto } from '../types/cloud';

export function assessmentLabel(assessment: Pick<EvaluacionSeguridad, 'assessmentType' | 'artifactMetadata' | 'artifactName'>, project?: Pick<Proyecto, 'repoProvider' | 'sourceMode'>): string {
  if (assessment.assessmentType === 'aws-account') return 'Cuenta AWS';
  const metadata = assessment.artifactMetadata;
  const provider = metadata?.provider;
  const uploadedZip = Boolean(metadata?.contentType) || /\.zip$/i.test(assessment.artifactName ?? '');
  const origin = provider === 'github' ? 'GitHub' : provider === 'gitlab' ? 'GitLab'
    : uploadedZip ? 'ZIP'
      : project?.sourceMode === 'repository' ? (project.repoProvider === 'gitlab' ? 'GitLab' : project.repoProvider === 'github' ? 'GitHub' : 'repositorio') : '';
  if (assessment.assessmentType === 'full') return origin ? `Integral · ${origin} + AWS` : 'Integral · código + AWS';
  return origin ? `Código de ${origin}` : 'Código';
}
