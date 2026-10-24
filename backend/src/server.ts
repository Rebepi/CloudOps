import Fastify, { type FastifyRequest, type FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { createHash, randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
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
// El escáner produce hallazgos, cobertura y arquitectura respaldados por evidencia del artefacto.
import { scanZipSecurity, BUILTIN_RULE_CATALOG } from './zipSecurityScanner.js';
import { getSastCatalog } from './security/sast.js';
import { mergeAssessments } from './fullAssessment.js';
import { serializeSbom, sbomChecksum, type CycloneDxBom } from './security/supplyChain.js';
import { registerSbomRoute } from './security/sbomRoute.js';
import { buildAnalyzerRuns, computeDimensionBreakdown, dimensionForFinding, type FindingInput } from './security/dimensions.js';
import { computeFingerprint } from './findingFingerprint.js';
import { startScheduler, computeNextRun } from './scheduler.js';
import { downloadRepositoryArchive, verifyRepository } from './repository.js';
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
      sa.dimension_scores AS "dimensionScores", sa.control_results AS "controlResults", sa.engine_version AS "engineVersion",
      sa.started_at AS "startedAt", sa.completed_at AS "completedAt",
      artifact_id AS "artifactId", pa.original_name AS "artifactName", pa.sha256 AS "artifactSha256",
      pa.size_bytes AS "artifactSizeBytes", pa.metadata AS "artifactMetadata"
    FROM security_assessments sa LEFT JOIN project_artifacts pa ON pa.id=sa.artifact_id
    WHERE sa.id=$1 AND sa.project_id=$2
  `, [assessmentId, projectId]);
  if (!assessment.rowCount) return null;
  const findings = await db.query(`
    SELECT id, assessment_id AS "assessmentId", external_id AS "externalId", source, category, dimension,
      title, description, severity, status, resource, recommendation, evidence, fingerprint, framework,
      owner, due_date AS "dueDate", justification, approved_by AS "approvedBy",
      created_at AS "createdAt", updated_at AS "updatedAt"
    FROM security_findings WHERE assessment_id=$1
    ORDER BY CASE severity WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MEDIUM' THEN 3 WHEN 'LOW' THEN 4 ELSE 5 END, created_at
  `, [assessmentId]);
  const analyzers = await db.query(`
    SELECT analyzer_id AS "analyzerId", dimension, state, items_analyzed AS "itemsAnalyzed",
      findings_count AS "findingsCount", duration_ms AS "durationMs", error, detail, created_at AS "createdAt"
    FROM assessment_analyzers WHERE assessment_id=$1 ORDER BY analyzer_id
  `, [assessmentId]);
  return { ...assessment.rows[0], findings: findings.rows, analyzers: analyzers.rows };
}

async function loadComparison(projectId: string, assessmentId: string) {
  const current = await db.query<{ assessmentType: string; score: number | null; coverage: number; startedAt: Date; methodologyVersion: string; engineVersion: string }>(`
    SELECT assessment_type AS "assessmentType", score, coverage, started_at AS "startedAt", methodology_version AS "methodologyVersion", engine_version AS "engineVersion"
    FROM security_assessments WHERE id=$1 AND project_id=$2 AND status='completed'
  `, [assessmentId, projectId]);
  if (!current.rowCount) return null;
  const assessment = current.rows[0]!;
  const previous = await db.query<{ id: string; score: number | null; coverage: number; startedAt: Date; methodologyVersion: string; engineVersion: string }>(`
    SELECT id, score, coverage, started_at AS "startedAt", methodology_version AS "methodologyVersion", engine_version AS "engineVersion"
    FROM security_assessments
    WHERE project_id=$1 AND assessment_type=$2 AND status='completed' AND started_at < $3
    ORDER BY started_at DESC LIMIT 1
  `, [projectId, assessment.assessmentType, assessment.startedAt]);
  const previousRow = previous.rows[0] ?? null;
  const comparable = Boolean(previousRow && previousRow.methodologyVersion === assessment.methodologyVersion && previousRow.engineVersion === assessment.engineVersion);
  const findingsOf = async (id: string) => (await db.query(`
    SELECT id, fingerprint, external_id AS "externalId", source, category, title, severity, status, resource, framework
    FROM security_findings WHERE assessment_id=$1
  `, [id])).rows;
  const currentFindings = await findingsOf(assessmentId);
  const previousFindings = previousRow ? await findingsOf(previousRow.id) : [];
  const previousMap = new Map(previousFindings.map((finding) => [finding.fingerprint, finding]));
  const currentMap = new Map(currentFindings.map((finding) => [finding.fingerprint, finding]));
  const newFindings = currentFindings.filter((finding) => !previousMap.has(finding.fingerprint));
  const resolvedFindings = previousFindings.filter((finding) => !currentMap.has(finding.fingerprint));
  const recurring = currentFindings.filter((finding) => previousMap.has(finding.fingerprint));
  const severityChanged = recurring
    .filter((finding) => previousMap.get(finding.fingerprint)!.severity !== finding.severity)
    .map((finding) => ({ ...finding, previousSeverity: previousMap.get(finding.fingerprint)!.severity, currentSeverity: finding.severity }));
  return {
    assessmentType: assessment.assessmentType,
    current: { id: assessmentId, score: assessment.score, coverage: assessment.coverage },
    previous: previousRow ? { id: previousRow.id, score: previousRow.score, coverage: previousRow.coverage, startedAt: previousRow.startedAt, methodologyVersion: previousRow.methodologyVersion } : null,
    summary: {
      newCount: newFindings.length,
      resolvedCount: resolvedFindings.length,
      recurringCount: recurring.length,
      severityChangedCount: severityChanged.length,
      scoreDelta: comparable && previousRow && assessment.score !== null && previousRow.score !== null ? assessment.score - previousRow.score : null,
      coverageDelta: comparable && previousRow ? assessment.coverage - previousRow.coverage : null,
      comparable,
    },
    newFindings,
    resolvedFindings,
    recurring,
    severityChanged,
  };
}

type PersistedFinding = {
  externalId?: string | null;
  source: string;
  category: string;
  title: string;
  description: string;
  severity: string;
  status?: string;
  resource?: string | null;
  recommendation: string;
  evidence: Record<string, unknown>;
  fingerprint?: string | null;
  framework?: string | null;
};

async function previousLifecycleByFingerprint(projectId: string, assessmentType: string, excludeAssessmentId: string) {
  const result = await db.query<{ fingerprint: string; status: string; owner: string | null; dueDate: string | null; justification: string | null; approvedBy: string | null; severity: string; firstSeenAssessmentId: string | null }>(`
    SELECT sf.fingerprint, sf.status, sf.owner, sf.due_date AS "dueDate", sf.justification,
      sf.approved_by AS "approvedBy", sf.severity, sf.first_seen_assessment_id AS "firstSeenAssessmentId"
    FROM security_findings sf JOIN security_assessments sa ON sa.id=sf.assessment_id
    WHERE sa.project_id=$1 AND sa.assessment_type=$2 AND sa.status='completed' AND sa.id<>$3 AND sf.fingerprint IS NOT NULL
    ORDER BY sa.started_at DESC
  `, [projectId, assessmentType, excludeAssessmentId]);
  const map = new Map<string, (typeof result.rows)[number]>();
  for (const row of result.rows) if (!map.has(row.fingerprint)) map.set(row.fingerprint, row);
  return map;
}

async function insertFindings(client: PoolClient, projectId: string, assessmentId: string, assessmentType: string, findings: PersistedFinding[]) {
  const previous = await previousLifecycleByFingerprint(projectId, assessmentType, assessmentId);
  for (const finding of findings) {
    const fingerprint = finding.fingerprint ?? computeFingerprint(finding);
    const observations = Array.isArray(finding.evidence.observations) ? finding.evidence.observations : [];
    const aliases = observations.flatMap((observation) => typeof observation === 'object' && observation !== null
      && 'fingerprint' in observation && typeof observation.fingerprint === 'string' ? [observation.fingerprint] : []);
    const prior = previous.get(fingerprint) ?? aliases.map((alias) => previous.get(alias)).find(Boolean);
    let status = finding.status ?? 'open';
    let owner: string | null = null;
    let dueDate: string | null = null;
    let justification: string | null = null;
    let approvedBy: string | null = null;
    let eventType = 'created';
    let firstSeen = assessmentId;
    if (prior) {
      owner = prior.owner;
      dueDate = prior.dueDate;
      justification = prior.justification;
      approvedBy = prior.approvedBy;
      firstSeen = prior.firstSeenAssessmentId ?? assessmentId;
      if (prior.status === 'false_positive' || prior.status === 'risk_accepted') {
        status = prior.status;
        eventType = prior.severity !== finding.severity ? 'severity_changed' : 'recurring';
      } else if (prior.status === 'resolved') {
        status = 'open';
        eventType = 'reopened';
      } else {
        status = prior.status || 'open';
        eventType = 'recurring';
      }
    }
    const findingId = randomUUID();
    await client.query(`
      INSERT INTO security_findings(id,assessment_id,external_id,source,category,title,description,severity,status,resource,recommendation,evidence,fingerprint,framework,owner,due_date,justification,approved_by,first_seen_assessment_id,last_seen_assessment_id,dimension)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
    `, [findingId, assessmentId, finding.externalId ?? null, finding.source, finding.category, finding.title, finding.description,
      finding.severity, status, finding.resource ?? null, finding.recommendation, JSON.stringify(finding.evidence),
      fingerprint, finding.framework ?? null, owner, dueDate, justification, approvedBy, firstSeen, assessmentId,
      dimensionForFinding(finding)]);
    await client.query(`
      INSERT INTO security_finding_events(id,finding_id,event_type,from_status,to_status,actor,justification,metadata)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8)
    `, [randomUUID(), findingId, eventType, prior?.status ?? null, status, 'system', justification,
      JSON.stringify({ severity: finding.severity, severityChanged: Boolean(prior && prior.severity !== finding.severity) })]);
  }
}

async function completeAssessment(client: PoolClient, assessmentId: string, assessmentType: string, evaluation: {
  score: number | null;
  coverage: number;
  confidence: string;
  summary: Record<string, unknown>;
  findings: readonly FindingInput[];
  sbom?: CycloneDxBom;
}) {
  const breakdown = computeDimensionBreakdown({ assessmentType, findings: evaluation.findings, summary: evaluation.summary });
  const controls = breakdown.flatMap((dimension) => dimension.controls);
  const analyzers = buildAnalyzerRuns({ assessmentType, findings: evaluation.findings, summary: evaluation.summary });
  await client.query(`
    UPDATE security_assessments SET status='completed',score=$2,coverage=$3,confidence=$4,summary=$5,methodology_version=$6,
      dimension_scores=$7,control_results=$8,engine_version=$9,completed_at=now()
    WHERE id=$1
  `, [assessmentId, evaluation.score, evaluation.coverage, evaluation.confidence, JSON.stringify(evaluation.summary),
    String(evaluation.summary.methodologyVersion ?? '2026.17'), JSON.stringify(breakdown), JSON.stringify(controls), '1.7.0']);
  if (evaluation.sbom) {
    await client.query(`INSERT INTO assessment_sboms(assessment_id,format,spec_version,sha256,content) VALUES($1,$2,$3,$4,$5)
      ON CONFLICT(assessment_id) DO UPDATE SET format=EXCLUDED.format,spec_version=EXCLUDED.spec_version,sha256=EXCLUDED.sha256,content=EXCLUDED.content`,
    [assessmentId, evaluation.sbom.bomFormat, evaluation.sbom.specVersion, sbomChecksum(evaluation.sbom), serializeSbom(evaluation.sbom)]);
  }
  await client.query('DELETE FROM assessment_analyzers WHERE assessment_id=$1', [assessmentId]);
  for (const run of analyzers) {
    await client.query(`
      INSERT INTO assessment_analyzers(id,assessment_id,analyzer_id,dimension,state,items_analyzed,findings_count,error,detail,duration_ms)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    `, [randomUUID(), assessmentId, run.analyzerId, run.dimension, run.state, run.itemsAnalyzed, run.findingsCount, run.error, JSON.stringify(run.detail), run.durationMs]);
  }
}

async function runAwsAssessment(projectId: string, region: string) {
  await cloud.assertAssessmentConnection();
  const assessmentId = randomUUID();
  await db.query(`INSERT INTO security_assessments(id,project_id,assessment_type,status,region) VALUES($1,$2,'aws-account','running',$3)`, [assessmentId, projectId, region]);
  try {
    const snapshot = await cloud.security(region);
    const evaluation = evaluateAwsSecurity(snapshot);
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await insertFindings(client, projectId, assessmentId, 'aws-account', evaluation.findings);
      await completeAssessment(client, assessmentId, 'aws-account', evaluation);
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
    return assessmentId;
  } catch (error) {
    const message = cloud.awsError(error);
    await db.query(`UPDATE security_assessments SET status='failed',error_message=$2,completed_at=now() WHERE id=$1`, [assessmentId, message]);
    throw Object.assign(new Error(`No se pudo completar la evaluación AWS: ${message}`), { statusCode: 502 });
  }
}

async function runZipAssessment(projectId: string, artifactId: string, assessmentId: string, temporaryPath: string, sourceMode: 'zip' | 'repository' = 'zip') {
  try {
    await db.query("UPDATE security_assessments SET status='running' WHERE id=$1", [assessmentId]);
    await db.query("UPDATE project_artifacts SET status='running' WHERE id=$1", [artifactId]);
    const evaluation = await scanZipSecurity(temporaryPath, { imageScan: { enabled: config.trivyEnabled, executable: config.trivyExecutable, mode: config.trivyMode },
      sastScan: { enabled: config.sastEnabled, executable: config.sastExecutable, mode: config.sastMode } });
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await insertFindings(client, projectId, assessmentId, 'code', evaluation.findings);
      await completeAssessment(client, assessmentId, 'code', evaluation);
      await client.query(`
        UPDATE project_artifacts SET status='completed',entry_count=$2,uncompressed_bytes=$3,metadata=metadata || $4,scanned_at=now()
        WHERE id=$1
      `, [artifactId, evaluation.summary.entryCount, evaluation.summary.uncompressedBytes, JSON.stringify({
        filesAnalyzed: evaluation.summary.filesAnalyzed,
        dependencyCount: evaluation.summary.dependencyCount,
        extensions: evaluation.summary.extensions,
        retained: false,
      })]);
      await client.query("UPDATE projects SET source_mode=$2,updated_at=now() WHERE id=$1", [projectId, sourceMode]);
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

async function runFullAssessment(projectId: string, artifactId: string, assessmentId: string, temporaryPath: string, region: string) {
  try {
    await cloud.assertAssessmentConnection();
    await db.query("UPDATE security_assessments SET status='running' WHERE id=$1", [assessmentId]);
    await db.query("UPDATE project_artifacts SET status='running' WHERE id=$1", [artifactId]);
    const [snapshot, codeEvaluation] = await Promise.all([
      cloud.security(region),
      scanZipSecurity(temporaryPath, { imageScan: { enabled: config.trivyEnabled, executable: config.trivyExecutable, mode: config.trivyMode },
        sastScan: { enabled: config.sastEnabled, executable: config.sastExecutable, mode: config.sastMode } }),
    ]);
    const awsEvaluation = evaluateAwsSecurity(snapshot);
    const evaluation = mergeAssessments(awsEvaluation, codeEvaluation);
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await insertFindings(client, projectId, assessmentId, 'full', evaluation.findings);
      await completeAssessment(client, assessmentId, 'full', evaluation);
      await client.query(`
        UPDATE project_artifacts SET status='completed',entry_count=$2,uncompressed_bytes=$3,metadata=metadata || $4,scanned_at=now()
        WHERE id=$1
      `, [artifactId, codeEvaluation.summary.entryCount, codeEvaluation.summary.uncompressedBytes, JSON.stringify({
        filesAnalyzed: codeEvaluation.summary.filesAnalyzed,
        dependencyCount: codeEvaluation.summary.dependencyCount,
        extensions: codeEvaluation.summary.extensions,
        retained: false,
      })]);
      await client.query("UPDATE projects SET source_mode='full',updated_at=now() WHERE id=$1", [projectId]);
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
    app.log.error({ assessmentId, artifactId, error: message }, 'Full security assessment failed');
  } finally {
    await unlink(temporaryPath).catch(() => undefined);
  }
}

async function runRepositoryAssessment(projectId: string, artifactId: string, assessmentId: string, source: { provider: string; owner: string; name: string; ref: string | null }, temporaryPath: string, assessmentType: 'code' | 'full' = 'code', region = 'us-east-1') {
  try {
    const result = await downloadRepositoryArchive(source, config.repositoryToken, temporaryPath);
    await db.query(`UPDATE project_artifacts SET sha256=$2, size_bytes=$3, metadata=metadata || $4 WHERE id=$1`,
      [artifactId, result.sha256, result.bytes, JSON.stringify({ provider: source.provider, owner: source.owner, name: source.name, ref: result.resolvedRef, commit: result.commit, retained: false })]);
    if (assessmentType === 'full') await runFullAssessment(projectId, artifactId, assessmentId, temporaryPath, region);
    else await runZipAssessment(projectId, artifactId, assessmentId, temporaryPath, 'repository');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await Promise.all([
      db.query("UPDATE security_assessments SET status='failed',error_message=$2,completed_at=now() WHERE id=$1", [assessmentId, message]),
      db.query("UPDATE project_artifacts SET status='failed',metadata=metadata || jsonb_build_object('error',$2,'retained',false),scanned_at=now() WHERE id=$1", [artifactId, message]),
    ]);
    app.log.error({ assessmentId, artifactId, error: message }, 'Repository security assessment failed');
    await unlink(temporaryPath).catch(() => undefined);
  }
}

async function recoverZipAssessments() {
  const pending = await db.query<{ id: string; project_id: string; artifact_id: string; assessment_type: string; region: string }>(`
    SELECT id,project_id,artifact_id,assessment_type,region FROM security_assessments
    WHERE assessment_type IN ('code','full') AND status IN ('pending','running') AND artifact_id IS NOT NULL
  `);
  const uploadDirectory = join(tmpdir(), 'cloudops-security-scans');
  for (const assessment of pending.rows) {
    const temporaryPath = join(uploadDirectory, `${assessment.artifact_id}.zip`);
    try {
      await access(temporaryPath);
      setImmediate(() => {
        if (assessment.assessment_type === 'full') void runFullAssessment(assessment.project_id, assessment.artifact_id, assessment.id, temporaryPath, assessment.region);
        else void runZipAssessment(assessment.project_id, assessment.artifact_id, assessment.id, temporaryPath);
      });
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
      p.repo_provider AS "repoProvider", p.repo_owner AS "repoOwner", p.repo_name AS "repoName", p.repo_default_branch AS "repoDefaultBranch",
      p.created_at AS "createdAt", p.updated_at AS "updatedAt",
      latest.id AS "latestAssessmentId", latest.score AS "latestScore",
      latest.coverage AS "latestCoverage", latest.status AS "latestAssessmentStatus",
      latest.completed_at AS "latestAssessmentAt",
      (SELECT count(*)::int FROM security_assessments sa WHERE sa.project_id=p.id) AS "assessmentCount",
      (SELECT count(*)::int FROM security_findings sf JOIN security_assessments sa ON sa.id=sf.assessment_id
        WHERE sa.project_id=p.id AND sf.severity IN ('CRITICAL','HIGH') AND sf.status IN ('open','in_progress')) AS "criticalHighFindings"
    FROM projects p
    LEFT JOIN LATERAL (
      SELECT id, score, coverage, status, completed_at
      FROM security_assessments WHERE project_id=p.id ORDER BY started_at DESC LIMIT 1
    ) latest ON true
    ORDER BY p.updated_at DESC
  `);
  return { data: result.rows };
});

app.post<{ Body: { name: string; clientName?: string; description?: string; applicationType: string; environment: string; region: string; technologyStack?: string[]; sourceMode?: string; repoProvider?: string; repoOwner?: string; repoName?: string; repoDefaultBranch?: string } }>('/api/v1/projects', {
  schema: { body: { type: 'object', required: ['name', 'applicationType', 'environment', 'region'], additionalProperties: false, properties: {
    name: { type: 'string', minLength: 3, maxLength: 120 }, clientName: { type: 'string', maxLength: 120 },
    description: { type: 'string', maxLength: 2000 }, applicationType: { enum: ['Web', 'Móvil', 'API', 'Analítica', 'Interna'] },
    environment: { enum: ['Producción', 'Staging', 'Sandbox'] }, region: { type: 'string', pattern: '^[a-z]{2}(?:-gov)?-[a-z]+-\\d$' },
    technologyStack: { type: 'array', maxItems: 30, items: { type: 'string', minLength: 1, maxLength: 60 } },
    sourceMode: { enum: ['none', 'zip', 'repository', 'aws'] },
    repoProvider: { enum: ['github', 'gitlab'] }, repoOwner: { type: 'string', maxLength: 100 },
    repoName: { type: 'string', maxLength: 120 }, repoDefaultBranch: { type: 'string', maxLength: 120 },
  } } },
}, async ({ body }, reply) => {
  const id = randomUUID();
  const result = await db.query(`
    INSERT INTO projects(id,name,client_name,description,application_type,environment,region,technology_stack,source_mode,repo_provider,repo_owner,repo_name,repo_default_branch)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
    RETURNING id,name,client_name AS "clientName",description,application_type AS "applicationType",
      environment,region,status,technology_stack AS "technologyStack",source_mode AS "sourceMode",
      repo_provider AS "repoProvider",repo_owner AS "repoOwner",repo_name AS "repoName",repo_default_branch AS "repoDefaultBranch",
      created_at AS "createdAt",updated_at AS "updatedAt"
  `, [id, body.name.trim(), body.clientName?.trim() || null, body.description?.trim() ?? '', body.applicationType,
    body.environment, body.region, JSON.stringify(body.technologyStack ?? []), body.sourceMode ?? 'none',
    body.repoProvider ?? null, body.repoOwner ?? null, body.repoName ?? null, body.repoDefaultBranch ?? 'main']);
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
      p.repo_provider AS "repoProvider", p.repo_owner AS "repoOwner", p.repo_name AS "repoName", p.repo_default_branch AS "repoDefaultBranch",
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

app.get<{ Params: { id: string; assessmentId: string } }>('/api/v1/projects/:id/security/assessments/:assessmentId/comparison', async ({ params }, reply) => {
  if (!uuidPattern.test(params.id) || !uuidPattern.test(params.assessmentId)) return reply.code(400).send({ message: 'ID inválido' });
  const comparison = await loadComparison(params.id, params.assessmentId);
  if (!comparison) return reply.code(404).send({ message: 'Evaluación no encontrada o todavía no completada' });
  return { data: comparison };
});

registerSbomRoute(app, db, uuidPattern);

app.get('/api/v1/security/rules', async () => ({ data: { builtin: BUILTIN_RULE_CATALOG, sast: await getSastCatalog() } }));

app.get<{ Params: { id: string; findingId: string } }>('/api/v1/projects/:id/security/findings/:findingId/events', async ({ params }, reply) => {
  if (!uuidPattern.test(params.id) || !uuidPattern.test(params.findingId)) return reply.code(400).send({ message: 'ID inválido' });
  const exists = await db.query(`
    SELECT 1 FROM security_findings sf JOIN security_assessments sa ON sa.id=sf.assessment_id
    WHERE sf.id=$1 AND sa.project_id=$2
  `, [params.findingId, params.id]);
  if (!exists.rowCount) return reply.code(404).send({ message: 'Hallazgo no encontrado' });
  const events = await db.query(`
    SELECT id, event_type AS "eventType", from_status AS "fromStatus", to_status AS "toStatus",
      actor, comment, justification, metadata, created_at AS "createdAt"
    FROM security_finding_events WHERE finding_id=$1 ORDER BY created_at DESC
  `, [params.findingId]);
  return { data: events.rows };
});

app.patch<{ Params: { id: string; findingId: string }; Body: { status?: string; owner?: string; dueDate?: string; justification?: string; comment?: string; approvedBy?: string; actor?: string } }>('/api/v1/projects/:id/security/findings/:findingId', {
  schema: { body: { type: 'object', additionalProperties: false, properties: {
    status: { enum: ['open', 'in_progress', 'resolved', 'false_positive', 'risk_accepted'] },
    owner: { type: 'string', maxLength: 160 }, dueDate: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
    justification: { type: 'string', maxLength: 4000 }, comment: { type: 'string', maxLength: 4000 },
    approvedBy: { type: 'string', maxLength: 160 }, actor: { type: 'string', maxLength: 160 },
  } } },
}, async ({ params, body }, reply) => {
  if (!uuidPattern.test(params.id) || !uuidPattern.test(params.findingId)) return reply.code(400).send({ message: 'ID inválido' });
  const current = await db.query(`
    SELECT sf.id, sf.status, sf.owner, sf.due_date AS "dueDate", sf.justification, sf.approved_by AS "approvedBy"
    FROM security_findings sf JOIN security_assessments sa ON sa.id=sf.assessment_id
    WHERE sf.id=$1 AND sa.project_id=$2
  `, [params.findingId, params.id]);
  if (!current.rowCount) return reply.code(404).send({ message: 'Hallazgo no encontrado' });
  const row = current.rows[0];
  const status = body.status ?? row.status;
  const owner = body.owner !== undefined ? (body.owner.trim() || null) : row.owner;
  const dueDate = body.dueDate !== undefined ? body.dueDate : row.dueDate;
  const justification = body.justification !== undefined ? (body.justification.trim() || null) : row.justification;
  const approvedBy = body.approvedBy !== undefined ? (body.approvedBy.trim() || null) : row.approvedBy;
  await db.query(`
    UPDATE security_findings SET status=$2, owner=$3, due_date=$4, justification=$5, approved_by=$6, updated_at=now() WHERE id=$1
  `, [params.findingId, status, owner ?? null, dueDate ?? null, justification ?? null, approvedBy ?? null]);
  let eventType = 'updated';
  if (status !== row.status) {
    eventType = status === 'false_positive' ? 'false_positive'
      : status === 'risk_accepted' ? 'risk_accepted'
      : status === 'resolved' ? 'resolved'
      : row.status === 'resolved' && status === 'open' ? 'reopened'
      : 'status_changed';
  } else if (body.comment) eventType = 'commented';
  else if (body.owner !== undefined && body.owner !== row.owner) eventType = 'assigned';
  await db.query(`
    INSERT INTO security_finding_events(id,finding_id,event_type,from_status,to_status,actor,comment,justification)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8)
  `, [randomUUID(), params.findingId, eventType, row.status, status, body.actor ?? null, body.comment ?? null, justification ?? null]);
  const updated = await db.query(`
    SELECT id, assessment_id AS "assessmentId", external_id AS "externalId", source, category,
      title, description, severity, status, resource, recommendation, evidence, fingerprint, framework,
      owner, due_date AS "dueDate", justification, approved_by AS "approvedBy",
      created_at AS "createdAt", updated_at AS "updatedAt"
    FROM security_findings WHERE id=$1
  `, [params.findingId]);
  return { data: updated.rows[0] };
});

const CADENCES = ['daily', 'weekly', 'monthly'] as const;
const NOTIFY_FLAGS = ['new_finding', 'severity_increase', 'coverage_drop', 'failure'] as const;

app.get<{ Params: { id: string } }>('/api/v1/projects/:id/security/schedules', async ({ params }, reply) => {
  if (!uuidPattern.test(params.id)) return reply.code(400).send({ message: 'ID de proyecto inválido' });
  const result = await db.query(`
    SELECT s.id, s.project_id AS "projectId", s.assessment_type AS "assessmentType", s.cadence, s.timezone,
      s.next_run_at AS "nextRunAt", s.last_run_at AS "lastRunAt", s.enabled, s.notify_on AS "notifyOn",
      s.notify_email AS "notifyEmail", s.created_at AS "createdAt", s.updated_at AS "updatedAt",
      (SELECT json_agg(json_build_object('id', r.id, 'status', r.status, 'attempt', r.attempt,
        'assessmentId', r.assessment_id, 'errorMessage', r.error_message,
        'startedAt', r.started_at, 'completedAt', r.completed_at) ORDER BY r.started_at DESC)
       FROM (SELECT * FROM assessment_runs WHERE schedule_id=s.id ORDER BY started_at DESC LIMIT 10) r) AS "runs"
    FROM assessment_schedules s WHERE s.project_id=$1 ORDER BY s.created_at DESC
  `, [params.id]);
  return { data: result.rows };
});

app.post<{ Params: { id: string }; Body: { assessmentType?: string; cadence: string; timezone?: string; notifyOn?: string[]; notifyEmail?: string } }>('/api/v1/projects/:id/security/schedules', {
  schema: { body: { type: 'object', required: ['cadence'], additionalProperties: false, properties: {
    assessmentType: { enum: ['aws-account'] }, cadence: { enum: CADENCES as unknown as string[] },
    timezone: { type: 'string', maxLength: 60 }, notifyOn: { type: 'array', items: { enum: NOTIFY_FLAGS as unknown as string[] } },
    notifyEmail: { type: 'string', maxLength: 160 },
  } } },
}, async ({ params, body }, reply) => {
  if (!uuidPattern.test(params.id)) return reply.code(400).send({ message: 'ID de proyecto inválido' });
  const project = await db.query('SELECT id FROM projects WHERE id=$1', [params.id]);
  if (!project.rowCount) return reply.code(404).send({ message: 'Proyecto no encontrado' });
  const id = randomUUID();
  const result = await db.query(`
    INSERT INTO assessment_schedules(id,project_id,assessment_type,cadence,timezone,next_run_at,notify_on,notify_email)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8)
    RETURNING id, project_id AS "projectId", assessment_type AS "assessmentType", cadence, timezone,
      next_run_at AS "nextRunAt", last_run_at AS "lastRunAt", enabled, notify_on AS "notifyOn", notify_email AS "notifyEmail"
  `, [id, params.id, body.assessmentType ?? 'aws-account', body.cadence, body.timezone ?? 'America/Lima',
    computeNextRun(new Date(), body.cadence, body.timezone ?? 'America/Lima'), body.notifyOn ?? [...NOTIFY_FLAGS], body.notifyEmail ?? null]);
  reply.code(201);
  return { data: result.rows[0] };
});

app.patch<{ Params: { id: string; scheduleId: string }; Body: { cadence?: string; timezone?: string; enabled?: boolean; notifyOn?: string[]; notifyEmail?: string } }>('/api/v1/projects/:id/security/schedules/:scheduleId', {
  schema: { body: { type: 'object', additionalProperties: false, properties: {
    cadence: { enum: CADENCES as unknown as string[] }, timezone: { type: 'string', maxLength: 60 }, enabled: { type: 'boolean' },
    notifyOn: { type: 'array', items: { enum: NOTIFY_FLAGS as unknown as string[] } }, notifyEmail: { type: 'string', maxLength: 160 },
  } } },
}, async ({ params, body }, reply) => {
  if (!uuidPattern.test(params.id) || !uuidPattern.test(params.scheduleId)) return reply.code(400).send({ message: 'ID inválido' });
  const current = await db.query('SELECT * FROM assessment_schedules WHERE id=$1 AND project_id=$2', [params.scheduleId, params.id]);
  if (!current.rowCount) return reply.code(404).send({ message: 'Programación no encontrada' });
  const row = current.rows[0];
  const cadence = body.cadence ?? row.cadence;
  const timezone = body.timezone ?? row.timezone;
  const nextRunAt = body.cadence || body.timezone ? computeNextRun(new Date(), cadence, timezone) : row.next_run_at;
  const result = await db.query(`
    UPDATE assessment_schedules SET cadence=$3, timezone=$4, enabled=$5, notify_on=$6, notify_email=$7, next_run_at=$8, updated_at=now()
    WHERE id=$1 AND project_id=$2
    RETURNING id, project_id AS "projectId", assessment_type AS "assessmentType", cadence, timezone,
      next_run_at AS "nextRunAt", last_run_at AS "lastRunAt", enabled, notify_on AS "notifyOn", notify_email AS "notifyEmail"
  `, [params.scheduleId, params.id, cadence, timezone, body.enabled ?? row.enabled,
    body.notifyOn ?? row.notify_on, body.notifyEmail !== undefined ? body.notifyEmail : row.notify_email, nextRunAt]);
  return { data: result.rows[0] };
});

app.delete<{ Params: { id: string; scheduleId: string } }>('/api/v1/projects/:id/security/schedules/:scheduleId', async ({ params }, reply) => {
  if (!uuidPattern.test(params.id) || !uuidPattern.test(params.scheduleId)) return reply.code(400).send({ message: 'ID inválido' });
  const result = await db.query('DELETE FROM assessment_schedules WHERE id=$1 AND project_id=$2', [params.scheduleId, params.id]);
  return reply.code(result.rowCount ? 204 : 404).send();
});

app.post<{ Params: { id: string; scheduleId: string } }>('/api/v1/projects/:id/security/schedules/:scheduleId/run', async ({ params }, reply) => {
  if (!uuidPattern.test(params.id) || !uuidPattern.test(params.scheduleId)) return reply.code(400).send({ message: 'ID inválido' });
  const schedule = await db.query('SELECT * FROM assessment_schedules WHERE id=$1 AND project_id=$2', [params.scheduleId, params.id]);
  if (!schedule.rowCount) return reply.code(404).send({ message: 'Programación no encontrada' });
  const project = await db.query<{ region: string }>('SELECT region FROM projects WHERE id=$1', [params.id]);
  if (!project.rowCount) return reply.code(404).send({ message: 'Proyecto no encontrado' });
  const runId = randomUUID();
  await db.query(`INSERT INTO assessment_runs(id,schedule_id,status,attempt) VALUES($1,$2,'running',1)`, [runId, params.scheduleId]);
  try {
    const assessmentId = await runAwsAssessment(params.id, project.rows[0]!.region);
    await db.query(`UPDATE assessment_runs SET status='completed',assessment_id=$2,completed_at=now() WHERE id=$1`, [runId, assessmentId]);
    await db.query('UPDATE assessment_schedules SET last_run_at=now(),updated_at=now() WHERE id=$1', [params.scheduleId]);
    const assessment = await loadSecurityAssessment(params.id, assessmentId);
    reply.code(201);
    return { data: { runId, assessment } };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.query(`UPDATE assessment_runs SET status='failed',error_message=$2,completed_at=now() WHERE id=$1`, [runId, message]);
    throw error;
  }
});

app.get<{ Params: { id: string } }>('/api/v1/projects/:id/security/runs', async ({ params }, reply) => {
  if (!uuidPattern.test(params.id)) return reply.code(400).send({ message: 'ID de proyecto inválido' });
  const result = await db.query(`
    SELECT r.id, r.schedule_id AS "scheduleId", r.assessment_id AS "assessmentId", r.status, r.attempt,
      r.error_message AS "errorMessage", r.started_at AS "startedAt", r.completed_at AS "completedAt"
    FROM assessment_runs r JOIN assessment_schedules s ON s.id=r.schedule_id
    WHERE s.project_id=$1 ORDER BY r.started_at DESC LIMIT 50
  `, [params.id]);
  return { data: result.rows };
});

app.post<{ Params: { id: string } }>('/api/v1/projects/:id/security/assessments/aws', async ({ params }, reply) => {
  if (!uuidPattern.test(params.id)) return reply.code(400).send({ message: 'ID de proyecto inválido' });
  const project = await db.query<{ region: string }>('SELECT region FROM projects WHERE id=$1', [params.id]);
  if (!project.rowCount) return reply.code(404).send({ message: 'Proyecto no encontrado' });
  const assessmentId = await runAwsAssessment(params.id, project.rows[0]!.region);
  const assessment = await loadSecurityAssessment(params.id, assessmentId);
  reply.code(201);
  return { data: assessment };
});

async function startArchiveAssessment(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply, assessmentType: 'code' | 'full') {
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
        VALUES($1,$2,$3,'pending',$4,$5)
      `, [assessmentId, id, assessmentType, project.rows[0]!.region, artifactId]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    const region = project.rows[0]!.region;
    setImmediate(() => {
      if (assessmentType === 'full') void runFullAssessment(id, artifactId, assessmentId, temporaryPath, region);
      else void runZipAssessment(id, artifactId, assessmentId, temporaryPath);
    });
    return reply.code(202).send({ data: { assessmentId, artifactId, status: 'pending', sha256, sizeBytes, originalName } });
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}

app.post<{ Params: { id: string } }>('/api/v1/projects/:id/security/assessments/code', (request, reply) => startArchiveAssessment(request, reply, 'code'));

app.post<{ Params: { id: string } }>('/api/v1/projects/:id/security/assessments/full', (request, reply) => startArchiveAssessment(request, reply, 'full'));

app.post<{ Params: { id: string }; Body: { provider: string; owner: string; name: string; defaultBranch?: string; tokenRef?: string } }>('/api/v1/projects/:id/repository', {
  schema: { body: { type: 'object', required: ['provider', 'owner', 'name'], additionalProperties: false, properties: {
    provider: { enum: ['github', 'gitlab'] }, owner: { type: 'string', minLength: 1, maxLength: 100 },
    name: { type: 'string', minLength: 1, maxLength: 120 }, defaultBranch: { type: 'string', maxLength: 120 }, tokenRef: { type: 'string', maxLength: 160 },
  } } },
}, async ({ params, body }, reply) => {
  if (!uuidPattern.test(params.id)) return reply.code(400).send({ message: 'ID de proyecto inválido' });
  const result = await db.query(`
    UPDATE projects SET repo_provider=$2, repo_owner=$3, repo_name=$4, repo_default_branch=$5, repo_token_ref=$6, updated_at=now()
    WHERE id=$1
    RETURNING id, repo_provider AS "repoProvider", repo_owner AS "repoOwner", repo_name AS "repoName",
      repo_default_branch AS "repoDefaultBranch", repo_token_ref AS "repoTokenRef"
  `, [params.id, body.provider, body.owner, body.name, body.defaultBranch ?? 'main', body.tokenRef ?? null]);
  if (!result.rowCount) return reply.code(404).send({ message: 'Proyecto no encontrado' });
  return { data: result.rows[0] };
});

app.post<{ Body: { provider: string; owner: string; name: string; ref?: string } }>('/api/v1/repositories/verify', {
  schema: { body: { type: 'object', required: ['provider', 'owner', 'name'], additionalProperties: false, properties: {
    provider: { enum: ['github', 'gitlab'] }, owner: { type: 'string', minLength: 1, maxLength: 100 },
    name: { type: 'string', minLength: 1, maxLength: 120 }, ref: { type: 'string', maxLength: 120 },
  } } },
}, async ({ body }, reply) => {
  try {
    const verified = await verifyRepository(body, config.repositoryToken);
    return { data: verified };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return reply.code(400).send({ message });
  }
});

app.post<{ Params: { id: string }; Body: { ref?: string; scope?: 'code' | 'full' } }>('/api/v1/projects/:id/security/assessments/repository', {
  schema: { body: { type: 'object', additionalProperties: false, properties: {
    ref: { type: 'string', maxLength: 120 }, scope: { enum: ['code', 'full'] },
  } } },
}, async ({ params, body }, reply) => {
  if (!uuidPattern.test(params.id)) return reply.code(400).send({ message: 'ID de proyecto inválido' });
  const project = await db.query<{ repoProvider: string | null; repoOwner: string | null; repoName: string | null; repoDefaultBranch: string | null; region: string }>(`
    SELECT repo_provider AS "repoProvider", repo_owner AS "repoOwner", repo_name AS "repoName", repo_default_branch AS "repoDefaultBranch"
      , region
    FROM projects WHERE id=$1
  `, [params.id]);
  if (!project.rowCount) return reply.code(404).send({ message: 'Proyecto no encontrado' });
  const source = project.rows[0]!;
  if (!source.repoProvider || !source.repoOwner || !source.repoName) {
    return reply.code(400).send({ message: 'El proyecto no tiene un repositorio Git conectado.' });
  }
  if (source.repoProvider !== 'github' && source.repoProvider !== 'gitlab') return reply.code(400).send({ message: 'Proveedor de repositorio no admitido.' });
  const assessmentType = body.scope === 'full' ? 'full' : 'code';
  const active = await db.query<{ id: string; status: string }>(`
    SELECT id,status FROM security_assessments
    WHERE project_id=$1 AND assessment_type=$2 AND status IN ('pending','running')
    ORDER BY started_at DESC LIMIT 1
  `, [params.id, assessmentType]);
  if (active.rowCount) return reply.code(202).send({ data: { assessmentId: active.rows[0]!.id, status: active.rows[0]!.status, reused: true } });
  const ref = body.ref?.trim() || source.repoDefaultBranch || 'main';
  const uploadDirectory = join(tmpdir(), 'cloudops-security-scans');
  await mkdir(uploadDirectory, { recursive: true });
  const artifactId = randomUUID();
  const assessmentId = randomUUID();
  const temporaryPath = join(uploadDirectory, `${artifactId}.zip`);
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      INSERT INTO project_artifacts(id,project_id,original_name,sha256,size_bytes,status,metadata)
      VALUES($1,$2,$3,'',0,'pending',$4)
    `, [artifactId, params.id, `${source.repoOwner}/${source.repoName}@${ref}`, JSON.stringify({ provider: source.repoProvider, owner: source.repoOwner, name: source.repoName, ref, retained: false })]);
    await client.query(`
      INSERT INTO security_assessments(id,project_id,assessment_type,status,region,artifact_id)
      SELECT $1,$2,$4,'pending',region,$3 FROM projects WHERE id=$2
    `, [assessmentId, params.id, artifactId, assessmentType]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    client.release();
    throw error;
  }
  client.release();
  setImmediate(() => { void runRepositoryAssessment(params.id, artifactId, assessmentId, { provider: source.repoProvider!, owner: source.repoOwner!, name: source.repoName!, ref }, temporaryPath, assessmentType, source.region); });
  return reply.code(202).send({ data: { assessmentId, artifactId, assessmentType, status: 'pending', provider: source.repoProvider, ref } });
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
  startScheduler(db, app.log, runAwsAssessment);
  await app.listen({ host: '127.0.0.1', port: config.port });
}

main().catch((error) => { app.log.error(error); process.exitCode = 1; });
