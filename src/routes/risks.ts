import { Hono } from 'hono';
import type { Bindings, Variables } from '../index';
import { genId, logAudit, requireResourceAccess, erro500, ForbiddenError, refForaDoProjeto } from '../helpers';
import { validateBody, createRiskSchema, riskUpdateSchema } from '../schemas';
import { riskLevel, residualLevel, carimboDeAceite, aceiteCaiu } from '../services/riscos-atividade';

const risks = new Hono<{ Bindings: Bindings; Variables: Variables }>();

risks.get('/api/v1/projects/:projectId/risks', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT r.*, cc.standard as control_standard, cc.title as control_title, pa.nome as owner_parte_nome
     FROM risks r 
     LEFT JOIN compliance_controls cc ON r.control_id = cc.id AND cc.project_id = r.project_id
     LEFT JOIN partes pa ON pa.id = r.owner_parte_id AND pa.project_id = r.project_id
     WHERE r.project_id = ? 
     ORDER BY r.impact * r.probability DESC`
  ).bind(c.req.param('projectId')).all();
  return c.json({ ok: true, risks: results });
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
    // Aceite carimbado pelo servidor só na transição para Accepted; accepted_by/accepted_at do corpo são ignorados.
    const email = c.get('user')?.email ?? 'system';
    const caiu = aceiteCaiu(atual as Parameters<typeof aceiteCaiu>[0], { impact, probability, residual_impact: residualImpact, residual_probability: residualProbability, status: obrigatoria('status') });
    const status = caiu ? 'Open' : obrigatoria('status');
    const aceite = carimboDeAceite(atual.status, status, email);
    // Sair de Accepted por status explícito também desfaz o aceite: o carimbo não sobrevive ao status.
    const saiu = !caiu && atual.status === 'Accepted' && status !== 'Accepted';

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
    if (aceite) await logAudit(c.env.DB, 'risk.aceito', email, `Risco ${id} aceito`, '', '', projectId);
    if (caiu) await logAudit(c.env.DB, 'risk.aceite_invalidado', email, `Risco ${id}: as notas mudaram depois do aceite; voltou a Aberto`, '', '', projectId);
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

risks.get('/api/v1/projects/:projectId/risks/history', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT rh.*, r.asset, r.threat FROM risk_history rh JOIN risks r ON rh.risk_id = r.id WHERE rh.project_id = ? ORDER BY rh.assessment_date DESC'
  ).bind(c.req.param('projectId')).all();
  return c.json({ ok: true, history: results });
});

export default risks;
