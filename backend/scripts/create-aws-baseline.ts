import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { assertAssessmentConnection, awsError, security } from '../src/aws.js';
import { evaluateAwsSecurity } from '../src/securityAssessment.js';

const projectId = process.argv[2];
if (!projectId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(projectId)) {
  throw new Error('Uso: npm run security:baseline -- <project-id>');
}

const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const assessmentId = randomUUID();

try {
  const project = await db.query<{ name: string; region: string }>('SELECT name,region FROM projects WHERE id=$1', [projectId]);
  if (!project.rowCount) throw new Error('Proyecto no encontrado');
  await assertAssessmentConnection();
  const { name, region } = project.rows[0]!;
  await db.query("INSERT INTO security_assessments(id,project_id,assessment_type,status,region) VALUES($1,$2,'aws-account','running',$3)", [assessmentId, projectId, region]);
  try {
    const evaluation = evaluateAwsSecurity(await security(region));
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      for (const finding of evaluation.findings) {
        await client.query(
          'INSERT INTO security_findings(id,assessment_id,external_id,source,category,title,description,severity,status,resource,recommendation,evidence) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',
          [randomUUID(), assessmentId, finding.externalId, finding.source, finding.category, finding.title, finding.description,
            finding.severity, finding.status, finding.resource, finding.recommendation, JSON.stringify(finding.evidence)],
        );
      }
      await client.query("UPDATE security_assessments SET status='completed',score=$2,coverage=$3,confidence=$4,summary=$5,completed_at=now() WHERE id=$1", [assessmentId, evaluation.score, evaluation.coverage, evaluation.confidence, JSON.stringify(evaluation.summary)]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    console.log(JSON.stringify({ assessmentId, projectId, project: name, region, status: 'completed', ...evaluation.summary, score: evaluation.score, coverage: evaluation.coverage, confidence: evaluation.confidence, findingCount: evaluation.findings.length }, null, 2));
  } catch (error) {
    const message = awsError(error);
    await db.query("UPDATE security_assessments SET status='failed',error_message=$2,completed_at=now() WHERE id=$1", [assessmentId, message]);
    throw error;
  }
} finally {
  await db.end();
}
