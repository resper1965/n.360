import { Hono } from 'hono';
import { Bindings, Variables } from '../index';
import { ehEquipeNess, erro500, logAudit } from '../helpers';
import { validateBody, empresaSchema } from '../schemas';
import { camposPresentes, gravacaoDaEmpresa, lerEmpresa, projetoComCnpj, type CampoEmpresa } from '../services/empresas';

/**
 * Cadastro da empresa do projeto (migration 0071), em `/api/v1/projects/:projectId/empresa`, faixa `nucleo`. O
 * `projectAccessMiddleware` já cortou o projeto (e a organização). Lê quem alcança o projeto; edita a equipe da
 * consultoria com acesso, o administrador do cliente (`org_admin`) e o agente MCP com o papel de consultor (preenche o cadastro
 * com o "sim" do consultor no chat; a trilha leva "agente de <consultor>"). Cliente comum, chave de API e agente auditor só leem.
 */
export const empresaApp = new Hono<{ Bindings: Bindings; Variables: Variables }>();

export const podeEditarEmpresa = (user: { role?: string; agente?: boolean; agente_papel?: string } | undefined | null) =>
  ehEquipeNess(user) || user?.role === 'org_admin' || (user?.agente === true && user.agente_papel === 'consultor');

empresaApp.get('/', async (c) => {
  try {
    const empresa = await lerEmpresa(c.env.DB, c.req.param('projectId')!);
    if (!empresa) return c.json({ error: 'Projeto não encontrado' }, 404);
    return c.json({ empresa, pode_editar: podeEditarEmpresa(c.get('user')) });
  } catch (e) {
    return erro500(c, 'Falha ao ler o cadastro da empresa', e);
  }
});

empresaApp.put('/', async (c) => {
  try {
    const user = c.get('user');
    if (!podeEditarEmpresa(user)) return c.json({ error: 'Somente a equipe da consultoria e o administrador do cliente editam o cadastro da empresa' }, 403);
    const projectId = c.req.param('projectId')!;
    const v = await validateBody(c, empresaSchema);
    if (!v.success) return v.response;
    const dados = v.data;

    const projeto = await c.env.DB.prepare('SELECT org_id FROM projects WHERE id = ?').bind(projectId).first<{ org_id: string }>();
    if (!projeto) return c.json({ error: 'Projeto não encontrado' }, 404);
    if (dados.cnpj) {
      const outro = await projetoComCnpj(c.env.DB, projeto.org_id, dados.cnpj, projectId);
      // O nome do outro projeto só para a equipe: o administrador do cliente não enxerga os demais clientes da consultoria.
      if (outro) {
        return c.json(ehEquipeNess(user)
          ? { error: `CNPJ já cadastrado no projeto ${outro.nome}`, projeto_existente: outro }
          : { error: 'CNPJ já cadastrado em outro projeto da consultoria' }, 409);
      }
    }

    const antes = await lerEmpresa(c.env.DB, projectId);
    await c.env.DB.batch(gravacaoDaEmpresa(c.env.DB, projectId, dados));
    const depois = await lerEmpresa(c.env.DB, projectId);
    // A trilha diz QUAIS campos mudaram, nunca os valores: o representante é dado pessoal.
    const mudaram = camposPresentes(dados).filter((k: CampoEmpresa) => (antes?.[k] ?? null) !== (depois?.[k] ?? null));
    if (mudaram.length) {
      await logAudit(c.env.DB, 'empresa.atualizada', user?.email ?? 'system', `Cadastro da empresa do projeto ${projectId}: ${mudaram.join(', ')}`, '', '', projectId);
    }
    return c.json({ ok: true, empresa: depois, alterados: mudaram });
  } catch (e) {
    return erro500(c, 'Falha ao gravar o cadastro da empresa', e);
  }
});
