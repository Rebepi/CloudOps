import test from 'node:test';
import assert from 'node:assert/strict';
import { lookupOsv } from './osvClient.js';
import type { Dependency } from '../zipSecurityScanner.js';

const dependency: Dependency = { ecosystem: 'npm', name: 'package', version: '1.0.0', manifest: 'package-lock.json' };
const json = (value: unknown, status = 200, headers?: Record<string, string>) => new Response(JSON.stringify(value), { status, headers });
function transport(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  return (async (url, init) => handler(String(url), init)) as typeof fetch;
}
function clock() {
  let time = 0;
  const waits: number[] = [];
  return { waits, now: () => time, sleep: async (ms: number) => { waits.push(ms); time += ms; } };
}

test('OSV reintenta errores de red y 5xx con espera exponencial acotada', async () => {
  let requests = 0;
  const timer = clock();
  const result = await lookupOsv([dependency], { ...timer, fetch: transport(() => {
    requests++;
    if (requests === 1) throw new TypeError('fetch failed');
    return requests === 2 ? json({}, 503) : json({ results: [{}] });
  }) });
  assert.equal(result.state, 'completed');
  assert.equal(result.checked, 1);
  assert.deepEqual(timer.waits, [250, 500]);
  assert.equal(result.metrics.requests, 3);
  assert.equal(result.metrics.retries, 2);
  assert.equal(result.metrics.durationMs, 750);
});

test('OSV respeta Retry-After sin esperar más que el presupuesto permitido', async () => {
  const timer = clock();
  let requests = 0;
  const result = await lookupOsv([dependency], { ...timer, fetch: transport(() => ++requests === 1
    ? json({}, 429, { 'retry-after': '2' }) : json({ results: [{}] })) });
  assert.equal(result.state, 'completed');
  assert.deepEqual(timer.waits, [2000]);
  const deferred = await lookupOsv([dependency], { ...clock(), fetch: transport(() => json({}, 429, { 'retry-after': '120' })) });
  assert.equal(deferred.metrics.requests, 1);
  assert.ok(deferred.limits.includes('osv-retry-budget'));
});

test('errores 4xx permanentes no se reintentan ni se interpretan como resultado limpio', async () => {
  const result = await lookupOsv([dependency], { ...clock(), fetch: transport(() => json({}, 403)) });
  assert.equal(result.state, 'failed');
  assert.equal(result.checked, 0);
  assert.equal(result.metrics.requests, 1);
  assert.equal(result.metrics.retries, 0);
});

test('un lote incompleto no se cuenta como dependencias evaluadas', async () => {
  const result = await lookupOsv([dependency], { ...clock(), fetch: transport(() => json({ results: [] })) });
  assert.equal(result.checked, 0);
  assert.equal(result.state, 'failed');
  assert.match(result.errors[0]!, /incompletos/);
});

test('un lote posterior fallido conserva hallazgos y cantidad ya evaluada', async () => {
  const dependencies = Array.from({ length: 101 }, (_, index) => ({ ...dependency, name: `package-${index}` }));
  let batches = 0;
  const result = await lookupOsv(dependencies, { ...clock(), fetch: transport((url) => {
    if (url.includes('/vulns/')) return json({ id: 'GHSA-observed', database_specific: { severity: 'HIGH' } });
    if (++batches > 1) return json({}, 503);
    return json({ results: Array.from({ length: 100 }, (_, index) => index ? {} : { vulns: [{ id: 'GHSA-observed' }] }) });
  }) });
  assert.equal(result.state, 'partial');
  assert.equal(result.checked, 100);
  assert.equal(result.matches.length, 1);
  assert.equal(result.details.get('GHSA-observed')!.database_specific!.severity, 'HIGH');
});

test('un aviso sin detalle conserva la coincidencia y declara evaluación parcial', async () => {
  const result = await lookupOsv([dependency], { ...clock(), fetch: transport((url) => url.includes('/vulns/')
    ? json({}, 404) : json({ results: [{ vulns: [{ id: 'GHSA-missing' }] }] })) });
  assert.equal(result.checked, 1);
  assert.equal(result.matches.length, 1);
  assert.equal(result.details.size, 0);
  assert.equal(result.state, 'partial');
});

test('el presupuesto global evita nuevas solicitudes y esperas fuera del plazo', async () => {
  const timer = clock();
  const result = await lookupOsv([dependency], { ...timer, budgetMs: 100, fetch: transport(() => { throw new TypeError('fetch failed'); }) });
  assert.equal(result.metrics.requests, 1);
  assert.deepEqual(timer.waits, []);
  assert.equal(result.state, 'failed');
  const expired = await lookupOsv([dependency], { ...timer, budgetMs: 0, fetch: transport(() => { throw new Error('No debe ejecutarse'); }) });
  assert.equal(expired.metrics.requests, 0);
  assert.ok(expired.limits.includes('osv-time-budget'));
});

test('límites de coincidencias y detalles quedan explícitos', async () => {
  const result = await lookupOsv([dependency], { ...clock(), fetch: transport((url) => url.includes('/vulns/')
    ? json({ id: decodeURIComponent(url.split('/').pop()!) })
    : json({ results: [{ vulns: Array.from({ length: 301 }, (_, index) => ({ id: `GHSA-${index}` })) }] })) });
  assert.equal(result.matches.length, 300);
  assert.equal(result.details.size, 100);
  assert.equal(result.state, 'partial');
  assert.deepEqual(result.limits.sort(), ['osv-detail-limit', 'osv-match-limit']);
});
