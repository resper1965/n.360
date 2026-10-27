import { S } from '../state.js';
import { escapeHTML, renderEmptyState } from '../ui.js';

const URL_MCP = 'https://niso.ness.com.br/mcp';

// aConfirmar: só o Claude Code foi exercitado contra a produção (30/09/2026). Os outros têm
// a configuração, mas o login OAuth deles não foi visto funcionar: não prometer o que não se viu.
// A rota interna segue 'conectar-agente' (menu, telaPedida e ?tela= dependem dela); a tela se chama Agentes.
const CLIENTES = [
    // `--scope user`: o padrão ("local") prende o servidor à pasta onde o comando rodou, e some numa
    // sessão sem pasta ou numa pasta temporária (caso real de um consultor, 01/10/2026).
    { id: 'claude', nome: 'Claude Code', onde: 'Terminal', aConfirmar: false,
      trecho: `claude mcp add --transport http --scope user n360 ${URL_MCP}`,
      precisa: 'Precisa do comando claude no terminal. Se o seu terminal disser que ele não existe (comum com o app desktop), instale no PowerShell com: irm https://claude.ai/install.ps1 | iex, e abra um terminal novo.',
      depois: 'Depois do comando o servidor aparece como "Needs authentication": é o esperado. Abra o claude, rode /mcp, escolha n360 e entre no navegador. Confira com: claude mcp list (deve mostrar conectado). Para refazer: claude mcp remove n360 -s user.' },
    { id: 'cursor', nome: 'Cursor', onde: 'Arquivo .cursor/mcp.json (este projeto) ou ~/.cursor/mcp.json (todos)', aConfirmar: true,
      trecho: `{ "mcpServers": { "niso": { "url": "${URL_MCP}" } } }`,
      depois: 'Salve o arquivo e abra Cursor Settings > MCP: o niso aparece pedindo login. Clique, entre pelo navegador e volte. Conectado, ele lista as ferramentas do niso. Se o navegador não abrir, atualize o Cursor: algumas versões têm esse defeito.' },
    { id: 'codex', nome: 'Codex', onde: 'Terminal', aConfirmar: true,
      trecho: `codex mcp add n360 --url ${URL_MCP}\ncodex mcp login n360`,
      depois: 'O segundo comando abre o navegador para você entrar no n.iso. Confira com: codex mcp list (deve mostrar o niso), ou /mcp dentro do Codex.' },
    { id: 'antigravity', nome: 'Antigravity', onde: 'Arquivo ~/.gemini/config/mcp_config.json', aConfirmar: true,
      trecho: `{ "mcpServers": { "niso": { "serverUrl": "${URL_MCP}" } } }`,
      depois: 'No painel MCP do Antigravity, o niso aparece com o botão Authenticate: clique e entre pelo navegador. Conectado, o botão vira Sign out. O editor e a linha de comando guardam o login separado: entre em cada um. Antes da versão 2.0 o arquivo ficava em ~/.gemini/antigravity/mcp_config.json. A tela de login do n.iso avisa que o acesso vai para outro endereço: confira que é do Google antes de autorizar.' },
    // Conectores de interface (sem terminal): o que se cola é o endereço; não há comando.
    { id: 'chatgpt', nome: 'ChatGPT', onde: 'ChatGPT, em Configurações > Conectores > Avançado > Modo desenvolvedor', aConfirmar: true,
      trecho: URL_MCP,
      depois: 'Ative o Modo desenvolvedor, crie um conector, cole o endereço acima como URL do servidor MCP e escolha OAuth como autenticação. Salve e conecte: o navegador abre para você entrar no n.360. Conectado, o conector lista as ferramentas do niso. Se o seu plano não mostra o Modo desenvolvedor, o conector personalizado não está disponível nele.' },
    { id: 'claude-web', nome: 'Claude (navegador e desktop)', onde: 'Claude, em Configurações > Conectores > adicionar conector personalizado', aConfirmar: true,
      trecho: URL_MCP,
      depois: 'Adicione um conector personalizado, dê o nome niso e cole o endereço acima. Conecte: o navegador abre para você entrar no n.360. Conectado, o niso aparece na lista de conectores com as ferramentas. Para o terminal, use a aba Claude Code.' },
];

// O papel é escolhido no login OAuth, junto com o cliente (src/routes/oauth-autorizacao.ts). Dois papéis: as duas abas ficam
// na ordem de tabulação (sem o tabindex móvel das abas de cliente). Mudou o alcance? Mude aqui,
// no consentimento, no niso_contexto (src/mcp/contexto.ts) e em docs/agente/seguranca.md.
const PAPEIS = [
    { id: 'consultor', nome: 'Consultor', alcance: [
        { titulo: 'Lê', texto: 'Tudo o que você lê neste cliente, nos módulos que o projeto e você têm. n.iso: controles, riscos, evidências em texto, políticas, entrevistas, governança. n.privacy: RoPA, DPIA, requisitos, pedidos do titular, incidentes e terceiros.' },
        { titulo: 'Grava', texto: 'Como você grava na interface. n.iso: políticas (como rascunho), SoA, evidências em texto, controles, ativos e riscos. n.privacy: propõe em rascunho, pelas ferramentas do n.privacy, tratamento do RoPA (pela entrevista de 8 blocos), ligações, LIA, DPIA, pedido do titular e incidente. Aprovar tratamento ou DPIA e concluir a LIA ficam com você, pela interface.' },
        { titulo: 'Pede o seu "sim"', sim: true, texto: 'Apagar, gerar políticas em lote e decidir como consultor (publicar documento, concluir passo, avaliar fornecedor, encerrar incidente, importar programa). Ele mostra o que vai fazer antes. O agente decide como o consultor quando você diz sim na conversa; cada decisão fica na trilha com o motivo. Assinar e aprovar continuam com o cliente.' },
        { titulo: 'Não faz', texto: 'Usuários, SSO, chaves de API, webhooks, sua conta pessoal, criar projeto e registrar achado de auditoria (quem implementa não audita: ISO 27001, 9.2). Atos do cliente: assinar, aprovar, revogar aprovação, aceitar risco, responder o titular e eliminar dados do titular.' },
    ] },
    { id: 'auditor', nome: 'Auditor', alcance: [
        { titulo: 'Lê', texto: 'Só este cliente, nos módulos que o projeto e você têm. n.iso: controles, SoA, riscos, evidências, políticas e auditorias. n.privacy: RoPA, DPIA, requisitos e lacunas, pedidos do titular, incidentes, terceiros e documentos.' },
        { titulo: 'Registra, com o seu "sim"', sim: true, texto: 'Achado de auditoria (a não conformidade abre a ação corretiva) e nota de auditor (pergunta ou pedido de evidência), citando a evidência que leu. Ele mostra o texto antes de gravar.' },
        { titulo: 'Não faz', texto: 'Nenhuma escrita de implementação: não grava, não corrige, não apaga, não gera política e não responde nota. Quem audita não implementa (ISO 27001, 9.2).' },
        { titulo: 'Separação de funções', texto: 'A mesma conta não tem agente Consultor e Auditor ativos no mesmo cliente. Para trocar de papel, revogue o outro acesso e conecte de novo, escolhendo o papel no login.' },
    ] },
];

// Quem pode ser identidade de agente (src/middleware/agente.ts): o consultor e o administrador da consultoria.
const CONECTA = ['consultor', 'consultant', 'consultoria_admin'];
// Quem vê o bloco "Quem está conectado" (GET /projects/:id/agentes, src/routes/agentes.ts).
const VE_CONECTADOS = ['platform_admin', 'consultoria_admin'];

const PASSOS = [
    { titulo: 'Adicione o servidor', texto: 'Copie o comando ou o endereço do seu cliente, na aba acima, e use-o onde a aba indica. O endereço é o mesmo para todos.' },
    { titulo: 'Entre e escolha o cliente e o papel', texto: 'O servidor fica sem acesso até você entrar: no Claude Code, abra o claude, rode /mcp, escolha n360 e entre pelo navegador. Esse login é seu, o agente da sessão não o faz por você. No navegador, escolha um cliente (é um por conexão) e o papel: Consultor ou Auditor.' },
    { titulo: 'Chame niso_contexto', texto: 'Peça ao agente para começar por niso_contexto: ela diz o cliente, o mapa da app e os roteiros (diagnóstico, fechar lacuna, responder auditoria e a pré-avaliação de prontidão, que só lê; no n.privacy, inventário, titular e incidente, cobertura, maturidade, implantação, migração e terceiros).' },
];

let selecionado = 'claude';
let papel = PAPEIS[0].id;
let ultimo = null; // { c, h, a } da última renderização, para trocar de aba sem perder o contêiner

// "Copiado" só depois que a área de transferência aceitou; senão, diz que falhou.
window.__copiarTrecho = async (id) => {
    const el = document.getElementById('trecho-' + id);
    try {
        await navigator.clipboard.writeText(el.textContent);
        window.showToast('Copiado');
    } catch (e) {
        window.showToast('Não foi possível copiar — selecione o texto e copie manualmente', 'error');
    }
};

const bloco = (id, texto, copia) => `
    <div class="ca-bloco">
        <pre id="trecho-${id}" class="ca-pre">${escapeHTML(texto)}</pre>
        ${copia ? `<button class="btn btn-secondary" data-action="__copiarTrecho" data-args='["${id}"]' aria-label="Copiar">Copiar</button>` : ''}
    </div>`;

const papelDoUsuario = () => S.user?.role;
const podeConectar = () => CONECTA.includes(papelDoUsuario());

const selo = (aConfirmar) => aConfirmar
    ? '<span class="ca-selo">A confirmar</span>'
    : '<span class="ca-selo ca-selo-ok">Verificado</span>';

function desenhar() {
    const { h, a } = ultimo;
    h.textContent = 'Agentes';
    a.innerHTML = '';
    const corpo = document.getElementById('agentes-corpo');
    const atual = CLIENTES.find(cl => cl.id === selecionado) || CLIENTES[0];

    const abas = CLIENTES.map(cl => {
        const ativa = cl.id === atual.id;
        return `<button type="button" role="tab" id="aba-${cl.id}" class="aba" aria-selected="${ativa}" aria-controls="painel-cliente" tabindex="${ativa ? 0 : -1}" data-action="__selecionarCliente" data-args='["${cl.id}"]'>${escapeHTML(cl.nome)} ${selo(cl.aConfirmar)}</button>`;
    }).join('');

    const estado = atual.aConfirmar
        ? 'A configuração está pronta, mas o login deste cliente ainda não foi confirmado. Se falhar, avise a ness. dizendo em que etapa.'
        : 'Exercitado em produção em 30/09/2026: conexão, leitura e escrita.';

    const passos = PASSOS.map((p, i) => `
        <li class="ca-passo">
            <span class="ca-num">0${i + 1}</span>
            <div class="ca-passo-corpo">
                <div class="ca-passo-titulo">${escapeHTML(p.titulo)}</div>
                <p class="ca-passo-txt">${escapeHTML(p.texto)}</p>
            </div>
        </li>`).join('');

    const papelAtual = PAPEIS.find(x => x.id === papel) || PAPEIS[0];
    const seletorPapel = `<div class="abas" role="tablist" aria-label="Papel do agente">${PAPEIS.map(x => `<button type="button" role="tab" id="papel-${x.id}" class="aba" aria-selected="${x.id === papelAtual.id}" aria-controls="alcance-papel" data-action="__selecionarPapel" data-args='["${x.id}"]'>${escapeHTML(x.nome)}</button>`).join('')}</div>`;
    const alcance = papelAtual.alcance.map(x => `
        <article class="ca-alc${x.sim ? ' ca-alc-sim' : ''}">
            <h3 class="ca-alc-titulo">${escapeHTML(x.titulo)}</h3>
            <p class="ca-alc-txt">${escapeHTML(x.texto)}</p>
        </article>`).join('');

    corpo.innerHTML = `
        <div class="ca fade-in">
            <div class="ca-main">
                <section aria-label="Seu cliente MCP">
                    <h2 class="ca-titulo">Conectar o seu cliente</h2>
                    <p class="ca-nota">O agente trabalha no n.360, nos dois módulos, n.iso e n.privacy, os que o projeto e você têm. O endereço do servidor é o mesmo para todos. O login define quem é o agente e em qual cliente ele atua: ele age em nome de você, só nos clientes que você alcança, e a trilha registra o seu e-mail.</p>
                    ${podeConectar() ? '' : '<p class="ca-dica ca-sem-conexao" role="note">Esta conta não conecta agente; use uma conta de consultor.</p>'}
                    <div class="abas" role="tablist" aria-label="Cliente MCP" data-action-keydown="__abaTecla" data-arg-event>${abas}</div>
                    <div class="ca-painel" role="tabpanel" id="painel-cliente" aria-labelledby="aba-${atual.id}">
                        <div class="ca-painel-cab">
                            <span class="ca-onde">${escapeHTML(atual.onde)}</span>
                            <span class="ca-estado">${escapeHTML(estado)}</span>
                        </div>
                        ${atual.precisa ? `<p class="ca-dica">${escapeHTML(atual.precisa)}</p>` : ''}
                        ${bloco(atual.id, atual.trecho, podeConectar())}
                        ${atual.depois ? `<p class="ca-dica">${escapeHTML(atual.depois)}</p>` : ''}
                    </div>
                </section>
                <section aria-label="Como conectar">
                    <h2 class="ca-titulo">Em três passos</h2>
                    <ol class="ca-passos">${passos}</ol>
                </section>
            </div>
            <aside class="ca-lado" aria-label="O que o agente faz">
                <h2 class="ca-titulo">O que o agente ${escapeHTML(papelAtual.nome)} faz</h2>
                ${seletorPapel}
                <div class="ca-alcance" id="alcance-papel" role="tabpanel" aria-labelledby="papel-${papelAtual.id}">${alcance}</div>
                <p class="ca-rodape">O MCP remoto só funciona em niso.ness.com.br. O administrador do cliente vê este acesso em Governança e pode revogá-lo; ele também cai quando você troca a senha ou sai da governança do projeto.</p>
            </aside>
        </div>`;
}

// "Quem está conectado": reaproveita o cartão e a revogação da Governança (monitor.js). Fica fora de
// #agentes-corpo para trocar de aba não refazer a consulta.
function blocoConectados() {
    if (!VE_CONECTADOS.includes(papelDoUsuario())) return '';
    const conteudo = S.activeProject
        ? '<div id="gov-agentes"></div>'
        : renderEmptyState({ titulo: 'Sem projeto ativo', texto: 'Escolha o projeto para ver quais agentes estão conectados a ele.',
            acao: '<button class="btn btn-primary" data-action="openActiveProjectModal">Selecionar projeto</button>' });
    return `<section class="ca-conectados" aria-label="Quem está conectado">
        <h2 class="ca-titulo">Quem está conectado</h2>${conteudo}</section>`;
}

function renderConectarAgente(c, h, a) {
    selecionado = 'claude';
    papel = PAPEIS[0].id;
    ultimo = { c, h, a };
    c.innerHTML = `<div id="agentes-corpo"></div>${blocoConectados()}`;
    desenhar();
    if (S.activeProject && VE_CONECTADOS.includes(papelDoUsuario())) {
        window.carregarAgentesDoProjeto?.(S.activeProject.id);
        window.agentesAoVivo?.(S.activeProject.id);
    }
}

window.__selecionarPapel = (id) => {
    if (!ultimo || !PAPEIS.some(x => x.id === id)) return;
    papel = id;
    desenhar();
};

window.__selecionarCliente = (id) => {
    if (!ultimo || !CLIENTES.some(cl => cl.id === id)) return;
    selecionado = id;
    desenhar();
};

// Setas, Home e End movem a seleção e dão a volta (padrão WAI-ARIA de abas). O foco acompanha,
// porque redesenhar troca o botão no DOM.
window.__abaTecla = (e) => {
    const i = CLIENTES.findIndex(cl => cl.id === selecionado);
    const n = CLIENTES.length;
    const destino = { ArrowRight: (i + 1) % n, ArrowLeft: (i - 1 + n) % n, Home: 0, End: n - 1 }[e.key];
    if (destino === undefined) return;
    e.preventDefault();
    window.__selecionarCliente(CLIENTES[destino].id);
    document.getElementById('aba-' + CLIENTES[destino].id)?.focus();
};

export { renderConectarAgente };
window.renderConectarAgente = renderConectarAgente;
