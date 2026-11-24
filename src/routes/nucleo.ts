import { Hono } from 'hono';
import type { Bindings, Variables } from '../index';
import { ehEquipeNess, erro500, logAudit, podeAdministrarOrg, registraErro, podeMexerEmAssinaturaDe, RECUSA_LINHA_DE_ASSINATURA } from '../helpers';
import { aplicarNomes, propostasDeNomes } from '../services/padronizar-nomes';
import { mesclar, previaDaMescla } from '../services/mesclar';
import { importarPartes, conciliarResponsaveis, recusaDeMudarTipo } from '../services/partes';
import { importarDocumentos } from '../services/documentos';
import { sincronizarDpoDaParte, membroDpoDaParte } from '../services/encarregado-pessoa';
import { emailAindaNaMatriz, revogarContaStakeholder } from './governance';
import { conteudoDoTratamentoMudou } from './ropa';
import { documentoAtual, hashConteudo } from '../services/pedidos';

/** Hash do conteúdo congelado do tratamento (o mesmo dos pedidos de aprovação); '' se não existe. */
const hashDoTratamento = async (db: D1Database, id: string, projectId: string) => {
  const d = await documentoAtual(db, 'tratamento', id, projectId);
  return d ? hashConteudo(d.conteudo) : '';
};
import { NOME_DO_PRODUTO } from '../modulos';
import { seedPhases } from '../services/project-setup';
import {
  validateBody, moduloHabilitarSchema, MODULOS, parseModulos, type Modulo,
  padronizarNomesSchema, mesclarSchema, departamentoCriarSchema, departamentoAtualizarSchema, parteCriarSchema, parteAtualizarSchema, vinculoCriarSchema,
  MATRIZ_PAPEL_ALVO, type AlvoVinculo,
} from '../schemas';

/**
 * Núcleo do n.privacy, fatia 1.1: módulos, departamentos, partes e vínculos. Montado em
 * `/api/v1/projects/:projectId`, então o `projectAccessMiddleware` já cortou o projeto antes daqui.
 */
export const nucleoApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();

async function estadoDosModulos(db: D1Database, projectId: string) {
  const [hab, proj] = await Promise.all([
    db.prepare('SELECT modulo FROM projeto_modulos WHERE project_id = ? ORDER BY modulo').bind(projectId).all<{ modulo: string }>(),
    db.prepare('SELECT p.org_id, o.modulos_contratados AS contratados FROM projects p LEFT JOIN organizations o ON o.id = p.org_id WHERE p.id = ?')
      .bind(projectId).first<{ org_id: string | null; contratados: string | null }>(),
  ]);
  return { habilitados: hab.results.map((r) => r.modulo), contratados: parseModulos(proj?.contratados), orgId: proj?.org_id ?? null };
}

nucleoApp.get('/modulos', async (c) => {
  const { habilitados, contratados } = await estadoDosModulos(c.env.DB, c.req.param('projectId')!);
  return c.json({ habilitados, contratados });
});

nucleoApp.put('/modulos/:modulo', async (c) => {
  try {
    const projectId = c.req.param('projectId')!;
    const modulo = c.req.param('modulo');
    if (!(MODULOS as readonly string[]).includes(modulo)) return c.json({ error: 'Módulo desconhecido' }, 400);
    const v = await validateBody(c, moduloHabilitarSchema);
    if (!v.success) return v.response;
    const db = c.env.DB;
    const user = c.get('user');
    const est = await estadoDosModulos(db, projectId);
    if (!podeAdministrarOrg(user, est.orgId)) return c.json({ error: 'Forbidden: só o administrador da consultoria habilita módulo' }, 403);
    const ligado = est.habilitados.includes(modulo);
    let trazido: { importados: { partes: number; documentos: number }; avisos: string[] } | undefined;
    if (v.data.habilitado) {
      if (!est.contratados.includes(modulo as Modulo)) return c.json({ error: 'Módulo não contratado pela consultoria' }, 409);
      if (!ligado) {
        // Módulos por pessoa (fatia 3 do n.360): ligar o módulo no projeto o concede às contas de CLIENTE dele, no mesmo
        // batch. Equipe e stakeholder não: a equipe recebe pelo contrato da organização (ou por PUT /users/:id/modulos).
        // A trilha é o terceiro statement do MESMO batch: se ela falha, nem o módulo nem a concessão ficam.
        // O n.ot não: só por concessão explícita a cada pessoa (modelo de ameaças do n.ot, P0-1; mesma regra do gatilho, 0089).
        await db.batch([
          db.prepare('INSERT INTO projeto_modulos (project_id, modulo, habilitado_por) VALUES (?, ?, ?)').bind(projectId, modulo, user.email),
          db.prepare(`INSERT OR IGNORE INTO usuario_modulos (user_id, modulo, concedido_por)
            SELECT id, ?, ? FROM users WHERE client_project_id = ? AND role IN ('org_admin', 'org_user', 'client') AND ? <> 'ot'`).bind(modulo, user.email, projectId, modulo),
          db.prepare(`INSERT INTO audit_logs (id, action, actor, details, justification, ip_address, project_id, created_at)
            VALUES (?, 'usuario.modulos', ?, ? || ' habilitado no projeto: concedido a '
              || (SELECT COUNT(*) FROM users WHERE client_project_id = ? AND role IN ('org_admin', 'org_user', 'client') AND ? <> 'ot') || ' contas de cliente',
              '', '', ?, datetime('now'))`)
            .bind(crypto.randomUUID(), user.email, NOME_DO_PRODUTO[modulo as Modulo], projectId, modulo, projectId),
        ]);
        if (modulo === 'iso') {
          // O projeto criado sem o n.iso nasce sem as fases da jornada: ligar o módulo as carrega (nunca duplica).
          try {
            if (!(await db.prepare('SELECT 1 FROM project_phases WHERE project_id = ? LIMIT 1').bind(projectId).first())) await seedPhases(db, projectId);
          } catch (e) {
            registraErro(c, e);
            trazido = { importados: { partes: 0, documentos: 0 }, avisos: ['Não foi possível carregar as fases da jornada; carregue pela Jornada.'] };
          }
        }
        if (modulo === 'privacy') {
          // O n.privacy lê o modelo comum (partes, vínculos, documentos); ligar traz o que o n.iso já tem, com as mesmas
          // pontes repetíveis dos botões manuais. Cada uma falha sozinha: o módulo já está ligado e o aviso diz o que refazer.
          trazido = { importados: { partes: 0, documentos: 0 }, avisos: [] };
          const t = trazido;
          const tentar = async (oQue: string, refazer: string, f: () => Promise<unknown>) => {
            try { await f(); } catch (e) { registraErro(c, e); t.avisos.push(`Não foi possível ${oQue}; refaça em ${refazer}.`); }
          };
          await tentar('trazer as pessoas e organizações', 'Partes, "Importar do projeto"', async () => { const r = await importarPartes(db, projectId, user.email); t.importados.partes = r.criadas; t.avisos.push(...r.avisos); });
          await tentar('conciliar os responsáveis', 'Partes, "Conciliar responsáveis"', () => conciliarResponsaveis(db, projectId, user.email));
          await tentar('trazer as políticas', 'Documentos, "Importar políticas"', async () => { const r = await importarDocumentos(db, projectId, user.email); t.importados.documentos = r.criados; t.avisos.push(...r.avisos); });
        }
      }
    } else if (ligado) {
      if (est.habilitados.length === 1) return c.json({ error: 'O projeto precisa de ao menos um módulo' }, 409);
      await db.prepare('DELETE FROM projeto_modulos WHERE project_id = ? AND modulo = ?').bind(projectId, modulo).run();
    }
    await logAudit(db, 'projeto.modulo', user.email, `Módulo ${modulo} ${v.data.habilitado ? 'habilitado' : 'desabilitado'}`, '', '', projectId);
    return c.json({ ok: true, ...trazido });
  } catch (e) { return erro500(c, 'Falha ao alterar o módulo', e); }
});

const unico = (e: unknown) => String((e as { message?: string })?.message ?? e).includes('UNIQUE');

// ─── padronizar nomes (saneamento do que já está gravado) ──────────────────
nucleoApp.get('/padronizar-nomes', async (c) => {
  try {
    if (!ehEquipeNess(c.get('user'))) return c.json({ error: 'A padronização de nomes é feita pela equipe da consultoria' }, 403);
    return c.json(await propostasDeNomes(c.env.DB, c.req.param('projectId')!));
  } catch (e) { return erro500(c, 'Falha ao listar os nomes a padronizar', e); }
});

nucleoApp.post('/padronizar-nomes', async (c) => {
  try {
    if (!ehEquipeNess(c.get('user'))) return c.json({ error: 'A padronização de nomes é feita pela equipe da consultoria' }, 403);
    const v = await validateBody(c, padronizarNomesSchema);
    if (!v.success) return v.response;
    return c.json({ ok: true, ...(await aplicarNomes(c.env.DB, c.req.param('projectId')!, c.get('user').email, v.data.itens)) });
  } catch (e) { return erro500(c, 'Falha ao padronizar os nomes', e); }
});

// ─── mesclar duplicata (D5): prévia sem `confirmar`, execução com `confirmar: true` ──────────────────
nucleoApp.post('/mesclar', async (c) => {
  try {
    if (!ehEquipeNess(c.get('user'))) return c.json({ error: 'Mesclar cadastros é feito pela equipe da consultoria' }, 403);
    const projectId = c.req.param('projectId')!;
    const v = await validateBody(c, mesclarSchema);
    if (!v.success) return v.response;
    const { tabela, manter, remover, confirmar } = v.data;
    // Atividades tocadas: o hash do conteúdo congelado antes da mescla, para derrubar a aprovação só onde ele mudou
    // (item só do ciclo de vida, que fica fora do conteúdo congelado, não derruba).
    const tocadas = confirmar ? await previaDaMescla(c.env.DB, tabela, projectId, manter, remover) : null;
    const antes = new Map<string, string>();
    if (tocadas && 'ok' in tocadas) for (const t of tocadas.tratamentos) antes.set(t, await hashDoTratamento(c.env.DB, t, projectId));
    const r = confirmar ? await mesclar(c.env.DB, tabela, projectId, c.get('user').email, manter, remover) : await previaDaMescla(c.env.DB, tabela, projectId, manter, remover);
    if (!('ok' in r)) return c.json({ error: r.error }, r.status);
    if (confirmar) {
      for (const t of r.tratamentos) if (antes.get(t) !== await hashDoTratamento(c.env.DB, t, projectId)) await conteudoDoTratamentoMudou(c, t, projectId);
    }
    return c.json({ ...r, previa: !confirmar, tratamentos: r.tratamentos.length });
  } catch (e) { return erro500(c, 'Falha ao mesclar os cadastros', e); }
});

// ─── departamentos ─────────────────────────────────────────────────────────
nucleoApp.get('/departamentos', async (c) => {
  const r = await c.env.DB.prepare('SELECT * FROM departamentos WHERE project_id = ? ORDER BY nome').bind(c.req.param('projectId')!).all();
  return c.json(r.results);
});

nucleoApp.post('/departamentos', async (c) => {
  try {
    const projectId = c.req.param('projectId')!;
    const v = await validateBody(c, departamentoCriarSchema);
    if (!v.success) return v.response;
    const id = crypto.randomUUID();
    try {
      await c.env.DB.prepare('INSERT INTO departamentos (id, project_id, nome, descricao) VALUES (?, ?, ?, ?)').bind(id, projectId, v.data.nome, v.data.descricao || null).run();
    } catch (e) {
      if (unico(e)) return c.json({ error: 'Já existe um departamento com esse nome neste projeto' }, 409);
      throw e;
    }
    await logAudit(c.env.DB, 'departamento.criado', c.get('user').email, `Departamento ${v.data.nome} criado`, '', '', projectId);
    return c.json({ ok: true, id }, 201);
  } catch (e) { return erro500(c, 'Falha ao criar o departamento', e); }
});

nucleoApp.put('/departamentos/:id', async (c) => {
  try {
    const projectId = c.req.param('projectId')!;
    const v = await validateBody(c, departamentoAtualizarSchema);
    if (!v.success) return v.response;
    try {
      const r = await c.env.DB.prepare(
        // descricao: ausente mantém; null ou vazia limpa.
        `UPDATE departamentos SET nome = COALESCE(?, nome), status = COALESCE(?, status), descricao = CASE WHEN ? THEN ? ELSE descricao END,
           updated_at = CURRENT_TIMESTAMP WHERE id = ? AND project_id = ?`
      ).bind(v.data.nome ?? null, v.data.status ?? null, v.data.descricao !== undefined ? 1 : 0, v.data.descricao || null, c.req.param('id'), projectId).run();
      if (!r.meta.changes) return c.json({ error: 'Departamento não encontrado' }, 404);
    } catch (e) {
      if (unico(e)) return c.json({ error: 'Já existe um departamento com esse nome neste projeto' }, 409);
      throw e;
    }
    await logAudit(c.env.DB, 'departamento.atualizado', c.get('user').email, `Departamento ${c.req.param('id')} atualizado`, '', '', projectId);
    return c.json({ ok: true });
  } catch (e) { return erro500(c, 'Falha ao atualizar o departamento', e); }
});

// ─── partes ────────────────────────────────────────────────────────────────
nucleoApp.get('/partes', async (c) => {
  const { tipo, status } = c.req.query();
  const where = ['project_id = ?'];
  const binds: string[] = [c.req.param('projectId')!];
  if (tipo === 'pessoa' || tipo === 'organizacao') { where.push('tipo = ?'); binds.push(tipo); }
  if (status === 'ativa' || status === 'inativa') { where.push('status = ?'); binds.push(status); }
  const r = await c.env.DB.prepare(`SELECT * FROM partes WHERE ${where.join(' AND ')} ORDER BY nome`).bind(...binds).all();
  return c.json(r.results);
});

nucleoApp.get('/partes/:id', async (c) => {
  const projectId = c.req.param('projectId')!;
  const parte = await c.env.DB.prepare('SELECT * FROM partes WHERE id = ? AND project_id = ?').bind(c.req.param('id'), projectId).first();
  if (!parte) return c.json({ error: 'Parte não encontrada' }, 404);
  const vinculos = await c.env.DB.prepare('SELECT id, papel, alvo_tipo, alvo_id, created_at FROM parte_vinculos WHERE parte_id = ? AND project_id = ? ORDER BY created_at')
    .bind(c.req.param('id'), projectId).all();
  return c.json({ ...parte, vinculos: vinculos.results });
});

nucleoApp.post('/partes', async (c) => {
  try {
    const projectId = c.req.param('projectId')!;
    const v = await validateBody(c, parteCriarSchema);
    if (!v.success) return v.response;
    const id = crypto.randomUUID();
    try {
      await c.env.DB.prepare('INSERT INTO partes (id, project_id, tipo, nome, email, cnpj) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(id, projectId, v.data.tipo, v.data.nome, v.data.email?.toLowerCase() ?? null, v.data.cnpj ?? null).run();
    } catch (e) {
      if (unico(e)) return c.json({ error: 'Já existe uma organização com esse CNPJ neste projeto' }, 409);
      throw e;
    }
    await logAudit(c.env.DB, 'parte.criada', c.get('user').email, `Parte ${v.data.tipo} criada`, '', '', projectId);
    return c.json({ ok: true, id }, 201);
  } catch (e) { return erro500(c, 'Falha ao criar a parte', e); }
});

// ─── importar e conciliar (sob demanda, por projeto, repetíveis) ───────────
nucleoApp.post('/partes/importar', async (c) => {
  try {
    return c.json({ ok: true, ...(await importarPartes(c.env.DB, c.req.param('projectId')!, c.get('user').email)) });
  } catch (e) { return erro500(c, 'Falha ao importar as partes', e); }
});

nucleoApp.post('/partes/conciliar', async (c) => {
  try {
    return c.json({ ok: true, ...(await conciliarResponsaveis(c.env.DB, c.req.param('projectId')!, c.get('user').email)) });
  } catch (e) { return erro500(c, 'Falha ao conciliar os responsáveis', e); }
});

nucleoApp.put('/partes/:id', async (c) => {
  try {
    const projectId = c.req.param('projectId')!;
    const id = c.req.param('id');
    const v = await validateBody(c, parteAtualizarSchema);
    if (!v.success) return v.response;
    const atual = await c.env.DB.prepare('SELECT nome, email, status, tipo, cnpj, user_id FROM partes WHERE id = ? AND project_id = ?')
      .bind(id, projectId).first<{ nome: string; email: string | null; status: string; tipo: string; cnpj: string | null; user_id: string | null }>();
    if (!atual) return c.json({ error: 'Parte não encontrada' }, 404);
    const tipo = v.data.tipo ?? atual.tipo;
    if (v.data.cnpj && tipo !== 'organizacao') return c.json({ error: 'CNPJ é só de organização' }, 400);
    const cnpj = v.data.cnpj === undefined ? atual.cnpj : v.data.cnpj;
    const mudaTipo = tipo !== atual.tipo;
    if (mudaTipo) {
      // Mudar o tipo é da equipe da consultoria, em pessoa: nunca o agente (nem com decisão confirmada) nem a chave de API (entra como client).
      const u = c.get('user');
      if (!ehEquipeNess(u) || u.agente) return c.json({ error: 'Mudar o tipo da parte é feito pela equipe da consultoria' }, 403);
      // shortcut: a verificação e a gravação não são atômicas (corrida rara entre a recusa e o UPDATE); vira batch condicional se aparecer dado inconsistente.
      const recusa = await recusaDeMudarTipo(c.env.DB, projectId, { id, ...atual }, cnpj);
      if (recusa) return c.json({ error: recusa }, 409);
    }
    const email = v.data.email === undefined ? atual.email : (v.data.email?.toLowerCase() ?? null);
    // A parte encarregada leva nome e e-mail à linha do DPO na governança: mudar é mexer na linha de quem assina.
    if ((v.data.nome ?? atual.nome) !== atual.nome || email !== atual.email) {
      if (!(await podeMexerEmAssinaturaDe(c.env.DB, c.get('user'), projectId))
        && await c.env.DB.prepare(`SELECT 1 FROM parte_vinculos WHERE parte_id = ? AND project_id = ? AND papel = 'encarregado'`).bind(id, projectId).first()
        && await membroDpoDaParte(c.env.DB, projectId, { nome: atual.nome, email: atual.email })) {
        return c.json(RECUSA_LINHA_DE_ASSINATURA, 403);
      }
    }
    try {
      await c.env.DB.batch([
        c.env.DB.prepare('UPDATE partes SET tipo = ?, nome = ?, email = ?, status = ?, cnpj = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND project_id = ?')
          .bind(tipo, v.data.nome ?? atual.nome, email, v.data.status ?? atual.status, cnpj, id, projectId),
        // Só ao virar organização: o que o gatilho vendor_perfil_do_terceiro faria. Em edição comum, perfil apagado (DELETE /vendors/:id) fica apagado.
        ...(mudaTipo && tipo === 'organizacao' ? [c.env.DB.prepare(`INSERT OR IGNORE INTO vendors (id, project_id, name, parte_id) SELECT lower(hex(randomblob(8))), p.project_id, p.nome, p.id FROM partes p
          WHERE p.id = ? AND EXISTS (SELECT 1 FROM parte_vinculos v WHERE v.parte_id = p.id AND v.papel = 'terceiro' AND v.alvo_tipo = 'projeto')`).bind(id)] : []),
      ]);
    } catch (e) {
      if (unico(e)) return c.json({ error: 'Já existe uma organização com esse CNPJ neste projeto' }, 409);
      throw e;
    }
    await logAudit(c.env.DB, 'parte.atualizada', c.get('user').email, `Parte ${id} atualizada${cnpj !== atual.cnpj ? ' (CNPJ alterado)' : ''}`, '', '', projectId);
    if (mudaTipo) await logAudit(c.env.DB, 'parte.tipo_alterado', c.get('user').email, `Parte ${id}: tipo ${atual.tipo} → ${tipo}`, '', '', projectId);
    const nome = v.data.nome ?? atual.nome;
    if (nome !== atual.nome || email !== atual.email) {
      // A parte é a encarregada: o membro DPO da governança acompanha. Falha é registrada, a parte já está gravada.
      try {
        if (await c.env.DB.prepare(`SELECT 1 FROM parte_vinculos WHERE parte_id = ? AND project_id = ? AND papel = 'encarregado'`).bind(id, projectId).first()) {
          const membro = await sincronizarDpoDaParte(c.env.DB, projectId, { nome: atual.nome, email: atual.email }, { nome, email });
          if (membro) {
            await logAudit(c.env.DB, 'parte.dpo_sincronizado', c.get('user').email, `Parte ${id} levada ao membro ${membro.id}`, '', '', projectId);
            // Mesmo passo do POST da governança: e-mail antigo que saiu da matriz perde o acesso de stakeholder.
            if (membro.email && membro.email.trim().toLowerCase() !== (email ?? '').trim().toLowerCase()
              && !(await emailAindaNaMatriz(c.env.DB, projectId, membro.email))) {
              await revogarContaStakeholder(c, projectId, membro.email, c.get('user').email);
            }
          }
        }
      } catch (e) { registraErro(c, e); }
    }
    return c.json({ ok: true });
  } catch (e) { return erro500(c, 'Falha ao atualizar a parte', e); }
});

// ─── vínculos ──────────────────────────────────────────────────────────────
/** `tratamento` é o registro do RoPA (`ropa_records`), que não tem rename (plano da fatia 4, ruling 1). */
async function conferirAlvo(db: D1Database, projectId: string, tipo: AlvoVinculo, id: string): Promise<'ok' | 'inexistente' | 'indisponivel'> {
  if (tipo === 'projeto') return id === projectId ? 'ok' : 'inexistente';
  const tabela = tipo === 'departamento' ? 'departamentos' : tipo === 'parte' ? 'partes' : tipo === 'item' ? 'itens' : tipo === 'tratamento' ? 'ropa_records' : null;
  if (!tabela) return 'indisponivel';
  // `tabela` sai das constantes acima, nunca da requisição; o id vai por bind.
  return (await db.prepare(`SELECT 1 FROM ${tabela} WHERE id = ? AND project_id = ?`).bind(id, projectId).first()) ? 'ok' : 'inexistente';
}

nucleoApp.post('/partes/:id/vinculos', async (c) => {
  try {
    const projectId = c.req.param('projectId')!;
    const parteId = c.req.param('id');
    const v = await validateBody(c, vinculoCriarSchema);
    if (!v.success) return v.response;
    const db = c.env.DB;
    const parte = await db.prepare('SELECT tipo FROM partes WHERE id = ? AND project_id = ?').bind(parteId, projectId).first<{ tipo: string }>();
    if (!parte) return c.json({ error: 'Parte não encontrada' }, 404);
    const { papel, alvo_tipo, alvo_id } = v.data;
    if (!MATRIZ_PAPEL_ALVO[alvo_tipo].includes(papel)) return c.json({ error: `O papel ${papel} não se aplica a ${alvo_tipo}` }, 400);
    const alvo = await conferirAlvo(db, projectId, alvo_tipo, alvo_id);
    if (alvo === 'indisponivel') return c.json({ error: `O alvo ${alvo_tipo} ainda não existe nesta versão` }, 400);
    if (alvo === 'inexistente') return c.json({ error: 'Alvo inexistente ou de outro projeto' }, 400);
    // Agente de tratamento (operador, cocontrolador, suboperador, destinatário) é uma organização, a de Parceiros; pessoa só como responsável.
    if (alvo_tipo === 'tratamento' && papel !== 'responsavel' && parte.tipo !== 'organizacao') {
      return c.json({ error: 'Operador, cocontrolador, suboperador e destinatário são organizações: cadastre a empresa em Parceiros e ligue-a aqui.' }, 400);
    }
    // Responsável por um fornecedor (D4): a pessoa responde por uma organização.
    if (alvo_tipo === 'parte' && papel === 'responsavel') {
      const org = await db.prepare('SELECT tipo FROM partes WHERE id = ? AND project_id = ?').bind(alvo_id, projectId).first<{ tipo: string }>();
      if (parte.tipo !== 'pessoa' || org?.tipo !== 'organizacao') return c.json({ error: 'O responsável por um fornecedor é uma pessoa, e o fornecedor é uma organização.' }, 400);
    }
    const id = crypto.randomUUID();
    try {
      await db.prepare('INSERT INTO parte_vinculos (id, project_id, parte_id, papel, alvo_tipo, alvo_id) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(id, projectId, parteId, papel, alvo_tipo, alvo_id).run();
    } catch (e) {
      if (unico(e)) return c.json({ error: 'Esse vínculo já existe' }, 409);
      throw e;
    }
    await logAudit(db, 'parte.vinculada', c.get('user').email, `Parte ${parteId}: ${papel} em ${alvo_tipo}`, '', '', projectId);
    // As partes do tratamento entram no conteúdo congelado do pedido de aprovação (fatia 4.3).
    if (alvo_tipo === 'tratamento') await conteudoDoTratamentoMudou(c, alvo_id, projectId);
    return c.json({ ok: true, id }, 201);
  } catch (e) { return erro500(c, 'Falha ao vincular a parte', e); }
});

nucleoApp.delete('/partes/:id/vinculos/:vinculoId', async (c) => {
  try {
    const projectId = c.req.param('projectId')!;
    const alvo = await c.env.DB.prepare('SELECT alvo_tipo, alvo_id FROM parte_vinculos WHERE id = ? AND parte_id = ? AND project_id = ?')
      .bind(c.req.param('vinculoId'), c.req.param('id'), projectId).first<{ alvo_tipo: string; alvo_id: string }>();
    const r = await c.env.DB.prepare('DELETE FROM parte_vinculos WHERE id = ? AND parte_id = ? AND project_id = ?')
      .bind(c.req.param('vinculoId'), c.req.param('id'), projectId).run();
    if (!r.meta.changes) return c.json({ error: 'Vínculo não encontrado' }, 404);
    if (alvo?.alvo_tipo === 'tratamento') await conteudoDoTratamentoMudou(c, alvo.alvo_id, projectId);
    return c.json({ ok: true });
  } catch (e) { return erro500(c, 'Falha ao remover o vínculo', e); }
});
