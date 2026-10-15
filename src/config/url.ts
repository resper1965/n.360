/**
 * Endereço canônico do n.360 (a plataforma; n.iso e n.privacy são módulos em `/iso` e `/privacy`). Links de
 * e-mail, base do SCIM, CORS e os hosts do MCP saem daqui, NUNCA do host da requisição: o IdP do cliente
 * cadastra um callback só, e um host alternativo gerava outro. `APP_URL` (wrangler.jsonc) sobrescreve o padrão.
 */
export const APP_URL_PADRAO = 'https://n360.ness.com.br';

export function appUrl(env?: { APP_URL?: string }): string {
  const url = env?.APP_URL || APP_URL_PADRAO;
  // Sem regex: `/\/+$/` é quadrática com muitas barras seguidas de outro caractere (js/polynomial-redos).
  let fim = url.length;
  while (fim > 0 && url.charCodeAt(fim - 1) === 47) fim--;
  return url.slice(0, fim);
}

/**
 * Endereço antigo do n.iso. Continua servindo as exceções de `fica` e é onde ficam presos o callback de SSO
 * (o IdP do cliente cadastrou este) e o recurso OAuth do MCP (tokens e conectores já emitidos).
 */
export const URL_NISO = 'https://niso.ness.com.br';

/** Recurso OAuth do MCP (`resourceMetadata` em src/index.ts). Não segue o `APP_URL`: mudar invalida os conectores. */
export const RECURSO_MCP = `${URL_NISO}/mcp`;

/** Domínios dos módulos: respondem as exceções no lugar, então o CORS os aceita além do `appUrl`. */
export const ORIGENS_EXTRAS = [URL_NISO, 'https://nprivacy.ness.com.br'];

/** Domínio de módulo → prefixo do módulo no n.360. Página de navegador ali vira 308 para `appUrl` + prefixo. */
export const HOST_DO_MODULO = new Map([
  ['niso.ness.com.br', '/iso'],
  ['nprivacy.ness.com.br', '/privacy'],
]);

/** Hosts antigos que o Worker ainda recebe só para redirecionar (308) ao `appUrl`, tudo, inclusive as exceções. */
export const HOSTS_LEGADOS = ['n-iso.ness.com.br', 'niso.ness.workers.dev'];

const FICAM = ['/api', '/scim', '/mcp', '/oauth', '/.well-known', '/health'];
const PAGINAS_PUBLICAS = ['/politicas', '/auditor', '/proposta', '/homologacao'];
const EXTENSOES = ['.html', '.js', '.css'];

const casa = (caminho: string, prefixo: string) => caminho === prefixo || caminho.startsWith(`${prefixo}/`);

/**
 * Caminhos que o domínio de módulo serve no lugar, sem redirecionar: integrações já configuradas (chaves de
 * API, SCIM, conectores MCP, links de e-mail do portal de políticas, do auditor, de proposta e de homologação de fornecedor) não dependem de
 * cliente que siga 308. Prefixo só em fronteira de segmento (`/api` casa `/api/x`, não `/apix`), sem regex.
 */
export function fica(caminho: string): boolean {
  return FICAM.some((p) => casa(caminho, p))
    || PAGINAS_PUBLICAS.some((p) => casa(caminho, p) || EXTENSOES.some((e) => caminho === p + e));
}
