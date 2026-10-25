import { Hono } from 'hono';
import type { Bindings, Variables } from '../index';
import { itemDoChecklist, registrarDocumentoDoItem } from '../services/checklist-evidencia';
import { validateBody, documentoGerarSchema, documentoAprovarSchema } from '../schemas';
import { logAudit, erro500 } from '../helpers';
import { PolicyAgent } from '../agents/policy';

// A política por controle saiu (PR3 das políticas temáticas): a política é um documento (routes/documentos.ts).
const policies = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// ═══════════════════════════════════════════════════════════════════════════════
//  DOCUMENT WIZARD — Guided Document Generation with Field Context
// ═══════════════════════════════════════════════════════════════════════════════

// POST /api/v1/projects/:id/generate-document
policies.post('/api/v1/projects/:projectId/generate-document', async (c) => {
  try {
    const projectId = c.req.param('projectId');
    const v = await validateBody(c, documentoGerarSchema);
    if (!v.success) return v.response;
    const { itemId, fields } = v.data;

    const project = await c.env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(projectId).first<any>();
    if (!project) return c.json({ error: 'Projeto não encontrado' }, 404);

    const item = itemDoChecklist(itemId);
    if (!item) return c.json({ error: 'Item de checklist não encontrado' }, 404);

    // Build context from fields
    const fieldsSummary = Object.entries(fields)
      .filter(([_, v]) => v)
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n');

    // ponytail: as respostas das entrevistas por trilha alimentam o relatório consolidado (p2_3)
    let interviewsSummary = '';
    if (itemId === 'p2_3') {
      try {
        const { results: interviews } = await c.env.DB.prepare(
          'SELECT track, question, answer, interviewee, gap_detected FROM project_interviews WHERE project_id = ?'
        ).bind(projectId).all<any>();
        if (interviews && interviews.length > 0) {
          interviewsSummary = '\nRESPOSTAS DAS ENTREVISTAS POR TRILHA:\n' + interviews.map((i: any) => 
            `[Trilha: ${i.track}] P: ${i.question} | R: ${i.answer} (Entrevistado: ${i.interviewee || 'N/A'}) | ${i.gap_detected ? '⚠️ LACUNA DETECTADA' : '✅ CONFORME'}`
          ).join('\n') + '\n';
        }
      } catch(e) { /* ignore database error */ }
    }

    const agent = new PolicyAgent(c.env.AI, c.env.DB, c.env);
    const prompt = `Gere um documento completo em formato markdown para "${item.text}" da organização "${project.client_name}" (setor: ${project.sector || 'não especificado'}, escopo: ${project.scope || 'ISO 27001:2022'}).

DADOS FORNECIDOS PELO USUÁRIO:
${fieldsSummary}

${interviewsSummary ? '\nDADOS COLETADOS NAS ENTREVISTAS POR TRILHA:\n' + interviewsSummary + '\n' : ''}

REQUISITOS:
- Documento profissional, completo e pronto para auditoria ISO 27001:2022
- Use os dados fornecidos acima para personalizar o conteúdo
- Incluir seções de: Objetivo, Escopo, Definições, Conteúdo Principal, Responsabilidades, Revisões
- Formato markdown limpo, sem placeholders
- Tom formal e executivo
- Incluir referências às cláusulas ISO relevantes`;

    const result = await agent.run(prompt, { organizationId: projectId });
    const content = result.success ? result.content : `# ${item.text}\n\nDocumento gerado para ${project.client_name}.\n\n${fieldsSummary}`;

    return c.json({ ok: true, content });
  } catch (e: any) {
    return erro500(c, 'Erro ao gerar documento', e);
  }
});

// POST /api/v1/projects/:id/approve-document
policies.post('/api/v1/projects/:projectId/approve-document', async (c) => {
  try {
    const projectId = c.req.param('projectId');
    const v = await validateBody(c, documentoAprovarSchema);
    if (!v.success) return v.response;
    const { itemId, content } = v.data;

    // ponytail: validate document size maximum limit (2MB) to prevent Edge memory exhaustion
    if (content.length > 2 * 1024 * 1024) {
      return c.json({ error: 'Document size exceeds 2MB limit' }, 400);
    }

    const project = await c.env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(projectId).first<any>();
    if (!project) return c.json({ error: 'Projeto não encontrado' }, 404);

    const item = itemDoChecklist(itemId);
    if (!item) return c.json({ error: 'Item não encontrado' }, 404);
    const userEmail = c.get('user')?.email ?? 'system';

    // Entra pendente: quem gerou não revisa. A revisão é a assinatura do Líder SGSI.
    const { evidenceId, fileName } = await registrarDocumentoDoItem(
      c.env, projectId, item, content, c.get('user'), 'Documento do assistente guiado; aguarda revisão.');

    await logAudit(c.env.DB, 'document.approved', userEmail, `Documento "${fileName}" aprovado via wizard para item ${itemId}`);

    return c.json({ ok: true, evidence_id: evidenceId, file_name: fileName });
  } catch (e: any) {
    return erro500(c, 'Erro ao aprovar documento', e);
  }
});

// POST /api/v1/projects/:id/checklist/:itemId/generate
policies.post('/api/v1/projects/:projectId/checklist/:itemId/generate', async (c) => {
  try {
    const projectId = c.req.param('projectId');
    const itemId = c.req.param('itemId');
    const userEmail = c.get('user')?.email ?? 'system';

    const project = await c.env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(projectId).first<any>();
    if (!project) return c.json({ error: 'Projeto não encontrado' }, 404);

    const item = itemDoChecklist(itemId);
    if (!item) return c.json({ error: 'Item de checklist não encontrado' }, 404);

    // Gerar conteúdo com o PolicyAgent
    const agent = new PolicyAgent(c.env.AI, c.env.DB, c.env);
    const prompt = `Gere um documento ou política detalhada em formato markdown para atender ao item de checklist "${item.text}" do projeto "${project.client_name}" (setor: ${project.sector || 'não especificado'}, escopo: ${project.scope || 'ISO 27001:2022'}). O documento deve ser completo, profissional, prático e pronto para auditoria, sem placeholders e com formatação markdown limpa.`;

    const result = await agent.run(prompt, { organizationId: projectId });
    const docContent = result.success ? result.content : `# ${item.text}\n\nRascunho a completar pela equipe.\n\nOrganização: ${project.client_name}`;

    // "A máquina propõe, a pessoa decide": gerar devolve só o RASCUNHO. Não grava evidência nem marca o
    // item; quem faz isso é o aceite da pessoa (approve-document), depois de ler e editar o texto.
    await logAudit(c.env.DB, 'document.draft_generated', userEmail, `Rascunho de IA gerado para o item ${itemId} (não gravado)`);

    return c.json({ ok: true, content: docContent });
  } catch (e: any) {
    return erro500(c, 'Erro ao gerar documento', e);
  }
});

export default policies;
