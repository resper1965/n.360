import { test, expect } from '@playwright/test';
import { servirShell } from './shell.js';

// n.ot: o Início do n.360 oferece "Abrir no n.ot" na linha do projeto só quando a carteira traz o módulo (projeto E pessoa); leva à casca /ot,
// que lista o catálogo RO-CB.BR.01 (GET /projects/:id/ot/requisitos, src/routes/ot.ts). A API é mockada.

const USER = { id: 'u1', email: 'consultor@ness.io', name: 'Consultor', role: 'consultor' };
const REQ = (codigo, titulo, prazo_meses) => ({ id: `ons-${codigo}`, framework: 'ONS-RO-CB.BR.01', codigo, titulo, descricao: null, categoria: null, versao: 'Rev.00', prazo_meses });

async function mockApi(page, modulos, modulosDaPessoa, papel = USER.role) {
  await servirShell(page);
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    const json = (o) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
    const user = { ...USER, role: papel, modulos: modulosDaPessoa };
    if (path === '/api/v1/auth/login') return json({ token: 'e2e-fake-token', user });
    if (path === '/api/v1/auth/me') return json({ user });
    if (path === '/api/v1/projects' && method === 'GET') return json([{ id: 'proj-e2e', client_name: 'Cliente E2E', project_name: 'Projeto E2E', modulos }]);
    if (path === '/api/v1/carteira') return json({ gerado_em: new Date().toISOString(), projetos: [{ id: 'proj-e2e', nome: 'Cliente E2E', modulos: modulos.filter((m) => modulosDaPessoa.includes(m)),
      tom: 'ok', situacao: 'Em dia', urgente: 'Nenhum prazo nos próximos 90 dias', modulo_urgente: 'iso', ultimo_movimento: null }] });
    if (path === '/api/v1/projects/proj-e2e/ot/requisitos') return json({ requisitos: [REQ('4.1.1', 'Segregação em zonas de segurança', 18), REQ('5.1.1', 'Tratamento de exceções', null)] });
    if (path === '/api/v1/projects/proj-e2e/ot/assessment') return json({ resumo: { atende: 0, parcial: 0, nao_atende: 0, nao_se_aplica: 0, nao_avaliado: 2, revisar: 0, a_confirmar: 0 }, itens: [
      { codigo: '4.1.1', titulo: 'Segregação em zonas de segurança', categoria: 'Rede', prazo: '2023-01-09', tipo: 'tecnico', situacao_org: 'nao_avaliado', por_site: [] },
      { codigo: '5.1.1', titulo: 'Tratamento de exceções', categoria: 'Exceções', prazo: null, tipo: 'excecao', situacao: 'nao_avaliado', evidencia: 'Não avaliado neste ciclo' }] });
    return json(method === 'GET' ? [] : { ok: true });
  });
}

async function entrar(page) {
  await page.goto('/login.html');
  await page.fill('#login-email', USER.email);
  await page.fill('#login-password', 'senha-e2e');
  await page.click('#login-submit');
}

// Entra no n.ot pelo endereço depois do login (com o Início já desenhado); o caminho pelo botão da linha é o primeiro teste.
async function abrirOt(page) {
  await expect(page.getByRole('button', { name: 'Ver situação de Cliente E2E' })).toBeVisible();
  await page.goto('/ot');
}

// Navegação nova: menu (Início, Sites, Assessment, Relatórios, Acessos e sondas) e, dentro do site, modo + sub-aba.
async function noSite(page, modo, sub) {
  await page.locator('#nav-ot-sites').click();
  await page.getByRole('button', { name: 'Abrir SE Norte' }).click();
  if (modo === 'operacao') await page.getByRole('tab', { name: 'Modo operação' }).click();
  await page.getByRole('tab', { name: sub, exact: true }).click();
}

test('projeto e pessoa com o n.ot: "Abrir no n.ot" da linha leva a /ot e à lista da RO-CB.BR.01', async ({ page }) => {
  await mockApi(page, ['iso', 'ot'], ['iso', 'ot']);
  await entrar(page);
  const botao = page.getByRole('button', { name: 'Abrir Cliente E2E no n.ot' });
  await expect(botao).toHaveText('Abrir no n.ot');
  await botao.click();
  await expect(page).toHaveURL(/\/ot$/);
  await expect(page).toHaveTitle('n.ot | ness. ARCiber');
  // A entrada é o Início; o catálogo fica no item Assessment do menu.
  await expect(page.locator('#content')).toContainText('Espera por você');
  await page.locator('#nav-ot-assessment').click();
  await expect(page.locator('#content')).toContainText('4.1.1');
  await expect(page.locator('#content')).toContainText('09/01/2023');
  await expect(page.locator('#content')).toContainText('Sem prazo');
});

test('pessoa sem o n.ot (projeto com ele): a linha não oferece o n.ot', async ({ page }) => {
  await mockApi(page, ['iso', 'privacy', 'ot'], ['iso', 'privacy']);
  await entrar(page);
  await expect(page.getByRole('button', { name: 'Abrir Cliente E2E no n.iso' })).toBeVisible();
  await expect(page.getByRole('button', { name: /no n\.ot$/ })).toHaveCount(0);
  await expect(page.locator('#nav-ot')).toHaveCount(0);
});

// N2–N4: as abas da casca /ot sobre os corpos de src/routes/ot.ts e ot-saidas.ts (mockados). Smoke: cada aba desenha o que a
// API devolve, IP/MAC como vieram (mascarados), a violação do fluxo externo sem VPN e os três estados da conformidade.
const B = '/api/v1/projects/proj-e2e/ot';
const ABAS_OT = {
  [`${B}/sites`]: { sites: [{ id: 's1', nome: 'SE Norte', tipo: 'subestacao', criticidade: 'alta', localizacao: null, status: 'ativo' }] },
  [`${B}/sites/s1/situacao`]: { fase: 'em_levantamento', base_pedida_em: null, base_aprovada_em: null, rascunhos: 0, lotes_em_revisao: 1, zonas_4_1_1: false, tem_conteudo: true, proximo_passo: 'revisar', lote_em_revisao_id: null },
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

test('abas do n.ot: inventário mascarado, fluxo sem VPN, lote sem arquivo guardado e saídas sem "atende"', async ({ page }) => {
  await mockApi(page, ['iso', 'ot'], ['iso', 'ot']);
  await page.route(`**${B}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path in ABAS_OT) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ABAS_OT[path]) });
    return route.fallback();
  });
  await entrar(page);
  await abrirOt(page);
  const conteudo = page.locator('#content');
  await page.locator('#nav-ot-assessment').click();
  await expect(conteudo).toContainText('4.1.1');

  await noSite(page, 'projeto', 'Base');
  await expect(conteudo).toContainText('RTU-01');
  await expect(conteudo).toContainText('aa:bb:cc:••:••:••');
  // o único primário da tela é o do cartão Próximo passo; a sub-aba Base fica com os botões comuns
  await expect(page.locator('#content .btn-primary, #header-actions .btn-primary')).toHaveCount(1);
  await expect(page.locator('#content .card .btn-primary')).toHaveText('Abrir Base');
  await expect(page.locator('#header-actions').getByRole('button', { name: '+ Novo ativo' })).toBeVisible();

  await expect(conteudo).toContainText('Fluxo externo sem VPN: viola 4.1.2 e 4.1.3');

  await page.getByRole('tab', { name: 'Revisão e aprovação' }).click();
  await expect(page.locator('#ot-coleta-privacidade')).toContainText('Trazer dados');
  await expect(conteudo).toContainText('Em revisão');

  await page.getByRole('tab', { name: 'Levantamento', exact: true }).click();
  await expect(conteudo).toContainText('Entrevista');
  await expect(conteudo).toContainText('Operador · turno B');

  await page.locator('#nav-ot-relatorios').click();
  await expect(conteudo).toContainText('Não atende');
  await expect(conteudo).toContainText('Sem evidência');
  const texto = (await conteudo.textContent()).replace(/Não atende/g, '');
  expect(texto).not.toMatch(/\batende\b|conforme/i);
  await expect(page.getByRole('button', { name: 'Exportar CSV' })).toBeVisible();
});

// Spec do Levantamento §9: abrir o levantamento, registrar um achado e enviá-lo para aprovação; o POST de envio leva só os ids marcados
// e a tela vai ao lote criado. API mockada com estado (o achado registrado volta no GET seguinte).
test('levantamento: abre o levantamento, registra um achado e envia para aprovação, que abre no lote de aprovação', async ({ page }) => {
  await mockApi(page, ['iso', 'ot'], ['iso', 'ot']);
  const LV = { ...ABAS_OT[`${B}/levantamentos`].levantamentos[0] };
  const achados = [];
  let criado, envio;
  await page.route(`**${B}/**`, async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const json = (o, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(o) });
    const chave = `${req.method()} ${path}`;
    // Nomes das pontas pela própria sessão e pelo lote (nunca via /ativos, que traria IP/MAC).
    const nomes_pontas = { a1: 'RTU-01' };
    if (chave === `GET ${B}/levantamentos/lv1`) return json({ levantamento: LV, achados, nomes_pontas, ativos_do_site: [{ id: 'a1', nome: 'RTU-01' }] });
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
        itens: achados.map((x, n) => ({ id: `i${n + 1}`, linha: n + 1, entidade: x.entidade, dados: x.dados, erros: [], decisao: 'pendente', duplicata_de: null })), nomes_pontas });
    }
    if (req.method() === 'GET' && path in ABAS_OT) return json(ABAS_OT[path]);
    return route.fallback();
  });
  await entrar(page);
  await abrirOt(page);
  const conteudo = page.locator('#content');
  await noSite(page, 'projeto', 'Levantamento');
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
  await expect(page.getByLabel('Externo')).toHaveValue('sim');
  await page.getByLabel('Via VPN').selectOption({ label: 'Sim' });
  await page.locator('#modal').getByRole('button', { name: 'Registrar' }).click();
  await expect(conteudo).toContainText('RTU-01 → Fora da empresa');
  await expect(conteudo.locator('.badge', { hasText: 'Contradiz' })).toHaveAttribute('title', /de outro jeito/);
  expect(criado).toMatchObject({ entidade: 'fluxo', pergunta_id: 'rot-01', dados: { origem_ativo_id: 'a1', protocolo: 'HTTPS', porta: 443, externo: true, via_vpn: true } });
  expect(criado.dados).not.toHaveProperty('destino_ativo_id');

  await page.getByRole('checkbox', { name: 'Enviar Notebook IHM para aprovação' }).check();
  await page.getByRole('checkbox', { name: 'Enviar RTU-01 → Fora da empresa para aprovação' }).check();
  await page.locator('#header-actions').getByRole('button', { name: 'Enviar para aprovação' }).click();
  await expect(page.locator('.confirmar')).toContainText('1 ativo e 1 fluxo');
  await page.locator('.confirmar').getByRole('button', { name: 'Enviar para aprovação' }).click();
  await expect(page.getByRole('tab', { name: 'Revisão e aprovação' })).toHaveAttribute('aria-selected', 'true');
  await expect(conteudo).toContainText('Lote de');
  await expect(conteudo).toContainText('Notebook IHM');
  await expect(conteudo).toContainText('Fluxo: RTU-01 → Fora da empresa');
  expect(envio).toEqual({ achados: ['ach1', 'ach2'] });
});

// L4 (de-para, src/routes/ot-depara.ts): levantamento documento → importar CSV → proposta pelo nome da coluna → criar achados.
// O mesmo arquivo vai nas duas chamadas; o achado sugerido pela IA (origem ia) traz o selo.
test('levantamento documento: importa CSV pelo de-para e os achados aparecem', async ({ page }) => {
  await mockApi(page, ['iso', 'ot'], ['iso', 'ot']);
  const LV = { ...ABAS_OT[`${B}/levantamentos`].levantamentos[0], tipo: 'documento', documento_titulo: 'Inventário 2023', funcao: null, turno: null };
  const achados = [{ id: 'ia1', levantamento_id: 'lv1', entidade: 'ativo', origem: 'ia', situacao: 'rascunho', lote_id: null,
    evidencia: 'O CLP-07 fica no painel 3', erros: [], dados: { nome: 'CLP-07' } }];
  const enviados = [];
  await page.route(`**${B}/**`, async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const json = (o, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(o) });
    const chave = `${req.method()} ${path}`;
    if (chave === `GET ${B}/levantamentos`) return json({ levantamentos: [LV] });
    if (chave === `GET ${B}/levantamentos/lv1`) return json({ levantamento: LV, achados, nomes_pontas: {}, ativos_do_site: [] });
    if (chave === `POST ${B}/levantamentos/lv1/depara/planilha/proposta`) {
      enviados.push(req.postData());
      return json({ cabecalho: ['Hostname', 'Endereço IP', 'Observação'], mapeamento: { 0: 'nome', 1: 'ip' }, origem: 'cabecalho', linhas: 2 });
    }
    if (chave === `POST ${B}/levantamentos/lv1/depara/planilha/aplicar`) {
      enviados.push(req.postData());
      for (const nome of ['RTU-10', 'IHM-02']) achados.push({ id: nome, levantamento_id: 'lv1', entidade: 'ativo', origem: 'consultor', situacao: 'rascunho', lote_id: null,
        evidencia: 'Planilha importada, linha 2', erros: [], dados: { nome, ip: '•••', mascarado: true } });
      return json({ criados: 2, com_aviso: 0 }, 201);
    }
    if (req.method() === 'GET' && path in ABAS_OT) return json(ABAS_OT[path]);
    return route.fallback();
  });
  await entrar(page);
  await abrirOt(page);
  const conteudo = page.locator('#content');
  await noSite(page, 'projeto', 'Levantamento');
  await page.getByRole('button', { name: 'Abrir Documento de 01/11/2026' }).click();
  await expect(conteudo.locator('tr', { hasText: 'CLP-07' }).locator('.badge', { hasText: 'Sugerido pela IA' })).toBeVisible();

  await page.getByRole('button', { name: 'Importar arquivo' }).click();
  await expect(page.locator('#modal')).toContainText('O arquivo é lido e descartado; não fica guardado.');
  await page.getByLabel('Planilha (CSV ou XLSX), documento (TXT ou DOCX) ou resumo de rede (JSON)').setInputFiles({ name: 'inventario.csv', mimeType: 'text/csv',
    buffer: Buffer.from('Hostname,Endereço IP,Observação\nRTU-10,10.0.0.10,x\nIHM-02,10.0.0.11,y\n') });
  await page.locator('#modal').getByRole('button', { name: 'Continuar' }).click();
  await expect(page.locator('#modal')).toContainText('Pelo nome da coluna');
  await expect(page.locator('#modal')).toContainText('2 linhas');
  await expect(page.getByLabel('Campo do n.ot para Hostname')).toHaveValue('nome');
  await expect(page.getByLabel('Campo do n.ot para Observação')).toHaveValue('');
  await page.locator('#modal').getByRole('button', { name: 'Criar achados' }).click();
  await expect(page.locator('body')).toContainText('2 achados criados (0 com aviso)');
  await expect(conteudo).toContainText('RTU-10');
  await expect(conteudo).toContainText('IHM-02');
  expect(enviados).toHaveLength(2);
  for (const corpo of enviados) expect(corpo).toContain('RTU-10,10.0.0.10');
  expect(enviados[1]).toContain('{"0":"nome","1":"ip"}');
});

// L3 (sensor de rede, src/routes/ot-depara.ts POST …/depara/rede): o .json do resumo é conferido na tela, vai inteiro à API e os achados
// voltam com o selo "Sensor de rede" (pela evidência). API mockada.
test('levantamento documento: importa o resumo do sensor de rede e os achados aparecem com o selo', async ({ page }) => {
  await mockApi(page, ['iso', 'ot'], ['iso', 'ot']);
  const LV = { ...ABAS_OT[`${B}/levantamentos`].levantamentos[0], tipo: 'documento', documento_titulo: 'Captura Zeek', funcao: null, turno: null };
  const achados = [];
  const enviados = [];
  const RESUMO = { formato: 'n.ot-resumo-rede/1', gerado_em: '2026-11-04T12:00:00Z', periodo: { inicio: '2026-11-01T00:00:00Z', fim: '2026-11-03T00:00:00Z' },
    ativos: [{ ip: '10.1.1.10', mac: '00:30:a7:01:02:03' }], conexoes: [{ origem: '10.1.1.20', destino: '10.1.1.10', transporte: 'tcp', porta: 20000, aplicacao: 'dnp3', contagem: 5321 }] };
  await page.route(`**${B}/**`, async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const json = (o, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(o) });
    const chave = `${req.method()} ${path}`;
    if (chave === `GET ${B}/levantamentos`) return json({ levantamentos: [LV] });
    if (chave === `GET ${B}/levantamentos/lv1`) return json({ levantamento: LV, achados, nomes_pontas: {}, ativos_do_site: [] });
    if (chave === `POST ${B}/levantamentos/lv1/depara/rede`) {
      enviados.push(req.postData());
      achados.push({ id: 'z1', levantamento_id: 'lv1', entidade: 'ativo', origem: 'consultor', situacao: 'rascunho', lote_id: null,
        evidencia: 'Sensor de rede (Zeek): 5321 conexões entre 01/11 e 03/11', erros: [], dados: { nome: 'Ativo 10.1.1.10', ip: '10.1.1.10' } });
      return json({ ativos_novos: 1, ativos_conhecidos: 0, macs_completados: 0, fluxos_criados: 0, fluxos_pendentes: 1, nao_importados: 0, pendentes_nao_importados: 0 }, 201);
    }
    if (req.method() === 'GET' && path in ABAS_OT) return json(ABAS_OT[path]);
    return route.fallback();
  });
  await entrar(page);
  await abrirOt(page);
  const conteudo = page.locator('#content');
  await noSite(page, 'projeto', 'Levantamento');
  await page.getByRole('button', { name: 'Abrir Documento de 01/11/2026' }).click();

  await page.getByRole('button', { name: 'Importar arquivo' }).click();
  await page.getByLabel('Planilha (CSV ou XLSX), documento (TXT ou DOCX) ou resumo de rede (JSON)').setInputFiles({ name: 'resumo.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(RESUMO)) });
  await page.locator('#modal').getByRole('button', { name: 'Continuar' }).click();
  await expect(page.locator('#modal')).toContainText('IP e MAC entram cifrados; o arquivo não fica guardado.');
  await expect(page.locator('#modal')).toContainText('1 ativo e 1 conexão no resumo.');
  await page.locator('#modal').getByRole('button', { name: 'Criar achados' }).click();
  await expect(page.locator('body')).toContainText('1 ativo novo');
  await expect(page.locator('body')).toContainText('1 fluxo aguardando ativo');
  await expect(conteudo.locator('tr', { hasText: 'Ativo 10.1.1.10' }).locator('.badge', { hasText: 'Sensor de rede' })).toBeVisible();
  expect(enviados).toHaveLength(1);
  expect(enviados[0]).toContain('"formato":"n.ot-resumo-rede/1"');
});

// L5: o cartão "Agente de coleta" em Acessos e sondas. O gestor liga (com a confirmação do aviso do modelo); o consultor emite a chave,
// que aparece uma vez no modal com o comando do Claude Code e some do DOM ao fechar. API mockada.
const ENDPOINT = 'https://app.example/ot-coleta/mcp';
async function rotasAgente(page, agente, extra = {}) {
  const puts = [];
  await page.route(`**${B}/**`, async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const json = (o, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(o) });
    const chave = `${req.method()} ${path}`;
    if (chave === `GET ${B}/agente`) return json(agente);
    if (chave === `PUT ${B}/agente`) { puts.push(req.postDataJSON()); agente.ligado = req.postDataJSON().ligado; return json({ ligado: agente.ligado }); }
    if (chave in extra) return json(...extra[chave]());
    if (req.method() === 'GET' && path in ABAS_OT) return json(ABAS_OT[path]);
    if (chave === `GET ${B}/acessos`) return json({ acessos: [] });
    return route.fallback();
  });
  return puts;
}

test('agente de coleta: o gestor liga depois de confirmar o aviso do modelo', async ({ page }) => {
  await mockApi(page, ['iso', 'ot'], ['iso', 'ot'], 'org_admin');
  const puts = await rotasAgente(page, { ligado: false, pode_ligar: true, pode_emitir: true, endpoint: ENDPOINT }, { [`GET ${B}/agente/chaves`]: () => [{ chaves: [] }] });
  await entrar(page);
  await abrirOt(page);
  await page.locator('#nav-ot-acessos').click();
  const cartao = page.locator('#ot-agente');
  await expect(cartao).toContainText('Um agente externo (Claude Code, Cursor)');
  const sw = cartao.getByRole('switch', { name: 'Agente de coleta' });
  await expect(sw).toHaveAttribute('aria-checked', 'false');
  await sw.click();
  await expect(page.getByRole('alertdialog')).toContainText('Os arquivos passam pelo modelo do agente antes de chegar ao n.ot, sem a máscara do n.ot.');
  await page.getByRole('alertdialog').getByRole('button', { name: 'Ligar' }).click();
  await expect(sw).toHaveAttribute('aria-checked', 'true');
  expect(puts).toEqual([{ ligado: true }]);
});

test('agente de coleta: o consultor emite a chave e a vê uma vez no modal', async ({ page }) => {
  await mockApi(page, ['iso', 'ot'], ['iso', 'ot']);
  const chaves = [{ id: 'k1', nome: 'Notebook da Ana', status: 'Active', expira_em: '2026-11-11T10:00:00.000Z', ultimo_uso: '2026-11-04T09:12:00.000Z' },
    { id: 'k0', nome: 'Coleta de outubro', status: 'Revoked', expira_em: '2026-10-20T10:00:00.000Z', ultimo_uso: null }];
  const posts = [];
  await rotasAgente(page, { ligado: true, pode_ligar: false, pode_emitir: true, endpoint: ENDPOINT }, {
    [`GET ${B}/agente/chaves`]: () => [{ chaves }],
    [`POST ${B}/agente/chaves`]: () => {
      posts.push(1);
      chaves.unshift({ id: 'k2', nome: 'Notebook do Rui', status: 'Active', expira_em: '2026-11-11T10:00:00.000Z', ultimo_uso: null });
      return [{ id: 'k2', chave: 'n360_ot_e2e_SEGREDO', expira_em: '2026-11-11T10:00:00.000Z' }, 201];
    },
  });
  await entrar(page);
  await abrirOt(page);
  await page.locator('#nav-ot-acessos').click();
  const cartao = page.locator('#ot-agente');
  await expect(cartao).toContainText('Ligado');
  await expect(cartao.getByRole('switch')).toHaveCount(0);
  await expect(cartao).toContainText('Notebook da Ana');
  await cartao.scrollIntoViewIfNeeded();

  await cartao.getByRole('button', { name: 'Emitir chave' }).click();
  await page.getByLabel('Nome').fill('Notebook do Rui');
  await expect(page.getByLabel('Validade (dias)')).toHaveValue('7');
  await page.locator('#modal').getByRole('button', { name: 'Emitir' }).click();
  const modal = page.locator('#modal');
  await expect(modal).toContainText('Guarde agora: ela não aparece de novo');
  await expect(page.getByRole('textbox', { name: 'Chave' })).toHaveValue('n360_ot_e2e_SEGREDO');
  await expect(modal).toContainText(`claude mcp add --transport http n-ot-coleta ${ENDPOINT} --header "Authorization: Bearer n360_ot_e2e_SEGREDO"`);
  await modal.locator('.acoes-rodape').getByRole('button', { name: 'Fechar' }).click();
  await expect(cartao).toContainText('Notebook do Rui');
  expect(await page.content()).not.toContain('n360_ot_e2e_SEGREDO');
  expect(posts).toHaveLength(1);
});

// Sonda com envio automático: a área "Sondas" em Acessos e sondas (credencial uma vez) e o cartão de saúde em Saúde da coleta do site. API mockada.
test('sondas: o consultor cria a sonda, vê a credencial uma vez e o cartão de saúde aparece', async ({ page }) => {
  await mockApi(page, ['iso', 'ot'], ['iso', 'ot']);
  const sensores = [];
  const posts = [];
  await page.route(`**${B}/**`, async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const json = (o, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(o) });
    const chave = `${req.method()} ${path}`;
    if (chave === `GET ${B}/sites/s1/sensores`) return json({ sensores });
    if (chave === `GET ${B}/sensores/pontos`) return json({ ativos: 3, fluxos: 1 });
    if (chave === `POST ${B}/sites/s1/sensores`) {
      posts.push(req.postDataJSON());
      sensores.push({ id: 'z1', nome: 'Sonda do barramento', faixa_origem: '203.0.113.0/24', situacao: 'ativa', saude: 'em_dia', ultimo_envio: new Date(Date.now() - 2 * 3600000).toISOString(),
        capture_loss: 1.2, vencendo: false, credenciais: [{ id: 'c1', expira_em: new Date(Date.now() + 365 * 86400000).toISOString(), situacao: 'ativa' }] });
      return json({ sensor: { id: 'z1' }, credencial: 'ots_e2e_SEGREDO', expira_em: new Date(Date.now() + 365 * 86400000).toISOString(), conf: '# /etc/n-ot-sonda.conf\ncredencial = ots_e2e_SEGREDO\n' }, 201);
    }
    if (chave === `GET ${B}/agente`) return json({ error: 'Forbidden' }, 403);
    if (req.method() === 'GET' && path in ABAS_OT) return json(ABAS_OT[path]);
    if (chave === `GET ${B}/acessos`) return json({ acessos: [] });
    return route.fallback();
  });
  await entrar(page);
  await abrirOt(page);
  await page.locator('#nav-ot-acessos').click();
  const area = page.locator('#ot-sondas');
  await expect(area).toContainText('Nenhuma sonda neste site.');
  await area.getByRole('button', { name: 'Nova sonda em SE Norte' }).click();
  await page.getByLabel('Nome').fill('Sonda do barramento');
  await page.getByLabel('Faixa de origem').fill('203.0.113.0/24');
  await page.locator('#modal').getByRole('button', { name: 'Criar sonda' }).click();
  const modal = page.locator('#modal');
  await expect(modal).toContainText('não será mostrada de novo');
  await expect(page.getByRole('textbox', { name: 'Credencial' })).toHaveValue('ots_e2e_SEGREDO');
  await modal.locator('.acoes-rodape').getByRole('button', { name: 'Fechar' }).click();
  await expect(area).toContainText('Sonda do barramento');
  await expect(area).toContainText('Em dia');
  expect(posts).toEqual([{ nome: 'Sonda do barramento', faixa_origem: '203.0.113.0/24' }]);

  // Recarregar: a credencial não volta.
  await page.reload();
  await page.locator('#nav-ot-acessos').click();
  await expect(page.locator('#ot-sondas')).toContainText('Sonda do barramento');
  expect(await page.content()).not.toContain('ots_e2e_SEGREDO');

  await noSite(page, 'operacao', 'Saúde da coleta');
  await expect(page.locator('#ot-cartoes-coleta')).toContainText('Saúde da coleta');
  await expect(page.locator('#ot-cartoes-coleta')).toContainText('1 de 1');
  await expect(page.locator('#ot-cartoes-coleta')).toContainText('Último resumo há 2 h');

  // Os pontos que a sonda trouxe seguem no topo do Levantamento (Modo projeto).
  await noSite(page, 'projeto', 'Levantamento');
  await expect(page.locator('#ot-cartoes-coleta')).toContainText('Achados da sonda para revisar');
  await expect(page.locator('#ot-cartoes-coleta')).toContainText('3 ativos');
});

// Desvios (spec n-ot-desvio §5): listar, tratar (nota obrigatória) e aceitar (só o Gestor ARCiber). API mockada com estado.
test('desvios: o gestor lista, trata com nota e aceita com prazo', async ({ page }) => {
  await mockApi(page, ['iso', 'ot'], ['iso', 'ot'], 'org_admin');
  const desvio = (id, ativo) => ({ id, site_id: 's1', site_nome: 'SE Norte', tipo: 'fluxo', situacao: 'aberto', protocolo: 'modbus', porta: 502, externo: false,
    origem: { ativo, zona: 'Supervisão' }, destino: { ativo: 'Historiador', zona: 'DMZ' }, primeira_vez: '2026-11-01T10:00:00Z', ultima_vez: '2026-11-08T10:00:00Z', ocorrencias: 3, aceito_ate: null, nota: null, achado_id: null });
  const abertos = [desvio('d1', 'CLP-01'), desvio('d2', 'CLP-02')];
  const posts = [];
  await page.route(`**${B}/**`, async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const json = (o) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
    if (req.method() === 'GET' && path === `${B}/desvios`) return json(new URL(req.url()).searchParams.get('contagem') ? { total: abertos.length } : { desvios: abertos });
    if (req.method() === 'GET' && path === `${B}/sites`) return json({ sites: [{ id: 's1', nome: 'SE Norte' }] });
    const m = path.match(/\/desvios\/(d\d)\/(tratar|aceitar)$/);
    if (req.method() === 'POST' && m) {
      posts.push([m[2], req.postDataJSON()]);
      abertos.splice(abertos.findIndex((d) => d.id === m[1]), 1);
      return json({ ok: true });
    }
    if (req.method() === 'GET' && /\/(lotes|levantamentos|acessos)$/.test(path)) return json({ lotes: [], levantamentos: [], acessos: [] });
    return route.fallback();
  });
  await entrar(page);
  await abrirOt(page);
  await noSite(page, 'operacao', 'Desvios');
  const conteudo = page.locator('#content');
  await expect(conteudo).toContainText('CLP-01');
  await expect(conteudo).toContainText('modbus:502');
  await page.getByRole('button', { name: 'Tratar Fluxo em SE Norte' }).first().click();
  await page.getByRole('button', { name: 'Tratar', exact: true }).click(); // sem nota: não envia
  expect(posts).toEqual([]);
  await page.getByLabel('Nota').fill('Regra de firewall criada');
  await page.getByRole('button', { name: 'Tratar', exact: true }).click();
  await expect(conteudo).not.toContainText('CLP-01');
  await page.getByRole('button', { name: /Aceitar temporariamente Fluxo/ }).click();
  await expect(page.locator('#modal-content')).toContainText('Não substitui a exceção formal 5.1.1');
  await page.getByLabel('Justificativa').fill('Janela de manutenção');
  await page.locator('#des-ate').fill(await page.locator('#des-ate').getAttribute('max'));
  await page.getByRole('button', { name: 'Aceitar', exact: true }).click();
  await expect(conteudo).not.toContainText('CLP-02');
  expect(posts.map((p) => p[0])).toEqual(['tratar', 'aceitar']);
  expect(posts[0][1]).toEqual({ nota: 'Regra de firewall criada' });
});

// Fluidez E1: o Início mostra o que espera pela pessoa, e o botão da linha abre o site direto no lote.
test('início: o gestor vê o lote de aprovação de outra pessoa e o botão abre o site no lote', async ({ page }) => {
  await mockApi(page, ['iso', 'ot'], ['iso', 'ot'], 'org_admin');
  await page.route(`**${B}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    const json = (o) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
    if (path === `${B}/lotes/l1`) return json({ lote: ABAS_OT[`${B}/lotes`].lotes[0], itens: [], nomes_pontas: {} });
    if (path in ABAS_OT) return json(ABAS_OT[path]);
    return route.fallback();
  });
  await entrar(page);
  await abrirOt(page);
  const conteudo = page.locator('#content');
  await expect(conteudo).toContainText('Espera por você');
  await expect(conteudo).toContainText('Lote de aprovação em SE Norte');
  await page.getByRole('button', { name: 'Abrir lote' }).click();
  await expect(page.getByRole('heading', { name: 'SE Norte' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Revisão e aprovação' })).toHaveAttribute('aria-selected', 'true');
  await expect(conteudo).toContainText('Lote de planilha · SE Norte'); // o lote l1 do mock, aberto por otIrParaLote
  await expect(conteudo).toContainText('Em revisão');
});

// Deep link /ot/desvios/<id>: abre o site do desvio, em Modo operação, na sub-aba Desvios, com a linha marcada.
test('deep link: /ot/desvios/<id> abre o site, em operação, nos Desvios, com a linha marcada', async ({ page }) => {
  await mockApi(page, ['iso', 'ot'], ['iso', 'ot'], 'org_admin');
  const desvio = (id, ativo) => ({ id, site_id: 's1', site_nome: 'SE Norte', tipo: 'fluxo', situacao: 'aberto', protocolo: 'modbus', porta: 502, externo: false,
    origem: { ativo, zona: 'Supervisão' }, destino: { ativo: 'Historiador', zona: 'DMZ' }, primeira_vez: '2026-11-01T10:00:00Z', ultima_vez: '2026-11-08T10:00:00Z', ocorrencias: 3, aceito_ate: null, nota: null, achado_id: null });
  await page.route(`**${B}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    const json = (o) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
    if (path === `${B}/desvios`) return json({ desvios: [desvio('d0', 'CLP-00'), desvio('d1', 'CLP-01')] });
    if (path in ABAS_OT) return json(ABAS_OT[path]);
    return route.fallback();
  });
  await entrar(page);
  await expect(page.getByRole('button', { name: 'Ver situação de Cliente E2E' })).toBeVisible();
  await page.goto('/ot/desvios/d1');
  await expect(page.getByRole('tab', { name: 'Modo operação' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tab', { name: 'Desvios', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('tbody tr[aria-current="true"]')).toContainText('CLP-01');
  await expect(page.locator('tbody tr[aria-current="true"]')).toHaveCount(1);
  await expect(page).toHaveURL(/modo=operacao/);
});

// Fluidez E2: na Revisão e aprovação do site, marcar achados de levantamentos diferentes e enviar de uma vez; o lote abre.
test('revisão: marca achados de dois levantamentos, envia para aprovação e o lote abre', async ({ page }) => {
  await mockApi(page, ['iso', 'ot'], ['iso', 'ot']);
  const fila = [
    { id: 'r1', levantamento_id: 'lv1', levantamento_tipo: 'entrevista', levantamento_data: '2026-11-01', entidade: 'ativo', origem: 'consultor', situacao: 'rascunho', evidencia: 'visto na sala', dados: { nome: 'Notebook IHM' }, desfecho: null },
    { id: 'r2', levantamento_id: 'lv2', levantamento_tipo: 'visita', levantamento_data: '2026-11-03', entidade: 'ativo', origem: 'ia', situacao: 'rascunho', evidencia: 'planilha', dados: { nome: 'Câmera CFTV' }, desfecho: null }];
  let envio;
  await page.route(`**${B}/**`, async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const json = (o, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(o) });
    const chave = `${req.method()} ${path}`;
    if (chave === `GET ${B}/achados`) return json({ achados: fila, nomes_pontas: {} });
    if (chave === `POST ${B}/sites/s1/enviar`) { envio = req.postDataJSON(); return json({ id: 'lote-rev', itens: 2 }, 201); }
    if (chave === `GET ${B}/lotes/lote-rev`) {
      return json({ lote: { id: 'lote-rev', site_id: 's1', fonte: 'manual', status: 'em_revisao', criado_por: 'u1', created_at: '2026-11-11 10:00:00', motivo: null },
        itens: fila.map((x, n) => ({ id: `i${n + 1}`, linha: n + 1, entidade: x.entidade, dados: x.dados, erros: [], decisao: 'pendente', duplicata_de: null })), nomes_pontas: {} });
    }
    if (req.method() === 'GET' && path in ABAS_OT) return json(ABAS_OT[path]);
    return route.fallback();
  });
  await entrar(page);
  await abrirOt(page);
  const conteudo = page.locator('#content');
  await noSite(page, 'projeto', 'Revisão e aprovação');
  await expect(conteudo).toContainText('Notebook IHM');
  await expect(conteudo).toContainText('Câmera CFTV');
  await expect(page.getByRole('button', { name: 'Enviar para aprovação (0)' })).toBeDisabled();
  await page.getByRole('checkbox', { name: 'Enviar Notebook IHM para aprovação' }).check();
  await page.getByRole('checkbox', { name: 'Enviar Câmera CFTV para aprovação' }).check();
  await page.getByRole('button', { name: 'Enviar para aprovação (2)' }).click();
  await expect(page.locator('.confirmar')).toContainText('Enviar 2 achados para aprovação?');
  await page.locator('.confirmar').getByRole('button', { name: 'Enviar para aprovação' }).click();
  await expect(conteudo).toContainText('Notebook IHM');
  await expect(conteudo).toContainText('Lote de');
  expect(envio).toEqual({ achados: ['r1', 'r2'] });
});

// Fluidez E2: o gestor recusa um item com motivo, aprova os restantes e o lote conclui; o levantamento mostra o desfecho de cada achado.
test('decisão: o gestor recusa um item com motivo, aprova o restante e o levantamento mostra o desfecho', async ({ page }) => {
  await mockApi(page, ['iso', 'ot'], ['iso', 'ot'], 'org_admin');
  const LV = { ...ABAS_OT[`${B}/levantamentos`].levantamentos[0] };
  const lote = { id: 'lote-d', site_id: 's1', fonte: 'manual', status: 'em_revisao', criado_por: 'u-tec', created_at: new Date().toISOString().slice(0, 19).replace('T', ' '), motivo: null };
  const itens = [{ id: 'i1', linha: 1, entidade: 'ativo', dados: { nome: 'Notebook IHM' }, erros: [], decisao: 'pendente', duplicata_de: null, motivo: null },
    { id: 'i2', linha: 2, entidade: 'ativo', dados: { nome: 'Câmera CFTV' }, erros: [], decisao: 'pendente', duplicata_de: null, motivo: null }];
  const achados = [{ id: 'a1', levantamento_id: 'lv1', entidade: 'ativo', origem: 'consultor', situacao: 'enviado', lote_id: 'lote-d', evidencia: 'e1', erros: [], dados: { nome: 'Notebook IHM' }, desfecho: null },
    { id: 'a2', levantamento_id: 'lv1', entidade: 'ativo', origem: 'consultor', situacao: 'enviado', lote_id: 'lote-d', evidencia: 'e2', erros: [], dados: { nome: 'Câmera CFTV' }, desfecho: null }];
  let recusa, aprovado = false;
  await page.route(`**${B}/**`, async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const json = (o, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(o) });
    const chave = `${req.method()} ${path}`;
    if (chave === `GET ${B}/achados`) return json({ achados: [], nomes_pontas: {} });
    if (chave === `GET ${B}/lotes`) return json({ lotes: [{ ...lote, itens: 2, com_erro: 0, gravados: itens.filter((i) => i.decisao === 'gravado').length }] });
    if (chave === `GET ${B}/lotes/lote-d`) return json({ lote, itens, nomes_pontas: {} });
    if (chave === `POST ${B}/lotes/lote-d/itens/i1/recusar`) {
      recusa = req.postDataJSON();
      itens[0] = { ...itens[0], decisao: 'recusado', motivo: recusa.motivo };
      achados[0] = { ...achados[0], desfecho: 'recusado', motivo: recusa.motivo };
      return json({ ok: true });
    }
    if (chave === `POST ${B}/lotes/lote-d/aprovar`) {
      aprovado = true;
      lote.status = 'concluido';
      itens[1] = { ...itens[1], decisao: 'gravado' };
      achados[1] = { ...achados[1], desfecho: 'no_inventario', registro_id: 'a9' };
      return json({ criados: 1, atualizados: 0, recusados: 1, fluxos_pendentes_resolvidos: 0 });
    }
    if (chave === `GET ${B}/levantamentos/lv1`) return json({ levantamento: LV, achados, nomes_pontas: {}, ativos_do_site: [] });
    if (req.method() === 'GET' && path in ABAS_OT) return json(ABAS_OT[path]);
    return route.fallback();
  });
  await entrar(page);
  await abrirOt(page);
  const conteudo = page.locator('#content');
  await noSite(page, 'projeto', 'Revisão e aprovação');
  await page.getByRole('button', { name: /^Revisar lote/ }).click();
  await expect(conteudo).toContainText('Decidir até');
  await expect(page.getByRole('button', { name: 'Aprovar lote' })).toBeVisible();

  await page.getByRole('button', { name: 'Recusar a linha 1' }).click();
  await page.locator('.confirmar input, .confirmar textarea').first().fill('Equipamento pessoal, fora do escopo');
  await page.locator('.confirmar').getByRole('button', { name: 'Recusar', exact: true }).click();
  expect(recusa).toEqual({ motivo: 'Equipamento pessoal, fora do escopo' });
  await expect(conteudo).toContainText('Equipamento pessoal, fora do escopo');
  await page.getByRole('button', { name: 'Aprovar os restantes (1)' }).click();
  await page.locator('.confirmar').getByRole('button', { name: 'Aprovar', exact: true }).click();
  await expect.poll(() => aprovado).toBe(true);
  await expect(page.getByRole('button', { name: /^Aprovar/ })).toHaveCount(0);
  await expect(conteudo).toContainText('Concluído');

  await page.getByRole('tab', { name: 'Levantamento', exact: true }).click();
  await page.getByRole('button', { name: 'Abrir Entrevista de 01/11/2026' }).click();
  await expect(conteudo).toContainText('Recusado: Equipamento pessoal, fora do escopo');
  await expect(conteudo).toContainText('No inventário');
});

// Fluidez E3: a base do site. O consultor pede a aprovação; o Gestor aprova com a declaração e o site passa a "Em operação".
test('base: o consultor pede a aprovação e o gestor aprova; o site abre no Modo operação', async ({ page }) => {
  let papel = 'consultor';
  const sit = { ...ABAS_OT[`${B}/sites/s1/situacao`], lotes_em_revisao: 0, zonas_4_1_1: true, proximo_passo: 'pedir_base' };
  const posts = [];
  await mockApi(page, ['iso', 'ot'], ['iso', 'ot']);
  await page.route(`**${B}/**`, async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const json = (o) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
    if (req.method() === 'POST' && /\/sites\/s1\/base\/(pedir|aprovar)$/.test(path)) {
      const acao = path.split('/').pop();
      posts.push([acao, req.postDataJSON()]);
      if (acao === 'pedir') Object.assign(sit, { fase: 'base_em_aprovacao', proximo_passo: 'aguardar_base' });
      else Object.assign(sit, { fase: 'em_operacao', proximo_passo: 'em_operacao', base_aprovada_em: '2026-11-12 10:00:00' });
      return json({ ok: true });
    }
    if (path === `${B}/sites/s1/situacao`) return json(sit);
    if (path in ABAS_OT) return json(ABAS_OT[path]);
    return route.fallback();
  });
  await entrar(page);
  await abrirOt(page);
  await page.locator('#nav-ot-sites').click();
  await page.getByRole('button', { name: 'Abrir SE Norte' }).click();
  const conteudo = page.locator('#content');
  await expect(conteudo).toContainText('Tudo aprovado: peça a aprovação da base');
  await page.getByRole('button', { name: 'Pedir aprovação da base' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Pedir aprovação' }).click();
  await expect(conteudo).toContainText('Aguardando o Gestor aprovar a base');
  expect(posts).toEqual([['pedir', {}]]);
  // o Gestor entra com a mesma API e aprova
  papel = 'org_admin';
  await page.route('**/api/v1/auth/me', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: { ...USER, role: papel, modulos: ['iso', 'ot'] } }) }));
  await page.reload(); // a URL já é a do site
  await page.getByRole('button', { name: 'Aprovar a base' }).click();
  await expect(page.getByRole('alertdialog')).toContainText('Confirmo que este inventário representa o site.');
  await page.getByRole('alertdialog').getByRole('button', { name: 'Aprovar a base' }).click();
  await expect(conteudo).toContainText('Em operação');
  await expect(page.getByRole('tab', { name: 'Modo operação' })).toHaveAttribute('aria-selected', 'true');
  expect(posts[1]).toEqual(['aprovar', { declaracao: true }]);
});

// O técnico (org_user) no site concedido: traz dados e abre levantamento, mas não pede a aprovação da base.
test('técnico: vê "Trazer dados" e "Novo levantamento" e não vê "Pedir aprovação da base"', async ({ page }) => {
  await mockApi(page, ['iso', 'ot'], ['iso', 'ot'], 'org_user');
  await page.route(`**${B}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === `${B}/sites/s1/situacao`) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...ABAS_OT[path], lotes_em_revisao: 0, zonas_4_1_1: true, proximo_passo: 'pedir_base' }) });
    if (path in ABAS_OT) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ABAS_OT[path]) });
    return route.fallback();
  });
  await entrar(page);
  await abrirOt(page);
  await noSite(page, 'projeto', 'Levantamento');
  await expect(page.getByRole('button', { name: 'Trazer dados' })).toBeVisible();
  await expect(page.getByRole('button', { name: '+ Novo levantamento' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pedir aprovação da base' })).toHaveCount(0);
});

// Fluidez E4: o Gestor abre a obra no site em operação; o selo aparece e "Renovar obra" fica disponível.
test('obra: o gestor abre a obra, o selo aparece e Renovar obra fica disponível', async ({ page }) => {
  await mockApi(page, ['iso', 'ot'], ['iso', 'ot'], 'org_admin');
  const sit = { ...ABAS_OT[`${B}/sites/s1/situacao`], fase: 'em_operacao', lotes_em_revisao: 0, zonas_4_1_1: true, proximo_passo: 'em_operacao', obra: null, revalidar_em: null };
  const posts = [];
  await page.route(`**${B}/**`, async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const json = (o) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
    if (req.method() === 'POST' && path === `${B}/sites/s1/obra/abrir`) {
      posts.push(req.postDataJSON());
      Object.assign(sit, { fase: 'em_obra', obra: { ate: req.postDataJSON().ate, renovada: false, justificativa: req.postDataJSON().justificativa } });
      return json({ ok: true });
    }
    if (path === `${B}/sites/s1/situacao`) return json(sit);
    if (path === `${B}/desvios`) return json({ desvios: [] });
    if (path in ABAS_OT) return json(ABAS_OT[path]);
    return route.fallback();
  });
  await entrar(page);
  await abrirOt(page);
  await page.locator('#nav-ot-sites').click();
  await page.getByRole('button', { name: 'Abrir SE Norte' }).click();
  await expect(page.getByRole('button', { name: 'Renovar obra' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Abrir obra' }).click();
  await page.getByLabel('Justificativa').fill('Troca do painel de controle');
  await page.getByLabel('Fim da obra').fill(await page.locator('#obra-ate').getAttribute('max'));
  await page.locator('#modal-content').getByRole('button', { name: 'Abrir obra' }).click();
  await expect(page.locator('#content')).toContainText('Obra em andamento até');
  await expect(page.getByRole('button', { name: 'Renovar obra' })).toBeVisible();
  expect(posts).toHaveLength(1);
  expect(posts[0].justificativa).toBe('Troca do painel de controle');
});

// Fluidez E4: desvio aberto com achado de origem. Regularizar confirma, envia o achado e abre o lote.
test('desvios: Regularizar envia o achado do desvio e abre o lote', async ({ page }) => {
  await mockApi(page, ['iso', 'ot'], ['iso', 'ot'], 'org_admin');
  const desvio = { id: 'd1', site_id: 's1', site_nome: 'SE Norte', tipo: 'fluxo', situacao: 'aberto', protocolo: 'modbus', porta: 502, externo: false,
    origem: { ativo: 'CLP-01', zona: 'Supervisão' }, destino: { ativo: 'Historiador', zona: 'DMZ' }, primeira_vez: '2026-11-01T10:00:00Z', ultima_vez: '2026-11-08T10:00:00Z', ocorrencias: 3, aceito_ate: null, nota: null, achado_id: 'ach1' };
  const posts = [];
  await page.route(`**${B}/**`, async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const json = (o) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
    if (req.method() === 'POST' && path === `${B}/sites/s1/enviar`) { posts.push(req.postDataJSON()); return json({ id: 'l1' }); }
    if (path === `${B}/lotes/l1`) return json({ lote: ABAS_OT[`${B}/lotes`].lotes[0], itens: [], nomes_pontas: {} });
    if (path === `${B}/desvios`) return json(new URL(req.url()).searchParams.get('contagem') ? { total: 1 } : { desvios: [desvio] });
    if (path in ABAS_OT) return json(ABAS_OT[path]);
    return route.fallback();
  });
  await entrar(page);
  await abrirOt(page);
  await noSite(page, 'operacao', 'Desvios');
  await page.getByRole('button', { name: /Regularizar Fluxo/ }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Regularizar' }).click();
  await expect(page.getByRole('tab', { name: 'Revisão e aprovação' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#content')).toContainText('Lote de planilha · SE Norte');
  expect(posts).toEqual([{ achados: ['ach1'] }]);
});

// Fluidez E5: o consultor avalia um item de política; o Gestor ARCiber o vê "A confirmar" e confirma. API mockada com estado.
test('assessment: o consultor preenche um item de política e o gestor o vê "A confirmar" e confirma', async ({ page }) => {
  let papel = 'consultor';
  let avaliacao = null;
  const envios = [];
  await mockApi(page, ['iso', 'ot'], ['iso', 'ot']);
  await page.route(`**${B}/assessment**`, async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const json = (o) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
    if (req.method() === 'PUT' && path === `${B}/assessment/4.2.1`) {
      const corpo = req.postDataJSON();
      envios.push(['PUT', corpo]);
      avaliacao = { ...corpo, confirmado: false, responsavel_nome: null, updated_at: '2026-11-12 13:00:00.123' };
      return json({ ok: true });
    }
    if (req.method() === 'POST' && path === `${B}/assessment/4.2.1/confirmar`) {
      envios.push(['confirmar', req.postDataJSON()]);
      avaliacao = { ...avaliacao, confirmado: true, confirmado_por_nome: 'Gestor', confirmado_em: '2026-11-12' };
      return json({ ok: true });
    }
    const conf = avaliacao && avaliacao.confirmado ? 0 : avaliacao ? 1 : 0;
    return json({ resumo: { atende: 0, parcial: avaliacao ? 1 : 0, nao_atende: 0, nao_se_aplica: 0, nao_avaliado: avaliacao ? 0 : 1, revisar: 0, a_confirmar: conf },
      itens: [{ codigo: '4.2.1', titulo: 'Gestor e suplente designados', categoria: 'Governança', prazo: null, tipo: 'politica', avaliacao, evidencias: [], subsidio: [] }] });
  });
  await entrar(page);
  await abrirOt(page);
  await page.locator('#nav-ot-assessment').click();
  const conteudo = page.locator('#content');
  await expect(conteudo).toContainText('4.2.1');
  await page.getByRole('button', { name: 'Abrir 4.2.1' }).click();
  await page.locator('#ass-sit').selectOption('parcial');
  await page.fill('#ass-just', 'Suplente ainda não designado formalmente');
  await page.locator('#modal').getByRole('button', { name: 'Gravar' }).click();
  await expect(conteudo.locator('.badge', { hasText: 'A confirmar' })).toBeVisible();
  expect(envios[0]).toEqual(['PUT', { situacao: 'parcial', justificativa: 'Suplente ainda não designado formalmente', responsavel_id: null, proxima_revisao: null }]);
  // o consultor não confirma
  await page.getByRole('button', { name: 'Abrir 4.2.1' }).click();
  await expect(page.locator('#modal').getByRole('button', { name: 'Confirmar' })).toHaveCount(0);

  // o Gestor entra com a mesma API, filtra o que espera por ele e confirma
  papel = 'org_admin';
  await page.route('**/api/v1/auth/me', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: { ...USER, role: papel, modulos: ['iso', 'ot'] } }) }));
  await page.reload();
  await page.locator('#nav-ot-assessment').click();
  await page.locator('#ass-meus').check();
  await expect(conteudo.locator('.badge', { hasText: 'A confirmar' })).toBeVisible();
  await page.getByRole('button', { name: 'Abrir 4.2.1' }).click();
  await page.locator('#modal').getByRole('button', { name: 'Confirmar' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Confirmar' }).click();
  await expect(conteudo).toContainText('Nada espera por você');
  await page.locator('#ass-meus').uncheck();
  await expect(conteudo.locator('.badge', { hasText: 'A confirmar' })).toHaveCount(0);
  expect(envios[1]).toEqual(['confirmar', { updated_at: '2026-11-12 13:00:00.123' }]);
});

// Fluidez E5: o relatório de conformidade abre a partir de Relatórios e tem o botão de imprimir.
test('relatório: Relatórios abre o relatório de conformidade com o botão Imprimir / Salvar PDF', async ({ page }) => {
  await mockApi(page, ['iso', 'ot'], ['iso', 'ot']);
  await page.route(`**${B}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    const json = (o) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
    if (path === `${B}/relatorio/conformidade`) return json({ projeto: 'Projeto E2E', gerado_em: '2026-11-12 10:00:00', gerado_por: 'Consultor',
      sites: [{ nome: 'SE Norte', fase: 'em_operacao', base_aprovada_em: '2026-11-01 10:00:00' }],
      itens: [{ codigo: '4.2.1', titulo: 'Gestor e suplente designados', tipo: 'politica', situacao: 'parcial', prazo: null, justificativa: 'Suplente ainda não designado',
        evidencias: [], responsavel_nome: null, confirmado_em: null, proxima_revisao: '2027-11-12' }] });
    if (path in ABAS_OT) return json(ABAS_OT[path]);
    return route.fallback();
  });
  await entrar(page);
  await abrirOt(page);
  await page.locator('#nav-ot-relatorios').click();
  await page.getByRole('button', { name: 'Relatório de conformidade' }).click();
  const conteudo = page.locator('#content');
  await expect(conteudo).toContainText('Relatório de conformidade RO-CB.BR.01');
  await expect(conteudo).toContainText('Suplente ainda não designado');
  await expect(page.getByRole('button', { name: 'Imprimir / Salvar PDF' })).toBeVisible();
});
