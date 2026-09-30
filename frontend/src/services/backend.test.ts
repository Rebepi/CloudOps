import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, fromProposalDto, request, requestAll, toProposalDto, type ProposalDto } from './backend';

afterEach(() => vi.unstubAllGlobals());

describe('cliente backend', () => {
  it('envía sesión y correlación sin credenciales AWS', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'ok' })));
    vi.stubGlobal('fetch', fetchMock);
    expect(await request('/projects', 'session')).toEqual({ status: 'ok' });
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/v1/projects');
    expect(options.headers.Authorization).toBe('Bearer session');
    expect(options.headers['X-Correlation-ID']).toMatch(/^[a-f0-9-]{36}$/);
    expect(JSON.stringify(options)).not.toContain('AWS_ACCESS_KEY');
  });

  it('no convierte un error de persistencia en éxito', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ detail: 'Sin permiso' }), { status: 403 },
    )));
    await expect(request('/proposals', 'session', { method: 'POST' }))
      .rejects.toMatchObject({ status: 403, message: 'Sin permiso' });
  });

  it('maneja errores no JSON y respuestas vacías', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response('proxy caído', { status: 502 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(request('/projects', null)).rejects.toBeInstanceOf(ApiError);
    expect(await request('/auth/logout', 'session', { method: 'POST' })).toBeUndefined();
  });

  it('convierte decimales y relaciones sin inventar importes', () => {
    const dto: ProposalDto = {
      id: 'p1', name: 'Prueba', application_type: 'Web', description: '', region_code: 'us-east-1',
      estimated_users: 100, availability: 'alta', migration_goal: '', budget_limit: '250.50',
      rto_hours: null, rpo_minutes: null, services: ['s3'], frameworks: ['SOC 2'], created_at: '2026-09-29',
    };
    const result = fromProposalDto(dto);
    expect(result.presupuestoMaximo).toBe(250.5);
    expect(result.rtoHoras).toBeUndefined();
    expect(toProposalDto(result)).toMatchObject({ services: ['s3'], frameworks: ['SOC 2'], rto_hours: null });
  });

  it('no trunca inventarios con más de una página', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(Array.from({ length: 200 }, (_, id) => ({ id })))))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 200 }])));
    vi.stubGlobal('fetch', fetchMock);
    expect(await requestAll('/projects/p/resources', 'session')).toHaveLength(201);
    expect(fetchMock.mock.calls[1][0]).toBe('/api/v1/projects/p/resources?limit=200&offset=200');
  });
});
