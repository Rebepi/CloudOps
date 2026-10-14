import { computeFingerprint, deduplicateByFingerprint } from './findingFingerprint.js';

export type MergeFinding = {
  externalId: string;
  source: string;
  category: string;
  title: string;
  description: string;
  severity: string;
  status: string;
  resource: string | null;
  recommendation: string;
  evidence: Record<string, unknown>;
  fingerprint?: string;
  framework?: string | null;
};

export type MergeEvaluation = {
  score: number;
  coverage: number;
  confidence: string;
  findings: MergeFinding[];
  summary: Record<string, unknown>;
};

const SEVERITY_PENALTY: Record<string, number> = { CRITICAL: 20, HIGH: 12, MEDIUM: 6, LOW: 2, INFORMATIONAL: 0 };

function withFingerprint(finding: MergeFinding): MergeFinding {
  return finding.fingerprint ? finding : { ...finding, fingerprint: computeFingerprint(finding) };
}

export function mergeAssessments(aws: MergeEvaluation, code: MergeEvaluation) {
  const combined = deduplicateByFingerprint([...aws.findings, ...code.findings].map(withFingerprint));
  const counts = combined.reduce<Record<string, number>>((acc, finding) => {
    acc[finding.severity] = (acc[finding.severity] ?? 0) + 1;
    return acc;
  }, { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFORMATIONAL: 0 });
  const rawPenalty = combined.reduce((total, finding) => total + (finding.category === 'coverage' ? 0 : SEVERITY_PENALTY[finding.severity] ?? 0), 0);
  let score: number;
  if (rawPenalty <= 50) {
    score = Math.max(0, Math.round(100 - rawPenalty));
  } else {
    const excess = rawPenalty - 50;
    const decayed = 50 / (1 + (excess / 180));
    score = Math.max(5, Math.round(decayed));
  }
  const coverage = Math.round((aws.coverage + code.coverage) / 2);
  const confidence = coverage === 100 ? 'high' : coverage >= 75 ? 'medium' : 'low';
  return {
    score,
    coverage,
    confidence,
    findings: combined,
    summary: {
      ...code.summary,
      ...aws.summary,
      counts,
      deduplicatedFindings: aws.summary.deduplicatedFindings !== undefined || code.summary.deduplicatedFindings !== undefined
        ? Number(aws.summary.deduplicatedFindings ?? 0) + Number(code.summary.deduplicatedFindings ?? 0)
        : undefined,
      combined: true,
      components: {
        aws: { score: aws.score, coverage: aws.coverage, confidence: aws.confidence, findings: aws.findings.length },
        code: { score: code.score, coverage: code.coverage, confidence: code.confidence, findings: code.findings.length },
      },
      methodology: 'Evaluación combinada de cuenta AWS, código, dependencias e IaC; puntaje único con deduplicación entre fuentes y exclusión de hallazgos de cobertura opcional.',
      methodologyVersion: '2026.10',
    },
  };
}
