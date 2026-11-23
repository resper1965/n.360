import { Hono, type Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { Bindings, Variables } from '../index';
import { semRastroDeAssinatura, semRastros, genId, logAudit, requireResourceAccess, verifyPassword, validateUpload, autoridadeDeAssinatura, recusaDeAssinatura, recusaSenhaDeOutro, erro500, registraErro, idDoControle } from '../helpers';
import type { PapelAssinatura } from '../helpers';
import { EvidenceAgent } from '../agents/evidence';
import { listPaged } from '../helpers';
import { validateBody, evidenceContentSchema, evidenciaVincularSchema, evidenciaTextoSchema, evidenciaAssinarSchema, evidenciaAvaliacaoSchema, evidenciaControleSchema } from '../schemas';
import { comControles, ligarControle, desligarControle } from '../services/evidencia-controles';
import { recusaDoModulo } from '../modulos';

/**
 * Confere que o documento existe, é do MESMO projeto e está `vigente`. Devolve a
 * mensagem de erro (400) ou `null` se pode vincular. Obsoleto/rascunho é recusado:
 * evidência só acompanha documento vigente (a ligação é ao documento, que resolve
 * à versão vigente, não a uma versão fixa). Usado no PUT e no upload.
 */
async function erroDocumentoVigente(db: Bindings['DB'], projectId: string, docId: string): Promise<string | null> {
  const doc = await db.prepare('SELECT status FROM documentos WHERE id = ? AND project_id = ?').bind(docId, projectId).first<{ status: string }>();
  // Mesma resposta para inexistente e de outro projeto (não revela documento alheio).
  if (!doc) return 'Documento não encontrado neste projeto';
  if (doc.status !== 'vigente') return `Documento não está vigente (status: ${doc.status}); vincule a versão vigente do documento`;
  return null;
}

export const evidenceApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();
export const projectEvidenceApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();


// ─── Direct Evidence Router (/api/v1/evidence) ─────────────────────────────

evidenceApp.get('/:id/detail', async (c) => {
  try {
    const id = c.req.param('id');
    await requireResourceAccess(c.env.DB, 'evidence', id, c.get('user'));
    const evidence = await c.env.DB.prepare('SELECT * FROM evidence WHERE id = ?').bind(id).first<any>();
    if (!evidence) return c.json({ error: 'Evidência não encontrada' }, 404);
    const [comCtrl] = await comControles(c.env.DB, evidence.project_id, [evidence]);
    return c.json(semRastroDeAssinatura(comCtrl));
  } catch (e: any) {
    return erro500(c, 'Falha ao buscar detalhe da evidência', e);
  }
});

async function downloadEvidence(c: any, id: string) {
  try {
    await requireResourceAccess(c.env.DB, 'evidence', id, c.get('user'));
    const ev = await c.env.DB.prepare('SELECT * FROM evidence WHERE id = ?').bind(id).first();
    if (!ev || !ev.r2_key) return c.json({ error: 'Evidência não encontrada' }, 404);

    const obj = await c.env.STORAGE.get(ev.r2_key);
    if (!obj) return c.json({ error: 'Arquivo da evidência não encontrado no R2' }, 404);

    const headers = new Headers();
    obj.writeHttpMetadata(headers);
    headers.set('etag', obj.httpEtag);
    headers.set('Content-Disposition', `attachment; filename="${encodeURIComponent(ev.file_name || 'evidencia')}"`);

    return new Response(obj.body, { headers });
  } catch (e: any) {
    return erro500(c, 'Falha ao baixar evidência', e);
  }
}

evidenceApp.get('/:id/download', async (c) => downloadEvidence(c, c.req.param('id')));
projectEvidenceApp.get('/:evidenceId/download', async (c) => downloadEvidence(c, c.req.param('evidenceId')));

evidenceApp.get('/:id/content', async (c) => {
  try {
    const id = c.req.param('id');
    await requireResourceAccess(c.env.DB, 'evidence', id, c.get('user'));
    const ev = await c.env.DB.prepare('SELECT * FROM evidence WHERE id = ?').bind(id).first<any>();
    if (!ev || !ev.r2_key) return c.json({ error: 'Evidência não encontrada' }, 404);

    const obj = await c.env.STORAGE.get(ev.r2_key);
    if (!obj) return c.json({ error: 'Conteúdo não encontrado no R2' }, 404);

    const content = await obj.text();
    return c.json({ ok: true, file_name: ev.file_name, content });
  } catch (e: any) {
    return erro500(c, 'Falha ao buscar conteúdo da evidência', e);
  }
});

evidenceApp.put('/:id/content', async (c) => {
  try {
    const id = c.req.param('id');
    await requireResourceAccess(c.env.DB, 'evidence', id, c.get('user'));
    const v = await validateBody(c, evidenceContentSchema);
    if (!v.success) return v.response;
    const { content } = v.data;
    if (content === undefined) return c.json({ error: 'Campo "content" é obrigatório' }, 400);

    const ev = await c.env.DB.prepare('SELECT * FROM evidence WHERE id = ?').bind(id).first<any>();
    if (!ev || !ev.r2_key) return c.json({ error: 'Evidência não encontrada' }, 404);
    // Só documento em texto se edita: gravar texto sobre um PDF ou imagem destruía o arquivo enviado (o R2 não guarda versão).
    if (!['text/markdown', 'text/plain'].includes(String(ev.file_type ?? ''))) {
      return c.json({ error: 'Só documento em texto se edita aqui; para trocar o arquivo, envie uma evidência nova' }, 409);
    }

    const encoder = new TextEncoder();
    const arrayBuffer = encoder.encode(content);
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const realSha256 = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    const user = c.get('user');
    await c.env.STORAGE.put(ev.r2_key, arrayBuffer, {
      httpMetadata: { contentType: ev.file_type || 'text/markdown' }
    });

    // Conteúdo novo é documento novo: a revisão e as assinaturas eram do texto anterior.
    // Sem isto o cliente (org_user pode editar) reescrevia documento já revisado e ele seguia conforme.
    await c.env.DB.prepare(
      `UPDATE evidence SET file_size = ?, file_hash = ?, uploaded_by = ?, evaluation_status = 'pending', evaluation_score = NULL, evaluation_notes = NULL, avaliacao_ia = NULL,
         ciso_approved_by = NULL, ciso_approved_at = NULL, ciso_approved_ip = NULL, ciso_approved_ua = NULL,
         ceo_approved_by = NULL, ceo_approved_at = NULL, ceo_approved_ip = NULL, ceo_approved_ua = NULL,
         updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).bind(arrayBuffer.byteLength, realSha256, user?.email || 'system', id).run();

    const assinaram = [ev.ciso_approved_by ? `Líder SGSI (${ev.ciso_approved_by})` : '', ev.ceo_approved_by ? `Direção (${ev.ceo_approved_by})` : ''].filter(Boolean).join(' e ') || 'ninguém';
    await logAudit(c.env.DB, 'evidence.content_updated', user?.email || 'system',
      `Conteúdo da evidência ${id} atualizado. Status anterior: ${ev.evaluation_status ?? 'pending'}; assinaturas apagadas de: ${assinaram}; autor anterior ${ev.uploaded_by ?? '-'} -> ${user?.email || 'system'}; hash ${ev.file_hash ?? '-'} -> ${realSha256}.`, '', '', ev.project_id ?? undefined);
    return c.json({ ok: true, sha256: realSha256 });
  } catch (e: any) {
    return erro500(c, 'Falha ao atualizar conteúdo da evidência', e);
  }
});

evidenceApp.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    await requireResourceAccess(c.env.DB, 'evidence', id, c.get('user'));
    const ev = await c.env.DB.prepare('SELECT file_name, r2_key, project_id FROM evidence WHERE id = ?').bind(id).first<any>();
    if (!ev) return c.json({ error: 'Evidência não encontrada' }, 404);

    // `checklist_progress.evidence_id` referencia `evidence` SEM ON DELETE: a FK
    // (RESTRICT) derrubava o DELETE com 500 quando um item de checklist apontava
    // para a evidência. Soltamos o vínculo
    // primeiro — o item permanece, como faria ON DELETE SET NULL — e apagamos na
    // MESMA transação (`db.batch`). As outras FKs para `evidence`
    // (evidencia_requisitos, ot_requisito_evidencias) são ON DELETE CASCADE.
    // Falha do R2 depois disso vira objeto órfão — vai ao log, não desfaz a exclusão.
    const soltos = (await c.env.DB.prepare('SELECT item_id FROM checklist_progress WHERE evidence_id = ?').bind(id).all<{ item_id: string }>()).results.map((x) => x.item_id);
    const r = await c.env.DB.batch([
      c.env.DB.prepare('UPDATE checklist_progress SET evidence_id = NULL WHERE evidence_id = ?').bind(id),
      c.env.DB.prepare('DELETE FROM evidence WHERE id = ?').bind(id),
    ]);
    const itensSoltos = r[0]?.meta?.changes ?? 0;
    if (ev.r2_key) {
      await c.env.STORAGE.delete(ev.r2_key).catch((e: unknown) => registraErro(c, e));
    }
    await logAudit(c.env.DB, 'evidence.deleted', c.get('user')?.email ?? 'system', `Evidência ${ev.file_name} excluída permanentemente${itensSoltos ? `; ${itensSoltos} item(ns) de checklist desvinculado(s): ${soltos.join(', ')}` : ''}.`, '', '', ev.project_id);
    return c.json({ ok: true });
  } catch (e: any) {
    return erro500(c, 'Erro ao excluir evidência', e);
  }
});

// Re-associa (ou desassocia) uma evidência a um controle e/ou a um documento
// vigente. Faltava caminho de API para o documento — o PUT antes só lia
// control_id, então documento_id vinha no corpo e era ignorado em silêncio.
evidenceApp.put('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    await requireResourceAccess(c.env.DB, 'evidence', id, c.get('user'));
    const ev = await c.env.DB.prepare('SELECT id, project_id, control_id, documento_id, file_hash, ciso_approved_by, ceo_approved_by FROM evidence WHERE id = ?').bind(id).first<any>();
    if (!ev) return c.json({ error: 'Evidência não encontrada' }, 404);

    const v = await validateBody(c, evidenciaVincularSchema);
    if (!v.success) return v.response;
    const body = v.data;
    const temControle = 'control_id' in body;
    const temDocumento = 'documento_id' in body;
    if (!temControle && !temDocumento) {
      return c.json({ error: 'Envie control_id e/ou documento_id (null para desassociar).' }, 400);
    }

    const resp: Record<string, unknown> = { ok: true };
    const novoDoc = temDocumento ? (body.documento_id ?? null) : null;
    const novoControle = temControle ? (body.control_id ?? null) : null;

    // Validar TODOS os alvos ANTES de qualquer escrita: com documento_id válido e
    // control_id inválido, antes gravava o documento e só então recusava com 400 —
    // uma gravação parcial sob resposta de erro. Agora nada é escrito num 400.
    if (temDocumento && novoDoc !== null) {
      const erro = await erroDocumentoVigente(c.env.DB, ev.project_id, novoDoc);
      if (erro) return c.json({ error: erro }, 400);
    }
    if (temControle && novoControle !== null) {
      // Aterramento de tenant: só vincula a um controle DO MESMO projeto. Mesma
      // resposta para inexistente e de outro projeto (como no upload): um 403
      // distinto confirmava que o id existe em outro tenant.
      const ctrl = await c.env.DB.prepare('SELECT 1 FROM compliance_controls WHERE id = ? AND project_id = ?').bind(novoControle, ev.project_id).first();
      if (!ctrl) return c.json({ error: 'Controle não encontrado neste projeto' }, 400);
    }

    // documento_id: liga a evidência ao DOCUMENTO vigente do projeto (não a uma
    // versão fixa). Ortogonal ao controle: não mexe em avaliação nem assinatura.
    if (temDocumento) {
      const mudouDoc = novoDoc !== (ev.documento_id ?? null);
      if (mudouDoc) {
        await c.env.DB.prepare(`UPDATE evidence SET documento_id = ?, updated_at = datetime('now') WHERE id = ?`).bind(novoDoc, id).run();
        await logAudit(c.env.DB, 'evidence.documento_vinculado', c.get('user')?.email ?? 'system', `Evidência ${id}: documento ${ev.documento_id ?? '(nenhum)'} -> ${novoDoc ?? '(nenhum)'}.`, '', '', ev.project_id);
      }
      resp.documento_id = novoDoc;
      resp.documento_relinked = mudouDoc;
    }

    if (temControle) {
      // Troca o controle PRINCIPAL (N:N, 0119): liga o novo e só então desliga o antigo, para o principal não pular para
      // outro vínculo no meio. Avaliação e assinaturas ficam: valem para o conteúdo (hash), não para o vínculo.
      const mudou = novoControle !== (ev.control_id ?? null);
      if (mudou) {
        const quem = c.get('user')?.email ?? 'system';
        if (novoControle) {
          await ligarControle(c.env.DB, ev, novoControle, quem);
          await c.env.DB.prepare(`UPDATE evidence SET control_id = ?, updated_at = datetime('now') WHERE id = ?`).bind(novoControle, id).run();
        }
        // Sem controle novo, o principal passa ao vínculo mais antigo que sobrar (ou a NULL).
        if (ev.control_id) await desligarControle(c.env.DB, id, ev.control_id);
        await logAudit(c.env.DB, 'evidence.relinked', quem, `Evidência ${id} re-associada: controle ${ev.control_id ?? '(nenhum)'} -> ${novoControle ?? '(nenhum)'}.${await aprovacaoAgora(c.env.DB, id, ev)}`, '', '', ev.project_id);
      }
      resp.control_id = novoControle;
      resp.relinked = mudou;
      // Mantido por compatibilidade: trocar o vínculo não zera mais a aprovação.
      resp.approvals_reset = false;
    }

    return c.json(resp);
  } catch (e: any) {
    return erro500(c, 'Erro ao re-associar evidência', e);
  }
});

/**
 * A aprovação (Líder SGSI e Direção) vale para a EVIDÊNCIA, isto é, para o conteúdo que tem aquele hash, e não para o
 * vínculo com um controle: ligar, desligar ou trocar controle não a zera; mudar o conteúdo (hash novo, PUT .../content)
 * zera. A trilha da mudança de vínculo diz que a aprovação ficou e de qual hash ela é.
 */
type Aprovacoes = { file_hash: string | null; ciso_approved_by: string | null; ceo_approved_by: string | null };
/** O estado de aprovação lido de novo, logo depois de mudar o vínculo: a trilha não registra uma assinatura ou um hash que mudou no meio. */
const aprovacaoAgora = async (db: D1Database, id: string, antes: Aprovacoes) =>
  aprovacaoMantida((await db.prepare('SELECT file_hash, ciso_approved_by, ceo_approved_by FROM evidence WHERE id = ?').bind(id).first<Aprovacoes>()) ?? antes);
const aprovacaoMantida = (ev: Aprovacoes) => {
  const quem = [ev.ciso_approved_by ? `Líder SGSI (${ev.ciso_approved_by})` : '', ev.ceo_approved_by ? `Direção (${ev.ceo_approved_by})` : ''].filter(Boolean).join(' e ');
  return quem ? ` Aprovação mantida: ${quem}, conteúdo ${ev.file_hash ?? '-'}.` : '';
};

// Liga a evidência a mais um controle do mesmo projeto (N:N). Não mexe em avaliação nem em assinatura:
// a aprovação vale para o conteúdo da evidência (hash), não para o vínculo. A mudança vai para a trilha.
evidenceApp.post('/:id/controles', async (c) => {
  try {
    const id = c.req.param('id');
    await requireResourceAccess(c.env.DB, 'evidence', id, c.get('user'));
    const ev = await c.env.DB.prepare('SELECT id, project_id, file_hash, ciso_approved_by, ceo_approved_by FROM evidence WHERE id = ?').bind(id).first<{ id: string; project_id: string } & Aprovacoes>();
    if (!ev) return c.json({ error: 'Evidência não encontrada' }, 404);
    // A evidência é do núcleo, o controle é do n.iso: ligar e desligar exigem o n.iso no projeto e na pessoa (como as rotas de controle).
    const semIso = await recusaDoModulo(c.env.DB, c.get('user'), ev.project_id, 'iso');
    if (semIso) return c.json({ error: semIso }, 403);
    const v = await validateBody(c, evidenciaControleSchema);
    if (!v.success) return v.response;
    // Mesma resposta para controle inexistente e de outro projeto. Aceita o id da linha ou o código ("A.5.1").
    const controlId = await idDoControle(c.env.DB, ev.project_id, v.data.control_id);
    if (!controlId) return c.json({ error: 'Controle não encontrado neste projeto' }, 400);
    const quem = c.get('user')?.email ?? 'system';
    const ligou = await ligarControle(c.env.DB, ev, controlId, quem);
    if (ligou) await logAudit(c.env.DB, 'evidence.controle_ligado', quem, `Evidência ${id} ligada ao controle ${controlId}.${await aprovacaoAgora(c.env.DB, id, ev)}`, '', '', ev.project_id);
    return c.json({ ok: true, control_id: controlId, ligado: ligou }, ligou ? 201 : 200);
  } catch (e) {
    return erro500(c, 'Erro ao ligar a evidência ao controle', e);
  }
});

evidenceApp.delete('/:id/controles/:controlId', async (c) => {
  try {
    const id = c.req.param('id');
    await requireResourceAccess(c.env.DB, 'evidence', id, c.get('user'));
    const ev = await c.env.DB.prepare('SELECT id, project_id, file_hash, ciso_approved_by, ceo_approved_by FROM evidence WHERE id = ?').bind(id).first<{ id: string; project_id: string } & Aprovacoes>();
    if (!ev) return c.json({ error: 'Evidência não encontrada' }, 404);
    // A evidência é do núcleo, o controle é do n.iso: ligar e desligar exigem o n.iso no projeto e na pessoa (como as rotas de controle).
    const semIso = await recusaDoModulo(c.env.DB, c.get('user'), ev.project_id, 'iso');
    if (semIso) return c.json({ error: semIso }, 403);
    const controlId = c.req.param('controlId');
    const desligou = await desligarControle(c.env.DB, id, controlId);
    if (!desligou) return c.json({ error: 'A evidência não está ligada a este controle' }, 404);
    const quem = c.get('user')?.email ?? 'system';
    await logAudit(c.env.DB, 'evidence.controle_desligado', quem, `Evidência ${id} desligada do controle ${controlId}.${await aprovacaoAgora(c.env.DB, id, ev)}`, '', '', ev.project_id);
    return c.json({ ok: true, control_id: controlId });
  } catch (e) {
    return erro500(c, 'Erro ao desligar a evidência do controle', e);
  }
});

evidenceApp.post('/:id/evaluate', async (c) => {
  try {
    const evidenceId = c.req.param('id');
    await requireResourceAccess(c.env.DB, 'evidence', evidenceId, c.get('user'));
    const v = await validateBody(c, evidenciaTextoSchema);
    if (!v.success) return v.response;
    const body = v.data;

    if (!body.text) {
      return c.json({ error: 'Campo "text" é obrigatório (texto extraído do documento)' }, 400);
    }

    const evidence = await c.env.DB.prepare('SELECT * FROM evidence WHERE id = ?').bind(evidenceId).first<any>();
    if (!evidence) return c.json({ error: 'Evidência não encontrada' }, 404);

    let controlRef = '';
    if (evidence.control_id) {
      const ctrl = await c.env.DB.prepare('SELECT title, description FROM compliance_controls WHERE id = ?').bind(evidence.control_id).first<any>();
      if (ctrl) controlRef = `${evidence.control_id}: ${ctrl.title}. ${ctrl.description || ''}`;
    }

    const agent = new EvidenceAgent(c.env.AI, c.env.DB, c.env);
    const result = await agent.run(body.text, {
      organizationId: evidence.project_id || '',
      controlId: evidence.control_id || 'N/A',
      standardReference: controlRef || undefined,
    });

    if (!result.success) {
      // result.content traz o texto cru de cada provedor de IA: vai ao log, não ao cliente.
      return erro500(c, 'Falha ao avaliar evidência', new Error(result.content));
    }

    // O veredito vem na linha "Veredito:" (prompt do EvidenceAgent). Antes, includes('CONFORME')
    // casava também "NÃO CONFORME" e gravava conforming para evidência reprovada.
    // Duas opções na linha (ou o eco "[CONFORME | PARCIAL | NÃO CONFORME]" do template) = sem veredito.
    // A IA nunca grava conforming: conforme é a assinatura do Líder SGSI. CONFORME da IA fica pending.
    const linha = (/Veredito:[ \t]*([^\n]*)/i.exec(result.content)?.[1] ?? '')
      .toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const sinais = linha.includes('|') ? [] : [
      /NAO\s+CONFORME/.test(linha) && 'non_conforming',
      /PARCIAL/.test(linha) && 'partial',
      /(?<!NAO\s)(?<!PARCIALMENTE\s)\bCONFORME/.test(linha) && 'pending',
    ].filter(Boolean) as string[];
    const evalStatus = sinais.length === 1 ? sinais[0] : 'pending';

    // A IA grava em `avaliacao_ia` (coluna própria) e no score; NUNCA em
    // `evaluation_notes`, que é a nota humana — antes a reavaliação a apagava.
    // Evidência já assinada pelo Líder SGSI mantém o status.
    await c.env.DB.prepare(
      `UPDATE evidence SET evaluation_status = CASE WHEN ciso_approved_by IS NOT NULL THEN evaluation_status ELSE ? END,
         evaluation_score = ?, avaliacao_ia = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).bind(evalStatus, result.confidence || 0, result.content, evidenceId).run();

    await logAudit(c.env.DB, 'evidence.evaluated', c.get('user')?.email ?? 'system', evidence.ciso_approved_by
      ? `Evidência ${evidenceId} reavaliada pela IA (${evalStatus}); status mantido (já assinada).`
      : `Evidência ${evidenceId} avaliada como ${evalStatus}.`, '', '', evidence.project_id);

    return c.json({
      ok: true,
      evaluation_status: evidence.ciso_approved_by ? evidence.evaluation_status : evalStatus,
      evaluation_markdown: result.content,
      confidence: result.confidence,
      control: evidence.control_id,
      metadata: result.metadata
    });
  } catch (e: any) {
    return erro500(c, 'Falha ao avaliar evidência', e);
  }
});

// `uploaded_by` é o e-mail de quem enviou; evidência criada pelo agente grava "agente de <email> (<projeto>)".
const enviadoPor = (u: string) => (/^agente de (\S+) \(/i.exec(u)?.[1] ?? u).toLowerCase();

const MUDOU = 'O conteúdo da evidência mudou desde que você abriu; recarregue e revise de novo';

export type ResultadoAprovacao = { status: number; corpo: Record<string, unknown> };

/**
 * A assinatura de UMA evidência, sem resposta HTTP: serve à rota individual e ao lote (`POST /pedidos/lote`). `password`
 * é a senha a conferir (a rota); no lote ela é conferida uma vez antes e vem `null`, com o `dbUser` já lido. `fileHash` é o
 * conteúdo que a pessoa viu: o UPDATE só pega se a evidência ainda tem esse hash.
 */
export async function assinarEvidencia(
  c: Context<{ Bindings: Bindings; Variables: Variables }>, user: NonNullable<Variables['user']>, id: string,
  a: { password: string | null; dbUser?: { password_hash: string; name: string | null }; fileHash?: string; role?: string | null },
): Promise<ResultadoAprovacao> {
  await requireResourceAccess(c.env.DB, 'evidence', id, user);
  const evidence = await c.env.DB.prepare('SELECT * FROM evidence WHERE id = ?').bind(id).first<{ project_id: string; uploaded_by: string | null; evaluation_status: string | null }>();
  if (!evidence) return { status: 404, corpo: { error: 'Evidência não encontrada' } };
  const dbUser = a.dbUser ?? await c.env.DB.prepare('SELECT password_hash, name FROM users WHERE id = ? OR email = ?').bind(user.id || '', user.email || '').first<{ password_hash: string; name: string | null }>();
  if (!dbUser || (a.password !== null && !(await verifyPassword(a.password, dbUser.password_hash)))) {
    return { status: 401, corpo: { error: 'Senha incorreta para assinatura eletrônica' } };
  }

  const email = user.email || '';
  let targetRole = a.role;
  let approvedBy = dbUser.name;

  // A matriz de governança vale para TODO MUNDO, inclusive `platform_admin`.
  // Antes, papel de plataforma pulava esta checagem inteira e assinava como
  // Líder SGSI em qualquer projeto — mas papel de plataforma diz o que a
  // pessoa OPERA, não quem ela É num projeto específico. A mesma pessoa é DPO
  // num cliente, consultor noutro e nada num terceiro; é a matriz que sabe
  // disso, e por isso ela é a única fonte de autoridade de assinatura.
  const autoridade = await autoridadeDeAssinatura(c.env.DB, evidence.project_id, user);

  // Sem papel explícito no corpo, deduz do cargo designado.
  if (!targetRole) {
    if (autoridade.ehLiderSgsi) targetRole = 'ciso';
    else if (autoridade.ehDirecao) targetRole = 'ceo';
    else targetRole = 'ciso';
  }

  const recusa = recusaDeAssinatura(autoridade, targetRole as PapelAssinatura) ?? await recusaSenhaDeOutro(c.env.DB, user.id);
  if (recusa) return { status: 403, corpo: { error: recusa } };

  // Quem enviou a evidência não a revisa (segregação de funções).
  if (targetRole === 'ciso' && evidence.uploaded_by && email && enviadoPor(evidence.uploaded_by) === email.toLowerCase()) {
    return { status: 403, corpo: { error: 'Quem enviou a evidência não pode revisá-la' } };
  }
  // A assinatura vale para o conteúdo que a tela mostrou (hash), não para o que estiver lá depois.
  if (!a.fileHash) return { status: 400, corpo: { error: 'file_hash é obrigatório: assine o conteúdo que você revisou' } };

  // O carimbo leva o nome da matriz: é sob aquela designação que se assina.
  approvedBy = autoridade.nome || approvedBy;

  const now = new Date().toISOString();
  const ip = c.req.header('CF-Connecting-IP') || '127.0.0.1';
  const ua = c.req.header('User-Agent') || 'Unknown';

  if (targetRole === 'ciso') {
    // A assinatura do Líder SGSI é a revisão humana: leva a evidência pendente a conforme.
    // Não passa por cima de parcial/não conforme: essas voltam a pendente ao serem corrigidas.
    const r = await c.env.DB.prepare(
      `UPDATE evidence SET ciso_approved_by = ?, ciso_approved_at = ?, ciso_approved_ip = ?, ciso_approved_ua = ?,
         evaluation_status = CASE WHEN COALESCE(evaluation_status, 'pending') = 'pending' THEN 'conforming' ELSE evaluation_status END
       WHERE id = ? AND file_hash = ?`
    ).bind(approvedBy, now, ip, ua, id, a.fileHash).run();
    if (!r.meta.changes) return { status: 409, corpo: { error: MUDOU } };
    const antes = evidence.evaluation_status || 'pending';
    const transicao = antes === 'pending' ? 'pending→conforming' : `status mantido: ${antes}`;
    await logAudit(c.env.DB, 'evidence.approved_ciso', email, `Evidência ${id} aprovada pelo Líder SGSI (${approvedBy}); ${transicao}`, '', '', evidence.project_id);
  } else {
    const r = await c.env.DB.prepare(
      'UPDATE evidence SET ceo_approved_by = ?, ceo_approved_at = ?, ceo_approved_ip = ?, ceo_approved_ua = ? WHERE id = ? AND file_hash = ?'
    ).bind(approvedBy, now, ip, ua, id, a.fileHash).run();
    if (!r.meta.changes) return { status: 409, corpo: { error: MUDOU } };
    await logAudit(c.env.DB, 'evidence.approved_ceo', email, `Evidência ${id} aprovada pela Direção Executiva (${approvedBy})`, '', '', evidence.project_id);
  }

  return { status: 200, corpo: { ok: true, role: targetRole, approved_by: approvedBy, approved_at: now } };
}

async function handleApprove(c: any) {
  try {
    const id = c.req.param('id');
    // Isolamento de tenant ANTES de qualquer coisa. A checagem da matriz de
    // governança logo abaixo parece cobrir isto, mas não cobre: ela é pulada
    // inteira para `platform_admin`, `ciso` e `ceo`, e `users.role` é TEXT
    // livre (`createUserSchema.role` é `z.string()`). Um usuário com papel
    // `ciso` escopado ao projeto A assinava evidência do projeto B — sonda
    // devolveu 200 e gravou `ciso_approved_by` na linha do outro cliente.
    await requireResourceAccess(c.env.DB, 'evidence', id, c.get('user'));
    const existe = await c.env.DB.prepare('SELECT 1 AS x FROM evidence WHERE id = ?').bind(id).first();
    if (!existe) return c.json({ error: 'Evidência não encontrada' }, 404);

    const user = c.get('user');
    if (!user) return c.json({ error: 'Não autorizado' }, 401);

    // openapi: evidenceApp POST /:id/approve
    const v = await validateBody(c, evidenciaAssinarSchema);
    if (!v.success) return v.response;
    const body = v.data;
    if (!body.password) return c.json({ error: 'Senha é obrigatória para assinatura eletrônica' }, 400);

    const r = await assinarEvidencia(c, user, id, { password: body.password, fileHash: body.file_hash, role: body.role });
    return c.json(r.corpo, r.status as ContentfulStatusCode);
  } catch (e: any) {
    return erro500(c, 'Falha ao assinar evidência', e);
  }
}

evidenceApp.post('/:id/approve', handleApprove);
evidenceApp.put('/:id/approve', handleApprove);
evidenceApp.post('/:id/signatures/approve', handleApprove);
evidenceApp.put('/:id/signatures/approve', handleApprove);


// ─── Project Evidence Sub-Router (/api/v1/projects/:projectId/evidence) ────

projectEvidenceApp.get('/', async (c) => {
  const projectId = c.req.param('projectId') ?? '';
  const p = await listPaged(c, 'SELECT * FROM evidence WHERE project_id = ? ORDER BY created_at DESC', [projectId]);
  // `control_id` segue sendo o primeiro vínculo (leitura compatível); `control_ids` traz todos.
  const evidence = await comControles(c.env.DB, projectId, p.results as { id: string }[]);
  return c.json({ ok: true, evidence: semRastros(evidence) }, 200, { 'X-Has-More': String(p.hasMore) });
});

// Notas de avaliação: grava evaluation_notes e/ou evaluation_status (domínio
// canônico). Não mexe em control_id nem em assinatura. A autorização é a da faixa
// (contrato ativo + write-guard): papel só-leitura cai em 403 no middleware, e o
// agente MCP é recusado em FORA_DO_AGENTE: a avaliação humana é pela interface.
projectEvidenceApp.patch('/:evidenceId', async (c) => {
  try {
    const projectId = c.req.param('projectId');
    const id = c.req.param('evidenceId');
    await requireResourceAccess(c.env.DB, 'evidence', id, c.get('user'));
    const ev = await c.env.DB.prepare('SELECT id, project_id, evaluation_status, ciso_approved_by, ceo_approved_by FROM evidence WHERE id = ?')
      .bind(id).first<{ project_id: string; evaluation_status: string | null; ciso_approved_by: string | null; ceo_approved_by: string | null }>();
    if (!ev || ev.project_id !== projectId) return c.json({ error: 'Evidência não encontrada' }, 404);

    const v = await validateBody(c, evidenciaAvaliacaoSchema);
    if (!v.success) return v.response;
    const body = v.data;
    const temNotas = 'evaluation_notes' in body;
    const temStatus = 'evaluation_status' in body;
    if (!temNotas && !temStatus) return c.json({ error: 'Envie evaluation_notes e/ou evaluation_status.' }, 400);

    // A assinatura cobre o conteúdo (hash), não as notas: notas seguem editáveis. O status de evidência
    // assinada só muda revogando a assinatura ou corrigindo o conteúdo (como a avaliação por IA, que também não o troca).
    if (temStatus && body.evaluation_status !== (ev.evaluation_status || 'pending') && (ev.ciso_approved_by || ev.ceo_approved_by)) {
      return c.json({ error: 'Evidência assinada: o status não muda por aqui. Revogue a assinatura ou corrija o conteúdo da evidência.' }, 409);
    }

    const sets: string[] = [];
    const vals: unknown[] = [];
    if (temNotas) { sets.push('evaluation_notes = ?'); vals.push(body.evaluation_notes ?? null); }
    if (temStatus) { sets.push('evaluation_status = ?'); vals.push(body.evaluation_status); }
    sets.push("updated_at = datetime('now')");
    vals.push(id);
    await c.env.DB.prepare(`UPDATE evidence SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();

    const user = c.get('user');
    await logAudit(c.env.DB, 'evidence.evaluation_updated', user?.email ?? 'system',
      `Avaliação da evidência ${id} atualizada por ${user?.email ?? 'system'}${temStatus ? `; status -> ${body.evaluation_status}` : ''}${temNotas ? '; notas atualizadas' : ''}.`, '', '', projectId);
    return c.json({ ok: true, ...(temStatus ? { evaluation_status: body.evaluation_status } : {}) });
  } catch (e) {
    return erro500(c, 'Falha ao atualizar avaliação da evidência', e);
  }
});

projectEvidenceApp.post('/upload', async (c) => {
  try {
    const projectId = c.req.param('projectId') as string;
    const body = await c.req.parseBody();
    const file = body['file'] as File;
    const pedido = typeof body['control_id'] === 'string' ? body['control_id'] : '';
    const ref = typeof body['control_ref'] === 'string' ? body['control_ref'] : '';
    const docPedido = typeof body['documento_id'] === 'string' ? body['documento_id'] : '';

    if (!file) {
      return c.json({ error: 'No file provided' }, 400);
    }

    // Recusa antes de ler o arquivo na memória: sem isto qualquer cliente
    // autenticado enche o R2, e HTML/SVG voltariam ao navegador como XSS.
    const invalido = validateUpload(file);
    if (invalido) return c.json({ error: invalido }, 400);

    // O controle precisa existir E ser deste projeto, conferido ANTES de tocar
    // no R2: sem isto a FK derrubava o INSERT depois do put (objeto órfão + 500)
    // e controle de outro projeto era aceito. Mesma resposta nos dois casos para
    // não revelar a existência de controle alheio. Aceita o id da linha ou o
    // código ("A.5.1", o que o modal pede).
    let controlId: string | null = null;
    if (pedido) {
      controlId = await idDoControle(c.env.DB, projectId, pedido);
      if (!controlId) return c.json({ error: 'Controle não encontrado neste projeto' }, 400);
    } else if (ref) {
      // ponytail: leniente de propósito — quem manda control_ref (o treinamento, A.6.3) é uma
      // sugestão; projeto sem esse controle recebe o arquivo sem vínculo em vez de recusar.
      controlId = await idDoControle(c.env.DB, projectId, ref);
    }

    // documento_id (opcional, via niso_create_evidence): documento vigente do
    // projeto. Conferido ANTES de tocar no R2, como o controle.
    let documentoId: string | null = null;
    if (docPedido) {
      const erro = await erroDocumentoVigente(c.env.DB, projectId, docPedido);
      if (erro) return c.json({ error: erro }, 400);
      documentoId = docPedido;
    }

    const id = genId();
    const r2Key = `evidence/${projectId}/${id}-${file.name}`;
    const arrayBuffer = await file.arrayBuffer();

    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const realSha256 = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    await c.env.STORAGE.put(r2Key, arrayBuffer, {
      httpMetadata: { contentType: file.type || 'application/octet-stream' }
    });

    const user = c.get('user');
    try {
      await c.env.DB.prepare(
        `INSERT INTO evidence (id, project_id, control_id, documento_id, file_name, file_size, file_type, r2_key, file_hash, evaluation_status, uploaded_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, datetime('now'))`
      ).bind(id, projectId, controlId, documentoId, file.name, file.size, file.type || 'application/octet-stream', r2Key, realSha256, user?.email || 'system').run();
    } catch (e) {
      // Compensação: sem a linha no banco, o objeto no R2 seria órfão. Se
      // a própria compensação falhar, o órfão fica registrado no log.
      await c.env.STORAGE.delete(r2Key).catch((e2: unknown) => registraErro(c, e2));
      throw e;
    }

    await logAudit(c.env.DB, 'evidence.uploaded', user?.email || 'system', `Evidência ${file.name} (SHA-256: ${realSha256.substring(0, 8)}...) enviada para projeto ${projectId}`, '', '', projectId);

    return c.json({ ok: true, id, sha256: realSha256 }, 201);
  } catch (e: any) {
    return erro500(c, 'Falha no upload de evidência', e);
  }
});
