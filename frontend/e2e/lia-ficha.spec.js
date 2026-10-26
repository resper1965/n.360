import { test, expect } from '@playwright/test';
import { servirShell } from './shell.js';

// LIA em página com abas (spec 2026-10-26): lista de LIA → ficha → aba Necessidade → responder → recarregar e a resposta continua.
// A API é mockada com estado (as respostas ficam na memória do teste). Dados fictícios.

const USER = { id: 'u1', email: 'consultor@ness.io', name: 'Consultor', role: 'consultor' };
const P = 'proj-e2e';
const BASE = `/api/v1/projects/${P}`;
const PERGUNTAS = {
  finalidade: [['finalidades', 'Quais são as finalidades do tratamento?', 'texto']],
  necessidade: [['realmente_necessario', 'O tratamento é realmente necessário?', 'escolha'], ['menos_dados', 'A finalidade seria alcançada com menos dados? Quais?', 'texto']],
  proporcionalidade: [['coleta_direta', 'A coleta dos dados é direta?', 'escolha']],
};
const ROTULOS = { finalidade: 'Finalidade', necessidade: 'Necessidade', proporcionalidade: 'Proporcionalidade' };

async function mockApi(page) {
  await servirShell(page);
  const respostas = {};
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    const json = (o, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(o) });
    if (path === '/api/v1/auth/login') return json({ token: 'e2e-fake-token', user: USER });
    if (path === '/api/v1/auth/me') return json({ user: USER });
    if (path === '/api/v1/projects' && method === 'GET') return json([{ id: P, client_name: 'Cliente E2E', project_name: 'Projeto E2E', modulos: ['privacy'] }]);
    if (path === `${BASE}/ropa/lias`) return json({ lias: [{ ropa_id: 'r1', atividade: 'Atendimento ficticio', status: 'rascunho', conclusao: null, concluida_por: null, concluida_em: null, area: 'Atendimento' }] });
    if (path === `${BASE}/ropa/r1/lia/questionario` && method === 'GET') {
      return json({ ok: true, abas: Object.entries(PERGUNTAS).map(([id, ps]) => ({ id, rotulo: ROTULOS[id],
        perguntas: ps.map(([pid, texto, tipo]) => ({ id: pid, texto, tipo, resposta: respostas[pid] ?? null, da_atividade: null })) })) });
    }
    if (path === `${BASE}/ropa/r1/lia/questionario` && method === 'PUT') {
      for (const [k, v] of Object.entries(route.request().postDataJSON().respostas)) { if (v === null) delete respostas[k]; else respostas[k] = v; }
      return json({ ok: true });
    }
    if (path === `${BASE}/ropa/r1/lia/logs`) return json({ ok: true, logs: [] });
    if (path === `${BASE}/ropa/r1/lia`) return json({ lia: null });
    return json(method === 'GET' ? [] : { ok: true });
  });
  return respostas;
}

test('lista de LIA → ficha → aba Necessidade → responder → recarregar e a resposta continua', async ({ page }) => {
  const respostas = await mockApi(page);
  await page.goto('/login.html');
  await page.fill('#login-email', USER.email);
  await page.fill('#login-password', 'senha-e2e');
  await page.click('#login-submit');
  await expect(page).toHaveURL(/\/privacy$/);

  await page.locator('#sidebar #nav-lia').click();
  await expect(page.locator('#header-title')).toHaveText('LIA');
  await page.locator('#content tbody tr', { hasText: 'Atendimento ficticio' }).getByRole('button', { name: 'Abrir' }).first().click();

  await expect(page.locator('#header-title')).toHaveText('Atendimento ficticio');
  await expect(page).toHaveURL(/tela=lia-ficha&ropa=r1&aba=finalidade/);
  await expect(page.getByRole('tab')).toHaveText(['Finalidade', 'Necessidade', 'Proporcionalidade', 'Conclusão', 'Logs']);

  await page.getByRole('tab', { name: 'Necessidade' }).click();
  await expect(page).toHaveURL(/aba=necessidade/);
  await page.getByLabel('A finalidade seria alcançada com menos dados? Quais?').fill('Só o nome e o contato');
  await page.getByLabel('Sim', { exact: true }).check();
  await expect(page.locator('#lf-st-menos_dados')).toHaveText('Salvo.');
  expect(respostas).toEqual({ menos_dados: 'Só o nome e o contato', realmente_necessario: 'sim' });

  await page.reload();
  await expect(page.getByRole('tab', { name: 'Necessidade' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByLabel('A finalidade seria alcançada com menos dados? Quais?')).toHaveValue('Só o nome e o contato');
  await expect(page.getByLabel('Sim', { exact: true })).toBeChecked();

  await page.getByRole('button', { name: 'Voltar às LIAs' }).click();
  await expect(page).not.toHaveURL(/ropa=/);
  await expect(page.locator('#header-title')).toHaveText('LIA');
});
