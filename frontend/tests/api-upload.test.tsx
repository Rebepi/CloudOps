import { afterEach, expect, it, vi } from 'vitest';
import { api } from '../src/lib/api';
import { assessmentLabel } from '../src/lib/assessmentLabels';

afterEach(() => { vi.unstubAllGlobals(); sessionStorage.clear(); });

it('conserva FormData sin forzar Content-Type y mantiene autenticación', async () => {
  const fetch = vi.fn(async () => new Response(JSON.stringify({ data: { status: 'pending' } }), { status: 202 }));
  vi.stubGlobal('fetch', fetch);
  sessionStorage.setItem('cloudops_token', 'test-session-token');
  const body = new FormData();
  body.append('archive', new File(['PK'], 'project.zip', { type: 'application/zip' }));
  await api('/projects/project-id/security/assessments/code', { method: 'POST', body, headers: { 'content-type': 'application/json' } });
  const options = fetch.mock.calls[0][1] as RequestInit;
  expect(options.body).toBe(body);
  expect(new Headers(options.headers).has('Content-Type')).toBe(false);
  expect(new Headers(options.headers).get('Authorization')).toBe('Bearer test-session-token');
});

it('sigue enviando JSON para peticiones ordinarias', async () => {
  const fetch = vi.fn(async () => new Response('{}'));
  vi.stubGlobal('fetch', fetch);
  await api('/projects', { method: 'POST', body: '{}' });
  const options = fetch.mock.calls[0][1] as RequestInit;
  expect(new Headers(options.headers).get('Content-Type')).toBe('application/json');
});

it('identifica la fuente del artefacto antes que la configuración actual del proyecto', () => {
  const repoProject = { sourceMode: 'repository' as const, repoProvider: 'github' as const };
  expect(assessmentLabel({ assessmentType: 'code', artifactMetadata: { provider: 'github' } }, repoProject)).toBe('Código de GitHub');
  expect(assessmentLabel({ assessmentType: 'code', artifactName: 'upload.zip' }, repoProject)).toBe('Código de ZIP');
  expect(assessmentLabel({ assessmentType: 'code' })).toBe('Código');
});
