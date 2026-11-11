import { test, expect } from '@playwright/test';
import { servirShell } from './shell.js';

// RIPD em página com abas (spec 2026-10-26): lista de RIPD → página → aba Conformidade → responder → recarregar e a resposta continua.
// A API é mockada com estado (as respostas ficam na memória do teste). Dados fictícios.

const USER = { id: 'u1', email: 'consultor@ness.io', name: 'Consultor', role: 'consultor' };
const P = 'proj-e2e';
const BASE = `/api/v1/projects/${P}`;
const PERGUNTAS = {
  teste_impacto: [['beneficios', 'Benefícios', 'texto']],
  conformidade: [['o_que_muda', 'O que muda depois do projeto?', 'texto'], ['partes_envolvidas', 'As partes interessadas foram envolvidas?', 'texto']],
  armazenamento: [['onde_ficam', 'Onde os dados ficam armazenados?', 'texto']],
};
const ROTULOS = { teste_impacto: 'Teste de Impacto', conformidade: 'Conformidade', armazenamento: 'Armazenamento' };

async function mockApi(page) {
  await servirShell(page);
  const respostas = {};
  const dpia = { id: 'd1', system_name: '', atividade: 'Folha de pagamento ficticia', processing_name: 'Folha', status: 'Draft', residual_risk_level: 'Medium', area: 'RH', responsavel: 'Pessoa Exemplo' };
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    const json = (o, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(o) });
    if (path === '/api/v1/auth/login') return json({ token: 'e2e-fake-token', user: USER });
    if (path === '/api/v1/auth/me') return json({ user: USER });
    if (path === '/api/v1/projects' && method === 'GET') return json([{ id: P, client_name: 'Cliente E2E', project_name: 'Projeto E2E', modulos: ['privacy'] }]);
    if (path === `${BASE}/dpia` && method === 'GET') return json({ ok: true, assessments: [dpia] });
    if (path === `${BASE}/dpia/d1/questionario` && method === 'GET') {
      return json({ ok: true, abas: Object.entries(PERGUNTAS).map(([id, ps]) => ({ id, rotulo: ROTULOS[id],
        perguntas: ps.map(([pid, texto, tipo]) => ({ id: pid, texto, tipo, resposta: respostas[pid] ?? null, da_atividade: null })) })) });
    }
    if (path === `${BASE}/dpia/d1/questionario` && method === 'PUT') {
      for (const [k, v] of Object.entries(route.request().postDataJSON().respostas)) { if (v === null) delete respostas[k]; else respostas[k] = v; }
      return json({ ok: true });
    }
    if (path === `${BASE}/dpia/d1/logs`) return json({ ok: true, logs: [] });
    return json(method === 'GET' ? [] : { ok: true });
  });
  return respostas;
}

test('lista de RIPD → página → aba Conformidade → responder → recarregar e a resposta continua', async ({ page }) => {
  const respostas = await mockApi(page);
  await page.goto('/login.html');
  await page.fill('#login-email', USER.email);
  await page.fill('#login-password', 'senha-e2e');
  await page.click('#login-submit');
  await expect(page).toHaveURL(/\/privacy$/);

  await page.locator('#sidebar #nav-dpia').click();
  await expect(page.locator('#header-title')).toHaveText('RIPD');
  await page.locator('#content tbody tr', { hasText: 'Folha de pagamento ficticia' }).getByRole('button', { name: 'Abrir' }).click();

  // A página usa a finalidade da atividade como título quando não há sistema, e a aba vai no endereço.
  await expect(page.locator('#header-title')).toHaveText('Folha de pagamento ficticia');
  await expect(page).toHaveURL(/tela=ripd-ficha&dpia=d1&aba=dados/);
  await expect(page.getByRole('tab')).toHaveText(['Dados', 'Teste de Impacto', 'Conformidade', 'Armazenamento', 'Logs']);

  await page.getByRole('tab', { name: 'Conformidade' }).click();
  await expect(page).toHaveURL(/aba=conformidade/);
  await page.getByLabel('O que muda depois do projeto?').fill('A folha passa a ser digital');
  await page.getByLabel('As partes interessadas foram envolvidas?').fill('Sim');
  await page.getByLabel('As partes interessadas foram envolvidas?').blur();
  await expect(page.locator('#rf-st-partes_envolvidas')).toHaveText('Salvo.');
  await expect(page.getByRole('heading', { name: 'Perguntas 1 a 6' })).toBeVisible();
  await expect(page.locator('#rf-st-o_que_muda')).toHaveText('Salvo.');
  expect(respostas).toEqual({ o_que_muda: 'A folha passa a ser digital', partes_envolvidas: 'Sim' });

  await page.reload();
  await expect(page.getByRole('tab', { name: 'Conformidade' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByLabel('O que muda depois do projeto?')).toHaveValue('A folha passa a ser digital');
  await expect(page.getByLabel('As partes interessadas foram envolvidas?')).toHaveValue('Sim');

  await page.getByRole('button', { name: 'Voltar aos RIPDs' }).click();
  await expect(page).not.toHaveURL(/dpia=/);
  await expect(page.locator('#header-title')).toHaveText('RIPD');
});
