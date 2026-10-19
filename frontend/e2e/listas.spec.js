import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { servirShell } from './shell.js';

// Listas do legado no n.privacy (spec 2026-10-19): menu Avaliar → Gaps → filtro de status → Abrir leva à atividade na aba Controle
// de GAPs. A API é dublada com as formas do contrato (contracts/ropa-abas). Dados fictícios.

const USER = { id: 'u1', email: 'consultor@ness.io', name: 'Consultor', role: 'consultor' };
const P = 'proj-e2e';
const FICHA = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '../../contracts/ropa-abas/ficha.json'), 'utf8'));
const GAPS = [
  { id: 'g1', ropa_id: 'r1', atividade: 'Atividade Exemplo', titulo: 'Sem política de retenção', recomendacao: 'Criar a política', plano: 'Redigir e aprovar',
    responsavel: 'Responsável Exemplo', prazo: '2026-12-31', faixa: 'mais_de_150', status: 'Open', anexos: 1 },
  { id: 'g2', ropa_id: 'r2', atividade: 'Outra Atividade', titulo: 'Contrato sem cláusula', recomendacao: null, plano: null,
    responsavel: null, prazo: null, faixa: null, status: 'Closed', anexos: 0 },
];

async function mockApi(page) {
  await servirShell(page);
  await page.route('**/api/v1/**', async (route) => {
    const p = new URL(route.request().url()).pathname.replace(`/api/v1/projects/${P}`, '');
    const m = route.request().method();
    const json = (o, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(o) });
    if (p === '/api/v1/auth/login') return json({ token: 'e2e-fake-token', user: USER });
    if (p === '/api/v1/auth/me') return json({ user: USER });
    if (p === '/api/v1/projects') return json([{ id: P, client_name: 'Cliente E2E', project_name: 'Projeto E2E', modulos: ['privacy'] }]);
    if (p === '/ropa/gaps') return json({ gaps: GAPS });
    if (p === '/ropa' && m === 'GET') return json({ ok: true, records: [{ id: 'r1', processing_purpose: 'Atividade Exemplo', nome: 'Atividade Exemplo', status: 'Draft' }] });
    if (p === '/ropa/r1/ficha') {
      const f = structuredClone(FICHA);
      f.registro = { ...f.registro, id: 'r1', nome: 'Atividade Exemplo', finalidade: 'Atividade Exemplo' };
      return json(f);
    }
    if (p === '/ropa/r1/gaps') return json({ ok: true, nao_aplicavel: false, gaps: [{ id: 'g1', gap: 'Sem política de retenção', recomendacao: 'Criar a política',
      plano_acao: 'Redigir e aprovar', responsavel: { id: 'pa1', nome: 'Responsável Exemplo' }, prazo: '2026-12-31', status: 'Open', anexos: [] }] });
    return json(m === 'GET' ? [] : { ok: true });
  });
}

test('Gaps: lista → filtro de status → Abrir leva à atividade na aba Controle de GAPs', async ({ page }) => {
  await mockApi(page);
  await page.goto('/login.html');
  await page.fill('#login-email', USER.email);
  await page.fill('#login-password', 'senha-e2e');
  await page.click('#login-submit');
  await expect(page).toHaveURL(/\/privacy$/);

  const menu = page.locator('#sidebar');
  await expect(menu.getByText('Avaliar', { exact: true })).toBeVisible();
  await menu.locator('#nav-gaps').click();
  await expect(page.locator('#header-title')).toHaveText('Gaps');
  await expect(page.locator('#gp-lista tbody tr')).toHaveCount(2);

  await page.getByLabel('Status').selectOption('Open');
  await expect(page.locator('#gp-lista tbody tr')).toHaveCount(1);
  const linha = page.locator('#gp-lista tbody tr', { hasText: 'Sem política de retenção' });
  await expect(linha).toContainText('Responsável Exemplo');

  await linha.getByRole('button', { name: 'Abrir a atividade: Atividade Exemplo' }).click();
  await expect(page).toHaveURL(/aba=gaps/);
  await expect(page.getByRole('tab', { name: /Controle de GAPs/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#at-corpo')).toContainText('Sem política de retenção');
});
