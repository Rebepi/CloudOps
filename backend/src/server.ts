import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { createHash, randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { access, mkdir, open, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { db, cached } from './db.js';
import { config } from './config.js';
import * as cloud from './aws.js';
import { evaluateAwsSecurity } from './securityAssessment.js';
import { scanZipSecurity } from './zipSecurityScanner.js';
import {
  getUserByEmail,
  getUserById,
  verifyPassword,
  createToken,
  verifyToken,
  createSession,
  verifySSOTicket,
  syncSSOUser,
  toPublicUser,
} from './auth.js';

const app = Fastify({ logger: true, bodyLimit: 1024 * 1024 });

await app.register(cors, {
  origin: true,
  credentials: true,
});

await app.register(multipart, {
  limits: { files: 1, fields: 4, fileSize: 100 * 1024 * 1024 },
});

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

async function loadSecurityAssessment(projectId: string, assessmentId: string) {
  const assessment = await db.query(`
    SELECT sa.id, sa.project_id AS "projectId", sa.assessment_type AS "assessmentType", sa.status, sa.region,
      sa.score, sa.coverage, sa.confidence, sa.summary, sa.error_message AS "errorMessage",
      sa.started_at AS "startedAt", sa.completed_at AS "completedAt",
      artifact_id AS "artifactId", pa.original_name AS "artifactName", pa.sha256 AS "artifactSha256",
      pa.size_bytes AS "artifactSizeBytes"
    FROM security_assessments sa LEFT JOIN project_artifacts pa ON pa.id=sa.artifact_id
    WHERE sa.id=$1 AND sa.project_id=$2
  `, [assessmentId, projectId]);
  if (!assessment.rowCount) return null;
  const findings = await db.query(`
    SELECT id, assessment_id AS "assessmentId", external_id AS "externalId", source, category,
      title, description, severity, status, resource, recommendation, evidence, created_at AS "createdAt"
    FROM security_findings WHERE assessment_id=$1
    ORDER BY CASE severity WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MEDIUM' THEN 3 WHEN 'LOW' THEN 4 ELSE 5 END, created_at
  `, [assessmentId]);
  return { ...assessment.rows[0], findings: findings.rows };
}

async function runZipAssessment(projectId: string, artifactId: string, assessmentId: string, temporaryPath: string) {
  try {
    await db.query("UPDATE security_assessments SET status='running' WHERE id=$1", [assessmentId]);
    await db.query("UPDATE project_artifacts SET status='running' WHERE id=$1", [artifactId]);
    const evaluation = await scanZipSecurity(temporaryPath);
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      for (const item of evaluation.findings) {
        await client.query(`
          INSERT INTO security_findings(id,assessment_id,external_id,source,category,title,description,severity,status,resource,recommendation,evidence)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        `, [randomUUID(), assessmentId, item.externalId, item.source, item.category, item.title, item.description,
          item.severity, item.status, item.resource, item.recommendation, JSON.stringify(item.evidence)]);
      }
      await client.query(`
        UPDATE security_assessments SET status='completed',score=$2,coverage=$3,confidence=$4,summary=$5,completed_at=now()
        WHERE id=$1
      `, [assessmentId, evaluation.score, evaluation.coverage, evaluation.confidence, JSON.stringify(evaluation.summary)]);
      await client.query(`
        UPDATE project_artifacts SET status='completed',entry_count=$2,uncompressed_bytes=$3,metadata=$4,scanned_at=now()
        WHERE id=$1
      `, [artifactId, evaluation.summary.entryCount, evaluation.summary.uncompressedBytes, JSON.stringify({
        filesAnalyzed: evaluation.summary.filesAnalyzed,
        dependencyCount: evaluation.summary.dependencyCount,
        extensions: evaluation.summary.extensions,
        retained: false,
      })]);
      await client.query("UPDATE projects SET source_mode='zip',updated_at=now() WHERE id=$1", [projectId]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await Promise.all([
      db.query("UPDATE security_assessments SET status='failed',error_message=$2,completed_at=now() WHERE id=$1", [assessmentId, message]),
      db.query("UPDATE project_artifacts SET status='failed',metadata=jsonb_build_object('error',$2,'retained',false),scanned_at=now() WHERE id=$1", [artifactId, message]),
    ]);
    app.log.error({ assessmentId, artifactId, error: message }, 'ZIP security assessment failed');
  } finally {
    await unlink(temporaryPath).catch(() => undefined);
  }
}

async function recoverZipAssessments() {
  const pending = await db.query<{ id: string; project_id: string; artifact_id: string }>(`
    SELECT id,project_id,artifact_id FROM security_assessments
    WHERE assessment_type='code' AND status IN ('pending','running') AND artifact_id IS NOT NULL
  `);
  const uploadDirectory = join(tmpdir(), 'cloudops-security-scans');
  for (const assessment of pending.rows) {
    const temporaryPath = join(uploadDirectory, `${assessment.artifact_id}.zip`);
    try {
      await access(temporaryPath);
      setImmediate(() => { void runZipAssessment(assessment.project_id, assessment.artifact_id, assessment.id, temporaryPath); });
    } catch {
      const message = 'El proceso se interrumpió y el archivo ZIP temporal ya no está disponible; vuelve a cargarlo.';
      await Promise.all([
        db.query("UPDATE security_assessments SET status='failed',error_message=$2,completed_at=now() WHERE id=$1", [assessment.id, message]),
        db.query("UPDATE project_artifacts SET status='failed',metadata=metadata || jsonb_build_object('error',$2,'retained',false),scanned_at=now() WHERE id=$1", [assessment.artifact_id, message]),
      ]);
    }
  }
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

app.post<{ Body: { email?: string; password?: string } }>('/api/v1/auth/login', async (request, reply) => {
  const { email, password } = request.body ?? {};
  if (!email || !password) {
    return reply.code(400).send({ message: 'Correo y contraseña requeridos.' });
  }

  const user = await getUserByEmail(email);
  if (!user) {
    return reply.code(401).send({ message: 'Credenciales inválidas.' });
  }

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    return reply.code(401).send({ message: 'Credenciales inválidas.' });
  }

  if (!user.is_active) {
    return reply.code(403).send({ message: 'Usuario suspendido o deshabilitado.' });
  }

  const token = createToken(user);
  await createSession(user.id, token);

  return {
    token,
    user: toPublicUser(user),
  };
});

app.post<{ Body: { ticket?: string } }>('/api/v1/auth/sso-login', async (request, reply) => {
  const { ticket } = request.body ?? {};
  if (!ticket) {
    return reply.code(400).send({ message: 'Ticket de SSO requerido.' });
  }

  try {
    const ssoData = await verifySSOTicket(ticket);
    const user = await syncSSOUser(ssoData);

    if (!user.is_active) {
      return reply.code(403).send({ message: 'Usuario suspendido o deshabilitado.' });
    }

    const token = createToken(user);
    await createSession(user.id, token);

    return {
      token,
      user: toPublicUser(user),
    };
  } catch (err) {
    request.log.error(err);
    const message = err instanceof Error ? err.message : 'Error al procesar el ticket de SSO.';
    return reply.code(401).send({ message });
  }
});

app.get('/api/v1/auth/me', async (request, reply) => {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return reply.code(401).send({ message: 'No autenticado.' });
  }

  const token = authHeader.slice(7).trim();
  const payload = verifyToken(token);
  if (!payload?.id) {
    return reply.code(401).send({ message: 'Token inválido o expirado.' });
  }

  const user = await getUserById(payload.id);
  if (!user || !user.is_active) {
    return reply.code(401).send({ message: 'Usuario no encontrado o inactivo.' });
  }

  return {
    user: toPublicUser(user),
  };
});

app.post('/api/v1/auth/logout', async () => {
  return { success: true };
});

app.addHook('preHandler', async (request) => {
  const path = request.url.split('?')[0];
  if (path?.startsWith('/api/v1/aws/') && path !== '/api/v1/aws/identity' && path !== '/api/v1/aws/connection') {
    await cloud.assertAssessmentConnection();
  }
});

app.get('/api/v1/aws/identity', async () => response(await cloud.identity()));
app.get('/api/v1/aws/connection', async () => response(await cloud.connectionStatus()));
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

app.get<{ Querystring: { region?: string } }>('/api/v1/aws/alb-metrics', async ({ query }) => {
  const region = regionFrom(query);
  const result = await cached(`alb-metrics:${region}`, ttl.short, () => cloud.albMetrics(region));
  return response(result.data, result.observedAt, result.cached);
});
app.post<{ Body: { url?: string } }>('/api/v1/aws/simulate-request', {
  schema: { body: { type: 'object', required: ['url'], properties: { url: { type: 'string', minLength: 8, maxLength: 250 } } } },
}, async ({ body }) => response(await cloud.simulateRequest(body.url!)));

app.get('/api/v1/projects', async () => {
  const result = await db.query(`
    SELECT p.id, p.name, p.client_name AS "clientName", p.description,
      p.application_type AS "applicationType", p.environment, p.region, p.status,
      p.technology_stack AS "technologyStack", p.source_mode AS "sourceMode",
      p.created_at AS "createdAt", p.updated_at AS "updatedAt",
      latest.id AS "latestAssessmentId", latest.score AS "latestScore",
      latest.coverage AS "latestCoverage", latest.status AS "latestAssessmentStatus",
      latest.completed_at AS "latestAssessmentAt",
      (SELECT count(*)::int FROM security_assessments sa WHERE sa.project_id=p.id) AS "assessmentCount",
      (SELECT count(*)::int FROM security_findings sf JOIN security_assessments sa ON sa.id=sf.assessment_id
        WHERE sa.project_id=p.id AND sf.severity IN ('CRITICAL','HIGH') AND sf.status='open') AS "criticalHighFindings"
    FROM projects p
    LEFT JOIN LATERAL (
      SELECT id, score, coverage, status, completed_at
      FROM security_assessments WHERE project_id=p.id ORDER BY started_at DESC LIMIT 1
    ) latest ON true
    ORDER BY p.updated_at DESC
  `);
  return { data: result.rows };
});

app.post<{ Body: { name: string; clientName?: string; description?: string; applicationType: string; environment: string; region: string; technologyStack?: string[]; sourceMode?: string } }>('/api/v1/projects', {
  schema: { body: { type: 'object', required: ['name', 'applicationType', 'environment', 'region'], additionalProperties: false, properties: {
    name: { type: 'string', minLength: 3, maxLength: 120 }, clientName: { type: 'string', maxLength: 120 },
    description: { type: 'string', maxLength: 2000 }, applicationType: { enum: ['Web', 'Móvil', 'API', 'Analítica', 'Interna'] },
    environment: { enum: ['Producción', 'Staging', 'Sandbox'] }, region: { type: 'string', pattern: '^[a-z]{2}(?:-gov)?-[a-z]+-\\d$' },
    technologyStack: { type: 'array', maxItems: 30, items: { type: 'string', minLength: 1, maxLength: 60 } },
    sourceMode: { enum: ['none', 'zip', 'repository', 'aws'] },
  } } },
}, async ({ body }, reply) => {
  const id = randomUUID();
  const result = await db.query(`
    INSERT INTO projects(id,name,client_name,description,application_type,environment,region,technology_stack,source_mode)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
    RETURNING id,name,client_name AS "clientName",description,application_type AS "applicationType",
      environment,region,status,technology_stack AS "technologyStack",source_mode AS "sourceMode",
      created_at AS "createdAt",updated_at AS "updatedAt"
  `, [id, body.name.trim(), body.clientName?.trim() || null, body.description?.trim() ?? '', body.applicationType,
    body.environment, body.region, JSON.stringify(body.technologyStack ?? []), body.sourceMode ?? 'none']);
  reply.code(201);
  return { data: result.rows[0] };
});

app.post<{ Params: { proposalId: string } }>('/api/v1/projects/from-proposal/:proposalId', async ({ params }, reply) => {
  if (!uuidPattern.test(params.proposalId)) return reply.code(400).send({ message: 'ID de propuesta inválido' });
  const proposal = await db.query<{ name: string; data: Record<string, unknown>; project_id: string | null }>('SELECT name,data,project_id FROM proposals WHERE id=$1', [params.proposalId]);
  if (!proposal.rowCount) return reply.code(404).send({ message: 'Propuesta no encontrada' });
  const source = proposal.rows[0]!;
  if (source.project_id) {
    const existing = await db.query('SELECT id FROM projects WHERE id=$1', [source.project_id]);
    if (existing.rowCount) return { data: { id: source.project_id, existing: true } };
  }
  const projectId = randomUUID();
  const applicationType = typeof source.data.tipoAplicacion === 'string' ? source.data.tipoAplicacion : 'Web';
  const region = typeof source.data.regionId === 'string' && regionPattern.test(source.data.regionId) ? source.data.regionId : config.region;
  const description = typeof source.data.descripcion === 'string' ? source.data.descripcion : '';
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      INSERT INTO projects(id,name,description,application_type,environment,region,technology_stack,source_mode)
      VALUES($1,$2,$3,$4,'Sandbox',$5,'[]'::jsonb,'none')
    `, [projectId, source.name, description, applicationType, region]);
    await client.query('UPDATE proposals SET project_id=$2,data=$3 WHERE id=$1', [params.proposalId, projectId, JSON.stringify({ ...source.data, projectId })]);
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
  reply.code(201);
  return { data: { id: projectId, existing: false } };
});

app.get<{ Params: { id: string } }>('/api/v1/projects/:id', async ({ params }, reply) => {
  if (!uuidPattern.test(params.id)) return reply.code(400).send({ message: 'ID de proyecto inválido' });
  const result = await db.query(`
    SELECT p.id,p.name,p.client_name AS "clientName",p.description,p.application_type AS "applicationType",
      p.environment,p.region,p.status,p.technology_stack AS "technologyStack",p.source_mode AS "sourceMode",
      p.created_at AS "createdAt",p.updated_at AS "updatedAt",
      (SELECT count(*)::int FROM proposals WHERE project_id=p.id) AS "proposalCount",
      (SELECT count(*)::int FROM cost_items WHERE project_id=p.id) AS "costItemCount",
      (SELECT count(*)::int FROM security_assessments WHERE project_id=p.id) AS "assessmentCount"
    FROM projects p WHERE p.id=$1
  `, [params.id]);
  if (!result.rowCount) return reply.code(404).send({ message: 'Proyecto no encontrado' });
  return { data: result.rows[0] };
});

app.patch<{ Params: { id: string }; Body: { name?: string; clientName?: string; description?: string; applicationType?: string; environment?: string; region?: string; status?: string; technologyStack?: string[]; sourceMode?: string } }>('/api/v1/projects/:id', {
  schema: { body: { type: 'object', additionalProperties: false, properties: {
    name: { type: 'string', minLength: 3, maxLength: 120 }, clientName: { type: 'string', maxLength: 120 }, description: { type: 'string', maxLength: 2000 },
    applicationType: { enum: ['Web', 'Móvil', 'API', 'Analítica', 'Interna'] }, environment: { enum: ['Producción', 'Staging', 'Sandbox'] },
    region: { type: 'string', pattern: '^[a-z]{2}(?:-gov)?-[a-z]+-\\d$' }, status: { enum: ['active', 'paused', 'archived'] },
    technologyStack: { type: 'array', maxItems: 30, items: { type: 'string', minLength: 1, maxLength: 60 } }, sourceMode: { enum: ['none', 'zip', 'repository', 'aws'] },
  } } },
}, async ({ params, body }, reply) => {
  if (!uuidPattern.test(params.id)) return reply.code(400).send({ message: 'ID de proyecto inválido' });
  const current = await db.query('SELECT * FROM projects WHERE id=$1', [params.id]);
  if (!current.rowCount) return reply.code(404).send({ message: 'Proyecto no encontrado' });
  const row = current.rows[0];
  const result = await db.query(`
    UPDATE projects SET name=$2,client_name=$3,description=$4,application_type=$5,environment=$6,region=$7,
      status=$8,technology_stack=$9,source_mode=$10,updated_at=now() WHERE id=$1
    RETURNING id,name,client_name AS "clientName",description,application_type AS "applicationType",
      environment,region,status,technology_stack AS "technologyStack",source_mode AS "sourceMode",
      created_at AS "createdAt",updated_at AS "updatedAt"
  `, [params.id, body.name?.trim() ?? row.name, body.clientName?.trim() ?? row.client_name,
    body.description?.trim() ?? row.description, body.applicationType ?? row.application_type,
    body.environment ?? row.environment, body.region ?? row.region, body.status ?? row.status,
    JSON.stringify(body.technologyStack ?? row.technology_stack), body.sourceMode ?? row.source_mode]);
  return { data: result.rows[0] };
});

app.delete<{ Params: { id: string } }>('/api/v1/projects/:id', async ({ params }, reply) => {
  if (!uuidPattern.test(params.id)) return reply.code(400).send({ message: 'ID de proyecto inválido' });
  const result = await db.query('DELETE FROM projects WHERE id=$1', [params.id]);
  return reply.code(result.rowCount ? 204 : 404).send();
});

app.get<{ Params: { id: string } }>('/api/v1/projects/:id/security/assessments', async ({ params }, reply) => {
  if (!uuidPattern.test(params.id)) return reply.code(400).send({ message: 'ID de proyecto inválido' });
  const result = await db.query(`
    SELECT sa.id,sa.project_id AS "projectId",sa.assessment_type AS "assessmentType",sa.status,sa.region,
      sa.score,sa.coverage,sa.confidence,sa.summary,sa.error_message AS "errorMessage",
      sa.started_at AS "startedAt",sa.completed_at AS "completedAt",sa.artifact_id AS "artifactId",
      pa.original_name AS "artifactName",pa.sha256 AS "artifactSha256",pa.size_bytes AS "artifactSizeBytes",
      count(sf.id)::int AS "findingCount"
    FROM security_assessments sa LEFT JOIN security_findings sf ON sf.assessment_id=sa.id
    LEFT JOIN project_artifacts pa ON pa.id=sa.artifact_id
    WHERE sa.project_id=$1 GROUP BY sa.id,pa.id ORDER BY sa.started_at DESC
  `, [params.id]);
  return { data: result.rows };
});

app.get<{ Params: { id: string; assessmentId: string } }>('/api/v1/projects/:id/security/assessments/:assessmentId', async ({ params }, reply) => {
  if (!uuidPattern.test(params.id) || !uuidPattern.test(params.assessmentId)) return reply.code(400).send({ message: 'ID inválido' });
  const assessment = await loadSecurityAssessment(params.id, params.assessmentId);
  if (!assessment) return reply.code(404).send({ message: 'Evaluación no encontrada' });
  return { data: assessment };
});

app.post<{ Params: { id: string } }>('/api/v1/projects/:id/security/assessments/aws', async ({ params }, reply) => {
  if (!uuidPattern.test(params.id)) return reply.code(400).send({ message: 'ID de proyecto inválido' });
  const project = await db.query<{ region: string }>('SELECT region FROM projects WHERE id=$1', [params.id]);
  if (!project.rowCount) return reply.code(404).send({ message: 'Proyecto no encontrado' });
  await cloud.assertAssessmentConnection();
  const assessmentId = randomUUID();
  const region = project.rows[0]!.region;
  await db.query(`INSERT INTO security_assessments(id,project_id,assessment_type,status,region) VALUES($1,$2,'aws-account','running',$3)`, [assessmentId, params.id, region]);
  try {
    const snapshot = await cloud.security(region);
    const evaluation = evaluateAwsSecurity(snapshot);
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      for (const finding of evaluation.findings) {
        await client.query(`
          INSERT INTO security_findings(id,assessment_id,external_id,source,category,title,description,severity,status,resource,recommendation,evidence)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        `, [randomUUID(), assessmentId, finding.externalId, finding.source, finding.category, finding.title, finding.description,
          finding.severity, finding.status, finding.resource, finding.recommendation, JSON.stringify(finding.evidence)]);
      }
      await client.query(`
        UPDATE security_assessments SET status='completed',score=$2,coverage=$3,confidence=$4,summary=$5,completed_at=now() WHERE id=$1
      `, [assessmentId, evaluation.score, evaluation.coverage, evaluation.confidence, JSON.stringify(evaluation.summary)]);
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
    const assessment = await loadSecurityAssessment(params.id, assessmentId);
    reply.code(201);
    return { data: assessment };
  } catch (error) {
    const message = cloud.awsError(error);
    await db.query(`UPDATE security_assessments SET status='failed',error_message=$2,completed_at=now() WHERE id=$1`, [assessmentId, message]);
    throw Object.assign(new Error(`No se pudo completar la evaluación AWS: ${message}`), { statusCode: 502 });
  }
});

app.post<{ Params: { id: string } }>('/api/v1/projects/:id/security/assessments/code', async (request, reply) => {
  const { id } = request.params;
  if (!uuidPattern.test(id)) return reply.code(400).send({ message: 'ID de proyecto inválido' });
  const project = await db.query<{ region: string }>('SELECT region FROM projects WHERE id=$1', [id]);
  if (!project.rowCount) return reply.code(404).send({ message: 'Proyecto no encontrado' });

  const part = await request.file();
  if (!part) return reply.code(400).send({ message: 'Debes adjuntar un archivo ZIP en el campo archive.' });
  const originalName = basename(part.filename).slice(0, 240);
  if (!originalName.toLowerCase().endsWith('.zip')) {
    part.file.resume();
    return reply.code(415).send({ message: 'Solo se admiten archivos con extensión .zip.' });
  }

  const uploadDirectory = join(tmpdir(), 'cloudops-security-scans');
  await mkdir(uploadDirectory, { recursive: true });
  const artifactId = randomUUID();
  const assessmentId = randomUUID();
  const temporaryPath = join(uploadDirectory, `${artifactId}.zip`);
  const hash = createHash('sha256');
  let sizeBytes = 0;
  const meter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      sizeBytes += chunk.length;
      hash.update(chunk);
      callback(null, chunk);
    },
  });

  try {
    await pipeline(part.file, meter, createWriteStream(temporaryPath, { flags: 'wx' }));
    if (part.file.truncated) throw Object.assign(new Error('El ZIP supera el límite de carga de 100 MB.'), { statusCode: 413 });
    const fileHandle = await open(temporaryPath, 'r');
    const signature = Buffer.alloc(4);
    try { await fileHandle.read(signature, 0, 4, 0); }
    finally { await fileHandle.close(); }
    const isZip = signature.length >= 4 && signature[0] === 0x50 && signature[1] === 0x4b && [0x03, 0x05, 0x07].includes(signature[2]!) && [0x04, 0x06, 0x08].includes(signature[3]!);
    if (!isZip) throw Object.assign(new Error('El archivo no tiene una firma ZIP válida.'), { statusCode: 415 });
    const sha256 = hash.digest('hex');
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await client.query(`
        INSERT INTO project_artifacts(id,project_id,original_name,sha256,size_bytes,status,metadata)
        VALUES($1,$2,$3,$4,$5,'pending',$6)
      `, [artifactId, id, originalName, sha256, sizeBytes, JSON.stringify({ contentType: part.mimetype, retained: false })]);
      await client.query(`
        INSERT INTO security_assessments(id,project_id,assessment_type,status,region,artifact_id)
        VALUES($1,$2,'code','pending',$3,$4)
      `, [assessmentId, id, project.rows[0]!.region, artifactId]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    setImmediate(() => { void runZipAssessment(id, artifactId, assessmentId, temporaryPath); });
    return reply.code(202).send({ data: { assessmentId, artifactId, status: 'pending', sha256, sizeBytes, originalName } });
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
});

app.get('/api/v1/proposals', async () => {
  const result = await db.query<{ data: Record<string, unknown> }>('SELECT data FROM proposals ORDER BY created_at DESC');
  return { data: result.rows.map((r) => r.data) };
});
app.post<{ Body: Record<string, unknown> }>('/api/v1/proposals', {
  schema: { body: { type: 'object', required: ['nombre', 'regionId', 'serviciosSeleccionados', 'descripcion', 'tipoAplicacion', 'usuariosEstimados', 'disponibilidad', 'objetivoMigracion'], properties: {
    nombre: { type: 'string', minLength: 3 }, regionId: { type: 'string', pattern: '^[a-z0-9-]+$' }, serviciosSeleccionados: { type: 'array', minItems: 1, items: { type: 'string' } },
    descripcion: { type: 'string', minLength: 1 }, tipoAplicacion: { enum: ['Web', 'Móvil', 'API', 'Analítica', 'Interna'] }, usuariosEstimados: { type: 'integer', minimum: 1 }, disponibilidad: { enum: ['basica', 'alta', 'critica'] }, objetivoMigracion: { type: 'string', minLength: 1 },
    presupuestoMaximo: { type: 'number', minimum: 0 }, rtoHoras: { type: 'number', minimum: 0 }, rpoMinutos: { type: 'number', minimum: 0 }, cumplimiento: { type: 'array', items: { type: 'string' } },
    costoEstimadoMensual: { type: 'number' }, costoEstimadoAnual: { type: 'number' }, scoreWellArchitected: { type: 'number' }, desgloseServicios: { type: 'array' },
  }, additionalProperties: true } },
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

app.delete('/api/v1/cache', async (_request, reply) => {
  await db.query('DELETE FROM aws_cache');
  return reply.code(204).send();
});
app.delete<{ Params: { pattern: string } }>('/api/v1/cache/:pattern', async ({ params }, reply) => {
  await db.query("DELETE FROM aws_cache WHERE key LIKE $1", [`${decodeURIComponent(params.pattern)}%`]);
  return reply.code(204).send();
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
  await recoverZipAssessments();
  await app.listen({ host: '127.0.0.1', port: config.port });
}

main().catch((error) => { app.log.error(error); process.exitCode = 1; });
