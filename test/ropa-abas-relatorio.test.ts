import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { prepararProjeto, chamar, comoAgente, json, base, novaAtividade, P, OUTRO, type Sessoes } from './helpers/ropa-abas';

describe('relatório da atividade, lista e exportação sem cancelada', () => {
  let s: Sessoes;
  beforeAll(async () => {
    s = await prepararProjeto();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO partes (id, project_id, tipo, nome, email, status) VALUES ('rl-dpo', ?, 'pessoa', 'Encarregada Exemplo', 'dpo@cliente.exemplo', 'ativa')`).bind(P),
      env.DB.prepare(`INSERT INTO partes (id, project_id, tipo, nome) VALUES ('rl-p', ?, 'pessoa', 'Responsável exemplo')`).bind(P),
    ]);
    await env.DB.prepare(`INSERT INTO parte_vinculos (id, project_id, parte_id, papel, alvo_tipo, alvo_id) VALUES ('rl-v', ?, 'rl-dpo', 'encarregado', 'projeto', ?)`).bind(P, P).run();
  });
  const relatorio = (rid: string, h = s.consultor) => chamar(h, 'GET', `${base(rid)}/relatorio`);

  it('HTML 200 com o cabeçalho do controlador, as nove seções na ordem e o título pelo nome', async () => {
    const rid = await novaAtividade(s.consultor, { processing_purpose: 'Finalidade do relatório' });
    await env.DB.prepare(`UPDATE ropa_records SET nome = 'Nome da atividade exemplo' WHERE id = ?`).bind(rid).run();
    const r = await relatorio(rid);
    expect(r.status).toBe(200);
    expect(r.headers.get('Content-Type')).toContain('text/html');
    const html = await r.text();
    expect(html).toContain('<h1>Nome da atividade exemplo</h1>');
    expect(html).toContain('<title>Atividade de tratamento - Nome da atividade exemplo</title>');
    expect(html).toContain('<strong>Controlador:</strong> Cliente exemplo');
    expect(html).toContain('<strong>Encarregado:</strong> Encarregada Exemplo (dpo@cliente.exemplo)');
    const ordem = ['Escopo', 'Tratamento de Dados', 'Agentes de Tratamento', 'Medidas de Segurança', 'Base Jurídica', 'Controle de GAPs', 'Teste de Impacto', 'Riscos', 'Logs ROPA']
      .map((t) => html.indexOf(`<h2>${t}</h2>`));
    expect(ordem.every((i) => i > 0)).toBe(true);
    expect([...ordem].sort((a, b) => a - b)).toEqual(ordem);
    expect(html).not.toContain('<script');
    expect(html).not.toMatch(/style="/);
  });

  it('todo texto digitado sai escapado (gap, risco, medida, nome)', async () => {
    const rid = await novaAtividade(s.consultor);
    await env.DB.prepare(`UPDATE ropa_records SET nome = '<img src=x onerror=alert(1)>' WHERE id = ?`).bind(rid).run();
    await chamar(s.consultor, 'POST', `${base(rid)}/gaps`, { gap: '<script>x</script>', responsavel_parte_id: 'rl-p', recomendacao: '<b>rec</b>' });
    await chamar(s.consultor, 'POST', `${base(rid)}/riscos`, { threat: '<script>risco</script>', impact: 2, probability: 2 });
    await env.DB.prepare(`INSERT INTO tratamento_medidas (id, project_id, ropa_id, medida, status) VALUES ('rl-m', ?, ?, '<u>medida</u>', 'ativa')`).bind(P, rid).run();
    const html = await (await relatorio(rid)).text();
    expect(html).not.toContain('<script>x</script>');
    expect(html).toContain('&lt;script&gt;x&lt;/script&gt;');
    expect(html).toContain('&lt;script&gt;risco&lt;/script&gt;');
    expect(html).toContain('&lt;u&gt;medida&lt;/u&gt;');
    expect(html).toContain('&lt;b&gt;rec&lt;/b&gt;');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('IDR 1');
  });

  it('agente MCP: 403; cliente lê; outro projeto e inexistente falham', async () => {
    const rid = await novaAtividade(s.consultor);
    expect((await comoAgente('GET', `${base(rid)}/relatorio`)).status).toBe(403);
    expect((await relatorio(rid, s.cliente)).status).toBe(200);
    expect((await relatorio(rid, s.outro)).status).toBeGreaterThanOrEqual(403);
    expect((await relatorio('nao-existe')).status).toBe(404);
  });

  it('GET /ropa/report (a lista) não inclui atividade cancelada', async () => {
    const viva = await novaAtividade(s.consultor, { processing_purpose: 'Atividade viva do relatório' });
    const morta = await novaAtividade(s.consultor, { processing_purpose: 'Atividade cancelada do relatório' });
    await env.DB.prepare(`UPDATE ropa_records SET status = 'Inactive' WHERE id = ?`).bind(morta).run();
    const html = await (await chamar(s.consultor, 'GET', `/api/v1/projects/${P}/ropa/report`)).text();
    expect(html).toContain('Atividade viva do relatório');
    expect(html).not.toContain('Atividade cancelada do relatório');
    expect(viva).toBeTruthy();
  });

  it('GET /ropa (a lista) devolve a situação por linha, uma de cada', async () => {
    const mk = async (finalidade: string, status: string) => {
      const id = await novaAtividade(s.consultor, { processing_purpose: finalidade });
      await env.DB.prepare('UPDATE ropa_records SET status = ? WHERE id = ?').bind(status, id).run();
      return id;
    };
    const ids = { rascunho: await mk('Lista rascunho', 'Draft'), em_revisao: await mk('Lista revisão', 'Under Review'), aprovada: await mk('Lista aprovada', 'Approved'), cancelada: await mk('Lista cancelada', 'Inactive') };
    const { records } = await json<{ records: any[] }>(await chamar(s.consultor, 'GET', `/api/v1/projects/${P}/ropa`));
    const rotulos = { rascunho: 'Rascunho', em_revisao: 'Em Revisão', aprovada: 'Aprovada', cancelada: 'Cancelada' };
    for (const [codigo, id] of Object.entries(ids)) {
      expect(records.find((r) => r.id === id).situacao, codigo).toEqual({ codigo, rotulo: rotulos[codigo as keyof typeof rotulos] });
    }
  });

  it('CSV atividades ganha Nome e Situação da atividade e não inclui cancelada', async () => {
    const viva = await novaAtividade(s.consultor, { processing_purpose: 'CSV viva exemplo' });
    const morta = await novaAtividade(s.consultor, { processing_purpose: 'CSV cancelada exemplo' });
    await env.DB.prepare(`UPDATE ropa_records SET status = 'Inactive' WHERE id = ?`).bind(morta).run();
    await env.DB.prepare(`UPDATE ropa_records SET nome = 'Nome no CSV' WHERE id = ?`).bind(viva).run();
    const r = await chamar(s.consultor, 'GET', `/api/v1/projects/${P}/export/atividades`);
    expect(r.status).toBe(200);
    const csv = await r.text();
    expect(csv).toContain('"Nome";"Situação da atividade"');
    expect(csv).toContain('CSV viva exemplo');
    expect(csv).toContain('"Nome no CSV";"Rascunho"');
    expect(csv).not.toContain('CSV cancelada exemplo');
  });

  it('a visão do encarregado e o painel não contam atividade cancelada', async () => {
    // OUTRO nunca teve atividade: uma só atividade, cancelada, não conta como "tratamento".
    const rid = await novaAtividade(s.outro, { processing_purpose: 'Só cancelada', dpia_required: true, legal_basis: 'Legítimo interesse' }, OUTRO);
    const antes = await json<any>(await chamar(s.outro, 'GET', `/api/v1/projects/${OUTRO}/encarregado`));
    expect(antes.tratamentos).toMatchObject({ total: 1, dpia_pendente: 1, lia_pendente: 1 });
    await env.DB.prepare(`UPDATE ropa_records SET status = 'Inactive' WHERE id = ?`).bind(rid).run();
    const depois = await json<any>(await chamar(s.outro, 'GET', `/api/v1/projects/${OUTRO}/encarregado`));
    expect(depois.tratamentos).toMatchObject({ total: 0, dpia_pendente: 0, lia_pendente: 0 });
    const painel = await json<any>(await chamar(s.outro, 'GET', `/api/v1/projects/${OUTRO}/painel`));
    expect(JSON.stringify(painel)).toContain('"comecando"');
  });
});
