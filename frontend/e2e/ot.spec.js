import { test, expect } from '@playwright/test';
import { servirShell } from './shell.js';

// n.ot (N1): o item "n.ot" do menu do n.360 só aparece com projeto e pessoa com o módulo; leva à casca /ot, que lista o
// catálogo RO-CB.BR.01 (GET /projects/:id/ot/requisitos, src/routes/ot.ts). A API é mockada.

const USER = { id: 'u1', email: 'consultor@ness.io', name: 'Consultor', role: 'consultor' };
const REQ = (codigo, titulo, prazo_meses) => ({ id: `ons-${codigo}`, framework: 'ONS-RO-CB.BR.01', codigo, titulo, descricao: null, categoria: null, versao: 'Rev.00', prazo_meses });

async function mockApi(page, modulos, modulosDaPessoa) {
  await servirShell(page);
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    const json = (o) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
    const user = { ...USER, modulos: modulosDaPessoa };
    if (path === '/api/v1/auth/login') return json({ token: 'e2e-fake-token', user });
    if (path === '/api/v1/auth/me') return json({ user });
    if (path === '/api/v1/projects' && method === 'GET') return json([{ id: 'proj-e2e', client_name: 'Cliente E2E', project_name: 'Projeto E2E', modulos }]);
    if (path === '/api/v1/projects/proj-e2e/ot/requisitos') return json({ requisitos: [REQ('4.1.1', 'Segregação em zonas de segurança', 18), REQ('5.1.1', 'Tratamento de exceções', null)] });
    return json(method === 'GET' ? [] : { ok: true });
  });
}

async function entrar(page) {
  await page.goto('/login.html');
  await page.fill('#login-email', USER.email);
  await page.fill('#login-password', 'senha-e2e');
  await page.click('#login-submit');
}

test('projeto e pessoa com o n.ot: o item do menu leva a /ot e à lista da RO-CB.BR.01', async ({ page }) => {
  await mockApi(page, ['iso', 'ot'], ['iso', 'ot']);
  await entrar(page);
  const item = page.locator('#nav-ot');
  await expect(item).toBeVisible();
  await expect(item).toHaveText('n.ot');
  await item.click();
  await expect(page).toHaveURL(/\/ot$/);
  await expect(page).toHaveTitle('n.ot | ness. ARCiber');
  await expect(page.locator('#content')).toContainText('4.1.1');
  await expect(page.locator('#content')).toContainText('18 meses');
  await expect(page.locator('#content')).toContainText('Sem prazo');
});

test('pessoa sem o n.ot (projeto com ele): o item não aparece', async ({ page }) => {
  await mockApi(page, ['iso', 'privacy', 'ot'], ['iso', 'privacy']);
  await entrar(page);
  await expect(page.locator('#nav-inicio')).toBeVisible();
  await expect(page.locator('#nav-ot')).toBeHidden();
});
