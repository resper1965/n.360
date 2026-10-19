import { describe, it, expect, beforeAll } from 'vitest';
import { prepararProjeto, chamar, json, base, novaAtividade, P, OUTRO, type Sessoes } from './helpers/ropa-abas';

/** Catálogos do projeto (spec 4.2, plano A2.1). Nada é semeado: toda lista começa vazia. Nomes fictícios. */
describe('catálogos do projeto: vazios, criação inline e isolamento', () => {
  let s: Sessoes;
  beforeAll(async () => { s = await prepararProjeto(); });
  const cat = (tipo: string, h = s.consultor) => chamar(h, 'GET', `/api/v1/projects/${P}/catalogos/${tipo}`);
  const criar = (tipo: string, corpo: unknown, h = s.consultor, projeto = P) => chamar(h, 'POST', `/api/v1/projects/${projeto}/catalogos/${tipo}`, corpo);

  it('projeto novo: as quatro listas vêm vazias e a leitura não grava nada', async () => {
    for (const tipo of ['titulares', 'dados', 'medidas', 'motivos-risco']) {
      const r = await cat(tipo);
      expect(r.status).toBe(200);
      expect((await json(r)).itens).toEqual([]);
    }
    expect(await env_count()).toBe(0);
  });

  it('criação inline padroniza o nome, e nome igual em outra caixa é 409 com o existente', async () => {
    const r = await criar('dados', { nome: 'dado exemplo novo', sensivel: true });
    expect(r.status).toBe(201);
    const item = (await json(r)).item;
    expect(item.nome).not.toBe('dado exemplo novo');
    expect(item).toMatchObject({ sensivel: true, status: 'ativo' });
    const lista = await json(await cat('dados'));
    expect(lista.itens.map((i: { id: string }) => i.id)).toEqual([item.id]);
    const dup = await criar('dados', { nome: 'DADO EXEMPLO NOVO' });
    expect(dup.status).toBe(409);
    expect((await json(dup)).existente).toEqual({ id: item.id, nome: item.nome });
  });

  it('busca sem acento e sem caixa', async () => {
    await criar('titulares', { nome: 'Cliente exemplo sáude' });
    const r = await json(await chamar(s.consultor, 'GET', `/api/v1/projects/${P}/catalogos/titulares?q=SAUDE`));
    expect(r.itens.length).toBe(1);
  });

  it('PUT muda o sensível; só a equipe e o administrador do cliente editam', async () => {
    const id = (await json(await criar('dados', { nome: 'Dado exemplo sensível teste', sensivel: true }))).item.id;
    const cliente = await chamar(s.cliente, 'PUT', `/api/v1/projects/${P}/catalogos/dados/${id}`, { sensivel: false });
    expect(cliente.status).toBe(403);
    const r = await chamar(s.adminCliente, 'PUT', `/api/v1/projects/${P}/catalogos/dados/${id}`, { sensivel: false });
    expect(r.status).toBe(200);
    expect((await json(r)).item.sensivel).toBe(false);
  });

  it('inativo some da lista padrão e aparece com ?inativos=1; nada é apagado', async () => {
    const id = (await json(await criar('medidas', { nome: 'Medida exemplo inativa' }))).item.id;
    await chamar(s.consultor, 'PUT', `/api/v1/projects/${P}/catalogos/medidas/${id}`, { status: 'inativo' });
    expect((await json(await cat('medidas'))).itens.map((i: { id: string }) => i.id)).not.toContain(id);
    const todos = await json(await chamar(s.consultor, 'GET', `/api/v1/projects/${P}/catalogos/medidas?inativos=1`));
    expect(todos.itens.map((i: { id: string }) => i.id)).toContain(id);
  });

  it('tipo fora da lista fixa é 404; catálogo de outro projeto não aparece', async () => {
    expect((await cat('xyz')).status).toBe(404);
    await criar('titulares', { nome: 'Titular só do outro' }, s.outro, OUTRO);
    const meu = await json(await cat('titulares'));
    expect(meu.itens.map((i: { nome: string }) => i.nome)).not.toContain('Titular só do outro');
  });

  it('projeto sem n.privacy: 403 (faixa privacy)', async () => {
    const r = await chamar(s.soIso, 'GET', `/api/v1/projects/${P}/catalogos/titulares`);
    expect(r.status).toBe(403);
  });

  it('dado da lista fixa nasce sensível quando o corpo não diz; a pessoa pode desmarcar', async () => {
    const r = await json(await criar('dados', { nome: 'biometria' }));
    expect(r.item).toMatchObject({ sensivel: true });
    const id = r.item.id;
    const d = await json(await chamar(s.consultor, 'PUT', `/api/v1/projects/${P}/catalogos/dados/${id}`, { sensivel: false }));
    expect(d.item.sensivel).toBe(false);
  });

  it('motivo de risco aceita descrição padrão; outro tipo recusa', async () => {
    const r = await criar('motivos-risco', { nome: 'Motivo exemplo de risco', descricao_padrao: 'Descrição padrão exemplo' });
    expect(r.status).toBe(201);
    expect((await json(r)).item.descricao_padrao).toBe('Descrição padrão exemplo');
    expect((await criar('titulares', { nome: 'Titular com descrição', descricao_padrao: 'nao' })).status).toBe(400);
  });
  it('titular aceita "descricao" (0081); só o titular, e o texto volta na listagem e na edição', async () => {
    const r = await criar('titulares', { nome: 'Titular exemplo com descrição', descricao: 'Pessoa que se candidata a uma vaga' });
    expect(r.status).toBe(201);
    const item = (await json(r)).item;
    expect(item.descricao).toBe('Pessoa que se candidata a uma vaga');
    const lista = (await json(await chamar(s.consultor, 'GET', `/api/v1/projects/${P}/catalogos/titulares`))).itens;
    expect(lista.find((x: any) => x.id === item.id).descricao).toBe('Pessoa que se candidata a uma vaga');
    const e = await json(await chamar(s.consultor, 'PUT', `/api/v1/projects/${P}/catalogos/titulares/${item.id}`, { descricao: 'Outra' }));
    expect(e.item.descricao).toBe('Outra');
    expect((await criar('dados', { nome: 'Dado exemplo com descrição', descricao: 'nao' })).status).toBe(400);
  });
  it('motivo criado no catálogo com descrição padrão é sugerido em GET /riscos/motivos', async () => {
    const rid = await novaAtividade(s.consultor);
    const criado = await criar('motivos-risco', { nome: 'Motivo exemplo de sugestão', descricao_padrao: 'Descrição padrão exemplo' });
    expect(criado.status).toBe(201);
    const lista = await json(await chamar(s.consultor, 'GET', `${base(rid)}/riscos/motivos`));
    expect(lista.motivos.map((m: { descricao_padrao: string }) => m.descricao_padrao)).toContain('Descrição padrão exemplo');
  });
});

async function env_count(): Promise<number> {
  const { env } = await import('cloudflare:test');
  const row = await env.DB.prepare(`SELECT count(*) n FROM catalogo_itens WHERE project_id = ?`).bind(P).first<{ n: number }>();
  return row?.n ?? 0;
}
