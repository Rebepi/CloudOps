import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import { db } from '../src/db.js';
import { buildSbom, sbomChecksum, serializeSbom } from '../src/security/supplyChain.js';
import { registerSbomRoute } from '../src/security/sbomRoute.js';

// PostgreSQL + HTTP injection check. All fixtures are isolated and rolled back.
const client = await db.connect();
const app = Fastify();
const project = randomUUID();
const assessment = randomUUID();
let verification: Record<string, unknown> | undefined;
try {
  await client.query('BEGIN');
  await client.query('INSERT INTO projects(id,name,application_type) VALUES($1,$2,$3)', [project, 'SBOM transactional verification', 'API']);
  await client.query('INSERT INTO security_assessments(id,project_id,assessment_type,status,region) VALUES($1,$2,$3,$4,$5)',
    [assessment, project, 'code', 'completed', 'us-east-1']);
  const bom = buildSbom([{ ecosystem: 'npm', name: 'example', version: '1.0.0', manifest: 'package-lock.json', licenses: ['MIT'] }], [], [], [], true);
  const hash = sbomChecksum(bom);
  await client.query('INSERT INTO assessment_sboms(assessment_id,format,spec_version,sha256,content) VALUES($1,$2,$3,$4,$5)',
    [assessment, bom.bomFormat, bom.specVersion, hash, serializeSbom(bom)]);
  registerSbomRoute(app, client, /^[0-9a-f-]{36}$/i);
  const path = `/api/v1/projects/${project}/security/assessments/${assessment}/sbom`;
  const response = await app.inject({ method: 'GET', url: path });
  assert.equal(response.statusCode, 200);
  assert.equal(response.body, serializeSbom(bom));
  assert.equal(response.headers.etag, JSON.stringify(hash));
  const wrong = await app.inject({ method: 'GET', url: path.replace(project, randomUUID()) });
  assert.equal(wrong.statusCode, 404);
  verification = { artifactDownload: response.statusCode, wrongProject: wrong.statusCode, checksumMatches: true };
} finally {
  try { await app.close(); }
  finally {
    try { await client.query('ROLLBACK'); }
    finally { client.release(); await db.end(); }
  }
}
console.log(JSON.stringify({ ...verification, rolledBack: true }));
