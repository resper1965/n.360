import { test, expect } from '@playwright/test';
import { servirShell } from './shell.js';

// Fornecedores (n.privacy, spec 2026-10-19): lista → abrir o fornecedor → aba Criticidade → confirmar → o nível aparece na lista.
// A API é mockada com estado: a criticidade confirmada passa a valer na lista e na ficha. Dados fictícios.

const USER = { id: 'u1', email: 'consultor@ness.io', name: 'Consultor', role: 'consultor' };
const P = 'proj-e2e';
const BASE = `/api/v1/projects/${P}/terceiros`;

async function mockApi(page) {
  await servirShell(page);
  let criticidade = null;
  const fornecedor = () => ({
    id: 'f1', nome: 'Fornecedor Exemplo', terceiro_tipo: criticidade ? 'pequeno' : null, metodo: criticidade ? 'questionario' : null,
    situacao: 'pendente', ultima_avaliacao: null, tratamentos: 1, documentos: 0, nivel: criticidade && criticidade.nivel, dpa: false, atividades: 1,
  });
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    const json = (o, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(o) });
    if (path === '/api/v1/auth/login') return json({ token: 'e2e-fake-token', user: USER });
    if (path === '/api/v1/auth/me') return json({ user: USER });
    if (path === '/api/v1/projects' && method === 'GET') return json([{ id: P, client_name: 'Cliente E2E', project_name: 'Projeto E2E', modulos: ['privacy'] }]);
    if (path === BASE && method === 'GET') return json([fornecedor()]);
    if (path === `${BASE}/f1` && method === 'GET') {
      return json({ ...fornecedor(), email: 'contato@fornecedor.exemplo', seguranca: null, historico: [], documentos_ligados: [], suboperadores: [],
        tratamentos_afetados: [{ id: 'r1', finalidade: 'Folha de pagamento', origem: 'vinculo' }] });
    }
    if (path === `${BASE}/f1/criticidades` && method === 'GET') return json({ atual: criticidade, historico: criticidade ? [criticidade] : [] });
    if (path === `${BASE}/f1/criticidades` && method === 'POST') {
      criticidade = { id: 'c1', ...route.request().postDataJSON(), nivel: 'baixo', avaliado_por: USER.email, created_at: '2026-10-19 10:00:00' };
      return json({ ok: true, id: 'c1', nivel: 'baixo', tipo: 'pequeno' }, 201);
    }
    return json(method === 'GET' ? [] : { ok: true });
  });
}

test('lista → ficha → aba Criticidade → confirmar → o nível aparece na lista', async ({ page }) => {
  await mockApi(page);
  await page.goto('/login.html');
  await page.fill('#login-email', USER.email);
  await page.fill('#login-password', 'senha-e2e');
  await page.click('#login-submit');
  await expect(page).toHaveURL(/\/privacy$/);

  const menu = page.locator('#sidebar');
  await expect(menu.getByText('Cadastros', { exact: true })).toBeVisible();
  await menu.locator('#nav-terceiros').click();
  await expect(page.locator('#header-title')).toHaveText('Fornecedores');
  const linha = page.locator('#content tbody tr', { hasText: 'Fornecedor Exemplo' });
  await expect(linha).toContainText('Não avaliada');

  await linha.getByRole('button', { name: 'Abrir' }).click();
  await expect(page.locator('#header-title')).toHaveText('Fornecedor Exemplo');
  await expect(page).toHaveURL(/tela=terceiro&parte=f1&aba=cadastro/);
  await page.getByRole('tab', { name: 'Criticidade' }).click();
  await expect(page).toHaveURL(/aba=criticidade/);
  await expect(page.getByRole('tab', { name: 'Criticidade' })).toHaveAttribute('aria-selected', 'true');

  for (const rotulo of ['Baixo (impacto mínimo ou inexistente)', 'Várias alternativas (fácil de substituir)', 'Baixo (financeiramente sólido)',
    'Não há Regulamentação Específica no setor de atuação', 'Baixo (risco mínimo)']) await page.getByLabel(rotulo).check();
  await page.getByRole('button', { name: 'Confirmar avaliação' }).click();
  await expect(page.locator('#tc-crit')).toContainText('Nível atual: Baixo');

  await page.getByRole('button', { name: 'Voltar aos fornecedores' }).click();
  await expect(page).not.toHaveURL(/parte=/);
  await expect(page.locator('#content tbody tr', { hasText: 'Fornecedor Exemplo' })).toContainText('Baixo');
});
