import { createMiddleware } from 'hono/factory';
import { Bindings, Variables } from '../index';
import { requireProjectAccess } from '../helpers';
import { faixaDoCaminho, modulosDaPessoa, modulosDoProjeto, recusaDaPessoa, recusaDeModulo } from '../modulos';

// Segmentos literais sob /api/v1/projects/<seg>/... que NÃO são IDs de projeto
// e portanto não devem passar pela checagem de tenant. Se uma rota literal for
// adicionada aqui no futuro, registre-a nesta lista, senão o segmento será
// tratado como id de projeto e negado para clientes.
//  - `admin`: rotas administrativas (ex.: POST /projects/admin/encrypt-tokens),
//    protegidas por checagem de platform_admin no próprio handler.
//  - `consulta-cnpj`: GET /projects/consulta-cnpj/:cnpj (assistente "Novo projeto"), papel conferido no handler.
const RESERVED_SEGMENTS = new Set<string>(['admin', 'consulta-cnpj']);

/**
 * Reforça o isolamento multi-tenant para todas as rotas com escopo de projeto
 * (/api/v1/projects/:projectId/*). Deve ser montado APÓS o authMiddleware, que
 * popula c.get('user'). Rotas cujo primeiro segimento é reservado (ex.: dashboard)
 * ou sem projectId são deixadas passar — elas fazem sua própria verificação.
 */
export const projectAccessMiddleware = createMiddleware<{ Bindings: Bindings; Variables: Variables }>(async (c, next) => {
  const user = c.get('user');
  const projectId = c.req.param('projectId');

  if (user && projectId && !RESERVED_SEGMENTS.has(projectId)) {
    try {
      await requireProjectAccess(c.env.DB, user, projectId);
    } catch {
      return c.json({ error: 'Forbidden: No access to this project' }, 403);
    }
    // Produto: o que o projeto habilitou decide a faixa (n.iso, n.privacy ou o núcleo compartilhado). Vale para qualquer papel.
    const faixa = faixaDoCaminho(c.req.path);
    // Depois, a pessoa (fatia 3 do n.360): o projeto ter o módulo não basta, ela também precisa ter. Projeto sem módulo
    // nenhum é inexistente: passa, e a rota responde o 404 dela.
    if (faixa && faixa !== 'nucleo') {
      const doProjeto = await modulosDoProjeto(c.env.DB, projectId);
      const recusa = recusaDeModulo(faixa, doProjeto) ?? (doProjeto.length ? recusaDaPessoa(faixa, await modulosDaPessoa(c.env.DB, user)) : null);
      if (recusa) return c.json({ error: recusa }, 403);
    }
  }

  await next();
});
