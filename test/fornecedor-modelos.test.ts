import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { applySchema } from './helpers/d1';
import {
  PERGUNTAS_PADRAO, ROTEIRO_TRUST_CENTER, lerModelos, salvarPrazo, criarPerguntaModelo, atualizarPerguntaModelo,
  perguntasDoProjeto, perguntasDoEnvio, ajustarPerguntaDoModelo,
} from '../src/services/fornecedor-modelos';
import { criarPergunta, criarHomologacao, lerHomologacao } from '../src/services/homologacao';

/** Modelos de avaliação de fornecedor da consultoria (fatia 1, migration 0106): herança viva por organização. */
const A = 'fm-org-a', B = 'fm-org-b';
const PA1 = 'fm-pa1', PA2 = 'fm-pa2', PB = 'fm-pb';

beforeAll(async () => {
  await applySchema();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO organizations (id, name, slug) VALUES (?1, 'Consultoria A', ?1), (?2, 'Consultoria B', ?2)`).bind(A, B),
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES
      (?1, 'C1', 'LGPD', 'Controller', 'Active', ?4), (?2, 'C2', 'LGPD', 'Controller', 'Active', ?4), (?3, 'C3', 'LGPD', 'Controller', 'Active', ?5)`).bind(PA1, PA2, PB, A, B),
    env.DB.prepare(`INSERT INTO partes (id, project_id, tipo, nome, terceiro_tipo) VALUES ('fm-forn', ?, 'organizacao', 'Fornecedor', 'critico')`).bind(PA1),
  ]);
});

const usadas = async (projeto: string, tipo: 'critico' | 'medio' | 'pequeno') => (await perguntasDoEnvio(env.DB, projeto, tipo)).map((p) => p.texto);

describe('modelos da consultoria', () => {
  it('semeio idempotente, separado por organização, com os quatro tipos e os prazos provisórios a validar', async () => {
    const m1 = await lerModelos(env.DB, A);
    const m2 = await lerModelos(env.DB, A);
    expect(m2).toEqual(m1);
    expect(m1.map((m) => [m.tipo, m.prazo_meses, m.a_validar])).toEqual([['critico', 12, true], ['medio', 24, true], ['pequeno', 36, true], ['grande_provedor', 12, true]]);
    expect(m1[0].perguntas.map((p) => p.texto)).toEqual(PERGUNTAS_PADRAO.map((p) => p.texto));
    expect(m1[3].perguntas.map((p) => p.texto)).toEqual(ROTEIRO_TRUST_CENTER.map((p) => p.texto));
    const mb = await lerModelos(env.DB, B);
    expect(mb[0].perguntas.map((p) => p.id)).not.toEqual(m1[0].perguntas.map((p) => p.id));
  });

  it('editar o modelo chega a todos os projetos da organização e não aos de outra; prazo salvo vira da consultoria', async () => {
    const [critico] = await lerModelos(env.DB, A);
    expect(await atualizarPerguntaModelo(env.DB, A, critico.perguntas[0].id, 'adm@a', { texto: 'Pergunta revisada pela consultoria' })).toBe(true);
    // pergunta de A editada pela organização B: não é dela
    expect(await atualizarPerguntaModelo(env.DB, B, critico.perguntas[1].id, 'adm@b', { ativa: false })).toBe(false);
    await criarPerguntaModelo(env.DB, A, 'critico', 'adm@a', { tema: 'Auditoria', texto: 'Há relatório de auditoria independente dos últimos 12 meses?' });
    for (const p of [PA1, PA2]) {
      const t = await usadas(p, 'critico');
      expect(t[0]).toBe('Pergunta revisada pela consultoria');
      expect(t).toContain('Há relatório de auditoria independente dos últimos 12 meses?');
    }
    expect((await usadas(PB, 'critico'))[0]).toBe(PERGUNTAS_PADRAO[0].texto);
    await salvarPrazo(env.DB, A, 'critico', 18, 'adm@a');
    const [depois] = await lerModelos(env.DB, A);
    expect(depois).toMatchObject({ prazo_meses: 18, origem: 'consultoria' });
    expect((await perguntasDoProjeto(env.DB, PA1, 'critico')).prazo_meses).toBe(18);
  });

  it('o projeto desliga pergunta do modelo só para si e acrescenta as próprias, por tipo ou para todos', async () => {
    const { perguntas } = await perguntasDoProjeto(env.DB, PA1, 'medio');
    const alvo = perguntas[2];
    expect(await ajustarPerguntaDoModelo(env.DB, PA1, alvo.id, false, 'cons@a')).toBe(true);
    expect(await usadas(PA1, 'medio')).not.toContain(alvo.texto);
    expect(await usadas(PA2, 'medio')).toContain(alvo.texto);
    // pergunta do modelo de outra organização: recusada
    const [criticoB] = await lerModelos(env.DB, B);
    expect(await ajustarPerguntaDoModelo(env.DB, PA1, criticoB.perguntas[0].id, false, 'cons@a')).toBe(false);
    await criarPergunta(env.DB, PA1, 'cons@a', { tema: 'Local', texto: 'Só do crítico deste projeto', tipo: 'critico' });
    await criarPergunta(env.DB, PA1, 'cons@a', { tema: 'Local', texto: 'Para todos os tipos deste projeto' });
    expect(await usadas(PA1, 'critico')).toEqual(expect.arrayContaining(['Só do crítico deste projeto', 'Para todos os tipos deste projeto']));
    expect(await usadas(PA1, 'pequeno')).toContain('Para todos os tipos deste projeto');
    // o roteiro do grande provedor não recebe pergunta do projeto, nem a de todos os tipos
    expect((await perguntasDoProjeto(env.DB, PA1, 'grande_provedor')).perguntas.every((p) => p.fonte === 'modelo')).toBe(true);
    expect(await usadas(PA1, 'pequeno')).not.toContain('Só do crítico deste projeto');
    expect(await usadas(PA2, 'critico')).not.toContain('Para todos os tipos deste projeto');
    // a pergunta padrão antiga do projeto (que o código velho ressemeava) é ignorada
    await env.DB.prepare(`INSERT INTO homologacao_perguntas (id, project_id, tema, texto, origem) VALUES ('fm-velha', ?, 'T', 'Padrão antiga', 'padrao')`).bind(PA1).run();
    expect(await usadas(PA1, 'critico')).not.toContain('Padrão antiga');
  });

  it('o envio usa o modelo do tipo do fornecedor, grava o tipo e congela: editar o modelo depois não muda o envio feito', async () => {
    const r = await criarHomologacao(env.DB, PA1, 'cons@a', { parte_id: 'fm-forn', dias: 15 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(await env.DB.prepare('SELECT tipo FROM homologacoes WHERE id = ?').bind(r.id).first('tipo')).toBe('critico');
    const antes = (await lerHomologacao(env.DB, PA1, r.id))!.perguntas.map((p) => p.texto);
    expect(antes).toEqual(await usadas(PA1, 'critico'));
    const [critico] = await lerModelos(env.DB, A);
    await atualizarPerguntaModelo(env.DB, A, critico.perguntas[0].id, 'adm@a', { texto: 'Texto mudado depois do envio' });
    expect((await lerHomologacao(env.DB, PA1, r.id))!.perguntas.map((p) => p.texto)).toEqual(antes);
  });
});
