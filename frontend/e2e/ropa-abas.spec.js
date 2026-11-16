import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { servirShell, aguardarBoot } from './shell.js';

// O SISTEMA VAZIO: projeto novo, sem nenhum cadastro. O consultor cria a primeira atividade e percorre as nove abas só pelo teclado.
// Cada aba tem de explicar o que é e o que fazer (nunca uma lista seca), sem erro no console. A API é dublada; as formas são as do
// contrato (contracts/ropa-abas) e as que test/ropa-abas-formas-front.test.ts fixa no backend. Dados fictícios.

const USER = { id: 'u1', email: 'consultor@ness.io', name: 'Consultor', role: 'consultor' };
const PID = 'proj-novo';
const RID = 'at-1';
const NOME = 'Atividade exemplo';
const ABAS = ['Escopo', 'Tratamento de Dados', 'Agentes de Tratamento', 'Medidas de Segurança', 'Base Jurídica', 'Controle de GAPs', 'Teste de Impacto', 'Riscos', 'Logs ROPA'];

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
const PERGUNTAS = [
  { id: 'alto_risco', grupo: 'alto_risco', texto: 'A atividade pode gerar alto risco ao titular de dados?', curto: 'alto risco', resposta: null, da_atividade: null },
  { id: 'afeta_direitos', grupo: 'geral', texto: 'O tratamento pode afetar significativamente interesses e direitos dos titulares?', curto: 'direitos', resposta: null, da_atividade: null },
  { id: 'sensiveis', grupo: 'especifico', texto: 'Será realizado o tratamento de dados pessoais sensíveis?', curto: 'sensíveis', resposta: null, da_atividade: null },
];

async function mockApi(page, erros) {
  await servirShell(page);
  page.on('console', (m) => { if (m.type() === 'error') erros.push(`console: ${m.text()}`); });
  page.on('pageerror', (e) => erros.push(`pageerror: ${e.message}`));
  let atividades = [];
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
    if (p === `${a}/ciclo`) return json({ etapas: [] });
    if (p === `${a}/ligacoes`) return json({});
    if (p === `${a}/base-juridica`) return json({ ok: true, previsao_legal: null, lgpd: [], art11: { nao_aplicavel: false, incisos: [] }, gdpr: [], lia_exigida: false, base_gdpr_texto_anterior: null, legal_basis_texto: null });
    if (p === `${a}/impacto`) return json({ perguntas: PERGUNTAS, recomendacao: { resultado: 'incompleto', motivos: [] }, finalizado_em: null });
    if (p === `${a}/gaps`) return json({ ok: true, gaps: [], nao_aplicavel: false });
    if (p === `${a}/riscos/motivos`) return json({ motivos: [] });
    if (p === `${a}/logs`) return json([]);
    if (m === 'GET') return json([]);
    return json({ ok: true });
  });
}

async function entrarEAbrirAtividade(page) {
  await page.goto('/privacy');
  await page.fill('#login-email', USER.email);
  await page.fill('#login-password', 'senha-e2e');
  await page.click('#login-submit');
  await expect(page).toHaveURL(/\/privacy$/);
  await aguardarBoot(page);
  await page.locator('#nav-ropa').click();
  // lista vazia: explica e oferece o caminho
  await expect(page.locator('#content')).toContainText('Nenhuma atividade de tratamento registrada.');
  // a atividade nasce por "Nova atividade", direto nas abas (o formulário antigo não existe no n.privacy)
  await page.locator('#content').getByRole('button', { name: 'Nova atividade' }).click();
  await page.fill('#ra-nome', NOME);
  await page.getByRole('radio', { name: /Direto nas abas/ }).check();
  await page.getByRole('button', { name: 'Criar', exact: true }).click();
  await expect(page.locator('#header-title')).toHaveText(NOME);
}

test('sistema vazio: cria a primeira atividade e percorre as nove abas pelo teclado, cada uma explicando o vazio', async ({ page }) => {
  const erros = [];
  await mockApi(page, erros);
  await entrarEAbrirAtividade(page);

  // as nove abas, com os rótulos do legado e na ordem, e só a primeira no Tab
  const abas = page.getByRole('tab');
  await expect(abas).toHaveCount(9);
  for (let i = 0; i < 9; i++) await expect(abas.nth(i)).toContainText(ABAS[i]);
  await expect(page.getByRole('tablist', { name: 'Abas da atividade' })).toBeVisible();
  await expect(page.locator('.at-aba[tabindex="0"]')).toHaveCount(1);
  await expect(page.locator('.at-faixa-cancelada')).toHaveCount(0);

  // teclado: foco na aba atual e seta para a direita até a última; Home e End
  await abas.first().focus();
  const esperado = [
    /Cada alteração|Finalidade/, // Escopo tem os campos
    null, null, /Nenhuma medida de segurança registrada/, /Nenhum inciso registrado/, /Nenhum gap registrado/, null, null, /Nenhum registro ainda/,
  ];
  for (let i = 0; i < 9; i++) {
    await expect(abas.nth(i)).toHaveAttribute('aria-selected', 'true');
    await expect(abas.nth(i)).toBeFocused();
    const painel = page.getByRole('tabpanel');
    await expect(painel).toHaveAttribute('aria-labelledby', `at-aba-${await abas.nth(i).getAttribute('data-aba')}`);
    await expect(painel.getByRole('heading', { level: 2 })).toHaveText(ABAS[i]);
    // o vazio explica: texto no painel, nunca em branco nem "undefined"
    const texto = await painel.innerText();
    expect(texto.trim().length, `aba ${ABAS[i]} vazia`).toBeGreaterThan(ABAS[i].length + 10);
    expect(texto).not.toMatch(/undefined|\[object|NaN/);
    if (esperado[i] && i > 1) expect(texto).toMatch(esperado[i]);
    // uma só ação principal na ficha
    await expect(page.locator('#content .btn-primary:visible')).toHaveCount(0);
    if (i < 8) await page.keyboard.press('ArrowRight');
  }
  await page.keyboard.press('Home');
  await expect(abas.first()).toBeFocused();
  await expect(abas.first()).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('End');
  await expect(abas.last()).toBeFocused();
  await expect(abas.last()).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowRight'); // da última volta à primeira
  await expect(abas.first()).toBeFocused();

  expect(erros).toEqual([]);
});

test('sistema vazio, acessibilidade: um h1, um h2 por aba, Ações com motivo, campos com rótulo e foco visível', async ({ page }) => {
  const erros = [];
  await mockApi(page, erros);
  await entrarEAbrirAtividade(page);

  for (const [i, nome] of ABAS.entries()) {
    await page.getByRole('tab').nth(i).click();
    await expect(page.getByRole('tabpanel').getByRole('heading', { level: 2 })).toHaveText(nome);
    await expect(page.locator('#content h1, #header-title')).toHaveCount(1);
    // nenhum campo sem nome acessível, nenhum botão sem nome
    const semNome = await page.locator('#content').evaluate((raiz) => {
      const nomeDe = (e) => (e.getAttribute('aria-label') || (e.labels && e.labels[0] && e.labels[0].textContent) || e.textContent || '').trim();
      return [...raiz.querySelectorAll('input:not([type=hidden]), select, textarea, button')].filter((e) => !nomeDe(e) && !e.getAttribute('aria-labelledby')).map((e) => e.outerHTML.slice(0, 80));
    });
    expect(semNome, `aba ${nome}`).toEqual([]);
    await expect(page.locator('#content .btn-primary:visible')).toHaveCount(0);
  }

  // o foco da aba é visível (contorno definido em :focus-visible)
  await page.getByRole('tab').first().focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab').nth(1)).toBeFocused();
  const contorno = await page.getByRole('tab').nth(1).evaluate((e) => getComputedStyle(e).outlineStyle);
  expect(contorno).not.toBe('none');

  // menu Ações: "Conferir / Aprovar" desabilitada com o motivo escrito
  await page.getByRole('button', { name: /Ações/ }).click();
  const conferir = page.getByRole('menuitem', { name: /Conferir \/ Aprovar/ });
  await expect(conferir).toBeVisible();
  await expect(conferir).toHaveAttribute('aria-disabled', 'true');
  await expect(page.locator('body')).toContainText('Só uma atividade em revisão vai para aprovação.');

  expect(erros).toEqual([]);
});
