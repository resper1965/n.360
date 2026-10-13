import { test, expect } from '@playwright/test';
import { servirShell } from './shell.js';

// Entrada do n.360: login na raiz, início com um cartão por módulo, "Abrir" leva ao caminho do módulo
// (/iso, /privacy) com a casca dele; quem só tem um módulo entra direto. A API é mockada.

const USER = { id: 'u1', email: 'consultor@ness.io', name: 'Consultor', role: 'consultor' };

async function mockApi(page, modulos) {
  await servirShell(page);
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    const json = (o) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
    if (path === '/api/v1/auth/login') return json({ token: 'e2e-fake-token', user: USER });
    if (path === '/api/v1/auth/me') return json({ user: USER });
    if (path === '/api/v1/projects' && method === 'GET')
      return json([{ id: 'proj-e2e', client_name: 'Cliente E2E', project_name: 'Projeto E2E', modulos }]);
    return json(method === 'GET' ? [] : { ok: true });
  });
}

async function entrar(page) {
  await page.goto('/login.html');
  await page.fill('#login-email', USER.email);
  await page.fill('#login-password', 'senha-e2e');
  await page.click('#login-submit');
}

test('dois módulos: início do n.360 e "Abrir" leva à casca de cada módulo', async ({ page }) => {
  await mockApi(page, ['iso', 'privacy']);
  await entrar(page);

  await expect(page.locator('#content')).toContainText('n.iso');
  await expect(page.locator('#content')).toContainText('n.privacy');
  await expect(page.getByRole('button', { name: /^Abrir o n\./ })).toHaveCount(2);

  await page.getByRole('button', { name: /^Abrir o n\./ }).first().click();
  await expect(page).toHaveURL(/\/iso$/);
  await expect(page).toHaveTitle('n.iso | ness. Agentic GRC');

  await page.goto('/login.html');
  await expect(page.getByRole('button', { name: /^Abrir o n\./ })).toHaveCount(2);
  await page.getByRole('button', { name: /^Abrir o n\./ }).nth(1).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page).toHaveTitle('n.privacy | ness. Privacidade');
});

test('um módulo só (privacy): entra direto em /privacy', async ({ page }) => {
  await mockApi(page, ['privacy']);
  await entrar(page);
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page).toHaveTitle('n.privacy | ness. Privacidade');
});

test('n.privacy: menu por área de trabalho, com DSAR, terceiros e incidentes em destaque e os selos de vencimento', async ({ page }) => {
  await mockApi(page, ['privacy']);
  await page.route('**/api/v1/projects/proj-e2e/encarregado', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ encarregados: [{ id: 'e', nome: 'Enc' }], prioridades: [], pedidos_titular: { exigem_atencao: 4, atrasados: 1 }, terceiros: { com_pendencia: 2 }, incidentes: { comunicacoes_pendentes: 0 } }),
  }));
  await entrar(page);
  await expect(page).toHaveURL(/\/privacy$/);
  const menu = page.locator('#sidebar');
  await expect(menu.locator('#nav-titular')).toContainText('Direitos do titular (DSAR)');
  await expect(menu.locator('#nav-terceiros')).toContainText('Terceiros (risco de fornecedores)');
  await expect(menu.locator('#selo-titular')).toHaveAttribute('aria-label', '4 pedidos vencidos ou a vencer em 7 dias');
  await expect(menu.locator('#selo-terceiros')).toHaveText('2');
  await expect(menu.locator('#selo-incidentes')).toBeHidden();
  await expect(menu.getByText('Mapear e avaliar', { exact: true })).toBeVisible();
  await expect(menu.getByText('Governança e provas', { exact: true })).toBeVisible();
});
