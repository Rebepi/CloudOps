import 'dotenv/config';
import { db } from '../src/db.js';
import { config } from '../src/config.js';
import { createToken } from '../src/auth.js';

const projectId = process.argv[2];
if (!projectId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(projectId)) {
  throw new Error('Uso: npm run security:baseline -- <project-id> (API local iniciada)');
}
try {
  const user = (await db.query("SELECT id,email,rol FROM users WHERE is_active=true AND rol='super_admin' ORDER BY created_at LIMIT 1")).rows[0];
  if (!user) throw new Error('Se necesita un administrador local activo.');
  // The API owns persistence, versions, dimensions, timing and lifecycle inheritance.
  const response = await fetch(`http://127.0.0.1:${config.port}/api/v1/projects/${projectId}/security/assessments/aws`, {
    method: 'POST', headers: { authorization: `Bearer ${createToken(user)}` }, signal: AbortSignal.timeout(300_000),
  });
  const result = await response.json() as { message?: string; data?: Record<string, any> };
  if (!response.ok || !result.data) throw new Error(result.message ?? `API HTTP ${response.status}`);
  const assessment = result.data;
  console.log(JSON.stringify({ id: assessment.id, projectId, status: assessment.status, region: assessment.region, score: assessment.score,
    coverage: assessment.coverage, engineVersion: assessment.engineVersion, methodologyVersion: assessment.methodologyVersion,
    dimensions: assessment.dimensionScores?.length, analyzers: assessment.analyzers?.length, counts: assessment.summary?.counts }, null, 2));
} finally { await db.end(); }
