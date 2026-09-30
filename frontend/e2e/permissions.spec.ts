import { expect, test } from '@playwright/test';

test('lector no edita formulario y API rechaza escrituras aunque se evite la UI', async ({ page }) => {
  const adminLogin = await page.request.post('/api/v1/auth/mock/login', { data: { profile: 'admin' } });
  const admin = { Authorization: `Bearer ${(await adminLogin.json()).access_token}` };
  const projects = await (await page.request.get('/api/v1/projects', { headers: admin })).json();
  const project = projects[0].id;
  const proposal = { name: `Permisos E2E ${Date.now()}`, application_type: 'Web', description: 'Prueba de lectura',
    region_code: 'us-east-1', estimated_users: 10, availability: 'alta', migration_goal: 'Migrar',
    services: ['s3'], frameworks: [] };
  const created = await page.request.post(`/api/v1/projects/${project}/proposals`, { headers: admin, data: proposal });
  expect(created.status()).toBe(201);
  const id = (await created.json()).id;
  try {
    await page.goto('/planning');
    await page.getByLabel('Perfil local').selectOption('viewer');
    await page.getByRole('button', { name: 'Entrar al laboratorio' }).click();
    await expect(page.getByText('Perfil del proyecto: Lector')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Guardar Propuesta Cloud' })).toBeDisabled();
    await expect(page.locator('fieldset input').first()).toBeDisabled();
    await expect(page.getByTitle('Eliminar propuesta').first()).toBeDisabled();
    const token = await page.evaluate(() => sessionStorage.getItem('cloudops_session'));
    const reader = { Authorization: `Bearer ${token}` };
    expect((await page.request.post(`/api/v1/projects/${project}/proposals`, { headers: reader, data: proposal })).status()).toBe(403);
    expect((await page.request.put(`/api/v1/proposals/${id}`, { headers: reader, data: proposal })).status()).toBe(403);
    expect((await page.request.delete(`/api/v1/proposals/${id}`, { headers: reader })).status()).toBe(403);
    const listed = await (await page.request.get(`/api/v1/projects/${project}/proposals`, { headers: reader })).json();
    expect(listed.some((p: { id: string }) => p.id === id)).toBe(true);
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: 'Dashboard conectado' })).toBeVisible();
    await expect(page.getByText('Telemetría Global:', { exact: true })).toHaveCount(0);
    await expect(page.getByText('AWS Health: Operativo', { exact: true })).toHaveCount(0);
  } finally {
    await page.request.delete(`/api/v1/proposals/${id}`, { headers: admin });
    await page.request.post('/api/v1/auth/logout', { headers: admin });
  }
});
