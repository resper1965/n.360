import { Hono } from 'hono';
import { Bindings, Variables } from '../index';
import { logAudit, erro500 } from '../helpers';
import { validateBody, chatSchema } from '../schemas';
import { chatModel } from '../config/models';
import { MODULOS_PRODUTO, modulosDaPessoa, modulosDoProjeto, recusaDaPessoa, recusaDeModulo, type Modulo } from '../modulos';

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
  // Sem `modulo` (casca n.360), vale o primeiro, na ordem iso -> privacy -> ot, que o projeto E a pessoa têm; `modulo` explícito é checado à risca.
  const doProjeto = await modulosDoProjeto(c.env.DB, projectId);
  const daPessoa = await modulosDaPessoa(c.env.DB, user);
  const recusaDe = (m: Modulo) => recusaDeModulo(m, doProjeto) ?? recusaDaPessoa(m, daPessoa);
  const modulo: Modulo = body.modulo ?? MODULOS_PRODUTO.find((m) => !recusaDe(m)) ?? 'iso';
  const recusa = recusaDe(modulo);
  if (recusa) return c.json({ error: recusa }, 403);

  const contexto = `da empresa "${project.client_name}" (Setor: ${project.sector || 'Geral'}, Escopo: ${project.scope || 'SGSI Completo'})`;
  const systemPrompt = modulo === 'ot'
    ? `Você é o Assistente Virtual de Segurança de Tecnologia Operacional (OT) do n.OT, da ness.
Seu objetivo é auxiliar a equipe do projeto ${contexto} na governança de segurança cibernética do ARCiber (o ambiente regulado de OT) e no atendimento à rotina operacional do ONS RO-CB.BR.01.
Responda sempre em português do Brasil, de forma clara, objetiva e profissional.
Não invente requisito, prazo nem norma: cite o código do requisito do catálogo do projeto quando ele se aplicar, ou diga que não sabe.
Você orienta; quem decide e aprova é a equipe do projeto.`
    : modulo === 'privacy'
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
