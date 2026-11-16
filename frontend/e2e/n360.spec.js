import { test, expect } from '@playwright/test';
import { servirShell } from './shell.js';

// Entrada do n.360: login na raiz, o Início lista os projetos sem projeto ativo e "Abrir no n.x" leva ao caminho do módulo
// (/iso, /privacy) com a casca dele; ninguém é redirecionado. A API é mockada.

const USER = { id: 'u1', email: 'consultor@ness.io', name: 'Consultor', role: 'consultor' };

// O corpo de GET /projects/:id/painel (src/services/painel.ts), com dados fictícios.
const BLOCO = (m) => ({
  saude: { tom: 'atraso', rotulo: 'Atrasado', frase: m === 'iso' ? '1 ação corretiva passou do prazo.' : '2 pedidos do titular atrasados.', apoio: '' },
  numeros: [['1 de 3', m === 'iso' ? 'controles implementados' : 'atividades aprovadas'], ['2', 'atrasados'], ['0', 'outros']], comecando: false,
  fazer: [{ grupo: 'atraso', quando: 'Venceu em 12/10', texto: m === 'iso' ? '1 ação corretiva passou do prazo' : '2 pedidos do titular atrasados', contexto: '', acao: 'Abrir a lista', tela: m === 'iso' ? 'capa' : 'titular', modulo: m }],
  cobertura: [{ tema: 'Tema exemplo', feito: 2, andamento: 1, falta: 1, conta: 'a / b / c' }],
  vencimentos: [{ tipo: 'Exemplo', vencidos: 1, itens: [{ dias: 3, rotulo: 'Item exemplo' }] }],
  riscos: [{ p: 4, i: 5, n: 1 }], passos: [], ...(m === 'privacy' ? { pedidos_mes: [0, 1, 0, 2, 0, 0, 1, 0, 3, 0, 1, 2], acoes_por_prazo: [] } : {}),
});
const PAINEL = (modulos) => ({
  gerado_em: new Date().toISOString(), visao: 'equipe', modulos_pedidos: modulos,
  empresa: { razao_social: 'Exemplo Logística Integrada S.A.', cnpj: '12345678000190', setor: 'Transporte' },
  encarregados: [{ nome: 'Pessoa Exemplo' }], programa: { estado: 'implantacao', desde: null, rotulo: 'Em implantação' },
  saude: { tom: 'atraso', rotulo: 'Atrasado', frase: '2 pedidos do titular atrasados no n.privacy.', apoio: '' },
  modulos: Object.fromEntries(modulos.map((m) => [m, BLOCO(m)])),
  ...(modulos.includes('privacy') ? { selos: { pedidos_titular: { exigem_atencao: 4, atrasados: 1 }, terceiros: { com_pendencia: 2 }, incidentes: { comunicacoes_pendentes: 0 } } } : {}),
});

async function mockApi(page, modulos, { user = USER, painel = {} } = {}) {
  await servirShell(page);
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    const json = (o) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
    if (path === '/api/v1/auth/login') return json({ token: 'e2e-fake-token', user });
    if (path === '/api/v1/auth/me') return json({ user });
    if (path === '/api/v1/projects' && method === 'GET')
      return json([{ id: 'proj-e2e', client_name: 'Cliente E2E', project_name: 'Projeto E2E', modulos }]);
    if (path === '/api/v1/carteira') return json({ gerado_em: new Date().toISOString(), projetos: [{ id: 'proj-e2e', nome: 'Cliente E2E', modulos, tom: 'atraso',
      situacao: '1 prazo legal vencido', urgente: '2 pedidos do titular atrasados', modulo_urgente: modulos.includes('privacy') ? 'privacy' : modulos[0], ultimo_movimento: null }] });
    if (path === '/api/v1/projects/proj-e2e/painel') {
      const pedido = new URL(route.request().url()).searchParams.get('modulo');
      return json({ ...PAINEL(pedido ? [pedido] : modulos), ...painel });
    }
    return json(method === 'GET' ? [] : { ok: true });
  });
}

async function entrar(page, caminho = '/login.html') {
  await page.goto(caminho);
  await page.fill('#login-email', USER.email);
  await page.fill('#login-password', 'senha-e2e');
  await page.click('#login-submit');
}

test('dois módulos: o Início lista o projeto e "Abrir no" leva à casca de cada módulo', async ({ page }) => {
  await mockApi(page, ['iso', 'privacy']);
  await entrar(page);

  await expect(page.locator('#content')).toContainText('Cliente E2E');
  await expect(page.getByRole('button', { name: /^Abrir Cliente E2E no n\./ })).toHaveCount(2);

  await page.getByRole('button', { name: 'Abrir Cliente E2E no n.iso' }).click();
  await expect(page).toHaveURL(/\/iso$/);
  await expect(page).toHaveTitle('n.iso | ness. Agentic GRC');

  // No módulo, o seletor do cabeçalho troca para o outro sem voltar ao início.
  const seletor = page.getByRole('navigation', { name: 'Módulo' });
  await expect(seletor.getByRole('link', { name: 'n.iso' })).toHaveAttribute('aria-current', 'page');
  await seletor.getByRole('link', { name: 'n.privacy' }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.getByRole('navigation', { name: 'Módulo' }).getByRole('link', { name: 'n.privacy' })).toHaveAttribute('aria-current', 'page');

  await page.goto('/login.html');
  await page.getByRole('button', { name: 'Abrir Cliente E2E no n.privacy' }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page).toHaveTitle('n.privacy | ness. Privacidade');
});

test('um módulo só (privacy): fica no Início, sem redirecionamento; "Abrir no n.privacy" leva ao módulo', async ({ page }) => {
  await mockApi(page, ['privacy']);
  await entrar(page);
  const abrir = page.getByRole('button', { name: 'Abrir Cliente E2E no n.privacy' });
  await expect(abrir).toBeVisible();
  await expect(page).not.toHaveURL(/\/privacy/);
  await abrir.click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page).toHaveTitle('n.privacy | ness. Privacidade');
});

test('n.privacy: menu em seções fixas, rótulos de uma linha, selos (total a tratar; atraso em fundo cheio; painel com os atrasados) e barra recolhida com nome', async ({ page }) => {
  await mockApi(page, ['privacy']);
  // os selos vêm do próprio painel (selos), sem a segunda chamada à visão do encarregado
  const visao = [];
  page.on('request', (r) => { if (new URL(r.url()).pathname.endsWith('/encarregado')) visao.push(r.url()); });
  await entrar(page, '/privacy');
  await expect(page).toHaveURL(/\/privacy$/);
  const menu = page.locator('#sidebar');
  await expect(menu.locator('#nav-titular')).toContainText('Solicitações');
  await expect(menu.locator('#nav-encarregado')).toContainText('Painel');
  await expect(menu.locator('#selo-titular')).toHaveAttribute('aria-label', '4 pedidos vencidos ou a vencer em 7 dias, 1 atrasado');
  await expect(menu.locator('#selo-painel')).toHaveText('1');
  await expect(menu.locator('#selo-terceiros')).toHaveText('2');
  await expect(menu.locator('#selo-incidentes')).toBeHidden();
  expect(visao).toEqual([]);
  for (const secao of ['Cadastros', 'Mapeamento', 'Diagnóstico', 'Atendimento', 'Mais']) await expect(menu.getByText(secao, { exact: true })).toBeVisible();
  await expect(menu.locator('#secao-fornecedores')).toHaveText('Fornecedores');
  await expect(menu.locator('#secao-documentos')).toHaveText('Documentos');
  // tudo à vista, sem abrir grupo: Arquivos, Políticas e Consentimentos a um clique
  await expect(menu.locator('#nav-documentos-arquivo')).toContainText('Arquivos');
  await expect(menu.locator('#nav-documentos')).toContainText('Políticas');
  await expect(menu.locator('#nav-consentimentos')).toBeVisible();
  await expect(menu.locator('#nav-meus')).toBeHidden();
  await expect(menu.locator('#nav-audit-trail')).toBeHidden();
  // Minhas aprovações e Trilha de auditoria moram no menu de conta
  await page.click('#sidebar-user-card');
  await expect(page.getByRole('menuitem', { name: 'Minhas aprovações' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Trilha de auditoria' })).toBeVisible();
  await page.keyboard.press('Escape');
  // barra recolhida: todo link com nome, a dica aparece ao focar e o selo segue à vista no canto do ícone
  await page.click('#toggle-sidebar');
  // o ponteiro sai de cima do conteúdo: a barra encolhendo passa elementos sob ele, e cada mouseover fecha a dica
  await page.mouse.move(2, 2);
  await expect(menu.getByRole('link', { name: /^Solicitações/ })).toBeVisible();
  await expect(menu.getByRole('link', { name: /^Consentimentos/ })).toBeVisible();
  await expect(menu.locator('#selo-titular')).toBeVisible();
  await menu.locator('#nav-ropa').focus();
  await expect(page.locator('#sidebar-dica')).toHaveText('Atividades');
  await expect(page.locator('#sidebar-dica')).toBeVisible();
});

// Acessibilidade da barra também no n.iso, sem mudar o acordeão: Tab não para em item de grupo fechado e a barra recolhida
// tem nome em todo link.
test('n.iso: Tab sem item escondido e barra recolhida com nome', async ({ page }) => {
  await mockApi(page, ['iso']);
  await entrar(page, '/iso');
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
  await expect(menu.getByRole('link', { name: 'Painel' })).toBeVisible();
  const semNome = await menu.locator('.sidebar-nav[role="link"]:visible').evaluateAll((ns) => ns.filter((n) => !n.textContent.trim()).length);
  expect(semNome).toBe(0);
});

// Painel de entrada (estudo de 14/10/2026, direção A): uma chamada de dados do painel por entrada, a frase de saúde rápida
// mesmo com a API lenta, e cada item de "O que fazer" com nome próprio.
test('painel: uma chamada a /painel por entrada (n.360, n.iso e n.privacy)', async ({ page }) => {
  await mockApi(page, ['iso', 'privacy']);
  const painel = [];
  page.on('request', (r) => { if (new URL(r.url()).pathname.endsWith('/painel')) painel.push(new URL(r.url()).search); });
  await entrar(page);
  const ver = page.getByRole('button', { name: 'Ver situação de Cliente E2E' });
  await expect(ver).toBeVisible();
  expect(painel).toEqual([]);
  await ver.click();
  await expect(page.locator('.pn-sit')).toContainText('2 pedidos do titular atrasados.');
  expect(painel).toEqual(['']);
  painel.length = 0;
  await page.getByRole('button', { name: 'Abrir Cliente E2E no n.privacy' }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.locator('.pn-frase')).toBeVisible();
  await expect(page.locator('#pn-cob')).toBeVisible();
  expect(painel).toEqual(['?modulo=privacy']);
  painel.length = 0;
  await page.goto('/iso');
  await expect(page.locator('.pn-frase')).toBeVisible();
  expect(painel).toEqual(['?modulo=iso']);
  // todo botão de "O que fazer" tem nome único
  const nomes = await page.locator('.pn-grupo button').evaluateAll((bs) => bs.map((b) => b.getAttribute('aria-label')));
  expect(nomes.length).toBeGreaterThan(0);
  expect(new Set(nomes).size).toBe(nomes.length);
});

test('painel: a frase de saúde aparece em menos de 1 s com a API do painel atrasada em 300 ms', async ({ page }) => {
  await mockApi(page, ['privacy']);
  await page.route('**/api/v1/projects/proj-e2e/painel**', async (route) => {
    await new Promise((r) => setTimeout(r, 300));
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PAINEL(['privacy'])) });
  });
  let pedido = 0;
  page.on('request', (r) => { if (!pedido && new URL(r.url()).pathname.endsWith('/painel')) pedido = Date.now(); });
  await entrar(page, '/privacy');
  await expect(page.locator('.pn-frase')).toBeVisible();
  const ate = Date.now() - pedido;
  expect(pedido).toBeGreaterThan(0);
  expect(ate).toBeLessThan(1000);
});

// Roteiro da entrada (spec 2026-11-14-entrada-n360): ver a situação de um projeto sem entrar nele; entrar é o "Abrir no".
test('entrada: "Ver situação" abre no lugar sem escolher projeto; "Abrir no n.iso" entra no projeto', async ({ page }) => {
  await mockApi(page, ['iso', 'privacy']);
  const painel = [];
  page.on('request', (r) => { if (new URL(r.url()).pathname.endsWith('/painel')) painel.push(new URL(r.url()).search); });
  await entrar(page);
  const ver = page.getByRole('button', { name: 'Ver situação de Cliente E2E' });
  await expect(ver).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#tenant-name')).toHaveText('Nenhum projeto escolhido');
  expect(painel).toEqual([]);
  const ativo = () => page.evaluate(() => localStorage.getItem('niso_activeProject'));
  expect(await ativo()).toBeNull();
  await ver.click();
  await expect(ver).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('.pn-sit')).toContainText('1 ação corretiva passou do prazo.');
  await expect(page.locator('.pn-sit')).toContainText('2 pedidos do titular atrasados.');
  expect(painel).toEqual(['']);
  await expect(page.locator('#tenant-name')).toHaveText('Nenhum projeto escolhido');
  await expect(page.locator('#content .btn-primary')).toHaveCount(1);
  expect(await ativo()).toBeNull();
  await page.getByRole('button', { name: 'Abrir Cliente E2E no n.iso' }).click();
  await expect(page).toHaveURL(/\/iso$/);
  await expect(page.locator('#tenant-name')).toHaveText('Projeto E2E');
  expect(JSON.parse(await ativo()).id).toBe('proj-e2e');
});

test('cliente: o projeto dele já aberto, "Esperando a sua decisão" em cima, sem lista e sem carteira', async ({ page }) => {
  const cliente = { ...USER, role: 'org_admin', client_project_id: 'proj-e2e' };
  await mockApi(page, ['iso', 'privacy'], { user: cliente, painel: { visao: 'cliente',
    decisoes: [{ id: 'pd1', titulo: 'Aprovar a política', tipo: 'documento', papel: 'ciso', desde: '2026-11-10', acao: 'Ler e aprovar' }] } });
  const carteira = [];
  const paineis = [];
  page.on('request', (r) => {
    const p = new URL(r.url()).pathname;
    if (p === '/api/v1/carteira') carteira.push(r.url());
    if (/^\/api\/v1\/projects\/[^/]+\/painel$/.test(p)) paineis.push(p);
  });
  await entrar(page);
  await expect(page.locator('#pn-dec')).toHaveText('Esperando a sua decisão');
  await expect(page.getByRole('button', { name: 'Ler e aprovar: Aprovar a política' })).toHaveClass(/btn-primary/);
  await expect(page.getByRole('button', { name: 'Abrir Exemplo Logística Integrada S.A. no n.iso' })).toBeVisible();
  await expect(page.locator('[data-action="painelVerSituacao"]')).toHaveCount(0);
  await expect(page.locator('#content .btn-primary')).toHaveCount(1);
  await page.waitForLoadState('networkidle');
  expect(carteira).toEqual([]);
  expect(new Set(paineis)).toEqual(new Set(['/api/v1/projects/proj-e2e/painel']));
});

// O projeto lembrado de uma visita anterior não pode aparecer como ativo no seletor ao recarregar o Início, nem por um instante.
test('recarregar o Início com projeto lembrado: o seletor nunca mostra o nome dele', async ({ page }) => {
  await mockApi(page, ['iso', 'privacy']);
  await page.addInitScript(() => {
    window.__nomes = [];
    new MutationObserver(() => {
      const n = document.getElementById('tenant-name');
      const t = n ? n.textContent : null;
      if (t !== null && window.__nomes[window.__nomes.length - 1] !== t) window.__nomes.push(t);
    }).observe(document, { subtree: true, childList: true, characterData: true });
  });
  await entrar(page);
  await page.getByRole('button', { name: 'Abrir Cliente E2E no n.iso' }).click();
  await expect(page.locator('#tenant-name')).toHaveText('Projeto E2E');
  expect(JSON.parse(await page.evaluate(() => localStorage.getItem('niso_activeProject'))).id).toBe('proj-e2e');
  await page.goto('/login.html');
  await expect(page.getByRole('button', { name: 'Ver situação de Cliente E2E' })).toBeVisible();
  await page.waitForLoadState('networkidle');
  expect(await page.evaluate(() => window.__nomes.filter((n) => n.includes('E2E')))).toEqual([]);
  await expect(page.locator('#tenant-name')).toHaveText('Nenhum projeto escolhido');
  expect(await page.locator('#sidebar-project-select option').evaluateAll((os) => os.map((o) => o.value))).toEqual(['', 'proj-e2e']);
});

// "Ver consultorias" e o rodapé "Conta e acessos (n.360)" levam a `/?tela=`: o menu da conta só aparece depois do boot do papel.
test('platform_admin sem projeto: /?tela=organizacoes abre Consultorias, não o Início', async ({ page }) => {
  await mockApi(page, ['iso'], { user: { ...USER, role: 'platform_admin' } });
  await page.route('**/api/v1/projects', (route) => (route.request().method() === 'GET' ? route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }) : route.fallback()));
  await entrar(page, '/login.html?tela=organizacoes');
  await expect(page.locator('#header-title')).toHaveText('Consultorias');
});
