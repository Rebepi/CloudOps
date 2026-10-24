type Observation = {
  source: string;
  externalId: string | null;
  severity: string;
  resource: string | null;
  recommendation: string;
};

const sourceLabels: Record<string, string> = {
  cloudops: 'CloudOps Engine', 'security-hub': 'AWS Security Hub',
  semgrep: 'Semgrep SAST', trivy: 'Trivy',
  gitleaks: 'Gitleaks',
  'aws-config': 'AWS Config', 'amazon-inspector': 'Amazon Inspector', osv: 'OSV',
};

function observationsFrom(evidence: Record<string, unknown>): Observation[] {
  if (!Array.isArray(evidence.observations)) return [];
  return evidence.observations.filter((value): value is Observation => typeof value === 'object' && value !== null
    && typeof value.source === 'string' && typeof value.severity === 'string'
    && (typeof value.externalId === 'string' || value.externalId === null)
    && (typeof value.resource === 'string' || value.resource === null)
    && typeof value.recommendation === 'string');
}

export function FindingObservations({ evidence }: { evidence: Record<string, unknown> }) {
  const observations = observationsFrom(evidence);
  if (!observations.length) return null;
  return <details className="mt-3 rounded-xl border border-line bg-canvas/40 p-3">
    <summary className="cursor-pointer text-xs font-semibold text-ink">Fuentes y evidencia original ({observations.length})</summary>
    <p className="mt-2 text-[11px] text-muted">Hallazgo normalizado. Se conserva la mayor severidad y se contabiliza una sola vez.</p>
    <div className="mt-2 divide-y divide-line">{observations.map((observation, index) => <section key={`${observation.source}:${observation.externalId ?? index}`} className="py-2 text-[11px]">
      <div className="flex flex-wrap items-center gap-2"><strong className="text-ink">{sourceLabels[observation.source] ?? observation.source}</strong><span className="text-muted">{observation.severity}</span></div>
      {observation.externalId && <p className="mt-1 break-all font-mono text-[10px] text-muted">ID original: {observation.externalId}</p>}
      {observation.resource && <p className="mt-1 break-all text-muted">Recurso original: {observation.resource}</p>}
      <p className="mt-1 text-muted">{observation.recommendation}</p>
    </section>)}</div>
  </details>;
}
