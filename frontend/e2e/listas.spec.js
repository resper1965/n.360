import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { servirShell } from './shell.js';

// Listas do legado no n.privacy (spec 2026-10-19): menu Diagnóstico → Gestão de GAPs → filtro de status → o Gap abre o modal; a Atividade leva à ficha na aba Controle
// de GAPs. A API é dublada com as formas do contrato (contracts/ropa-abas). Dados fictícios.

const USER = { id: 'u1', email: 'consultor@ness.io', name: 'Consultor', role: 'consultor' };
const P = 'proj-e2e';
const FICHA = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '../../contracts/ropa-abas/ficha.json'), 'utf8'));
const GAPS = [
  { id: 'g1', ropa_id: 'r1', atividade: 'Atividade Exemplo', area: 'Recursos Humanos', titulo: 'Sem política de retenção', recomendacao: 'Criar a política', plano: 'Redigir e aprovar',
    responsavel: 'Responsável Exemplo', prazo: '2026-12-31', faixa: 'mais_de_150', status: 'Open', anexos: 1 },
  { id: 'g2', ropa_id: 'r2', atividade: 'Outra Atividade', area: null, titulo: 'Contrato sem cláusula', recomendacao: null, plano: null,
    responsavel: null, prazo: null, faixa: null, status: 'Closed', anexos: 0 },
];

// Corpo de GET /ropa/riscos-mapa (src/services/riscos-atividade.ts, riscosDoMapa).
const RISCOS = [
  { id: 'k1', ropa_id: 'r1', idr: 1, atividade: 'Atividade Exemplo', area: 'Recursos Humanos', threat: 'Vazamento', vulnerabilidade: 'Senha fraca', probability: 4, impact: 4,
    risk_level: 'High', residual_level: null, residual_impact: null, residual_probability: null, treatment: 'Mitigate', status: 'Open', plano: null, prazo: null, responsavel: null, owner_parte_id: null },
  { id: 'k2', ropa_id: 'r2', idr: 1, atividade: 'Outra Atividade', area: 'Jurídico', threat: 'Retenção', vulnerabilidade: null, probability: 1, impact: 2,
    risk_level: 'Low', residual_level: null, residual_impact: null, residual_probability: null, treatment: 'Accept', status: 'Closed', plano: null, prazo: '2026-01-10', responsavel: null, owner_parte_id: null },
];
const riscoGravado = [];

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
    if (p === '/ropa/riscos-mapa') return json({ riscos: RISCOS });
    if (p === '/partes') return json([{ id: 'pa1', tipo: 'pessoa', nome: 'Responsável Exemplo', status: 'ativa' }]);
    if (p === '/ropa/r1/riscos/k1' && m === 'PUT') { riscoGravado.push(JSON.parse(route.request().postData() || '{}')); return json({ ok: true, risk_level: 'High' }); }
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

test('Gestão de GAPs: lista → filtro de status → o Gap abre o Controle de GAPs → a Atividade leva à ficha na aba', async ({ page }) => {
  await mockApi(page);
  await page.goto('/privacy');
  await page.fill('#login-email', USER.email);
  await page.fill('#login-password', 'senha-e2e');
  await page.click('#login-submit');
  await expect(page).toHaveURL(/\/privacy$/);

  const menu = page.locator('#sidebar');
  await expect(menu.getByText('Diagnóstico', { exact: true })).toBeVisible();
  await menu.locator('#nav-gaps').click();
  await expect(page.locator('#header-title')).toHaveText('Gaps');
  await expect(page.locator('#gp-lista tbody tr')).toHaveCount(2);

  await page.getByLabel('Status').selectOption('Open');
  await expect(page.locator('#gp-lista tbody tr')).toHaveCount(1);
  const linha = page.locator('#gp-lista tbody tr', { hasText: 'Sem política de retenção' });
  await expect(linha).toContainText('Responsável Exemplo');
  await expect(linha).toContainText('Recursos Humanos');

  await linha.getByRole('button', { name: 'Controle do gap: Sem política de retenção' }).click();
  await expect(page.locator('#modal-content')).toContainText('Controle de GAPs');
  await expect(page.locator('#at-gap-gap')).toHaveValue('Sem política de retenção');
  await page.keyboard.press('Escape');
  await expect(page.locator('#at-gap-gap')).toBeHidden();

  await linha.getByRole('button', { name: 'Abrir a atividade: Atividade Exemplo' }).click();
  await expect(page).toHaveURL(/aba=gaps/);
  await expect(page.getByRole('tab', { name: /Controle de GAPs/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#at-corpo')).toContainText('Sem política de retenção');
});

test('Gestão de Riscos: lista padrão → filtro de área → Tratar Risco grava pela rota da atividade', async ({ page }) => {
  await mockApi(page);
  await page.goto('/privacy');
  await page.fill('#login-email', USER.email);
  await page.fill('#login-password', 'senha-e2e');
  await page.click('#login-submit');
  await expect(page).toHaveURL(/\/privacy$/);

  await page.locator('#sidebar #nav-mapa-de-risco').click();
  await expect(page.locator('#header-title')).toHaveText('Gestão de Riscos');
  await expect(page.locator('#mapa-lista tbody tr')).toHaveCount(2);
  await page.getByLabel('Área').selectOption('Recursos Humanos');
  await expect(page.locator('#mapa-lista tbody tr')).toHaveCount(1);

  await page.getByRole('button', { name: 'Tratar Risco: Vazamento' }).click();
  await expect(page.locator('#modal-content h2')).toHaveText('Tratar Risco 01');
  await page.getByRole('tab', { name: 'Tratamento' }).click();
  await page.locator('#at-rk-estr').selectOption('Mitigate');
  await page.locator('#at-rk-plano').fill('Ativar MFA (exemplo)');
  await page.locator('#at-rk-resp').selectOption('pa1');
  await page.locator('#at-rk-prazo').fill('2026-12-31');
  await page.locator('#at-rk-gravar').click();
  await expect(page.locator('#at-rk-gravar')).toBeHidden();
  expect(riscoGravado).toEqual([{ treatment: 'Mitigate', treatment_plan: 'Ativar MFA (exemplo)', owner_parte_id: 'pa1', treatment_due_date: '2026-12-31',
    residual_probability: null, residual_impact: null }]);
});
