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

// N2–N4: as abas da casca /ot sobre os corpos de src/routes/ot.ts e ot-saidas.ts (mockados). Smoke: cada aba desenha o que a
// API devolve, IP/MAC como vieram (mascarados), a violação do fluxo externo sem VPN e os três estados da conformidade.
const B = '/api/v1/projects/proj-e2e/ot';
const ABAS_OT = {
  [`${B}/sites`]: { sites: [{ id: 's1', nome: 'SE Norte', tipo: 'subestacao', criticidade: 'alta', localizacao: null, status: 'ativo' }] },
  [`${B}/zonas`]: { zonas: [{ id: 'z2', site_id: 's1', nome: 'Supervisão', nivel_purdue: 2, tipo: 'supervisao', descricao: null, status: 'ativo' }] },
  [`${B}/ativos`]: { ativos: [{ id: 'a1', project_id: 'proj-e2e', site_id: 's1', zona_id: 'z2', nome: 'RTU-01', no_arciber: true, categoria_arciber: 'centro_operacao',
    tipo_dispositivo: 'RTU', fabricante: 'ACME', modelo: 'X1', funcao: 'Telecontrole', firmware_so_versao: '1.2', firmware_nao_aplicavel: false, status: 'ativo',
    protocolos_portas: [{ protocolo: 'DNP3', porta: 20000 }], ip: '•••', mac: 'aa:bb:cc:••:••:••', mascarado: true }] },
  [`${B}/fluxos`]: { fluxos: [{ id: 'f1', site_id: 's1', origem_ativo_id: 'a1', origem_zona_id: null, destino_ativo_id: null, destino_zona_id: null, protocolo: 'HTTPS',
    porta: 443, direcao: 'unidirecional', finalidade: null, externo: true, via_vpn: false, violacoes: ['4.1.2', '4.1.3'] }] },
  [`${B}/lotes`]: { lotes: [{ id: 'l1', site_id: 's1', fonte: 'planilha', status: 'em_revisao', criado_por: 'u-tec', created_at: '2026-10-30 10:00:00', itens: 2, com_erro: 0, gravados: 0 }] },
  [`${B}/indicadores`]: { completude: { total: 1, completos: 1, percentual: 100, situacao: 'evidencia_no_inventario', evidencia: 'Os 1 ativo(s) têm os 6 campos do 4.3.1 registrados', arciber: { total: 1, completos: 1 } },
    por_zona: [{ zona_id: 'z2', site_id: 's1', nome: 'Supervisão', nivel_purdue: 2, ativos: 1 }], por_nivel: { 2: 1 }, sem_zona: 0,
    fluxos_externos: { externos: 1, sem_vpn: 1, situacao: 'nao_atende' }, prazos: [] },
  [`${B}/conformidade`]: { framework: 'ONS-RO-CB.BR.01', versao: 'Rev.00', vigencia: '2021-07-09', resumo: { nao_atende: 1, evidencia_no_inventario: 0, sem_evidencia: 1 }, itens: [
    { codigo: '4.1.3', titulo: 'Acesso externo por VPN', prazo_meses: 18, prazo_em: '2023-01-09', situacao: 'nao_atende', evidencia: '1 de 1 fluxo(s) externo(s) sem VPN' },
    { codigo: '5.1.1', titulo: 'Tratamento de exceções', prazo_meses: null, prazo_em: null, situacao: 'sem_evidencia', evidencia: 'Fora do que o inventário registra' }] },
};

test('abas do n.ot: inventário mascarado, fluxo sem VPN, coleta sem arquivo guardado e saídas sem "atende"', async ({ page }) => {
  await mockApi(page, ['iso', 'ot'], ['iso', 'ot']);
  await page.route(`**${B}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path in ABAS_OT) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ABAS_OT[path]) });
    return route.fallback();
  });
  await entrar(page);
  await page.locator('#nav-ot').click();
  const conteudo = page.locator('#content');
  await expect(conteudo).toContainText('4.1.1');

  await page.getByRole('tab', { name: 'Inventário' }).click();
  await expect(conteudo).toContainText('RTU-01');
  await expect(conteudo).toContainText('aa:bb:cc:••:••:••');
  await expect(page.locator('#header-actions .btn-primary')).toHaveText('+ Novo ativo');

  await page.getByRole('tab', { name: 'Fluxos' }).click();
  await expect(conteudo).toContainText('Fluxo externo sem VPN: viola 4.1.2 e 4.1.3');

  await page.getByRole('tab', { name: 'Coleta' }).click();
  await expect(page.locator('#ot-coleta-privacidade')).toContainText('o arquivo original não é guardado');
  await expect(conteudo).toContainText('Em revisão');

  await page.getByRole('tab', { name: 'Saídas' }).click();
  await expect(conteudo).toContainText('Não atende');
  await expect(conteudo).toContainText('Sem evidência');
  const texto = (await conteudo.textContent()).replace(/Não atende/g, '');
  expect(texto).not.toMatch(/\batende\b|conforme/i);
  await expect(page.getByRole('button', { name: 'Exportar CSV' })).toBeVisible();
});
