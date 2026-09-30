import { expect, test } from '@playwright/test';

test('propuesta API aparece en planificación y sobrevive una recarga', async ({ page }) => {
  await page.goto('/planning');
  await page.getByRole('button', { name: 'Entrar al laboratorio' }).click();
  await expect(page.getByText('Perfil local')).toHaveCount(0);
  const token = await page.evaluate(() => sessionStorage.getItem('cloudops_session'));
  const headers = { Authorization: `Bearer ${token}` };
  const projects = await (await page.request.get('/api/v1/projects', { headers })).json();
  const name = `Propuesta E2E ${Date.now()}`;
  const created = await page.request.post(`/api/v1/projects/${projects[0].id}/proposals`, {
    headers, data: { name, application_type: 'Web', description: 'Prueba de persistencia',
      region_code: 'us-east-1', estimated_users: 100, availability: 'alta', migration_goal: 'Migrar',
      services: ['s3'], frameworks: [] },
  });
  expect(created.status()).toBe(201);
  const proposal = await created.json();
  try {
    await page.reload();
    await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
    await page.reload();
    await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
  } finally {
    expect((await page.request.delete(`/api/v1/proposals/${proposal.id}`, { headers })).status()).toBe(204);
  }
});
