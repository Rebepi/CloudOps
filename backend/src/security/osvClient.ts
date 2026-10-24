import type { Dependency } from '../zipSecurityScanner.js';

export type OsvDetail = {
  id: string;
  summary?: string;
  database_specific?: { severity?: string };
  affected?: { package?: { ecosystem?: string; name?: string }; ranges?: { events?: { fixed?: string }[] }[]; ecosystem_specific?: { severity?: string } }[];
};

type Options = {
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  budgetMs?: number;
};

/** Retries only read-only OSV queries, with a shared deadline across batches and details. */
export async function lookupOsv(dependencies: Dependency[], options: Options = {}) {
  const request = options.fetch ?? fetch;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const now = options.now ?? (() => performance.now());
  const started = now();
  const deadline = started + (options.budgetMs ?? 120_000);
  let requests = 0;
  let retries = 0;
  let checked = 0;
  const errors: string[] = [];
  const limits = new Set<string>();
  const unique = [...new Map(dependencies.map((dependency) => [`${dependency.ecosystem}:${dependency.name}:${dependency.version}`, dependency])).values()];
  const matches: { dependency: Dependency; id: string }[] = [];
  const details = new Map<string, OsvDetail>();

  async function json(url: string, init: RequestInit, timeoutMs: number): Promise<unknown> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const remaining = deadline - now();
      if (remaining <= 0) { limits.add('osv-time-budget'); throw new Error('OSV agotó el presupuesto total de consulta.'); }
      let delay = 250 * 2 ** attempt;
      let error: unknown;
      let retryable = true;
      try {
        requests++;
        if (attempt > 0) retries++;
        const response = await request(url, { ...init, signal: AbortSignal.timeout(Math.max(1, Math.ceil(Math.min(timeoutMs, remaining)))) });
        if (response.ok) return await response.json();
        error = new Error(`OSV respondió HTTP ${response.status}`);
        retryable = response.status === 408 || response.status === 429 || response.status >= 500;
        const retryAfter = response.headers.get('retry-after');
        if (retryAfter) {
          const seconds = Number(retryAfter);
          const wait = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retryAfter) - Date.now();
          if (Number.isFinite(wait)) delay = Math.max(delay, wait);
        }
        await response.body?.cancel();
      } catch (failure) {
        error = failure;
        // JSON decoding failures are not network errors and should not be replayed.
        if (failure instanceof SyntaxError) retryable = false;
      }
      if (!retryable || attempt === 2) throw error;
      if (delay > 10_000 || delay >= deadline - now()) {
        limits.add('osv-retry-budget');
        throw new Error('OSV requiere una espera superior al presupuesto de reintento.');
      }
      await sleep(delay);
    }
    throw new Error('OSV no completó la consulta.');
  }

  for (let index = 0; index < unique.length; index += 100) {
    const batch = unique.slice(index, index + 100);
    try {
      const payload = await json('https://api.osv.dev/v1/querybatch', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ queries: batch.map((dependency) => ({ package: { name: dependency.name, ecosystem: dependency.ecosystem }, version: dependency.version })) }),
      }, 20_000);
      const results = payload && typeof payload === 'object' && 'results' in payload ? payload.results : undefined;
      if (!Array.isArray(results) || results.length !== batch.length || results.some((result) => !result || typeof result !== 'object'
        || ('vulns' in result && (!Array.isArray(result.vulns) || result.vulns.some((vuln: unknown) => !vuln || typeof vuln !== 'object' || !('id' in vuln) || typeof vuln.id !== 'string' || !vuln.id))))) {
        throw new Error('OSV devolvió resultados incompletos o inválidos para el lote.');
      }
      checked += batch.length;
      results.forEach((result, offset) => {
        for (const vulnerability of result.vulns ?? []) {
          if (matches.length >= 300) { limits.add('osv-match-limit'); break; }
          matches.push({ dependency: batch[offset]!, id: vulnerability.id });
        }
      });
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      break;
    }
  }
  const allIds = [...new Set(matches.map((match) => match.id))];
  if (allIds.length > 100) limits.add('osv-detail-limit');
  const ids = allIds.slice(0, 100);
  for (let index = 0; index < ids.length; index += 10) {
    await Promise.all(ids.slice(index, index + 10).map(async (id) => {
      try {
        const detail = await json(`https://api.osv.dev/v1/vulns/${encodeURIComponent(id)}`, {}, 15_000);
        if (!detail || typeof detail !== 'object' || !('id' in detail) || detail.id !== id) throw new Error(`OSV devolvió detalle inválido: ${id}`);
        details.set(id, detail as OsvDetail);
      } catch (error) {
        if (errors.length < 20) errors.push(error instanceof Error ? error.message : String(error));
      }
    }));
  }
  return { unique, matches, details, checked, errors, limits: [...limits],
    state: checked === unique.length && errors.length === 0 && limits.size === 0 ? 'completed' as const : checked > 0 ? 'partial' as const : 'failed' as const,
    metrics: { requests, retries, durationMs: Math.max(0, Math.round(now() - started)) } };
}
