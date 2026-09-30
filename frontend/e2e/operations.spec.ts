import { expect, test } from '@playwright/test';

test('sesión local, FLOCI, worker y auditoría conectados', async ({ page }) => {
  await page.goto('/operations');
  await page.getByRole('button', { name: 'Entrar al laboratorio' }).click();
  await expect(page.getByRole('heading', { name: 'Operaciones conectadas' })).toBeVisible();
  if (await page.getByRole('button', { name: 'Validar identidad' }).count() === 0) {
    await page.getByRole('button', { name: 'Conectar FLOCI' }).click();
  }
  await page.getByRole('button', { name: 'Validar identidad' }).first().click();
  await expect(page.getByRole('status')).toContainText('Identidad validada');
  await page.getByRole('button', { name: 'Sincronizar inventario' }).first().click();
  await expect(page.getByText(/succeeded · \d+ recursos/).first()).toBeVisible({ timeout: 30000 });
  await expect(page.getByText(/sync.inventory.succeeded/).first()).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('lector no puede escribir ni sincronizar', async ({ page }) => {
  await page.goto('/operations');
  await page.getByLabel('Perfil local').selectOption('viewer');
  await page.getByRole('button', { name: 'Entrar al laboratorio' }).click();
  await expect(page.getByRole('heading', { name: 'Operaciones conectadas' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Conectar FLOCI' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Sincronizar inventario' }).first()).toBeDisabled();
});
