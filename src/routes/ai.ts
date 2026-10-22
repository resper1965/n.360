import { Hono } from 'hono';
import { Bindings, Variables } from '../index';
import { logAudit, erro500 } from '../helpers';
import { AssessmentAgent } from '../agents/assessment';
import { validateBody, chatSchema } from '../schemas';
import { chatModel } from '../config/models';
import { modulosDaPessoa, modulosDoProjeto, recusaDaPessoa, recusaDeModulo, type Modulo } from '../modulos';

export const aiApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// AI Compliance Chatbot
aiApp.post('/projects/:id/chat', async (c) => {
  const projectId = c.req.param('id');
  const user = c.get('user');
  const v = await validateBody(c, chatSchema);
  if (!v.success) return v.response;
  const body = v.data;
  if (!body.message?.trim()) return c.json({ error: 'Message is required' }, 400);

  const project = await c.env.DB.prepare('SELECT client_name, scope, sector FROM projects WHERE id = ?').bind(projectId).first<any>();
  if (!project) return c.json({ error: 'Project not found' }, 404);

  // O chat é do núcleo (a faixa não barra), então o módulo pedido é conferido aqui: o projeto E a pessoa precisam tê-lo.
  // Sem `modulo` (casca n.360), vale o primeiro, na ordem iso -> privacy, que o projeto E a pessoa têm; `modulo` explícito é checado à risca.
  const doProjeto = await modulosDoProjeto(c.env.DB, projectId);
  const daPessoa = await modulosDaPessoa(c.env.DB, user);
  const recusaDe = (m: Modulo) => recusaDeModulo(m, doProjeto) ?? recusaDaPessoa(m, daPessoa);
  const modulo: Modulo = body.modulo ?? (['iso', 'privacy'] as const).find((m) => !recusaDe(m)) ?? 'iso';
  const recusa = recusaDe(modulo);
  if (recusa) return c.json({ error: recusa }, 403);

  const contexto = `da empresa "${project.client_name}" (Setor: ${project.sector || 'Geral'}, Escopo: ${project.scope || 'SGSI Completo'})`;
  const systemPrompt = modulo === 'privacy'
    ? `Você é o Assistente Virtual de Privacidade e Proteção de Dados do n.privacy, da ness.
Seu objetivo é auxiliar a equipe do projeto ${contexto} em LGPD, ANPD, RoPA (registro das operações de tratamento), direitos do titular e incidentes de segurança com dados pessoais.
Responda sempre em português do Brasil, de forma clara, objetiva e profissional.
Não invente prazo legal nem artigo de lei: quando a pergunta depender de prazo, cite o valor cadastrado em parametros_legais, com a fonte, ou diga que ele ainda não foi cadastrado.
Você orienta; não emite parecer jurídico.`
    : `Você é o Assistente Virtual de Conformidade ISO 27001 / ISO 27701 da ness.
Seu objetivo é auxiliar a equipe do projeto ${contexto}.
Responda de forma clara, objetiva, profissional e baseada estritamente nas normas ISO/IEC 27001:2022 e ISO/IEC 27701:2019/2025.
Seja solícito e forneça exemplos práticos quando solicitado.`;

  try {
    const aiResponse = await c.env.AI.run(chatModel(c.env), {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: body.message }
      ]
    }) as any;

    const reply = aiResponse.response || 'Desculpe, não consegui processar sua solicitação no momento.';
    // S-log: NÃO registrar o conteúdo da pergunta no audit_log. O trilho de
    // auditoria precisa saber QUE houve uma consulta, por QUEM (actor) e em QUAL
    // projeto — não o texto perguntado (conteúdo do titular; minimização LGPD).
    await logAudit(c.env.DB, 'ai.chat', user?.email || 'system', `Consulta ao AI Assistant no projeto ${projectId}`);

    return c.json({ ok: true, reply });
  } catch (err: any) {
    return erro500(c, 'Erro ao comunicar com a IA', err);
  }
});

// AI Executive Assessment Evaluation
aiApp.post('/projects/:id/assessment/evaluate', async (c) => {
  const projectId = c.req.param('id');
  const db = c.env.DB;

  try {
    const project = await db.prepare('SELECT project_name, client_name, sector, scope FROM projects WHERE id = ?').bind(projectId).first() as any;
    if (!project) return c.json({ error: 'Project not found' }, 404);

    const { results: interviews } = await db.prepare(
      'SELECT track, question, answer, interviewee, gap_detected FROM project_interviews WHERE project_id = ?'
    ).bind(projectId).all() as any;

    if (!interviews || interviews.length === 0) {
      return c.json({ error: 'Nenhuma resposta de entrevista encontrada para este projeto. Por favor, responda o questionário no Playbook antes de rodar o diagnóstico.' }, 400);
    }

    const assessmentData = interviews.map((i: any) => 
      `[Trilha: ${i.track}] Questão: ${i.question}\nResposta: ${i.answer}\nEntrevistado: ${i.interviewee}\nGap Detectado: ${i.gap_detected ? 'Sim' : 'Não'}`
    ).join('\n\n');

    const agent = new AssessmentAgent(c.env.AI, db, c.env);
    
    const context = {
      organizationId: projectId,
      standardReference: project.sector || 'Geral'
    };
    
    const result = await agent.run(assessmentData, context);
    
    if (!result.success) {
      // result.content traz o texto cru de cada provedor de IA: vai ao log, não ao cliente.
      return erro500(c, 'Falha no processamento agêntico do diagnóstico', new Error(result.content));
    }

    let cmmScore = 1;
    const cmmMatch = result.content.match(/Nível CMM.*?(\d+)/i);
    if (cmmMatch) {
      cmmScore = parseInt(cmmMatch[1]);
    }

    const notesPayload = JSON.stringify({
      audit_status: cmmScore >= 3 ? 'compliant' : 'non_compliant',
      cmm_score: cmmScore,
      audit_finding: result.content,
      audited_at: new Date().toISOString()
    });

    const existingProgress = await db.prepare('SELECT id FROM checklist_progress WHERE project_id = ? AND item_id = "global_assessment"').bind(projectId).first();
    if (existingProgress) {
      await db.prepare('UPDATE checklist_progress SET is_checked = ?, notes = ?, checked_at = CURRENT_TIMESTAMP WHERE project_id = ? AND item_id = "global_assessment"').bind(
        cmmScore >= 3 ? 1 : 0,
        notesPayload,
        projectId
      ).run();
    } else {
      await db.prepare(`INSERT INTO checklist_progress (id, project_id, phase_number, item_id, is_checked, notes)
        VALUES (lower(hex(randomblob(16))), ?, 0, 'global_assessment', ?, ?)`).bind(
          projectId,
          cmmScore >= 3 ? 1 : 0,
          notesPayload
        ).run();
    }

    await logAudit(db, 'project.assessment.evaluated', c.get('user')?.email || 'system', `Diagnóstico de Auto-Avaliação agêntico rodado para projeto ${projectId}`);

    return c.json({
      ok: true,
      cmm_score: cmmScore,
      report: result.content
    });

  } catch (err: any) {
    return erro500(c, 'Erro ao rodar diagnóstico executivo', err);
  }
});
