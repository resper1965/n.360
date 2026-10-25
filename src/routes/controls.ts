import { Hono } from 'hono';
import { Bindings, Variables } from '../index';
import { modulosDaPessoa, recusaDoModulo } from '../modulos';
import { semRastros, logAudit, requireResourceAccess, erro500, projetosVisiveis } from '../helpers';
import { validateBody, controlUpdateSchema, maturitySchema, statusSchema, trilhaDesfazerSchema, revogarAprovacaoSchema } from '../schemas';
import { registrarAlteracoes, registrarDesfazer, lerTrilha } from '../trilha-campo';
import { NA_STATUS, hasValidApplicability } from '../services/soa-logic';
import { conferirPedidosDoDocumento } from './pedidos';

// Sub-router de controles, montado em /api/v1/controls (FORA de
// /api/v1/projects/:projectId/*, portanto o projectAccessMiddleware não roda
// aqui — o isolamento de tenant é feito por requireResourceAccess em cada rota).
// Extraído de routes/projects.ts para reduzir aquele arquivo sem mudar rota.
export const controlsApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// ——— Gate de aplicabilidade ————————————————————————————————————————————
// Uma guarda só, chamada por TODA rota que grava status ou descrição. Antes a
// regra vivia na tela; `PUT /:id/status` era o caminho por onde um curl marcava
// N/A sem justificativa nenhuma.
type EstadoControle = { status?: string | null; description?: string | null };

/**
 * Devolve a mensagem de recusa, ou null se o estado resultante for válido.
 * Avalia o ESTADO FINAL (o que já está gravado + o que veio no corpo), não só o
 * que a requisição mandou: marcar N/A num controle que já tem justificativa é
 * legítimo, e mandar `description: ''` num controle já N/A não é.
 */
export function recusaAplicabilidade(atual: EstadoControle, entrada: EstadoControle): string | null {
  const statusFinal = entrada.status !== undefined && entrada.status !== null && entrada.status !== ''
    ? entrada.status
    : atual.status;
  if (statusFinal !== NA_STATUS) return null;

  const justificativaFinal = entrada.description !== undefined ? entrada.description : atual.description;
  if (hasValidApplicability({ controlId: '', isApplicable: false, justification: justificativaFinal })) {
    return null;
  }
  return 'Controle não aplicável exige justificativa de exclusão: a SoA não aceita exclusão de escopo sem registro.';
}

controlsApp.get('/', async (c) => {
  const user = c.get('user');
  if (user && (user.role === 'org_admin' || user.role === 'org_user' || user.role === 'client')) {
    // Controles são do n.iso: sem o módulo no projeto ou na pessoa, a lista vem vazia (a rota por projeto daria 403).
    if (!user.client_project_id || (await recusaDoModulo(c.env.DB, user, user.client_project_id, 'iso'))) {
      return c.json([]);
    }
    const { results } = await c.env.DB.prepare('SELECT * FROM compliance_controls WHERE project_id = ? ORDER BY id ASC').bind(user.client_project_id).all();
    return c.json(semRastros(results));
  }
  // Os controles dos projetos que o usuário enxerga (D5 e organização); só o platform_admin vê todos.
  // Só projetos com o n.iso, e só para quem tem o n.iso.
  if (!(await modulosDaPessoa(c.env.DB, user)).includes('iso')) return c.json([]);
  const comIso = `project_id IN (SELECT project_id FROM projeto_modulos WHERE modulo = 'iso')`;
  const v = projetosVisiveis(user);
  const { results } = await (v
    ? c.env.DB.prepare(`SELECT * FROM compliance_controls WHERE project_id IN (${v.sql}) AND ${comIso} ORDER BY id ASC`).bind(v.bind)
    : c.env.DB.prepare(`SELECT * FROM compliance_controls WHERE ${comIso} ORDER BY id ASC`)).all();
  return c.json(semRastros(results));
});

// Atividades do n.privacy que têm medida ligada a este controle (a medida aponta para o controle; aqui o caminho inverso).
controlsApp.get('/:id/atividades', async (c) => {
  try {
    const id = c.req.param('id');
    await requireResourceAccess(c.env.DB, 'compliance_controls', id, c.get('user'));
    const ctrl = await c.env.DB.prepare('SELECT id, project_id FROM compliance_controls WHERE id = ?').bind(id).first<{ id: string; project_id: string }>();
    if (!ctrl) return c.json({ error: 'Controle não encontrado' }, 404);
    const { results } = await c.env.DB.prepare(
      `SELECT r.id AS ropa_id, COALESCE(NULLIF(trim(r.nome), ''), r.processing_purpose) AS atividade, m.medida
         FROM tratamento_medidas m JOIN ropa_records r ON r.id = m.ropa_id AND r.project_id = m.project_id
        WHERE m.controle_id = ? AND m.project_id = ? AND COALESCE(r.status, '') <> 'Inactive'
        ORDER BY atividade, m.medida`
    ).bind(ctrl.id, ctrl.project_id).all<{ ropa_id: string; atividade: string; medida: string }>();
    return c.json({ atividades: results });
  } catch (e) { return erro500(c, 'Falha ao listar as atividades do controle', e); }
});

controlsApp.put('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    // Este router está montado em /api/v1/controls, FORA de
    // /api/v1/projects/:projectId/*, então o projectAccessMiddleware nunca roda
    // aqui: sem esta linha o UPDATE abaixo casa por id apenas e um org_admin
    // reescreve controle de outro tenant.
    await requireResourceAccess(c.env.DB, 'compliance_controls', id, c.get('user'));
    // `maturity` tem endpoint PRÓPRIO (PUT /:id/maturity, validação 0–5). O
    // controlUpdateSchema o descartava em silêncio: retornava 200 sem gravar
    // (no-op enganoso). Rejeita explícito apontando o caminho certo.
    const raw = await c.req.json().catch(() => ({} as any));
    if (raw && raw.maturity !== undefined) {
      return c.json({ error: 'Use PUT /api/v1/controls/:id/maturity para alterar a maturidade (0–5); não é editável por este endpoint.' }, 400);
    }
    const v = await validateBody(c, controlUpdateSchema);
    if (!v.success) return v.response;
    const { status, title, description, owner } = v.data as any;

    const atual = await c.env.DB.prepare(
      'SELECT project_id, status, title, description, maturity, owner FROM compliance_controls WHERE id = ?'
    ).bind(id).first() as any;
    // requireResourceAccess devolve true sem checar existência para papéis de
    // staff, então o 404 precisa ser explícito.
    if (!atual) return c.json({ error: 'Controle não encontrado' }, 404);

    // `description` é o texto da política. O agente propõe política por rascunho (POST .../policy); aqui só passa a
    // justificativa de "Não aplicável", senão este PUT contornaria a regra de que humano publica (fatia 3.2).
    if (c.get('user')?.agente === true && description !== undefined && description !== atual.description && (status || atual.status) !== NA_STATUS) {
      return c.json({ error: 'O agente não altera o texto do controle fora da justificativa de "Não aplicável": o texto da política é o documento: use niso_criar_politica / niso_gerar_secao' }, 403);
    }

    const recusa = recusaAplicabilidade(atual, { status, description });
    if (recusa) return c.json({ error: recusa }, 400);

    const updates: string[] = [];
    const values: any[] = [];
    if (status) { updates.push('status = ?'); values.push(status); }
    if (title) { updates.push('title = ?'); values.push(title); }
    if (description !== undefined) { updates.push('description = ?'); values.push(description); }
    // `owner` é metadado organizacional: grava sem tocar aprovações/maturity/status.
    if (owner !== undefined) { updates.push('owner = ?'); values.push(owner); }
    if (!updates.length) return c.json({ error: 'Nothing to update' }, 400);

    // Controle fora do escopo não tem grau de implementação nem responsável por
    // implementá-lo: manter CMMI e dono deixaria o relatório afirmando as duas
    // coisas. Zera no servidor e não em duas chamadas do cliente, senão a
    // segunda pode nunca chegar.
    const virouNA = status === NA_STATUS && atual.status !== NA_STATUS;
    if (virouNA) updates.push('maturity = 0', 'owner = NULL');

    // `description` é onde mora o texto da política do controle. Um documento
    // aprovado cujo conteúdo mudou não está mais aprovado — manter o carimbo do
    // CISO/CEO sobre texto que eles nunca leram é falsear a trilha de auditoria.
    // O endpoint de edição de política (routes/policies.ts) já zerava; esta rota
    // não, e era por aqui que dava para contornar a invalidação.
    //
    // Compara com o valor gravado de propósito: reenviar o MESMO texto não é
    // mudança de conteúdo e não deve custar a aprovação de quem já assinou.
    const textoMudou = description !== undefined && description !== atual.description;
    if (textoMudou) {
      updates.push(
        'ciso_approved_by = NULL', 'ciso_approved_at = NULL',
        'ciso_approved_ip = NULL', 'ciso_approved_ua = NULL',
        'ceo_approved_by = NULL', 'ceo_approved_at = NULL',
        'ceo_approved_ip = NULL', 'ceo_approved_ua = NULL',
      );
    }

    updates.push("updated_at = datetime('now')");
    values.push(id);
    await c.env.DB.prepare(`UPDATE compliance_controls SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();
    // Título e texto são o conteúdo do pedido de política (`DOCUMENTOS.politica`).
    if (title || description !== undefined) await conferirPedidosDoDocumento(c, 'politica', id, atual.project_id);

    const ator = c.get('user')?.email ?? 'system';

    // Trilha por campo, com rótulo em PT-BR — nunca a chave interna: quem lê o
    // histórico é o consultor e o auditor, não quem escreveu o schema.
    const operacao = c.req.header('X-Operacao') || undefined;
    await registrarAlteracoes(c.env.DB, {
      acao: 'control.updated',
      autor: ator,
      entidade: 'compliance_controls',
      entidadeId: id,
      projectId: atual.project_id,
      operacao,
      alteracoes: [
        { campo: 'Status', antes: atual.status, depois: status ?? atual.status },
        { campo: 'Título', antes: atual.title, depois: title ?? atual.title },
        { campo: 'Justificativa', antes: atual.description, depois: description !== undefined ? description : atual.description },
        ...(virouNA ? [
          { campo: 'Maturidade CMMI', antes: atual.maturity, depois: null },
          { campo: 'Responsável', antes: atual.owner, depois: null },
        ] : []),
      ],
    });
    // Evento próprio: a perda da aprovação é o que o auditor precisa enxergar,
    // e ela ficaria invisível dentro de um "controle atualizado" genérico.
    if (textoMudou) {
      await logAudit(c.env.DB, 'control.approvals_invalidated', ator, `Aprovações do controle ${id} invalidadas: o texto da política mudou`, '', '', atual.project_id);
    }
    // Exclusão de escopo é o evento que o auditor procura primeiro: precisa de
    // entrada própria, não diluída num "controle atualizado".
    if (virouNA) {
      await logAudit(c.env.DB, 'control.excluded_from_scope', ator, `Controle ${id} excluído do escopo com justificativa; maturidade e dono zerados`, '', '', atual.project_id);
    }
    return c.json({ ok: true });
  } catch (e: any) {
    return erro500(c, 'Falha ao atualizar controle', e);
  }
});

controlsApp.put('/:id/maturity', async (c) => {
  try {
    const id = c.req.param('id');
    await requireResourceAccess(c.env.DB, 'compliance_controls', id, c.get('user'));
    const v = await validateBody(c, maturitySchema);
    if (!v.success) return v.response;
    const { maturity } = v.data;

    if (maturity < 0 || maturity > 5) {
      return c.json({ error: 'Maturidade deve ser entre 0 e 5' }, 400);
    }

    const antes = await c.env.DB.prepare(
      'SELECT project_id, status, maturity FROM compliance_controls WHERE id = ?'
    ).bind(id).first() as any;
    if (!antes) return c.json({ error: 'Controle nao encontrado' }, 404);

    // Controle fora do escopo nao tem grau de implementacao: aceitar maturidade
    // nele contradiria o gate de N/A, que zera justamente este campo.
    if (antes.status === NA_STATUS) {
      return c.json({ error: 'Controle nao aplicavel nao tem maturidade: esta fora do escopo.' }, 400);
    }

    await c.env.DB.prepare(
      'UPDATE compliance_controls SET maturity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(maturity, id).run();

    await registrarAlteracoes(c.env.DB, {
      acao: 'control.maturity_updated',
      autor: c.get('user')?.email || 'system',
      entidade: 'compliance_controls',
      entidadeId: id,
      projectId: antes.project_id,
      operacao: c.req.header('X-Operacao') || undefined,
      alteracoes: [{ campo: 'Maturidade CMMI', antes: antes.maturity, depois: maturity }],
    });
    return c.json({ ok: true });
  } catch (e: any) {
    return erro500(c, 'Falha ao atualizar maturidade', e);
  }
});

controlsApp.put('/:id/status', async (c) => {
  try {
    const id = c.req.param('id');
    // Mesma exposição do PUT /:id — e aqui o estrago é pior, porque marcar
    // controle alheio como "Implemented" falseia o SGSI do outro tenant.
    await requireResourceAccess(c.env.DB, 'compliance_controls', id, c.get('user'));
    const v = await validateBody(c, statusSchema);
    if (!v.success) return v.response;
    const { status } = v.data;

    const atual = await c.env.DB.prepare(
      'SELECT project_id, status, description FROM compliance_controls WHERE id = ?'
    ).bind(id).first() as any;
    if (!atual) return c.json({ error: 'Controle não encontrado' }, 404);

    // Esta rota era o bypass do gate: aceita `status` sem `description`, então
    // marcava N/A sem justificativa nenhuma. A guarda é a MESMA do PUT /:id —
    // duas cópias da regra viram duas regras diferentes na primeira alteração.
    const recusa = recusaAplicabilidade(atual, { status });
    if (recusa) return c.json({ error: recusa }, 400);

    const virouNA = status === NA_STATUS && atual.status !== NA_STATUS;
    const extras = virouNA ? ', maturity = 0, owner = NULL' : '';
    await c.env.DB.prepare(
      `UPDATE compliance_controls SET status = ?${extras}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).bind(status, id).run();

    const ator = c.get('user')?.email || 'system';
    await registrarAlteracoes(c.env.DB, {
      acao: 'control.status_updated',
      autor: ator,
      entidade: 'compliance_controls',
      entidadeId: id,
      projectId: atual.project_id,
      operacao: c.req.header('X-Operacao') || undefined,
      alteracoes: [{ campo: 'Status', antes: atual.status, depois: status }],
    });
    if (virouNA) {
      await logAudit(c.env.DB, 'control.excluded_from_scope', ator, `Controle ${id} excluído do escopo com justificativa; maturidade e dono zerados`, '', '', atual.project_id);
    }
    return c.json({ ok: true });
  } catch (e: any) {
    return erro500(c, 'Falha ao atualizar status do controle', e);
  }
});

// A assinatura da política do controle (POST/PUT /:id/approve) saiu: a política é um documento, aprovado por pedido.

/**
 * Histórico do controle: `campo: antes → depois`, autor, quando e o marcador de
 * lote. É o que a tela de detalhe da SoA mostra — a trilha já era gravada e não
 * tinha por onde ser lida.
 */
controlsApp.get('/:id/trilha', async (c) => {
  try {
    const id = c.req.param('id');
    await requireResourceAccess(c.env.DB, 'compliance_controls', id, c.get('user'));
    return c.json({ ok: true, registros: await lerTrilha(c.env.DB, 'compliance_controls', id) });
  } catch (e: any) {
    if (e.message && e.message.startsWith('Forbidden')) return c.json({ error: e.message }, 403);
    return erro500(c, 'Falha ao ler a trilha do controle', e);
  }
});

/**
 * Marca uma operação como desfeita. NÃO apaga linha: `audit_logs` é append-only
 * por trigger do banco. A leitura da trilha é que esconde o par operação+desfazer
 * (ver src/trilha.ts) — o banco guarda os dois fatos para quem exporta a trilha
 * crua, e a tela mostra o que aconteceu de líquido.
 */
controlsApp.post('/:id/trilha/desfazer', async (c) => {
  try {
    const id = c.req.param('id');
    await requireResourceAccess(c.env.DB, 'compliance_controls', id, c.get('user'));
    const v = await validateBody(c, trilhaDesfazerSchema);
    if (!v.success) return v.response;
    const { operacao } = v.data;

    // Só se desfaz operação que existe E que tocou ESTE controle: sem a segunda
    // checagem, um id de operação de outro tenant sumiria da trilha dele.
    const linha = await c.env.DB.prepare(
      `SELECT project_id FROM audit_logs
        WHERE operation_id = ? AND entity_type = 'compliance_controls' AND entity_id = ?
        LIMIT 1`
    ).bind(operacao, id).first() as any;
    if (!linha) return c.json({ error: 'Operação não encontrada para este controle' }, 404);

    await registrarDesfazer(c.env.DB, {
      autor: c.get('user')?.email || 'system',
      operacao,
      projectId: linha.project_id,
      entidade: 'compliance_controls',
      entidadeId: id,
    });
    return c.json({ ok: true });
  } catch (e: any) {
    if (e.message && e.message.startsWith('Forbidden')) return c.json({ error: e.message }, 403);
    return erro500(c, 'Falha ao registrar o desfazer', e);
  }
});

// Colunas de sign-off por papel. Revogar limpa as quatro do papel indicado.
export const COLUNAS_REVOGACAO: Record<'ciso' | 'ceo', string> = {
  ciso: 'ciso_approved_by = NULL, ciso_approved_at = NULL, ciso_approved_ip = NULL, ciso_approved_ua = NULL',
  ceo: 'ceo_approved_by = NULL, ceo_approved_at = NULL, ceo_approved_ip = NULL, ceo_approved_ua = NULL',
};

// Revogar (desaprovar) a assinatura de um controle. Ao contrário de /approve, NÃO
// exige a senha do aprovador original nem acesso de admin: é ação do papel de
// escrita (consultor/platform_admin, via requireResourceAccess), para corrigir
// aprovações inválidas ou sem lastro. `reason` é obrigatório e vai para a trilha.
// Não mexe em `status`: segue a mesma convenção do PUT /:id (invalidação por
// mudança de texto), que também limpa o sign-off sem tocar o status.
controlsApp.post('/:id/revoke-approval', async (c) => {
  try {
    const id = c.req.param('id');
    await requireResourceAccess(c.env.DB, 'compliance_controls', id, c.get('user'));
    const v = await validateBody(c, revogarAprovacaoSchema);
    if (!v.success) return v.response;
    const role = v.data.role;
    const reason = (v.data.reason ?? '').trim();
    if (role !== 'ciso' && role !== 'ceo') return c.json({ error: "Campo 'role' deve ser 'ciso' ou 'ceo'" }, 400);
    if (!reason) return c.json({ error: "Campo 'reason' é obrigatório para revogar uma aprovação" }, 400);

    const atual = await c.env.DB.prepare('SELECT project_id FROM compliance_controls WHERE id = ?').bind(id).first() as any;
    if (!atual) return c.json({ error: 'Controle não encontrado' }, 404);

    await c.env.DB.prepare(
      `UPDATE compliance_controls SET ${COLUNAS_REVOGACAO[role as 'ciso' | 'ceo']}, updated_at = datetime('now') WHERE id = ?`
    ).bind(id).run();

    const ator = c.get('user')?.email ?? 'system';
    await logAudit(c.env.DB, 'control.approval_revoked', ator, `Aprovação ${String(role).toUpperCase()} do controle ${id} revogada. Motivo: ${reason}`, reason, '', atual.project_id);
    return c.json({ ok: true, revoked: true, role });
  } catch (e: any) {
    return erro500(c, 'Falha ao revogar aprovação', e);
  }
});
