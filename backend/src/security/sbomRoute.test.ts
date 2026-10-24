import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import type { Pool } from 'pg';
import { registerSbomRoute } from './sbomRoute.js';
import { buildSbom, sbomChecksum, serializeSbom } from './supplyChain.js';

const projectId = '11111111-1111-4111-8111-111111111111';
const assessmentId = '22222222-2222-4222-8222-222222222222';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const bom = buildSbom([], [], [], [], false);
const path = `/api/v1/projects/${projectId}/security/assessments/${assessmentId}/sbom`;

function application(t: TestContext) {
  const app = Fastify();
  t.after(() => app.close());
  app.addHook('preHandler', async (request, reply) => {
    if (request.headers.authorization !== 'Bearer test') return reply.code(401).send({ message: 'No autorizado' });
  });
  const db = { query: async (_sql: string, values: string[]) => ({ rows: values[0] === projectId && values[1] === assessmentId ? [{ content: bom, sha256: sbomChecksum(bom) }] : [] }) } as unknown as Pick<Pool, 'query'>;
  registerSbomRoute(app, db, uuid);
  return app;
}

test('descarga SBOM conserva autenticación heredada', async (t) => {
  assert.equal((await application(t).inject({ method: 'GET', url: path })).statusCode, 401);
});

test('descarga devuelve JSON canónico, nombre seguro y checksum consistente', async (t) => {
  const response = await application(t).inject({ method: 'GET', url: path, headers: { authorization: 'Bearer test' } });
  assert.equal(response.statusCode, 200);
  assert.equal(response.body, serializeSbom(bom));
  assert.equal(response.headers.etag, `"${sbomChecksum(bom)}"`);
  assert.match(String(response.headers['content-type']), /application\/vnd\.cyclonedx\+json/);
  assert.match(String(response.headers['content-disposition']), new RegExp(`${assessmentId}\.cdx\.json`));
});

test('otra identidad de proyecto y evaluaciones sin SBOM no exponen el artefacto', async (t) => {
  const app = application(t);
  const other = path.replace(projectId, '33333333-3333-4333-8333-333333333333');
  assert.equal((await app.inject({ method: 'GET', url: other, headers: { authorization: 'Bearer test' } })).statusCode, 404);
  assert.equal((await app.inject({ method: 'GET', url: path.replace(assessmentId, '44444444-4444-4444-8444-444444444444'), headers: { authorization: 'Bearer test' } })).statusCode, 404);
});

test('identificadores inválidos se rechazan antes de consultar el artefacto', async (t) => {
  assert.equal((await application(t).inject({ method: 'GET', url: path.replace(assessmentId, 'invalid'), headers: { authorization: 'Bearer test' } })).statusCode, 400);
});
