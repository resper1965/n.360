import { createMiddleware } from 'hono/factory';
import { Bindings, Variables } from '../index';
import { rateLimit } from '../helpers';

/**
 * Rate limit para as rotas caras.
 *
 * Antes disto o limite existia só no login. Tudo o que custa dinheiro ou banda
 * — inferência de IA, upload para o R2, export de CSV — ficava aberto a quem
 * tivesse uma sessão válida. Um cliente legítimo em loop derruba a cota de IA
 * de todos os outros.
 *
 * O limite é por USUÁRIO, não por IP: um escritório inteiro sai pelo mesmo IP,
 * e é o custo por conta que interessa. Chave de API entra como `apikey:<id>`,
 * então uma integração também é contada separadamente.
 */

// `q` é a query da requisição: a prontidão só chama o modelo com `?ai=1`. A interpretação da fase conta na própria rota, quando vai chamar o modelo.
type Regra = { teste: (p: string, q: Record<string, string>) => boolean; max: number; janelaSec: number; nome: string };

const REGRAS: Regra[] = [
  // Geração de seção de política: uma chamada por seção e a tela dispara a fila inteira; balde próprio (a primeira regra que casa vale).
  { nome: 'politica-secao', teste: p => /\/secoes\/\d+\/gerar$/.test(p), max: 120, janelaSec: 3600 },
  // Inferência custa por token e é o caminho mais caro do produto.
  { nome: 'ia', teste: (p, q) =>
      /\/(chat|migrate-27701|evaluate|generate-document)$/.test(p) || /\/checklist\/[^/]+\/generate$/.test(p)
      || (q.ai === '1' && /^\/api\/v1\/projects\/[^/]+\/readiness-check$/.test(p))
      || /^\/api\/v1\/projects\/[^/]+\/control-adequacao\/[^/]+\/suggestions$/.test(p)
      // Rascunhos de IA do n.privacy: atividade, pedido do titular, comunicação de incidente.
      || /^\/api\/v1\/projects\/[^/]+\/ropa\/[^/]+\/sugestao$/.test(p)
      || /^\/api\/v1\/projects\/[^/]+\/(titular-pedidos\/[^/]+\/rascunho|incidentes\/[^/]+\/rascunho-comunicacao)$/.test(p),
    max: 30, janelaSec: 3600 },
  // Parecidos por significado (embeddings): a tela chama com debounce enquanto a pessoa digita.
  { nome: 'similares', teste: p => /^\/api\/v1\/projects\/[^/]+\/similares$/.test(p), max: 60, janelaSec: 600 },
  // Copiloto da entrevista do RoPA e rascunho por etapa: uma chamada ao modelo de 70B por descrição; mais restrito que os parecidos.
  { nome: 'copiloto', teste: p => /^\/api\/v1\/projects\/[^/]+\/ropa\/(copiloto|[^/]+\/etapas\/[^/]+\/rascunho)$/.test(p), max: 20, janelaSec: 600 },
  // Copiloto do passo da Bancada (três modos): uma chamada ao modelo por clique, mesmo custo do copiloto do RoPA.
  { nome: 'copiloto-passo', teste: p => /^\/api\/v1\/projects\/[^/]+\/passos\/[^/]+\/copiloto\/[a-z-]+$/.test(p), max: 30, janelaSec: 600 },
  // Consulta de CNPJ na BrasilAPI (assistente "Novo projeto"): chamada externa por CNPJ; a tela chama ao sair do campo.
  { nome: 'consulta-cnpj', teste: p => /^\/api\/v1\/projects\/consulta-cnpj\/[^/]+$/.test(p), max: 30, janelaSec: 600 },
  // Upload: o teto de tamanho já existe por arquivo; isto limita o volume.
  { nome: 'upload', teste: p => p.endsWith('/upload'), max: 100, janelaSec: 3600 },
  // Export varre tabelas inteiras.
  { nome: 'export', teste: p => p.includes('/export/') || p.endsWith('/audit-pack'), max: 60, janelaSec: 3600 },
];

export const rateLimitMiddleware = createMiddleware<{ Bindings: Bindings; Variables: Variables }>(async (c, next) => {
  // Decodificado, como o roteador do Hono: o cru deixava `%69` passar pelas regras e chegar à rota.
  const path = c.req.path;
  const regra = REGRAS.find(r => r.teste(path, c.req.query()));
  if (!regra) return next();

  // Roda depois do authMiddleware, então o usuário já está no contexto.
  const ator = c.get('user')?.id ?? c.get('user')?.email ?? 'anon';
  if (!(await rateLimit(c.env.SESSIONS, `${regra.nome}:${ator}`, regra.max, regra.janelaSec))) {
    return c.json(
      { error: 'Limite de requisições excedido. Tente novamente mais tarde.' },
      429,
      { 'Retry-After': String(regra.janelaSec) }
    );
  }
  return next();
});
