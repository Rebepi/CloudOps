import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import type { FastifyBaseLogger } from 'fastify';
import { config } from './config.js';

type ScheduleRow = {
  id: string;
  projectId: string;
  assessmentType: string;
  cadence: string;
  timezone: string;
  notifyOn: string[];
  notifyEmail: string | null;
};

const MAX_ATTEMPTS = 3;
const RUN_HOUR = 3;

function zonedParts(date: Date, timezone: string) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const parts = formatter.formatToParts(date);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? '0');
  return { year: value('year'), month: value('month'), day: value('day') };
}

function timeZoneOffset(date: Date, timezone: string) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const parts = formatter.formatToParts(date);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? '0');
  const asUtc = Date.UTC(value('year'), value('month') - 1, value('day'), value('hour'), value('minute'), value('second'));
  return asUtc - date.getTime();
}

function zonedTimeToUtc(year: number, month: number, day: number, hour: number, timezone: string) {
  const guess = Date.UTC(year, month - 1, day, hour, 0, 0);
  const offset = timeZoneOffset(new Date(guess), timezone);
  return new Date(guess - offset);
}

export function computeNextRun(from: Date, cadence: string, timezone = 'America/Lima') {
  let zone = timezone;
  try { new Intl.DateTimeFormat('en-CA', { timeZone: zone }); } catch { zone = 'America/Lima'; }
  const { year, month, day } = zonedParts(from, zone);
  const base = new Date(Date.UTC(year, month - 1, day));
  if (cadence === 'daily') base.setUTCDate(base.getUTCDate() + 1);
  else if (cadence === 'monthly') base.setUTCMonth(base.getUTCMonth() + 1);
  else base.setUTCDate(base.getUTCDate() + 7);
  return zonedTimeToUtc(base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate(), RUN_HOUR, zone);
}

async function notify(log: FastifyBaseLogger, schedule: ScheduleRow, title: string, detail: Record<string, unknown>) {
  log.warn({ scheduleId: schedule.id, projectId: schedule.projectId, notifyEmail: schedule.notifyEmail, ...detail }, title);
  const webhook = config.securityAlertWebhook;
  if (!webhook) return;
  try {
    await fetch(webhook, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title, scheduleId: schedule.id, projectId: schedule.projectId, email: schedule.notifyEmail, observedAt: new Date().toISOString(), ...detail }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    log.error({ error: error instanceof Error ? error.message : String(error), scheduleId: schedule.id }, 'No se pudo enviar la alerta de seguridad');
  }
}

async function alertForAssessment(db: pg.Pool, log: FastifyBaseLogger, schedule: ScheduleRow, assessmentId: string) {
  const current = await db.query<{ score: number | null; coverage: number; assessmentType: string }>(
    'SELECT score, coverage, assessment_type AS "assessmentType" FROM security_assessments WHERE id=$1', [assessmentId]);
  const assessment = current.rows[0];
  if (!assessment) return;
  const previous = await db.query<{ id: string; score: number | null; coverage: number }>(
    `SELECT id, score, coverage FROM security_assessments
     WHERE project_id=$1 AND assessment_type=$2 AND status='completed' AND id<>$3
     ORDER BY started_at DESC LIMIT 1`, [schedule.projectId, assessment.assessmentType, assessmentId]);
  const previousRow = previous.rows[0];
  if (!previousRow) {
    await notify(log, schedule, 'Nueva línea base de seguridad registrada', { assessmentId, score: assessment.score, coverage: assessment.coverage });
    return;
  }
  const diff = await db.query<{ newCount: number; severityIncrease: number }>(`
    SELECT
      count(*) FILTER (WHERE prev.id IS NULL)::int AS "newCount",
      count(*) FILTER (WHERE prev.id IS NOT NULL AND
        CASE cur.severity WHEN 'CRITICAL' THEN 4 WHEN 'HIGH' THEN 3 WHEN 'MEDIUM' THEN 2 WHEN 'LOW' THEN 1 ELSE 0 END >
        CASE prev.severity WHEN 'CRITICAL' THEN 4 WHEN 'HIGH' THEN 3 WHEN 'MEDIUM' THEN 2 WHEN 'LOW' THEN 1 ELSE 0 END)::int AS "severityIncrease"
    FROM security_findings cur
    LEFT JOIN security_findings prev ON prev.fingerprint = cur.fingerprint AND prev.assessment_id = $1
    WHERE cur.assessment_id = $2
  `, [previousRow.id, assessmentId]);
  const row = diff.rows[0] ?? { newCount: 0, severityIncrease: 0 };
  const coverageDrop = assessment.coverage < previousRow.coverage;
  const wants = (flag: string) => schedule.notifyOn.includes(flag);
  if (wants('new_finding') && row.newCount > 0) {
    await notify(log, schedule, `${row.newCount} hallazgo(s) nuevo(s) en la evaluación programada`, { assessmentId, previousAssessmentId: previousRow.id, newCount: row.newCount });
  }
  if (wants('severity_increase') && row.severityIncrease > 0) {
    await notify(log, schedule, `${row.severityIncrease} hallazgo(s) aumentaron de severidad`, { assessmentId, severityIncrease: row.severityIncrease });
  }
  if (wants('coverage_drop') && coverageDrop) {
    await notify(log, schedule, `La cobertura bajó de ${previousRow.coverage}% a ${assessment.coverage}%`, { assessmentId, previousCoverage: previousRow.coverage, coverage: assessment.coverage });
  }
}

async function runSchedule(db: pg.Pool, log: FastifyBaseLogger, schedule: ScheduleRow, run: (projectId: string, region: string) => Promise<string>) {
  const project = await db.query<{ region: string }>('SELECT region FROM projects WHERE id=$1', [schedule.projectId]);
  if (!project.rowCount) {
    await db.query("UPDATE assessment_schedules SET enabled=false,updated_at=now() WHERE id=$1", [schedule.id]);
    return;
  }
  const region = project.rows[0]!.region;
  let lastError = 'Error desconocido';
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const runId = randomUUID();
    await db.query(`INSERT INTO assessment_runs(id,schedule_id,status,attempt) VALUES($1,$2,'running',$3)`, [runId, schedule.id, attempt]);
    try {
      const assessmentId = await run(schedule.projectId, region);
      await db.query(`UPDATE assessment_runs SET status='completed',assessment_id=$2,completed_at=now() WHERE id=$1`, [runId, assessmentId]);
      await db.query(`UPDATE assessment_schedules SET last_run_at=now(),updated_at=now() WHERE id=$1`, [schedule.id]);
      await alertForAssessment(db, log, schedule, assessmentId);
      return;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      await db.query(`UPDATE assessment_runs SET status='failed',error_message=$2,completed_at=now() WHERE id=$1`, [runId, lastError]);
      if (attempt < MAX_ATTEMPTS) await new Promise((resolve) => setTimeout(resolve, attempt * 2_000));
    }
  }
  await notify(log, schedule, 'La evaluación programada falló tras varios intentos', { error: lastError });
}

async function runDueSchedules(db: pg.Pool, log: FastifyBaseLogger, run: (projectId: string, region: string) => Promise<string>) {
  const due = await db.query<ScheduleRow>(`
    SELECT id, project_id AS "projectId", assessment_type AS "assessmentType", cadence, timezone,
      notify_on AS "notifyOn", notify_email AS "notifyEmail"
    FROM assessment_schedules WHERE enabled=true AND next_run_at <= now() ORDER BY next_run_at LIMIT 5
  `);
  for (const schedule of due.rows) {
    await db.query('UPDATE assessment_schedules SET next_run_at=$2,updated_at=now() WHERE id=$1',
      [schedule.id, computeNextRun(new Date(), schedule.cadence, schedule.timezone)]);
    await runSchedule(db, log, schedule, run);
  }
}

export function startScheduler(db: pg.Pool, log: FastifyBaseLogger, run: (projectId: string, region: string) => Promise<string>) {
  let stopped = false;
  const tick = async () => {
    if (stopped) return;
    try { await runDueSchedules(db, log, run); }
    catch (error) { log.error({ error: error instanceof Error ? error.message : String(error) }, 'Falló la revisión del planificador de evaluaciones'); }
  };
  const timer = setInterval(() => void tick(), 60_000);
  if (typeof timer.unref === 'function') timer.unref();
  void tick();
  return () => { stopped = true; clearInterval(timer); };
}
