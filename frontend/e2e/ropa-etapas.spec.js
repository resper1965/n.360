import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { servirShell } from './shell.js';

// SISTEMA VAZIO na aba Tratamento de Dados: projeto novo, uma atividade criada, e as seis etapas mostram o vazio explicado.
// Coleta primeiro (listas vazias com texto de ajuda); as de 2 a 6 ficam travadas ate a Coleta ser concluida ou marcada Nao Aplicavel;
// depois, cada uma abre vazia e diz o que falta. A API e dublada com as formas do servidor (GET /etapas, PUT /etapas/coleta, catalogos
// `{ ok, itens }`, `/diagrama` `{ mermaid }`). Dados ficticios; nenhum erro no console.

const USER = { id: 'u1', email: 'consultor@ness.io', name: 'Consultor', role: 'consultor' };
const PID = 'proj-novo';
const RID = 'at-1';
const NOME = 'Atividade exemplo';
const SEIS = ['coleta', 'uso', 'compartilhamento_interno', 'compartilhamento_externo', 'armazenamento', 'eliminacao'];
const ROTULOS = {
  coleta: 'Coleta', uso: 'Uso ou Processamento', compartilhamento_interno: 'Compartilhamento Interno',
  compartilhamento_externo: 'Compartilhamento Externo', armazenamento: 'Armazenamento', eliminacao: 'Eliminação',
};

const FICHA = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '../../contracts/ropa-abas/ficha.json'), 'utf8'));
const fichaVazia = () => {
  const f = structuredClone(FICHA);
  f.registro = { id: RID, nome: NOME, finalidade: NOME, descricao_atividade: null, responsavel: null, areas: [], empresa: '' };
  f.situacao = { codigo: 'rascunho', rotulo: 'Rascunho', aprovacao_desatualizada: false, em_nova_revisao: false };
  f.acoes.conferir_aprovar = { habilitada: false, motivo: 'Só uma atividade em revisão vai para aprovação.' };
  f.acoes.alterar_para_em_revisao = { habilitada: true, motivo: null };
  f.acoes.cancelar = { habilitada: true, motivo: null };
  for (const k of Object.keys(f.abas)) f.abas[k] = { estado: 'vazio', resumo: 'Nada registrado ainda.' };
  f.modulos = { iso: false };
  return f;
};

// Seis etapas como o servidor devolve num projeto novo. Coleta Não Aplicável libera as demais (o servidor só trava com a Coleta pendente).
const etapasVazias = (coletaNA) => SEIS.map((etapa) => {
  const naoAplicavel = etapa === 'coleta' && coletaNA;
  return {
    etapa, rotulo: ROTULOS[etapa], situacao: naoAplicavel ? 'nao_aplicavel' : 'pendente', faltas: naoAplicavel ? [] : ['descrição'],
    nao_aplicavel: naoAplicavel, descricao: null, origem: [], solicita_consentimento: null, criancas_adolescentes: false,
    ativos: [], areas: [], parceiros: [], titulares: [], prazo: null, descarte: null, migrado: false,
    bloqueada: etapa !== 'coleta' && !coletaNA,
  };
});

async function mockApi(page, erros) {
  await servirShell(page);
  page.on('console', (m) => { if (m.type() === 'error') erros.push(`console: ${m.text()}`); });
  page.on('pageerror', (e) => erros.push(`pageerror: ${e.message}`));
  let atividades = [];
  let coletaNA = false;
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname.replace(`/api/v1/projects/${PID}`, '');
    const m = req.method();
    const json = (o, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(o) });
    if (p === '/api/v1/auth/login') return json({ token: 'e2e-fake-token', user: USER });
    if (p === '/api/v1/auth/me') return json({ user: USER });
    if (p === '/api/v1/projects') return json([{ id: PID, client_name: 'Cliente novo', project_name: 'Projeto novo', modulos: ['privacy'] }]);
    if (p === '/painel') return json({ gerado_em: new Date().toISOString(), visao: 'equipe', modulos_pedidos: ['privacy'], empresa: null, encarregados: [], programa: { estado: 'implantacao', desde: null, rotulo: 'Em implantação' },
      saude: { tom: 'neutro', rotulo: 'Começando', frase: 'O programa está começando.', apoio: '' }, modulos: { privacy: { saude: { tom: 'neutro', rotulo: 'Começando', frase: 'Começando.', apoio: '' }, numeros: [], comecando: true, fazer: [], cobertura: [], vencimentos: [], riscos: [], passos: [] } } });
    if (p === '/ropa' && m === 'GET') return json({ ok: true, records: atividades });
    if (p === '/ropa' && m === 'POST') {
      atividades = [{ id: RID, processing_purpose: NOME, nome: NOME, status: 'Draft', situacao: { codigo: 'rascunho', rotulo: 'Rascunho' }, aprovacao_pedido: { ciso: null, ceo: null }, nao_informado: [], dpia_required: 0, international_transfers: 0 }];
      return json({ ok: true, id: RID }, 201);
    }
    const a = `/ropa/${RID}`;
    if (p === `${a}/ficha`) return json(fichaVazia());
    if (p === `${a}/etapas` && m === 'GET') return json({ ok: true, materializada: true, etapas: etapasVazias(coletaNA) });
    if (p === `${a}/etapas/coleta` && m === 'PUT') {
      const corpo = req.postDataJSON();
      if (typeof corpo.nao_aplicavel === 'boolean') coletaNA = corpo.nao_aplicavel;
      return json({ ok: true });
    }
    if (p === `${a}/diagrama`) return json({ mermaid: 'flowchart LR\n  A["Coleta"] --> B["Uso"]' });
    if (p === `${a}/ciclo`) return json({ etapas: [] });
    if (p === `${a}/ligacoes`) return json({});
    if (p === `${a}/base-juridica`) return json({ ok: true, previsao_legal: null, lgpd: [], art11: { nao_aplicavel: false, incisos: [] }, gdpr: [], lia_exigida: false, base_gdpr_texto_anterior: null, legal_basis_texto: null });
    if (p === `${a}/impacto`) return json({ perguntas: [], recomendacao: { resultado: 'incompleto', motivos: [] }, finalizado_em: null });
    if (p === `${a}/gaps`) return json({ ok: true, gaps: [], nao_aplicavel: false });
    if (p === `${a}/riscos/motivos`) return json({ motivos: [] });
    if (p === `${a}/logs`) return json([]);
    if (p === '/catalogos/titulares' || p === '/catalogos/dados') return json({ ok: true, itens: [] });
    if (p === '/assets') return json({ ok: true, assets: [] });
    if (p === '/departamentos' || p === '/partes') return json([]);
    if (m === 'GET') return json([]);
    return json({ ok: true });
  });
}

async function entrarEAbrirAtividade(page) {
  await page.goto('/login.html');
  await page.fill('#login-email', USER.email);
  await page.fill('#login-password', 'senha-e2e');
  await page.click('#login-submit');
  await expect(page).toHaveURL(/\/privacy$/);
  await page.locator('#nav-ropa').click();
  await expect(page.locator('#content')).toContainText('Nenhuma atividade de tratamento registrada.');
  // a atividade nasce por "Nova atividade", direto nas abas (o formulário antigo não existe no n.privacy)
  await page.locator('#content').getByRole('button', { name: 'Nova atividade' }).click();
  await page.fill('#ra-nome', NOME);
  await page.getByRole('radio', { name: /Direto nas abas/ }).check();
  await page.getByRole('button', { name: 'Criar', exact: true }).click();
  await expect(page.locator('#header-title')).toHaveText(NOME);
}

test('sistema vazio: as seis etapas do Tratamento de Dados explicam o vazio, sem erro no console', async ({ page }) => {
  const erros = [];
  await mockApi(page, erros);
  await entrarEAbrirAtividade(page);
  await page.getByRole('tab', { name: /Tratamento de Dados/ }).click();

  const painel = page.getByRole('tabpanel');
  await expect(painel.getByRole('heading', { level: 2 })).toHaveText('Tratamento de Dados');
  const botao = (id) => painel.locator(`[data-etapa-botao="${id}"]`);
  const abrir = async (id) => {
    if ((await botao(id).getAttribute('aria-expanded')) !== 'true') await botao(id).click();
    await expect(botao(id)).toHaveAttribute('aria-expanded', 'true');
  };
  await expect(painel.locator('[data-etapa-botao]')).toHaveCount(6);

  // Etapas 2 a 6 travadas: nao abrem e dizem por que
  for (const id of SEIS.slice(1)) {
    await expect(botao(id), id).toHaveAttribute('aria-disabled', 'true');
    await expect(botao(id), id).toContainText('Conclua a Coleta primeiro');
    await expect(botao(id), id).toHaveAttribute('aria-expanded', 'false');
  }

  // Coleta vazia: as listas dizem o que e titular e ativo, e o que falta
  await abrir('coleta');
  await expect(painel.getByText('Nenhum titular nesta atividade')).toBeVisible();
  await expect(painel.getByText('Nenhum ativo cadastrado').first()).toBeVisible();
  await expect(painel.getByRole('button', { name: '+ Adicionar Titulares' })).toBeVisible();
  await expect(painel.getByText('Falta preencher: descrição')).toBeVisible();

  // Coleta Nao Aplicavel (sem conteudo, sem confirmacao): as demais destravam
  await painel.locator('#at-et-c-coleta').getByLabel('Não Aplicável').check();
  await expect(botao('uso')).not.toHaveAttribute('aria-disabled', 'true');

  // Cada etapa aberta mostra o seu vazio
  const corpo = (id) => painel.locator(`#at-et-c-${id}`);
  await abrir('uso');
  await expect(corpo('uso').getByText('Nenhum titular definido na Coleta')).toBeVisible();
  await expect(corpo('uso').getByText('Nenhum ativo cadastrado')).toBeVisible();
  await abrir('compartilhamento_interno');
  await expect(corpo('compartilhamento_interno').getByText('Nenhuma área cadastrada')).toBeVisible();
  await abrir('compartilhamento_externo');
  await expect(corpo('compartilhamento_externo').getByText('Nenhum parceiro cadastrado')).toBeVisible();
  await abrir('armazenamento');
  await expect(corpo('armazenamento').getByText('Nenhum ativo cadastrado')).toBeVisible();
  await abrir('eliminacao');
  await expect(corpo('eliminacao').getByText('Nenhum ativo para eliminar')).toBeVisible();
  await expect(corpo('eliminacao').getByText('Nenhum titular definido na Coleta')).toBeVisible();
  await expect(corpo('eliminacao').getByLabel('Prazo')).toBeVisible();

  // Nenhuma etapa mostra texto quebrado
  const texto = await painel.innerText();
  expect(texto).not.toMatch(/undefined|\[object|NaN/);

  // "Ver o fluxo" abre o diagrama derivado
  await painel.getByRole('button', { name: 'Ver o fluxo' }).click();
  await expect(page.locator('#modal-content')).toContainText('Fluxo do tratamento');
  await expect(page.locator('#modal-content pre')).toContainText('flowchart LR');
  await page.locator('#modal-content').getByRole('button', { name: 'Fechar' }).click();

  expect(erros).toEqual([]);
});
