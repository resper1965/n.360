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

test('n.privacy: menu em seções fixas, rótulos de uma linha, selos (total a tratar; atraso em fundo cheio; painel com os atrasados) e barra recolhida com nome', async ({ page }) => {
  await mockApi(page, ['privacy']);
  await page.route('**/api/v1/projects/proj-e2e/encarregado', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ encarregados: [{ id: 'e', nome: 'Enc' }], prioridades: [], pedidos_titular: { exigem_atencao: 4, atrasados: 1 }, terceiros: { com_pendencia: 2 }, incidentes: { comunicacoes_pendentes: 0 } }),
  }));
  await entrar(page);
  await expect(page).toHaveURL(/\/privacy$/);
  const menu = page.locator('#sidebar');
  await expect(menu.locator('#nav-titular')).toContainText('Pedidos do titular');
  await expect(menu.locator('#nav-encarregado')).toContainText('Painel');
  await expect(menu.locator('#selo-titular')).toHaveAttribute('aria-label', '4 pedidos vencidos ou a vencer em 7 dias, 1 atrasado');
  await expect(menu.locator('#selo-painel')).toHaveText('1');
  await expect(menu.locator('#selo-terceiros')).toHaveText('2');
  await expect(menu.locator('#selo-incidentes')).toBeHidden();
  for (const secao of ['Mapear', 'Avaliar', 'Responder', 'Provar']) await expect(menu.getByText(secao, { exact: true })).toBeVisible();
  // tudo à vista, sem abrir grupo: Documentos e Consentimentos a um clique
  await expect(menu.locator('#nav-documentos')).toBeVisible();
  await expect(menu.locator('#nav-consentimentos')).toBeVisible();
  await expect(menu.locator('#nav-meus')).toBeHidden();
  await expect(menu.locator('#nav-audit-trail')).toBeHidden();
  // Minhas aprovações e Trilha de logs moram no menu de conta
  await page.click('#sidebar-user-card');
  await expect(page.getByRole('menuitem', { name: 'Minhas aprovações' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Trilha de logs' })).toBeVisible();
  await page.keyboard.press('Escape');
  // barra recolhida: todo link com nome, a dica aparece ao focar e o selo segue à vista no canto do ícone
  await page.click('#toggle-sidebar');
  await expect(menu.getByRole('link', { name: /^Pedidos do titular/ })).toBeVisible();
  await expect(menu.getByRole('link', { name: /^Consentimentos/ })).toBeVisible();
  await expect(menu.locator('#selo-titular')).toBeVisible();
  await menu.locator('#nav-ropa').focus();
  await expect(page.locator('#sidebar-dica')).toHaveText('Tratamentos (RoPA)');
  await expect(page.locator('#sidebar-dica')).toBeVisible();
});

// Acessibilidade da barra também no n.iso, sem mudar o acordeão: Tab não para em item de grupo fechado e a barra recolhida
// tem nome em todo link.
test('n.iso: Tab sem item escondido e barra recolhida com nome', async ({ page }) => {
  await mockApi(page, ['iso']);
  await entrar(page);
  await expect(page).toHaveURL(/\/iso$/);
  const menu = page.locator('#sidebar');
  await expect(menu.locator('#nav-evidence')).toBeHidden(); // grupo Operacional começa fechado
  await page.locator('#toggle-sidebar').focus();
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab');
    const foco = await page.evaluate(() => (document.activeElement && document.activeElement.closest('#sidebar') ? document.activeElement.id : null));
    if (foco === null) break;
    expect(['nav-evidence', 'nav-ropa', 'nav-audit-trail']).not.toContain(foco);
  }
  await page.locator('#toggle-sidebar').click();
  await expect(menu.getByRole('link', { name: 'Dashboard' })).toBeVisible();
  const semNome = await menu.locator('.sidebar-nav[role="link"]:visible').evaluateAll((ns) => ns.filter((n) => !n.textContent.trim()).length);
  expect(semNome).toBe(0);
});
