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
  // Sem lote esperando, a entrada é o Inventário; o catálogo fica na sua aba.
  await expect(page.getByRole('tab', { name: 'Inventário' })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab', { name: 'Catálogo RO-CB.BR.01' }).click();
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
  [`${B}/levantamentos`]: { levantamentos: [{ id: 'lv1', site_id: 's1', tipo: 'entrevista', realizado_em: '2026-11-01', funcao: 'Operador', turno: 'B', documento_titulo: null,
    documento_data: null, notas: '', roteiro: {}, situacao: 'aberto', achados: 0 }] },
  [`${B}/roteiro`]: { perguntas: [
    { id: 'rot-01', ordem: 1, texto: 'Algum equipamento desta sala é acessado de fora da empresa?', item_norma: '4.1.3', entidade_esperada: 'fluxo', tipos_sessao: ['entrevista', 'visita'] },
    { id: 'rot-02', ordem: 2, texto: 'Há pendrive ou notebook pessoal ligado à rede?', item_norma: '4.3.1', entidade_esperada: 'ativo', tipos_sessao: ['entrevista', 'visita'] }] },
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
  // O consultor aprova e há um lote de outra pessoa em revisão: a entrada é a Coleta, e as abas dizem o que espera.
  await expect(page.getByRole('tab', { name: 'Coleta · 1 em revisão' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tab', { name: 'Levantamento · 1 aberto' })).toBeVisible();
  await page.getByRole('tab', { name: 'Catálogo RO-CB.BR.01' }).click();
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

  await page.getByRole('tab', { name: 'Levantamento' }).click();
  await expect(conteudo).toContainText('Entrevista');
  await expect(conteudo).toContainText('Operador · turno B');

  await page.getByRole('tab', { name: 'Saídas' }).click();
  await expect(conteudo).toContainText('Não atende');
  await expect(conteudo).toContainText('Sem evidência');
  const texto = (await conteudo.textContent()).replace(/Não atende/g, '');
  expect(texto).not.toMatch(/\batende\b|conforme/i);
  await expect(page.getByRole('button', { name: 'Exportar CSV' })).toBeVisible();
});

// Spec do Levantamento §9: abrir a sessão, registrar um achado e enviá-lo ao lote; o POST de envio leva só os ids marcados
// e a tela vai ao lote criado na Coleta. API mockada com estado (o achado registrado volta no GET seguinte).
test('levantamento: abre a sessão, registra um achado e envia ao lote, que abre na Coleta', async ({ page }) => {
  await mockApi(page, ['iso', 'ot'], ['iso', 'ot']);
  const LV = { ...ABAS_OT[`${B}/levantamentos`].levantamentos[0] };
  const achados = [];
  let criado, envio;
  await page.route(`**${B}/**`, async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const json = (o, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(o) });
    const chave = `${req.method()} ${path}`;
    if (chave === `GET ${B}/levantamentos/lv1`) return json({ levantamento: LV, achados });
    if (chave === `POST ${B}/levantamentos/lv1/achados`) {
      criado = req.postDataJSON();
      const id = `ach${achados.length + 1}`;
      // O fluxo externo do RTU-01 já está no inventário sem VPN: dito "via VPN" na entrevista, contradiz.
      achados.push({ id, levantamento_id: 'lv1', entidade: criado.entidade, pergunta_id: criado.pergunta_id ?? null, origem: 'consultor', situacao: 'rascunho', lote_id: null,
        evidencia: criado.evidencia, erros: [], dados: criado.dados, confronto: criado.entidade === 'fluxo' ? 'contradiz' : 'novo', alvo_id: criado.entidade === 'fluxo' ? 'f1' : null });
      return json({ id, erros: [] }, 201);
    }
    if (chave === `POST ${B}/levantamentos/lv1/enviar`) { envio = req.postDataJSON(); return json({ id: 'lote-lv', itens: 1 }, 201); }
    if (chave === `GET ${B}/lotes/lote-lv`) {
      return json({ lote: { id: 'lote-lv', site_id: 's1', fonte: 'manual', status: 'em_revisao', criado_por: 'u1', created_at: '2026-11-01 10:00:00', motivo: null },
        itens: achados.map((x, n) => ({ id: `i${n + 1}`, linha: n + 1, entidade: x.entidade, dados: x.dados, erros: [], decisao: 'pendente', duplicata_de: null })) });
    }
    if (req.method() === 'GET' && path in ABAS_OT) return json(ABAS_OT[path]);
    return route.fallback();
  });
  await entrar(page);
  await page.locator('#nav-ot').click();
  const conteudo = page.locator('#content');
  await page.getByRole('tab', { name: /^Levantamento/ }).click();
  await page.getByRole('button', { name: 'Abrir Entrevista de 01/11/2026' }).click();
  await expect(conteudo).toContainText('Roteiro');

  await page.getByRole('button', { name: 'Registrar achado' }).click();
  await page.fill('#lev-evidencia', 'notebook pessoal ligado à IHM');
  await page.fill('#ot-f-nome', 'Notebook IHM');
  await page.locator('#modal').getByRole('button', { name: 'Registrar' }).click();
  await expect(conteudo).toContainText('Notebook IHM');
  expect(criado).toMatchObject({ entidade: 'ativo', dados: { nome: 'Notebook IHM' }, evidencia: 'notebook pessoal ligado à IHM' });

  // "Sim" na pergunta de fluxo abre o achado com Fluxo marcado e a pergunta ligada.
  await page.getByRole('row', { name: /acessado de fora da empresa/ }).getByRole('button', { name: 'Sim' }).click();
  await expect(page.getByRole('radio', { name: 'Fluxo' })).toBeChecked();
  await page.getByLabel('Origem').selectOption({ label: 'RTU-01' });
  await page.getByLabel('Destino').selectOption({ label: 'Fora da empresa' });
  await page.getByLabel('Protocolo', { exact: true }).fill('HTTPS');
  await page.getByLabel('Porta', { exact: true }).fill('443');
  await page.getByLabel('Via VPN').check();
  await page.locator('#modal').getByRole('button', { name: 'Registrar' }).click();
  await expect(conteudo).toContainText('RTU-01 → Fora da empresa');
  await expect(conteudo.locator('.badge', { hasText: 'Contradiz' })).toHaveAttribute('title', /de outro jeito/);
  expect(criado).toMatchObject({ entidade: 'fluxo', pergunta_id: 'rot-01', dados: { origem_ativo_id: 'a1', protocolo: 'HTTPS', porta: 443, externo: true, via_vpn: true } });
  expect(criado.dados).not.toHaveProperty('destino_ativo_id');

  await page.getByRole('checkbox', { name: 'Enviar Notebook IHM ao lote' }).check();
  await page.getByRole('checkbox', { name: 'Enviar RTU-01 → Fora da empresa ao lote' }).check();
  await page.locator('#header-actions').getByRole('button', { name: 'Enviar ao lote' }).click();
  await expect(page.locator('.confirmar')).toContainText('1 ativo e 1 fluxo');
  await page.locator('.confirmar').getByRole('button', { name: 'Enviar ao lote' }).click();
  await expect(page.getByRole('tab', { name: /^Coleta/ })).toHaveAttribute('aria-selected', 'true');
  await expect(conteudo).toContainText('Lote de');
  await expect(conteudo).toContainText('Notebook IHM');
  await expect(conteudo).toContainText('Fluxo: RTU-01 → Fora da empresa');
  expect(envio).toEqual({ achados: ['ach1', 'ach2'] });
});
