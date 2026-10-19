import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { workerEnv } from './helpers/d1';
import { prepararProjeto, chamar, comoAgente, json, P, OUTRO, type Sessoes } from './helpers/ropa-abas';
import { itensDoDia, tituloDoAviso } from '../src/services/avisos-prazo';

/** Documentos do legado (spec 2026-10-19, frente B): arquivo com metadados no núcleo, vencimento nos avisos de prazo. Tudo fictício. */
const B = `/api/v1/projects/${P}/documentos-arquivo`;
const PDF = (n = 1024) => { const b = new Uint8Array(n); b.set([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]); return b; };
const semJson = (h: Record<string, string>) => Object.fromEntries(Object.entries(h).filter(([k]) => k.toLowerCase() !== 'content-type'));
const enviar = (h: Record<string, string>, id: string, nome: string, bytes: Uint8Array, base = B) => {
  const f = new FormData();
  f.append('file', new File([bytes], nome));
  return app.fetch(new Request(`http://localhost${base}/${id}/arquivo`, { method: 'POST', headers: semJson(h), body: f }), workerEnv());
};

describe('documentos em arquivo', () => {
  let s: Sessoes;
  beforeAll(async () => {
    s = await prepararProjeto();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO partes (id, project_id, tipo, nome, email) VALUES ('da-p1', ?, 'pessoa', 'Pessoa exemplo', 'pessoa@cliente.exemplo')`).bind(P),
      env.DB.prepare(`INSERT INTO partes (id, project_id, tipo, nome) VALUES ('da-p2', ?, 'pessoa', 'Pessoa de outro projeto')`).bind(OUTRO),
    ]);
  });
  const criar = (corpo: object = {}, h = s.consultor) =>
    chamar(h, 'POST', B, { nome: 'Política de exemplo', tipo: 'politica', status: 'rascunho', ...corpo });

  it('cria, lista com filtro e responsável, edita e exclui; trilha nas escritas', async () => {
    const r = await criar({ vencimento: '2027-03-31', responsavel_parte_id: 'da-p1' });
    expect(r.status, await r.clone().text()).toBe(201);
    const id = (await json<{ id: string }>(r)).id;
    await criar({ nome: 'Contrato exemplo', tipo: 'contrato', status: 'publicado', sem_vencimento: true });

    const todos = await json<any[]>(await chamar(s.consultor, 'GET', B));
    expect(todos.map((d) => d.nome)).toEqual(['Contrato exemplo', 'Política de exemplo']);
    expect(todos[1]).toMatchObject({ id, tipo: 'politica', status: 'rascunho', vencimento: '2027-03-31', sem_vencimento: 0, responsavel_parte_id: 'da-p1',
      responsavel_nome: 'Pessoa exemplo', arquivo_nome: null, criado_por: 'cons@ness.lat' });
    expect(todos[1].r2_key).toBeUndefined();
    expect((await json<any[]>(await chamar(s.consultor, 'GET', `${B}?tipo=contrato`))).map((d) => d.nome)).toEqual(['Contrato exemplo']);
    expect((await json<any[]>(await chamar(s.consultor, 'GET', `${B}?status=rascunho`))).map((d) => d.nome)).toEqual(['Política de exemplo']);
    expect((await json<any[]>(await chamar(s.consultor, 'GET', `${B}?q=polí`))).map((d) => d.nome)).toEqual(['Política de exemplo']);

    const e = await chamar(s.consultor, 'PUT', `${B}/${id}`, { nome: 'Política revisada', tipo: 'norma', status: 'publicado', sem_vencimento: true, responsavel_parte_id: null });
    expect(e.status).toBe(200);
    const l = (await env.DB.prepare('SELECT * FROM documentos_arquivo WHERE id = ?').bind(id).first<any>())!;
    expect(l).toMatchObject({ nome: 'Política revisada', tipo: 'norma', status: 'publicado', vencimento: null, sem_vencimento: 1, responsavel_parte_id: null });

    expect((await chamar(s.consultor, 'DELETE', `${B}/${id}`)).status).toBe(200);
    expect(await env.DB.prepare('SELECT 1 FROM documentos_arquivo WHERE id = ?').bind(id).first()).toBeNull();
    const trilha = (await env.DB.prepare(`SELECT action FROM audit_logs WHERE project_id = ? AND action LIKE 'documento_arquivo.%'`).bind(P).all<{ action: string }>()).results.map((x) => x.action);
    expect(trilha).toEqual(expect.arrayContaining(['documento_arquivo.criado', 'documento_arquivo.atualizado', 'documento_arquivo.excluido']));
  });

  it('recusa corpo inválido: tipo, status, data inexistente, vencimento com "sem vencimento", campo a mais, responsável de outro projeto', async () => {
    for (const corpo of [{ tipo: 'planilha' }, { status: 'vigente' }, { vencimento: '2027-02-30' }, { vencimento: '2027-01-31', sem_vencimento: true }, { extra: 1 }, { nome: '' }]) {
      expect((await criar(corpo)).status, JSON.stringify(corpo)).toBe(400);
    }
    expect((await criar({ responsavel_parte_id: 'da-p2' })).status).toBe(400);
    expect((await criar({ responsavel_parte_id: 'nao-existe' })).status).toBe(400);
  });

  it('arquivo: PDF anexa no R2 com a chave do projeto, baixa, troca e remove; tipo e tamanho conferidos', async () => {
    const id = (await json<{ id: string }>(await criar())).id;
    const r = await enviar(s.consultor, id, 'politica exemplo.pdf', PDF());
    expect(r.status, await r.clone().text()).toBe(201);
    const l = (await env.DB.prepare('SELECT r2_key, arquivo_nome, arquivo_tipo FROM documentos_arquivo WHERE id = ?').bind(id).first<any>())!;
    expect(l).toEqual({ r2_key: `documentos-arquivo/${P}/${id}/politica exemplo.pdf`, arquivo_nome: 'politica exemplo.pdf', arquivo_tipo: 'pdf' });
    const dl = await chamar(s.consultor, 'GET', `${B}/${id}/arquivo`);
    expect(dl.status).toBe(200);
    expect(dl.headers.get('Content-Type')).toBe('application/pdf');
    expect(dl.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(dl.headers.get('Content-Disposition')).toContain("filename*=UTF-8''politica%20exemplo.pdf");
    expect(new Uint8Array(await dl.arrayBuffer())).toEqual(PDF());

    // trocar o arquivo apaga o objeto anterior
    expect((await enviar(s.consultor, id, 'nova/../versao.pdf', PDF(2048))).status).toBe(201);
    const nova = (await env.DB.prepare('SELECT r2_key FROM documentos_arquivo WHERE id = ?').bind(id).first<any>())!.r2_key;
    expect(nova).toBe(`documentos-arquivo/${P}/${id}/nova_.._versao.pdf`);
    expect(await env.STORAGE.get(l.r2_key)).toBeNull();

    const exe = new Uint8Array(1024); exe.set([0x4d, 0x5a, 0x90, 0x00]);
    expect((await enviar(s.consultor, id, 'mal.pdf', exe)).status).toBe(400);
    expect((await enviar(s.consultor, id, 'grande.pdf', PDF(10 * 1024 * 1024 + 1))).status).toBe(413);
    expect((await enviar(s.consultor, 'nao-existe', 'a.pdf', PDF())).status).toBe(404);

    expect((await chamar(s.consultor, 'DELETE', `${B}/${id}/arquivo`)).status).toBe(200);
    expect(await env.STORAGE.get(nova)).toBeNull();
    expect((await env.DB.prepare('SELECT r2_key, arquivo_nome FROM documentos_arquivo WHERE id = ?').bind(id).first<any>())).toEqual({ r2_key: null, arquivo_nome: null });
    expect((await chamar(s.consultor, 'GET', `${B}/${id}/arquivo`)).status).toBe(404);
  });

  it('excluir o documento apaga o arquivo do R2', async () => {
    const id = (await json<{ id: string }>(await criar())).id;
    await enviar(s.consultor, id, 'a.pdf', PDF());
    const chave = `documentos-arquivo/${P}/${id}/a.pdf`;
    expect(await env.STORAGE.get(chave)).not.toBeNull();
    expect((await chamar(s.consultor, 'DELETE', `${B}/${id}`)).status).toBe(200);
    expect(await env.STORAGE.get(chave)).toBeNull();
  });

  it('isolamento: documento de outro projeto não se lê, edita, baixa nem exclui pelo projeto errado', async () => {
    const id = (await json<{ id: string }>(await chamar(s.outro, 'POST', `/api/v1/projects/${OUTRO}/documentos-arquivo`, { nome: 'Alheio', tipo: 'outro', status: 'rascunho' }))).id;
    expect((await chamar(s.consultor, 'PUT', `${B}/${id}`, { nome: 'X', tipo: 'outro', status: 'rascunho' })).status).toBe(404);
    expect((await chamar(s.consultor, 'DELETE', `${B}/${id}`)).status).toBe(404);
    expect((await chamar(s.consultor, 'GET', `${B}/${id}/arquivo`)).status).toBe(404);
    expect((await json<any[]>(await chamar(s.consultor, 'GET', B))).some((d) => d.id === id)).toBe(false);
    expect((await chamar(s.consultor, 'GET', `/api/v1/projects/${OUTRO}/documentos-arquivo`)).status).toBe(403);
  });

  it('o agente MCP lê, mas não escreve', async () => {
    expect((await comoAgente('GET', B)).status).toBe(200);
    expect((await comoAgente('POST', B, { nome: 'Pelo agente', tipo: 'outro', status: 'rascunho' })).status).toBe(403);
  });

  it('avisos de prazo: fonte documento_arquivo com vencimento, fora obsoleto e sem vencimento', async () => {
    const hoje = '2026-10-19';
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO documentos_arquivo (id, project_id, nome, tipo, status, vencimento, responsavel_parte_id) VALUES ('da-d0', ?, 'Termo exemplo', 'termo', 'publicado', ?, 'da-p1')`).bind(P, hoje),
      env.DB.prepare(`INSERT INTO documentos_arquivo (id, project_id, nome, tipo, status, vencimento) VALUES ('da-obs', ?, 'Velho', 'termo', 'obsoleto', ?)`).bind(P, hoje),
      env.DB.prepare(`INSERT INTO documentos_arquivo (id, project_id, nome, tipo, status, sem_vencimento) VALUES ('da-sem', ?, 'Sem prazo', 'termo', 'publicado', 1)`).bind(P),
    ]);
    const itens = (await itensDoDia(env.DB, hoje)).itens.filter((i) => i.fonte === 'documento_arquivo');
    expect(itens).toHaveLength(1);
    expect(itens[0]).toMatchObject({ item_id: 'da-d0', project_id: P, marco: 'D0', titulo: 'Documento Termo exemplo', responsavel: 'pessoa@cliente.exemplo' });
    expect(tituloDoAviso({ fonte: 'documento_arquivo', titulo: 'Documento Termo exemplo', marco: 'D0' })).toBe('Documento Termo exemplo vence hoje');
  });

  it('descrição da área: POST e PUT aceitam descricao; PUT sem descricao não a apaga; null limpa', async () => {
    const r = await chamar(s.consultor, 'POST', `/api/v1/projects/${P}/departamentos`, { nome: 'Financeiro', descricao: 'Contas a pagar e a receber' });
    expect(r.status).toBe(201);
    const id = (await json<{ id: string }>(r)).id;
    const ler = async () => (await env.DB.prepare('SELECT descricao FROM departamentos WHERE id = ?').bind(id).first<{ descricao: string | null }>())!.descricao;
    expect(await ler()).toBe('Contas a pagar e a receber');
    await chamar(s.consultor, 'PUT', `/api/v1/projects/${P}/departamentos/${id}`, { status: 'inativo' });
    expect(await ler()).toBe('Contas a pagar e a receber');
    await chamar(s.consultor, 'PUT', `/api/v1/projects/${P}/departamentos/${id}`, { descricao: 'Tesouraria' });
    expect(await ler()).toBe('Tesouraria');
    await chamar(s.consultor, 'PUT', `/api/v1/projects/${P}/departamentos/${id}`, { descricao: null });
    expect(await ler()).toBeNull();
    expect((await chamar(s.consultor, 'PUT', `/api/v1/projects/${P}/departamentos/${id}`, { descricao: 'x'.repeat(2001) })).status).toBe(400);
  });
});
