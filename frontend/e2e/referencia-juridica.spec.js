import { test, expect } from '@playwright/test';
import { servirShell } from './shell.js';

// Referência jurídica (n.privacy, spec 2026-10-20): menu → Referência jurídica → buscar "consentimento" → o inciso do art. 7 com o selo.
// A API é mockada. Dados fictícios.

const USER = { id: 'u1', email: 'consultor@ness.io', name: 'Consultor', role: 'consultor' };
const P = 'proj-e2e';
const LGPD = [
  { id: 'lgpd:art7', fonte_id: 'lgpd', referencia: 'art. 7', titulo: 'Fundamentar o tratamento em uma base legal', pai_id: null, validado_por: null, validado_em: null },
  { id: 'lgpd:art7:i', fonte_id: 'lgpd', referencia: 'art. 7, I', titulo: 'Consentimento do titular', pai_id: 'lgpd:art7', validado_por: 'adm@ness.lat', validado_em: '2026-10-20' },
  { id: 'lgpd:art46', fonte_id: 'lgpd', referencia: 'art. 46', titulo: 'Medidas de segurança', pai_id: null, validado_por: null, validado_em: null },
];

async function mockApi(page) {
  await servirShell(page);
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    const json = (o, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(o) });
    if (path === '/api/v1/auth/login') return json({ token: 'e2e-fake-token', user: USER });
    if (path === '/api/v1/auth/me') return json({ user: USER });
    if (path === '/api/v1/projects' && method === 'GET') return json([{ id: P, client_name: 'Cliente E2E', project_name: 'Projeto E2E', modulos: ['privacy'] }]);
    if (path === '/api/v1/requisitos' && method === 'GET') {
      return json(new URL(route.request().url()).searchParams.get('fonte') === 'lgpd' ? LGPD : []);
    }
    if (path === '/api/v1/requisitos/gdpr-bases') return json([{ id: 'consentimento', rotulo: 'Consentimento', texto: 'Ação deliberada do titular.' }]);
    return json(method === 'GET' ? [] : { ok: true });
  });
}

test('menu → Referência jurídica → buscar "consentimento"', async ({ page }) => {
  await mockApi(page);
  await page.goto('/login.html');
  await page.fill('#login-email', USER.email);
  await page.fill('#login-password', 'senha-e2e');
  await page.click('#login-submit');
  await expect(page).toHaveURL(/\/privacy$/);

  await page.locator('#sidebar #nav-referencia-juridica').click();
  await expect(page.locator('#header-title')).toHaveText('Referência jurídica');
  await expect(page.locator('.rj-bases-legais')).toContainText('art. 7, I');
  await expect(page.locator('#content')).toContainText('art. 46');

  await page.fill('#rj-busca', 'consentimento');
  const linhas = page.locator('#rj-painel tbody tr');
  await expect(linhas).toHaveCount(2);
  await expect(page.locator('#content')).not.toContainText('art. 46');
  await expect(page.locator('#rj-painel')).toContainText('Validado juridicamente');
  await expect(page.locator('[data-action="pedirValidacaoJuridica"]')).toHaveCount(0);

  await page.getByRole('tab', { name: 'GDPR' }).click();
  await expect(page.locator('.rj-base')).toHaveCount(1);
});
