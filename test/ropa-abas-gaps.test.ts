import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import app from '../src/index';
import { workerEnv } from './helpers/d1';
import { tipoDoAnexo, MAX_ANEXO } from '../src/services/ropa-abas/anexos';
import { prepararProjeto, chamar, comoAgente, json, base, novaAtividade, P, OUTRO, AGENTE, type Sessoes } from './helpers/ropa-abas';

const PDF = (n = 1024) => { const b = new Uint8Array(n); b.set([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]); return b; };
const DOCX = () => { const b = new Uint8Array(512); b.set([0x50, 0x4b, 0x03, 0x04]); return b; };
const DOC = () => { const b = new Uint8Array(512); b.set([0xd0, 0xcf, 0x11, 0xe0]); return b; };

describe('tipoDoAnexo: o tipo pelo conteúdo, conferido com a extensão', () => {
  it('confere assinatura e extensão', () => {
    expect(tipoDoAnexo('a.pdf', PDF())).toBe('pdf');
    expect(tipoDoAnexo('a.PDF', PDF())).toBe('pdf');
    expect(tipoDoAnexo('a.docx', DOCX())).toBe('docx');
    expect(tipoDoAnexo('a.doc', DOC())).toBe('doc');
    expect(tipoDoAnexo('a.pdf', new Uint8Array([0x4d, 0x5a, 0x90, 0]))).toBeNull(); // executável renomeado
    expect(tipoDoAnexo('a.txt', PDF())).toBeNull();
    expect(tipoDoAnexo('a.pdf.exe', PDF())).toBeNull();
    expect(tipoDoAnexo('constructor', PDF())).toBeNull();
  });
});

describe('Controle de GAPs e anexos', () => {
  let s: Sessoes;
  let parte: string;
  let parteAlheia: string;
  beforeAll(async () => {
    s = await prepararProjeto();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO partes (id, project_id, tipo, nome) VALUES ('gp-1', ?, 'pessoa', 'Responsável exemplo')`).bind(P),
      env.DB.prepare(`INSERT INTO partes (id, project_id, tipo, nome) VALUES ('gp-2', ?, 'pessoa', 'Pessoa de outro projeto')`).bind(OUTRO),
    ]);
    parte = 'gp-1'; parteAlheia = 'gp-2';
  });
  const gaps = async (rid: string) => json<any>(await chamar(s.consultor, 'GET', `${base(rid)}/gaps`));
  const criar = (rid: string, extra: object = {}, h = s.consultor) => chamar(h, 'POST', `${base(rid)}/gaps`, { gap: 'Ausência de exclusão dos dados (exemplo)', responsavel_parte_id: parte, ...extra });
  async function enviar(h: Record<string, string>, rid: string, gid: string, nome: string, bytes: Uint8Array, cabecalhos: Record<string, string> = {}) {
    const f = new FormData();
    f.append('file', new File([bytes], nome));
    return app.fetch(new Request(`http://localhost${base(rid)}/gaps/${gid}/anexos`, { method: 'POST', headers: { ...h, ...cabecalhos }, body: f }), workerEnv());
  }
  // a sessão traz Content-Type? não: o helper de sessão só devolve o cookie/Authorization
  const semJson = (h: Record<string, string>) => Object.fromEntries(Object.entries(h).filter(([k]) => k.toLowerCase() !== 'content-type'));

  it('sistema vazio: sem gaps, a lista responde vazia e não aplicável falso', async () => {
    const rid = await novaAtividade(s.consultor);
    expect(await gaps(rid)).toEqual({ ok: true, gaps: [], nao_aplicavel: false });
  });

  it('POST cria uma corrective_actions com ropa_id, Pendente e responsável; aparece em /acoes e na CAPA do n.iso', async () => {
    const rid = await novaAtividade(s.consultor);
    const r = await criar(rid, { gap: 'Primeira linha do gap\nSegunda linha', recomendacao: 'Recomendar algo' });
    expect(r.status).toBe(201);
    const id = (await json<{ id: string }>(r)).id;
    const l = (await env.DB.prepare('SELECT * FROM corrective_actions WHERE id = ?').bind(id).first<any>())!;
    expect(l).toMatchObject({ ropa_id: rid, project_id: P, title: 'Primeira linha do gap', description: 'Primeira linha do gap\nSegunda linha', status: 'Open', assigned_to_parte_id: parte, recomendacao: 'Recomendar algo' });
    const lista = (await gaps(rid)).gaps;
    expect(lista).toHaveLength(1);
    expect(lista[0]).toMatchObject({ id, gap: 'Primeira linha do gap\nSegunda linha', status: 'Open', responsavel: { id: parte, nome: 'Responsável exemplo' }, anexos: [] });
    const acoes = await json<any>(await chamar(s.consultor, 'GET', `${base(rid)}/acoes`));
    expect(JSON.stringify(acoes)).toContain(id);
    const capa = await chamar(s.consultor, 'GET', `/api/v1/projects/${P}/capa`);
    if (capa.status === 200) expect(JSON.stringify(await capa.json())).toContain(id);
  });

  it('título cortado em 120; sem responsável 400; responsável de outro projeto 400', async () => {
    const rid = await novaAtividade(s.consultor);
    const longo = 'x'.repeat(300);
    const id = (await json<{ id: string }>(await criar(rid, { gap: longo }))).id;
    expect((await env.DB.prepare('SELECT title FROM corrective_actions WHERE id = ?').bind(id).first<{ title: string }>())!.title).toHaveLength(120);
    expect((await chamar(s.consultor, 'POST', `${base(rid)}/gaps`, { gap: 'sem responsável' })).status).toBe(400);
    expect((await criar(rid, { responsavel_parte_id: parteAlheia })).status).toBe(400);
  });

  it('PUT: Closed carimba completed_at; recomendação, plano e prazo gravam nas colunas certas', async () => {
    const rid = await novaAtividade(s.consultor);
    const id = (await json<{ id: string }>(await criar(rid))).id;
    expect((await chamar(s.consultor, 'PUT', `${base(rid)}/gaps/${id}`, { status: 'Closed' })).status).toBe(200);
    expect((await env.DB.prepare('SELECT completed_at FROM corrective_actions WHERE id = ?').bind(id).first<any>())!.completed_at).not.toBeNull();
    expect((await chamar(s.consultor, 'PUT', `${base(rid)}/gaps/${id}`, { recomendacao: 'Rec', plano_acao: 'Plano', prazo: '2026-12-01' })).status).toBe(200);
    expect(await env.DB.prepare('SELECT recomendacao, action_plan, due_date, status FROM corrective_actions WHERE id = ?').bind(id).first()).toEqual({ recomendacao: 'Rec', action_plan: 'Plano', due_date: '2026-12-01', status: 'Closed' });
    expect((await chamar(s.consultor, 'PUT', `${base(rid)}/gaps/${id}`, { campo_novo: 1 })).status).toBe(400);
  });

  it('linha criada pela rota antiga /acoes aparece em /gaps como gap = title, sem responsável', async () => {
    const rid = await novaAtividade(s.consultor);
    const r = await chamar(s.consultor, 'POST', `${base(rid)}/acoes`, { title: 'Ação antiga exemplo' });
    expect(r.status).toBe(201);
    expect((await gaps(rid)).gaps[0]).toMatchObject({ gap: 'Ação antiga exemplo', responsavel: null });
  });

  it('Não Aplicável: 409 com gaps; sem gaps grava; com Não Aplicável o POST /gaps é 409', async () => {
    const rid = await novaAtividade(s.consultor);
    const id = (await json<{ id: string }>(await criar(rid))).id;
    const com = await chamar(s.consultor, 'PUT', `${base(rid)}/gaps/nao-aplicavel`, { valor: true });
    expect(com.status).toBe(409);
    expect((await json(com)).error).toBe('Há gaps registrados: apague-os antes de marcar Não Aplicável');
    expect((await chamar(s.consultor, 'DELETE', `${base(rid)}/gaps/${id}`)).status).toBe(200);
    expect((await chamar(s.consultor, 'PUT', `${base(rid)}/gaps/nao-aplicavel`, { valor: true })).status).toBe(200);
    expect((await gaps(rid)).nao_aplicavel).toBe(true);
    expect((await criar(rid)).status).toBe(409);
    expect((await chamar(s.consultor, 'PUT', `${base(rid)}/gaps/nao-aplicavel`, { valor: false })).status).toBe(200);
    expect((await criar(rid)).status).toBe(201);
  });

  it('gap de outra atividade ou de outro projeto: 404', async () => {
    const rid = await novaAtividade(s.consultor);
    const outra = await novaAtividade(s.consultor);
    const id = (await json<{ id: string }>(await criar(rid))).id;
    expect((await chamar(s.consultor, 'PUT', `${base(outra)}/gaps/${id}`, { status: 'Closed' })).status).toBe(404);
    expect((await chamar(s.consultor, 'DELETE', `${base(outra)}/gaps/${id}`)).status).toBe(404);
    expect((await chamar(s.outro, 'PUT', `${base(rid)}/gaps/${id}`, { status: 'Closed' })).status).toBeGreaterThanOrEqual(403);
  });

  it('gap e anexo NÃO chamam conferirPedidosDoDocumento (o hash e o pedido aberto ficam como estão)', async () => {
    const rid = await novaAtividade(s.consultor);
    await env.DB.prepare(`INSERT INTO pedidos (id, org_id, project_id, tipo, ref_id, titulo, conteudo_json, hash, papel_exigido, status, criado_por)
      VALUES ('gh-aberto', 'org_ness', ?, 'tratamento', ?, 'Tratamento: exemplo', '{}', 'h-qualquer', 'ciso', 'aberto', 'cons@ness.lat')`).bind(P, rid).run();
    const id = (await json<{ id: string }>(await criar(rid))).id;
    await chamar(s.consultor, 'PUT', `${base(rid)}/gaps/${id}`, { status: 'In Progress' });
    await enviar(semJson(s.consultor), rid, id, 'plano.pdf', PDF());
    expect(await env.DB.prepare(`SELECT status, hash FROM pedidos WHERE id = 'gh-aberto'`).first()).toEqual({ status: 'aberto', hash: 'h-qualquer' });
  });

  describe('anexos', () => {
    let rid: string;
    let gid: string;
    beforeAll(async () => {
      rid = await novaAtividade(s.consultor);
      gid = (await json<{ id: string }>(await criar(rid))).id;
    });

    it('PDF de 1 KB: 201, R2 em acoes/<projeto>/<gap>/<id>, hash SHA-256; a lista e o download devolvem os bytes', async () => {
      const r = await enviar(semJson(s.consultor), rid, gid, 'plano.pdf', PDF());
      expect(r.status, await r.clone().text()).toBe(201);
      const id = (await json<{ id: string }>(r)).id;
      const l = (await env.DB.prepare('SELECT * FROM acao_anexos WHERE id = ?').bind(id).first<any>())!;
      expect(l).toMatchObject({ project_id: P, acao_id: gid, file_name: 'plano.pdf', file_type: 'pdf', file_size: 1024, r2_key: `acoes/${P}/${gid}/${id}`, uploaded_by: 'cons@ness.lat' });
      const esperado = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', PDF()))).map((b) => b.toString(16).padStart(2, '0')).join('');
      expect(l.file_hash).toBe(esperado);
      expect((await gaps(rid)).gaps[0].anexos).toEqual([{ id, file_name: 'plano.pdf', file_type: 'pdf', file_size: 1024 }]);
      const dl = await chamar(s.consultor, 'GET', `${base(rid)}/gaps/${gid}/anexos/${id}`);
      expect(dl.status).toBe(200);
      expect(dl.headers.get('Content-Disposition')).toBe("attachment; filename*=UTF-8''plano.pdf");
      expect(dl.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(new Uint8Array(await dl.arrayBuffer())).toEqual(PDF());
      // outro projeto e outro gap não baixam
      expect((await chamar(s.consultor, 'GET', `${base(rid)}/gaps/outro-gap/anexos/${id}`)).status).toBe(404);
      expect((await chamar(s.outro, 'GET', `${base(rid)}/gaps/${gid}/anexos/${id}`)).status).toBeGreaterThanOrEqual(403);
    });

    it('nome com caracteres perigosos não entra cru no cabeçalho nem na chave do R2', async () => {
      const nome = 'relatório "x"; filename=evil é.pdf';
      const r = await enviar(semJson(s.consultor), rid, gid, nome, PDF());
      expect(r.status, await r.clone().text()).toBe(201);
      const id = (await json<{ id: string }>(r)).id;
      const dl = await chamar(s.consultor, 'GET', `${base(rid)}/gaps/${gid}/anexos/${id}`);
      // só caracteres seguros no cabeçalho (o nome vai codificado; aspas, ponto e vírgula e acento não passam crus)
      expect(dl.headers.get('Content-Disposition')).toMatch(/^attachment; filename\*=UTF-8''[A-Za-z0-9%._~'()*!-]+$/);
      expect((await env.DB.prepare('SELECT r2_key FROM acao_anexos WHERE id = ?').bind(id).first<any>())!.r2_key).toBe(`acoes/${P}/${gid}/${id}`);
    });

    it('.exe renomeado para .pdf: 400; .txt: 400; vazio: 400', async () => {
      const exe = new Uint8Array(1024); exe.set([0x4d, 0x5a, 0x90, 0x00]);
      expect((await enviar(semJson(s.consultor), rid, gid, 'mal.pdf', exe)).status).toBe(400);
      const t = await enviar(semJson(s.consultor), rid, gid, 'nota.txt', PDF());
      expect(t.status).toBe(400);
      expect((await json(t)).error).toContain('PDF ou DOC');
      expect((await enviar(semJson(s.consultor), rid, gid, 'vazio.pdf', new Uint8Array(0))).status).toBe(400);
    });

    it('5 MiB passa; 5 MiB + 1 byte: 413 com "Máximo de 5 MB"', async () => {
      expect((await enviar(semJson(s.consultor), rid, gid, 'grande.pdf', PDF(MAX_ANEXO))).status).toBe(201);
      const r = await enviar(semJson(s.consultor), rid, gid, 'grande.pdf', PDF(MAX_ANEXO + 1));
      expect(r.status).toBe(413);
      expect((await json(r)).error).toContain('Máximo de 5 MB');
    });

    it('.docx (PK) e .doc (D0CF) passam', async () => {
      expect((await enviar(semJson(s.consultor), rid, gid, 'a.docx', DOCX())).status).toBe(201);
      expect((await enviar(semJson(s.consultor), rid, gid, 'a.doc', DOC())).status).toBe(201);
    });

    it('gap de outro projeto: 404 e nada vai ao R2', async () => {
      const antes = (await env.STORAGE.list({ prefix: 'acoes/' })).objects.length;
      expect((await enviar(semJson(s.outro), rid, gid, 'x.pdf', PDF())).status).toBeGreaterThanOrEqual(403);
      expect((await enviar(semJson(s.consultor), rid, 'gap-inexistente', 'x.pdf', PDF())).status).toBe(404);
      expect((await env.STORAGE.list({ prefix: 'acoes/' })).objects.length).toBe(antes);
    });

    it('DELETE do anexo apaga a linha E o objeto; apagar o gap apaga os anexos e os objetos', async () => {
      const r2 = await novaAtividade(s.consultor);
      const g2 = (await json<{ id: string }>(await criar(r2))).id;
      const a1 = (await json<{ id: string }>(await enviar(semJson(s.consultor), r2, g2, 'um.pdf', PDF()))).id;
      const a2 = (await json<{ id: string }>(await enviar(semJson(s.consultor), r2, g2, 'dois.pdf', PDF()))).id;
      const k = (id: string) => `acoes/${P}/${g2}/${id}`;
      expect(await env.STORAGE.get(k(a1))).not.toBeNull();
      expect((await chamar(s.consultor, 'DELETE', `${base(r2)}/gaps/${g2}/anexos/${a1}`)).status).toBe(200);
      expect(await env.STORAGE.get(k(a1))).toBeNull();
      expect(await env.DB.prepare('SELECT 1 FROM acao_anexos WHERE id = ?').bind(a1).first()).toBeNull();
      expect((await chamar(s.consultor, 'DELETE', `${base(r2)}/gaps/${g2}/anexos/${a1}`)).status).toBe(404);
      expect((await chamar(s.consultor, 'DELETE', `${base(r2)}/gaps/${g2}`)).status).toBe(200);
      expect(await env.STORAGE.get(k(a2))).toBeNull();
      expect(await env.DB.prepare('SELECT 1 FROM acao_anexos WHERE acao_id = ?').bind(g2).first()).toBeNull();
    });

    it('o agente MCP: 403 em POST, GET e DELETE de anexo e em DELETE de gap; cria e atualiza gap', async () => {
      for (const [m, c] of [['POST', `${base(rid)}/gaps/${gid}/anexos`], ['GET', `${base(rid)}/gaps/${gid}/anexos`], ['DELETE', `${base(rid)}/gaps/${gid}/anexos/x`], ['DELETE', `${base(rid)}/gaps/${gid}`]] as const) {
        expect((await comoAgente(m, c)).status, `${m} ${c}`).toBe(403);
      }
      const r = await comoAgente('POST', `${base(rid)}/gaps`, { gap: 'Gap rascunhado pelo agente', responsavel_parte_id: parte });
      expect(r.status).toBe(201);
      expect(AGENTE.projectId).toBe(P);
    });

    it('cliente org_user lê e baixa, mas não envia nem apaga', async () => {
      const id = (await json<{ id: string }>(await enviar(semJson(s.consultor), rid, gid, 'cliente.pdf', PDF()))).id;
      expect((await chamar(s.cliente, 'GET', `${base(rid)}/gaps`)).status).toBe(200);
      expect((await chamar(s.cliente, 'GET', `${base(rid)}/gaps/${gid}/anexos`)).status).toBe(200);
      expect((await chamar(s.cliente, 'GET', `${base(rid)}/gaps/${gid}/anexos/${id}`)).status).toBe(200);
      expect((await enviar(semJson(s.cliente), rid, gid, 'x.pdf', PDF())).status).toBe(403);
      expect((await chamar(s.cliente, 'DELETE', `${base(rid)}/gaps/${gid}/anexos/${id}`)).status).toBe(403);
    });

    it('atividade cancelada: anexo e gap 409', async () => {
      const r3 = await novaAtividade(s.consultor);
      const g3 = (await json<{ id: string }>(await criar(r3))).id;
      await env.DB.prepare(`UPDATE ropa_records SET status = 'Inactive' WHERE id = ?`).bind(r3).run();
      expect((await enviar(semJson(s.consultor), r3, g3, 'x.pdf', PDF())).status).toBe(409);
      expect((await chamar(s.consultor, 'PUT', `${base(r3)}/gaps/${g3}`, { status: 'Closed' })).status).toBe(409);
      expect((await chamar(s.consultor, 'DELETE', `${base(r3)}/gaps/${g3}`)).status).toBe(409);
    });
  });

  it('a trilha: Controle de GAPS / Inclusão, Alteração, Exclusão, sem o texto do gap', async () => {
    const rid = await novaAtividade(s.consultor);
    const id = (await json<{ id: string }>(await criar(rid, { gap: 'Texto livre sigiloso do gap' }))).id;
    await chamar(s.consultor, 'PUT', `${base(rid)}/gaps/${id}`, { status: 'In Progress' });
    await chamar(s.consultor, 'DELETE', `${base(rid)}/gaps/${id}`);
    const { results } = await env.DB.prepare(`SELECT field, details FROM audit_logs WHERE entity_id = ? AND action = 'ropa.secao' ORDER BY rowid`).bind(rid).all<any>();
    expect(results.map((l) => l.field)).toEqual(['Controle de GAPS / Inclusão', 'Controle de GAPS / Alteração', 'Controle de GAPS / Exclusão']);
    expect(JSON.stringify(results)).not.toContain('sigiloso');
  });
});
