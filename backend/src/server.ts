import Fastify from 'fastify';
import { createHash, randomUUID } from 'node:crypto';
import { db, cached } from './db.js';
import { config } from './config.js';
import * as cloud from './aws.js';

const app = Fastify({ logger: true, bodyLimit: 1024 * 1024 });
const ttl = { short: 60_000, inventory: 5 * 60_000, costs: 60 * 60_000 };
const regionPattern = /^[a-z]{2}(?:-gov)?-[a-z]+-\d$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const legacyId = (kind: string, value: unknown) => {
  const hash = createHash('sha256').update(kind).update(JSON.stringify(value)).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
};

function regionFrom(query: { region?: string }) {
  const region = query.region ?? config.region;
  if (!regionPattern.test(region)) throw new Error('Región inválida');
  return region;
}

function response<T>(data: T, observedAt = new Date().toISOString(), cachedResult = false) {
  return { data, source: 'aws', observedAt, cached: cachedResult };
}

app.setErrorHandler((error, request, reply) => {
  request.log.error(error);
  const exception = error instanceof Error ? error : new Error(String(error));
  const status = exception.message === 'Región inválida' ? 400 : ('statusCode' in exception && typeof exception.statusCode === 'number' ? exception.statusCode : 503);
  reply.code(status).send({ error: exception.name, message: exception.message });
});

app.get('/api/v1/health', async () => {
  await db.query('SELECT 1');
  return { status: 'ok', database: 'connected', awsProfile: config.awsProfile, region: config.region };
});

app.get('/api/v1/aws/identity', async () => response(await cloud.identity()));
app.get('/api/v1/aws/regions', async () => {
  const result = await cached('regions', ttl.costs, cloud.regions);
  return response(result.data, result.observedAt, result.cached);
});
app.get<{ Querystring: { region?: string } }>('/api/v1/aws/inventory', async ({ query }) => {
  const region = regionFrom(query);
  const result = await cached(`inventory:${region}`, ttl.inventory, () => cloud.inventory(region));
  return response(result.data, result.observedAt, result.cached);
});
app.get('/api/v1/aws/buckets', async () => {
  const result = await cached('buckets', ttl.inventory, cloud.buckets);
  return response(result.data, result.observedAt, result.cached);
});
app.get<{ Params: { region: string } }>('/api/v1/aws/regions/:region/detail', async ({ params }) => {
  const region = regionFrom({ region: params.region });
  const result = await cached(`region-detail:${region}`, ttl.inventory, () => cloud.regionDetail(region));
  return response(result.data, result.observedAt, result.cached);
});
app.get<{ Params: { region: string; zoneId: string } }>('/api/v1/aws/regions/:region/zones/:zoneId', async ({ params }) => {
  const region = regionFrom({ region: params.region });
  if (!/^[a-z0-9-]+$/.test(params.zoneId)) throw Object.assign(new Error('Zona inválida'), { statusCode: 400 });
  const result = await cached(`zone-detail:${region}:${params.zoneId}`, ttl.inventory, () => cloud.zoneDetail(region, params.zoneId));
  return response(result.data, result.observedAt, result.cached);
});
app.get<{ Querystring: { region?: string } }>('/api/v1/aws/services', async ({ query }) => {
  const region = regionFrom(query);
  const result = await cached(`services:${region}`, ttl.inventory, () => cloud.serviceInventory(region));
  return response(result.data, result.observedAt, result.cached);
});
app.get<{ Querystring: { region?: string } }>('/api/v1/aws/network', async ({ query }) => {
  const region = regionFrom(query);
  const result = await cached(`network:${region}`, ttl.inventory, () => cloud.network(region));
  return response(result.data, result.observedAt, result.cached);
});
app.get<{ Querystring: { region?: string } }>('/api/v1/aws/events', async ({ query }) => {
  const region = regionFrom(query);
  const result = await cached(`events:${region}`, ttl.short, () => cloud.events(region));
  return response(result.data, result.observedAt, result.cached);
});
app.get<{ Querystring: { region?: string } }>('/api/v1/aws/security', async ({ query }) => {
  const region = regionFrom(query);
  const result = await cached(`security:${region}`, ttl.inventory, () => cloud.security(region));
  return response(result.data, result.observedAt, result.cached);
});
app.get<{ Querystring: { region?: string } }>('/api/v1/aws/latency', async ({ query }) => response(await cloud.latency(regionFrom(query))));
app.get<{ Querystring: { serviceCode?: string; regionCode?: string; instanceType?: string; operatingSystem?: string; tenancy?: string; capacitystatus?: string; preInstalledSw?: string; storageClass?: string; databaseEngine?: string; usagetype?: string } }>('/api/v1/aws/pricing', async ({ query }) => {
  const allowed = new Set(['AmazonEC2', 'AmazonS3', 'AmazonRDS', 'AWSLambda', 'AmazonDynamoDB', 'AmazonCloudFront', 'AmazonRoute53', 'AmazonCloudWatch', 'AmazonVPC', 'awskms', 'awswaf', 'AWSELB']);
  if (!query.serviceCode || !allowed.has(query.serviceCode)) throw Object.assign(new Error('Código de servicio no admitido'), { statusCode: 400 });
  const fields = ['regionCode', 'instanceType', 'operatingSystem', 'tenancy', 'capacitystatus', 'preInstalledSw', 'storageClass', 'databaseEngine', 'usagetype'] as const;
  const filters = fields.flatMap((field) => {
    const value = query[field];
    if (!value) return [];
    if (value.length > 80) throw Object.assign(new Error('Filtro de precio demasiado largo'), { statusCode: 400 });
    return [{ field, value }];
  });
  const key = `pricing:v2:${query.serviceCode}:${JSON.stringify(filters)}`;
  const result = await cached(key, ttl.costs, () => cloud.price(query.serviceCode!, filters));
  return response(result.data, result.observedAt, result.cached);
});
app.get<{ Querystring: { start?: string; end?: string } }>('/api/v1/aws/costs', async ({ query }) => {
  const today = new Date();
  const end = query.end ?? new Date(today.getTime() + 86_400_000).toISOString().slice(0, 10);
  const start = query.start ?? `${today.toISOString().slice(0, 8)}01`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || start >= end) {
    throw Object.assign(new Error('Rango de fechas inválido'), { statusCode: 400 });
  }
  const result = await cached(`costs:${start}:${end}`, ttl.costs, () => cloud.costs(start, end));
  return response(result.data, result.observedAt, result.cached);
});
app.get('/api/v1/aws/finops', async () => {
  const result = await cached('finops', ttl.costs, cloud.finops);
  return response(result.data, result.observedAt, result.cached);
});
app.get<{ Querystring: { region?: string } }>('/api/v1/aws/overview', async ({ query }) => {
  const region = regionFrom(query);
  const names = ['identity', 'inventory', 'buckets', 'events'] as const;
  const requests = [cloud.identity(), cloud.inventory(region), cloud.buckets(), cloud.events(region)];
  const results = await Promise.allSettled(requests);
  const data: Record<string, unknown> = { region };
  const errors: Record<string, string> = {};
  results.forEach((result, index) => {
    const name = names[index]!;
    if (result.status === 'fulfilled') data[name] = result.value;
    else errors[name] = cloud.awsError(result.reason);
  });
  if (data.inventory) {
    const ids = (data.inventory as Awaited<ReturnType<typeof cloud.inventory>>).instances.map((i) => i.id).filter((id): id is string => Boolean(id));
    try { data.cpu = await cloud.cpuMetrics(region, ids); } catch (error) { errors.cpu = cloud.awsError(error); }
  }
  return { data, errors, source: 'aws', observedAt: new Date().toISOString() };
});
app.post<{ Body: { principalArn: string; action: string; resourceArn: string } }>('/api/v1/aws/iam/simulate', {
  schema: { body: { type: 'object', required: ['principalArn', 'action', 'resourceArn'], additionalProperties: false,
    properties: { principalArn: { type: 'string', pattern: '^arn:aws:iam::' }, action: { type: 'string', minLength: 3 }, resourceArn: { type: 'string', minLength: 1 } } } },
}, async ({ body }) => response(await cloud.simulatePolicy(body.principalArn, body.action, body.resourceArn)));

app.get('/api/v1/proposals', async () => {
  const result = await db.query<{ data: Record<string, unknown> }>('SELECT data FROM proposals ORDER BY created_at DESC');
  return { data: result.rows.map((r) => r.data) };
});
app.post<{ Body: Record<string, unknown> }>('/api/v1/proposals', {
  schema: { body: { type: 'object', required: ['nombre', 'regionId', 'serviciosSeleccionados', 'descripcion', 'tipoAplicacion', 'usuariosEstimados', 'disponibilidad', 'objetivoMigracion'], properties: {
    nombre: { type: 'string', minLength: 3 }, regionId: { type: 'string', pattern: '^[a-z0-9-]+$' }, serviciosSeleccionados: { type: 'array', minItems: 1, items: { type: 'string' } },
    descripcion: { type: 'string', minLength: 1 }, tipoAplicacion: { enum: ['Web', 'Móvil', 'API', 'Analítica', 'Interna'] }, usuariosEstimados: { type: 'integer', minimum: 1 }, disponibilidad: { enum: ['basica', 'alta', 'critica'] }, objetivoMigracion: { type: 'string', minLength: 1 },
    presupuestoMaximo: { type: 'number', minimum: 0 }, rtoHoras: { type: 'number', minimum: 0 }, rpoMinutos: { type: 'number', minimum: 0 }, cumplimiento: { type: 'array', items: { type: 'string' } },
  } } },
}, async ({ body }, reply) => {
  const id = randomUUID();
  const data = { ...body, id, creadaEn: new Date().toISOString() };
  await db.query('INSERT INTO proposals(id,name,data) VALUES($1,$2,$3)', [id, body.nombre, JSON.stringify(data)]);
  reply.code(201);
  return { data };
});
app.delete<{ Params: { id: string } }>('/api/v1/proposals/:id', async ({ params }, reply) => {
  if (!uuidPattern.test(params.id)) return reply.code(400).send({ message: 'ID inválido' });
  const result = await db.query('DELETE FROM proposals WHERE id=$1', [params.id]);
  return reply.code(result.rowCount ? 204 : 404).send();
});

app.get('/api/v1/cost-items', async () => {
  const result = await db.query('SELECT id,service_id AS "servicioId",quantity AS cantidad,monthly_hours AS "horasMes",configuration AS configuracion,unit_price AS "precioUnitario",price_unit AS "unidadPrecio",price_sku AS "skuPrecio",price_service_code AS "codigoServicioPrecio",price_region AS "regionPrecio",price_observed_at AS "fechaPrecio" FROM cost_items ORDER BY created_at');
  return { data: result.rows.map((r) => ({ ...r, cantidad: Number(r.cantidad), horasMes: Number(r.horasMes), precioUnitario: r.precioUnitario === null ? null : Number(r.precioUnitario) })) };
});
app.post<{ Body: { servicioId: string; cantidad: number; horasMes: number; configuracion?: string; precioUnitario?: number; unidadPrecio?: string; skuPrecio?: string; codigoServicioPrecio?: string; regionPrecio?: string; fechaPrecio?: string } }>('/api/v1/cost-items', {
  schema: { body: { type: 'object', required: ['servicioId', 'cantidad', 'horasMes'], additionalProperties: false, properties: {
    servicioId: { type: 'string', minLength: 1 }, cantidad: { type: 'number', exclusiveMinimum: 0 }, horasMes: { type: 'number', minimum: 0, maximum: 744 }, configuracion: { type: 'string' },
    precioUnitario: { type: 'number', minimum: 0 }, unidadPrecio: { type: 'string' }, skuPrecio: { type: 'string' }, codigoServicioPrecio: { type: 'string' }, regionPrecio: { type: 'string' }, fechaPrecio: { type: 'string' },
  } } },
}, async ({ body }, reply) => {
  const id = randomUUID();
  await db.query('INSERT INTO cost_items(id,service_id,quantity,monthly_hours,configuration,unit_price,price_unit,price_sku,price_service_code,price_region,price_observed_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)', [id, body.servicioId, body.cantidad, body.horasMes, body.configuracion ?? null, body.precioUnitario ?? null, body.unidadPrecio ?? null, body.skuPrecio ?? null, body.codigoServicioPrecio ?? null, body.regionPrecio ?? null, body.fechaPrecio ?? null]);
  reply.code(201);
  return { data: { ...body, id } };
});
app.delete<{ Params: { id: string } }>('/api/v1/cost-items/:id', async ({ params }, reply) => {
  if (!uuidPattern.test(params.id)) return reply.code(400).send({ message: 'ID inválido' });
  const result = await db.query('DELETE FROM cost_items WHERE id=$1', [params.id]);
  return reply.code(result.rowCount ? 204 : 404).send();
});
app.delete('/api/v1/cost-items', async (_request, reply) => {
  await db.query('DELETE FROM cost_items');
  return reply.code(204).send();
});

app.get('/api/v1/settings', async () => {
  const result = await db.query<{ key: string; value: unknown }>('SELECT key,value FROM app_settings');
  return { data: Object.fromEntries(result.rows.map((r) => [r.key, r.value])) };
});
app.put<{ Params: { key: string }; Body: { value: unknown } }>('/api/v1/settings/:key', {
  schema: { params: { type: 'object', required: ['key'], properties: { key: { enum: ['regionPrincipal', 'ambiente', 'presupuestoLimite'] } } }, body: { type: 'object', required: ['value'], properties: { value: {} } } },
}, async ({ params, body }) => {
  await db.query('INSERT INTO app_settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value', [params.key, JSON.stringify(body.value)]);
  return { data: { key: params.key, value: body.value } };
});

app.post<{ Body: { proposals?: Record<string, unknown>[]; costItems?: Record<string, unknown>[] } }>('/api/v1/import/browser', {
  schema: { body: { type: 'object', additionalProperties: false, properties: {
    proposals: { type: 'array', maxItems: 500, items: { type: 'object' } }, costItems: { type: 'array', maxItems: 1000, items: { type: 'object' } },
  } } },
}, async ({ body }) => {
  const client = await db.connect();
  let proposals = 0;
  let costItems = 0;
  try {
    await client.query('BEGIN');
    for (const p of body.proposals ?? []) {
      if (p.id === 'demo-1' || typeof p.nombre !== 'string' || !p.nombre.trim()) continue;
      const id = typeof p.id === 'string' && uuidPattern.test(p.id) ? p.id : legacyId('proposal', p);
      const data = { ...p, id };
      const result = await client.query('INSERT INTO proposals(id,name,data) VALUES($1,$2,$3) ON CONFLICT(id) DO NOTHING', [id, p.nombre, JSON.stringify(data)]);
      proposals += result.rowCount ?? 0;
    }
    for (const i of body.costItems ?? []) {
      if (['1', '2', '3', '4', '5'].includes(String(i.id))) continue;
      if (typeof i.servicioId !== 'string' || !Number.isFinite(i.cantidad) || !Number.isFinite(i.horasMes)) continue;
      const id = typeof i.id === 'string' && uuidPattern.test(i.id) ? i.id : legacyId('cost-item', i);
      const result = await client.query('INSERT INTO cost_items(id,service_id,quantity,monthly_hours,configuration,unit_price,price_unit,price_sku,price_service_code,price_region,price_observed_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(id) DO NOTHING', [
        id, i.servicioId, i.cantidad, i.horasMes, typeof i.configuracion === 'string' ? i.configuracion : null,
        typeof i.precioUnitario === 'number' && i.precioUnitario >= 0 ? i.precioUnitario : null,
        typeof i.unidadPrecio === 'string' ? i.unidadPrecio : null,
        typeof i.skuPrecio === 'string' ? i.skuPrecio : null,
        typeof i.codigoServicioPrecio === 'string' ? i.codigoServicioPrecio : null,
        typeof i.regionPrecio === 'string' ? i.regionPrecio : null,
        typeof i.fechaPrecio === 'string' && !Number.isNaN(Date.parse(i.fechaPrecio)) ? i.fechaPrecio : null,
      ]);
      costItems += result.rowCount ?? 0;
    }
    await client.query('COMMIT');
    return { data: { proposals, costItems } };
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
});

async function main() {
  await db.query('SELECT 1');
  await app.listen({ host: '127.0.0.1', port: config.port });
}

main().catch((error) => { app.log.error(error); process.exitCode = 1; });
