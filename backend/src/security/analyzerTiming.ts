export type AnalyzerTiming = { durationMs: number; scope: 'cumulative-rule' | 'cumulative-request' | 'elapsed-service' };
export type AnalyzerTimings = Record<string, AnalyzerTiming>;

export function recordAnalyzerTiming(timings: AnalyzerTimings, id: string, started: number, scope: AnalyzerTiming['scope']) {
  timings[id] = { durationMs: (timings[id]?.durationMs ?? 0) + Math.max(0, performance.now() - started), scope };
}

export async function measureAnalyzer<T>(timings: AnalyzerTimings, id: string, scope: AnalyzerTiming['scope'], operation: () => Promise<T>): Promise<T> {
  const started = performance.now();
  try { return await operation(); }
  finally { recordAnalyzerTiming(timings, id, started, scope); }
}
