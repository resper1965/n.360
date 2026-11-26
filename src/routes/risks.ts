import { Hono } from 'hono';
import type { Bindings, Variables } from '../index';
import { genId, logAudit, requireResourceAccess, erro500, ForbiddenError, refForaDoProjeto, podeMexerEmAssinaturaDe } from '../helpers';
import { validateBody, createRiskSchema, riskUpdateSchema, riscoAceiteSchema, riscoRevogarAceiteSchema, riscoAlcadasSchema } from '../schemas';
import { aceitarRisco, revogarAceite, conferirAceite, recusaDoStatus, comAceite, alcadasDoProjeto, NIVEIS_RISCO, RECUSA_STATUS_ACEITO, RECUSA_EXCLUIR_COM_ACEITE, temAceiteRegistrado, type RiscoBase } from '../services/aceite-risco';
import { conferirPedidosDoDocumento } from './pedidos';
import { escopoRopa } from '../services/escopo-itens';
import { comEvidenciasDoTratamento } from '../services/evidencia-riscos';
import { riskLevel, residualLevel, carimboDeAceite, aceiteCaiu } from '../services/riscos-atividade';

const risks = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Escopo `todos` de propósito: a matriz do n.iso mostra também os riscos das atividades do n.privacy.
risks.get('/api/v1/projects/:projectId/risks', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT r.*, cc.standard as control_standard, cc.title as control_title, pa.nome as owner_parte_nome
     FROM risks r 
     LEFT JOIN compliance_controls cc ON r.control_id = cc.id AND cc.project_id = r.project_id
     LEFT JOIN partes pa ON pa.id = r.owner_parte_id AND pa.project_id = r.project_id
     WHERE r.project_id = ?${escopoRopa('todos', 'r.ropa_id')}
     ORDER BY r.impact * r.probability DESC`
  ).bind(c.req.param('projectId')).all<RiscoBase>();
  // `aceite`: situação do aceite do risco residual (aceito, pendente, revogado), quem e quando, e se esta pessoa pode aceitar.
  const projectId = c.req.param('projectId') ?? '';
  // `evidencias_tratamento`: evidências ligadas ao risco como prova do tratamento (0122); fora do estado aceito.
  return c.json({ ok: true, risks: await comEvidenciasDoTratamento(c.env.DB, projectId, await comAceite(c.env.DB, c.get('user'), projectId, results)) });
});

risks.post('/api/v1/projects/:projectId/risks', async (c) => {
  try {
    const projectId = c.req.param('projectId');
    const valid = await validateBody(c, createRiskSchema);
    if (!valid.success) return valid.response;
    const body = valid.data as any;
    // Aceitar risco é ato humano: o agente (MCP) não grava aceite nem status Accepted.
    if (c.get('user')?.agente === true && (body.status === 'Accepted' || body.accepted_by != null || body.accepted_at != null)) {
      return c.json({ error: 'Forbidden: aceitar risco é ato humano, pela interface' }, 403);
    }
    // Risco não nasce aceito: o aceite do residual é um ato à parte, com senha (services/aceite-risco.ts).
    if (body.status === 'Accepted') return c.json({ error: RECUSA_STATUS_ACEITO }, 403);
    const fora = await refForaDoProjeto(c.env.DB, projectId, body, ['control_id', 'asset_id', 'owner_parte_id']);
    if (fora) return c.json({ error: `${fora} inexistente ou de outro projeto` }, 400);
    const id = genId();
    const impact = body.impact ?? 3;
    const probability = body.probability ?? 3;
    const level = riskLevel(impact * probability);
    // Quem aceitou e quando vêm da sessão (carimbo do servidor); accepted_by/accepted_at do corpo são ignorados.
    const email = c.get('user')?.email ?? 'system';
    const status = body.status ?? 'Open';
    const aceite = carimboDeAceite(null, status, email);

    await c.env.DB.prepare(
      `INSERT INTO risks (id, project_id, asset_id, asset, threat, vulnerability, impact, probability, risk_level, treatment, treatment_plan, control_id, owner, owner_parte_id, status, accepted_by, accepted_at, treatment_due_date, residual_impact, residual_probability, residual_level)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id,
      projectId,
      body.asset_id || null,
      body.asset,
      body.threat,
      body.vulnerability ?? null,
      impact,
      probability,
      level,
      body.treatment ?? 'Mitigate',
      body.treatment_plan ?? null,
      body.control_id || null,
      body.owner ?? null,
      body.owner_parte_id || null,
      status,
      aceite?.accepted_by ?? null,
      aceite?.accepted_at ?? null,
      body.treatment_due_date ?? null,
      body.residual_impact ?? null,
      body.residual_probability ?? null,
      residualLevel(body.residual_impact ?? null, body.residual_probability ?? null)
    ).run();

    // Gravar no histórico de riscos (Cláusula 6.1.2)
    const histId = genId();
    await c.env.DB.prepare(
      `INSERT INTO risk_history (id, risk_id, project_id, impact, probability, risk_level)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(histId, id, projectId, impact, probability, level).run();

    await logAudit(c.env.DB, 'risk.created', email, `Risk ${id} created for project ${projectId}`, '', '', projectId);
    if (aceite) await logAudit(c.env.DB, 'risk.aceito', email, `Risco ${id} aceito`, '', '', projectId);
    return c.json({ ok: true, id, risk_level: level }, 201);
  } catch (e: any) {
    if (e instanceof ForbiddenError) {
      return c.json({ ok: false, error: e.message }, 403);
    }
    return erro500(c, 'Falha ao criar risco', e);
  }
});

risks.put('/api/v1/risks/:id', async (c) => {
  try {
    const id = c.req.param('id');
    await requireResourceAccess(c.env.DB, 'risks', id, c.get('user'));
    const v = await validateBody(c, riskUpdateSchema);
    if (!v.success) return v.response;
    const body = v.data as any;
    // Aceitar risco é ato humano: o agente (MCP) não grava aceite nem status Accepted.
    if (c.get('user')?.agente === true && (body.status === 'Accepted' || body.accepted_by != null || body.accepted_at != null)) {
      return c.json({ error: 'Forbidden: aceitar risco é ato humano, pela interface' }, 403);
    }

    // PUT parcial: campo ausente mantém o valor gravado; null limpa onde a coluna aceita NULL.
    const atual = await c.env.DB.prepare(
      'SELECT project_id, asset_id, asset, threat, vulnerability, impact, probability, treatment, treatment_plan, control_id, owner, owner_parte_id, status, accepted_by, accepted_at, ropa_id, residual_impact, residual_probability, treatment_due_date FROM risks WHERE id = ?'
    ).bind(id).first<Record<string, any>>();
    if (!atual) return c.json({ error: 'Risco não encontrado' }, 404);
    const projectId = atual.project_id;
    // Accepted não se grava pelo PUT (o aceite é o ato com senha); o resto do status é livre e não derruba o aceite.
    const recusaStatus = recusaDoStatus(atual.status, body.status);
    if (recusaStatus) return c.json({ error: recusaStatus }, 403);
    // O projeto vem do risco gravado, nunca do corpo.
    const fora = await refForaDoProjeto(c.env.DB, projectId, body, ['control_id', 'asset_id', 'owner_parte_id', 'ropa_id']);
    if (fora) return c.json({ error: `${fora} inexistente ou de outro projeto` }, 400);

    // Coluna que aceita NULL: ausente mantém, null (ou vazio, nas referências) limpa.
    const anulavel = (k: string, vazioLimpa = false) =>
      body[k] === undefined ? atual[k] : (vazioLimpa ? body[k] || null : body[k]);
    // Coluna NOT NULL: ausente ou null mantém.
    const obrigatoria = (k: string) => body[k] ?? atual[k];
    const impact = obrigatoria('impact') as number;
    const probability = obrigatoria('probability') as number;
    const level = riskLevel(impact * probability);
    // F2 (0073): atividade e residual também são parciais; o nível residual é recalculado com o que fica gravado.
    const residualImpact = anulavel('residual_impact');
    const residualProbability = anulavel('residual_probability');
    // accepted_by/accepted_at do corpo são ignorados. O aceite com senha não depende do status (migration 0121): o status muda
    // livremente e o aceite só cai se o estado aceito mudar (conferirAceite, abaixo). `caiu` e `saiu` são do aceite ANTIGO (status
    // Accepted sem senha, de antes da 0120): notas mudadas ou saída de Accepted o desfazem, como antes.
    const email = c.get('user')?.email ?? 'system';
    // Legado = Accepted sem NENHUMA linha de aceite (o que já teve aceite com senha segue a regra do aceite com senha).
    const legado = atual.status === 'Accepted' && !(await temAceiteRegistrado(c.env.DB, id));
    const caiu = legado && aceiteCaiu(atual as Parameters<typeof aceiteCaiu>[0], { impact, probability, residual_impact: residualImpact, residual_probability: residualProbability, status: obrigatoria('status') });
    const status = caiu ? 'Open' : obrigatoria('status');
    const aceite = carimboDeAceite(atual.status, status, email);
    const saiu = legado && !caiu && status !== 'Accepted';

    await c.env.DB.prepare(
      `UPDATE risks SET asset_id=?, asset=?, threat=?, vulnerability=?, impact=?, probability=?, risk_level=?, treatment=?, treatment_plan=?, control_id=?, owner=?, owner_parte_id=?, status=?, accepted_by=?, accepted_at=?, aceite_manual=CASE WHEN ? THEN 0 ELSE aceite_manual END, ropa_id=?, residual_impact=?, residual_probability=?, residual_level=?, treatment_due_date=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`
    ).bind(
      anulavel('asset_id', true),
      obrigatoria('asset'),
      obrigatoria('threat'),
      anulavel('vulnerability'),
      impact,
      probability,
      level,
      obrigatoria('treatment'),
      anulavel('treatment_plan'),
      anulavel('control_id', true),
      anulavel('owner'),
      anulavel('owner_parte_id', true),
      status,
      caiu || saiu ? null : aceite?.accepted_by ?? atual.accepted_by,
      caiu || saiu ? null : aceite?.accepted_at ?? atual.accepted_at,
      aceite || caiu || saiu ? 1 : 0, // aceite novo pelo servidor (ou desfeito) deixa de ser "registrado à mão"
      anulavel('ropa_id', true),
      residualImpact,
      residualProbability,
      residualLevel(residualImpact, residualProbability),
      anulavel('treatment_due_date', true),
      id
    ).run();

    // Gravar no histórico sempre que houver atualização (Cláusula 6.1.2)
    if (projectId) {
      const histId = genId();
      await c.env.DB.prepare(
        `INSERT INTO risk_history (id, risk_id, project_id, impact, probability, risk_level)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).bind(histId, id, projectId, impact, probability, level).run();
    }
    // Aceite com senha: mudou o que foi aceito (notas, residual, estratégia, plano, controle), o aceite cai (o status não muda).
    // O pedido de aceite aberto acompanha o conteúdo novo. O aceite antigo (sem senha) segue a regra das notas, abaixo.
    const invalidou = await conferirAceite(c.env.DB, id, email);
    await conferirPedidosDoDocumento(c, 'risco', id, projectId);
    if (caiu && !invalidou) await logAudit(c.env.DB, 'risk.aceite_invalidado', email, `Risco ${id}: as notas mudaram depois do aceite; voltou a Aberto`, '', '', projectId);
    if (saiu) await logAudit(c.env.DB, 'risk.aceite_invalidado', email, `Risco ${id}: saiu de Aceito para ${status}; aceite desfeito`, '', '', projectId);

    return c.json({ ok: true, id, risk_level: level });
  } catch (e: any) {
    if (e instanceof ForbiddenError) {
      return c.json({ ok: false, error: e.message }, 403);
    }
    return erro500(c, 'Falha ao atualizar risco', e);
  }
});

risks.delete('/api/v1/risks/:id', async (c) => {
  try {
    const id = c.req.param('id');
    await requireResourceAccess(c.env.DB, 'risks', id, c.get('user'));
    if (await temAceiteRegistrado(c.env.DB, id)) return c.json({ error: RECUSA_EXCLUIR_COM_ACEITE }, 409);
    // A ação corretiva sobrevive ao risco (o FK é CASCADE): solta antes, como apagarRisco.
    await c.env.DB.batch([
      c.env.DB.prepare('UPDATE corrective_actions SET risk_id = NULL WHERE risk_id = ?').bind(id),
      c.env.DB.prepare('DELETE FROM risks WHERE id = ?').bind(id),
    ]);
    return c.json({ ok: true });
  } catch (e: any) {
    if (e instanceof ForbiddenError) return c.json({ ok: false, error: e.message }, 403);
    return erro500(c, 'Falha ao excluir risco', e);
  }
});

// ─── Aceite do risco residual (ISO/IEC 27001, 6.1.3 e; migration 0120) ───────────────────────────────────
// Um risco por chamada, com a senha de quem tem a alçada do nível residual. Sem rota de lote, de propósito.
risks.post('/api/v1/risks/:id/aceite', async (c) => {
  try {
    const id = c.req.param('id');
    await requireResourceAccess(c.env.DB, 'risks', id, c.get('user'));
    const v = await validateBody(c, riscoAceiteSchema);
    if (!v.success) return v.response;
    const r = await aceitarRisco(c.env.DB, c.get('user'), id, {
      senha: v.data.senha, justificativa: v.data.justificativa || null, hashVisto: v.data.hash_visto,
      ip: c.req.header('CF-Connecting-IP') || null, ua: c.req.header('User-Agent') || null,
    });
    return c.json(r.corpo, r.status as 200);
  } catch (e) {
    if (e instanceof ForbiddenError) return c.json({ ok: false, error: e.message }, 403);
    return erro500(c, 'Falha ao aceitar o risco', e);
  }
});

risks.post('/api/v1/risks/:id/aceite/revogar', async (c) => {
  try {
    const id = c.req.param('id');
    await requireResourceAccess(c.env.DB, 'risks', id, c.get('user'));
    const v = await validateBody(c, riscoRevogarAceiteSchema);
    if (!v.success) return v.response;
    const r = await revogarAceite(c.env.DB, c.get('user'), id, v.data.motivo, v.data.senha, c.req.header('CF-Connecting-IP') || null);
    return c.json(r.corpo, r.status as 200);
  } catch (e) {
    if (e instanceof ForbiddenError) return c.json({ ok: false, error: e.message }, 403);
    return erro500(c, 'Falha ao revogar o aceite', e);
  }
});

/** Todos os aceites do risco, do mais recente ao mais antigo (vigente, invalidados e revogados), sem IP nem navegador. */
risks.get('/api/v1/risks/:id/aceites', async (c) => {
  try {
    const id = c.req.param('id');
    await requireResourceAccess(c.env.DB, 'risks', id, c.get('user'));
    const { results } = await c.env.DB.prepare(
      `SELECT id, aceito_por, aceito_nome, papel, aceito_em, nivel_residual, estrategia, controles_json, conteudo_json, hash, justificativa, pedido_id,
              situacao, encerrado_em, encerrado_por, motivo FROM risco_aceites WHERE risk_id = ? ORDER BY aceito_em DESC`
    ).bind(id).all();
    return c.json({ ok: true, aceites: results });
  } catch (e) {
    if (e instanceof ForbiddenError) return c.json({ ok: false, error: e.message }, 403);
    return erro500(c, 'Falha ao ler os aceites do risco', e);
  }
});

// Alçada de aceite por nível do residual: lê quem alcança o projeto; muda só o administrador do cliente no projeto
// (a mesma regra da linha de quem assina na Governança).
risks.get('/api/v1/projects/:projectId/risco-alcadas', async (c) => {
  return c.json({ ok: true, alcadas: await alcadasDoProjeto(c.env.DB, c.req.param('projectId') ?? '') });
});

risks.put('/api/v1/projects/:projectId/risco-alcadas', async (c) => {
  try {
    const projectId = c.req.param('projectId') ?? '';
    const user = c.get('user');
    if (user?.agente === true || !(await podeMexerEmAssinaturaDe(c.env.DB, user, projectId))) {
      return c.json({ error: 'A alçada de aceite de risco é do cliente: só o administrador do cliente neste projeto a muda.' }, 403);
    }
    const v = await validateBody(c, riscoAlcadasSchema);
    if (!v.success) return v.response;
    const antes = await alcadasDoProjeto(c.env.DB, projectId);
    const mudou = NIVEIS_RISCO.filter((n) => v.data.alcadas[n] && v.data.alcadas[n] !== antes[n]);
    if (mudou.length) {
      await c.env.DB.batch(mudou.map((n) => c.env.DB.prepare(
        `INSERT INTO risco_alcadas (project_id, nivel, papel, atualizado_por) VALUES (?, ?, ?, ?)
         ON CONFLICT(project_id, nivel) DO UPDATE SET papel = excluded.papel, atualizado_por = excluded.atualizado_por, atualizado_em = CURRENT_TIMESTAMP`
      ).bind(projectId, n, v.data.alcadas[n], user.email)));
      await logAudit(c.env.DB, 'risco.alcada', user.email, `Alçada de aceite de risco: ${mudou.map((n) => `${n} ${antes[n]} -> ${v.data.alcadas[n]}`).join('; ')}`, '', '', projectId);
    }
    return c.json({ ok: true, alcadas: await alcadasDoProjeto(c.env.DB, projectId) });
  } catch (e) {
    return erro500(c, 'Falha ao gravar a alçada de aceite', e);
  }
});

risks.get('/api/v1/projects/:projectId/risks/history', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT rh.*, r.asset, r.threat FROM risk_history rh JOIN risks r ON rh.risk_id = r.id WHERE rh.project_id = ? ORDER BY rh.assessment_date DESC'
  ).bind(c.req.param('projectId')).all();
  return c.json({ ok: true, history: results });
});

export default risks;
