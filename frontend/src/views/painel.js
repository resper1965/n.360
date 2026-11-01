import { S } from '../state.js';
import { api, baixarArquivo } from '../api.js';
import { escapeHTML, openModal, showToast, renderEmptyState, renderErrorState } from '../ui.js';
import { modulosDe, modulosVisiveis, enderecoDoProduto, irPara, projetosDoProduto, DESCRICAO_DO_MODULO } from '../produto.js';
import { aplicarSelos } from '../selos-menu.js';
import { filtroValido } from '../filtro-painel.js';
import { renderPontoDePartida } from './ponto-de-partida.js';
import { graficoCobertura, graficoMapa, graficoVencimentos, graficoPedidos, ligarDicas } from './painel-graficos.js';

// Painel de entrada do n.360, do n.iso e do n.privacy (estudo docs/design/diagnostico-2026-10-14/dashboard-entrada.md, direção A).
// Uma chamada por entrada (`GET /projects/:id/painel`, com `?modulo=` no módulo); a frase, a lista e a visão por papel vêm do
// servidor, aqui só se desenha. Esqueleto no primeiro quadro; a resposta fica 60 s em `S.painel` e, vencida, a tela antiga
// aparece esmaecida enquanto a nova chega (nada de piscar o esqueleto). Todo texto do servidor passa por escapeHTML.

const VALIDADE_MS = 60_000;
const NOME = { iso: 'n.iso', privacy: 'n.privacy', ot: 'n.ot' };
// O n.ot ainda não tem bloco no painel (N1): fica fora das linhas e da lista; só o nome aparece na carteira.
const MODULOS = ['iso', 'privacy'];
const ROTULO_ESTADO = { atraso: 'Atrasado', semana: 'Nesta semana', plano: 'Para planejar' };
const e = (v) => escapeHTML(String(v ?? ''));
const args = (...v) => escapeHTML(JSON.stringify(v));
const marca = (m) => `n<span class="pn-ponto">.</span>${m === 'iso' ? 'iso' : 'privacy'}`;
/** Nome do módulo com o que ele é, na primeira coluna da linha. */
const nomeDoModulo = (m) => `<div><h3>${marca(m)}</h3><p class="pn-m-desc pn-meta">${e(DESCRICAO_DO_MODULO[m])}</p></div>`;
const estado = (tom, texto) => `<span class="pn-estado pn-${e(tom)}">${e(texto)}</span>`;
const quadro = (id, titulo, corpo, extra = '') => `<section class="pn-quadro" aria-labelledby="${id}"><header><h2 id="${id}">${e(titulo)}</h2>${extra}</header>${corpo}</section>`;
const ehEquipe = () => typeof window.ehEquipeNess === 'function' && window.ehEquipeNess();
const podeGerirModulos = () => !!S.user && ['platform_admin', 'consultoria_admin'].includes(S.user.role);
let rodada = 0;

/** Telas a que um botão do painel pode levar: a lista fechada (o destino vem do servidor como dado). */
const TELAS_DO_PAINEL = new Set(['encarregado', 'ropa', 'titular', 'terceiros', 'mapa-de-risco', 'evidence', 'documentos', 'requisitos', 'capa', 'audits',
    'risks', 'soa', 'context', 'project-detail', 'assets', 'meus-pedidos', 'importacao']);

/** O projeto da entrada: o ativo; sem ele, o primeiro da lista (e passa a ser o ativo, como o início do n.360 sempre fez). */
function projetoDaEntrada() {
    if (!S.activeProject && Array.isArray(S.projects) && S.projects.length) {
        S.activeProject = S.projects[0];
        S.currentProject = S.projects[0];
        if (typeof window.updateActiveProjectWidget === 'function') window.updateActiveProjectWidget();
    }
    return S.activeProject || null;
}

// ─── Vista do n.360: Projeto ou Carteira (decisão 4) ───────────────────────────────────────────────────

const CHAVE_VISTA = 'n360_vista';
const temCarteira = () => ehEquipe() && projetosDoProduto(S.projects || [], 'n360').length > 1;
let vistaDaSessao = null; // a escolha desta página, para valer mesmo sem storage
function vistaDoN360() {
    if (!temCarteira()) return 'projeto';
    let lembrada = vistaDaSessao;
    if (!lembrada) { try { lembrada = localStorage.getItem(CHAVE_VISTA); } catch (err) { lembrada = null; } }
    return lembrada === 'projeto' || lembrada === 'carteira' ? lembrada : 'carteira';
}
window.painelVista = function (vista) {
    if (vista !== 'projeto' && vista !== 'carteira') return;
    vistaDaSessao = vista;
    try { localStorage.setItem(CHAVE_VISTA, vista); } catch (err) { /* sem storage: vale só até recarregar */ }
    if (typeof window.render === 'function') window.render();
};
const alternancia = (vista) => `<div class="pn-alterna" role="group" aria-label="Ver o projeto ativo ou a carteira">
    <button type="button" class="btn btn-sm" data-action="painelVista" data-args='["projeto"]' aria-pressed="${vista === 'projeto'}">Projeto</button>
    <button type="button" class="btn btn-sm" data-action="painelVista" data-args='["carteira"]' aria-pressed="${vista === 'carteira'}">Carteira</button></div>`;

// ─── Peças ─────────────────────────────────────────────────────────────────────────────────────────────

function cnpj(v) {
    const d = String(v || '').replace(/\D/g, '');
    return d.length === 14 ? `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}` : String(v || '');
}

function identidade(d, proj) {
    const emp = d.empresa || {};
    const razao = emp.razao_social || proj.client_name || proj.project_name || 'Empresa sem cadastro';
    const campo = (rotulo, valor, falta = 'Não informado') => `<div><dt>${rotulo}</dt><dd>${valor ? e(valor) : `<span class="pn-falta">${falta}</span>`}</dd></div>`;
    const setor = emp.setor ? `${emp.setor}${emp.cnae_codigo ? ` (CNAE ${emp.cnae_codigo})` : ''}` : emp.cnae_descricao || '';
    const porte = emp.porte ? `${emp.porte}${emp.funcionarios ? `, ${emp.funcionarios} pessoas` : ''}` : emp.funcionarios ? `${emp.funcionarios} pessoas` : '';
    const local = [emp.municipio, emp.uf].filter(Boolean).join(', ');
    const encs = (Array.isArray(d.encarregados) ? d.encarregados : []).map((x) => x.nome).join(', ');
    const completo = emp.razao_social && (emp.cnpj || emp.documento_alternativo) && emp.setor;
    return `<section class="pn-ident" aria-labelledby="pn-empresa"><div>
            <h2 id="pn-empresa">${e(razao)}${emp.nome_fantasia && emp.nome_fantasia !== razao ? `<small>${e(emp.nome_fantasia)}</small>` : ''}</h2>
            <dl>${campo('CNPJ', emp.cnpj ? cnpj(emp.cnpj) : emp.documento_alternativo)}${campo('Setor', setor)}${campo('Porte', porte)}${campo('Local', local)}
                ${'privacy' in (d.modulos || {}) ? campo('Encarregado', encs, 'Não indicado') : ''}${campo('Programa', d.programa && d.programa.rotulo)}</dl>
        </div><div><button type="button" class="btn" data-action="abrirDadosEmpresa" data-args='${args(proj.id)}'>${completo ? 'Dados da empresa' : 'Completar o cadastro'}</button></div></section>`;
}

const hora = (iso) => { const t = new Date(iso); return Number.isNaN(t.getTime()) ? '' : t.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); };

function saude(s, geradoEm) {
    const sd = s || { tom: 'plano', rotulo: 'Sem dados', frase: '', apoio: '' };
    return `<section class="pn-saude" aria-labelledby="pn-saude-t"><h2 id="pn-saude-t" class="sr-only">Situação do programa</h2>${estado(sd.tom, sd.rotulo)}
        <p class="pn-frase">${e(sd.frase)}</p><p class="pn-apoio">${e(sd.apoio)}</p>
        <details class="pn-regra"><summary>Calculado às ${e(hora(geradoEm))} a partir do cadastro do projeto. Como esta frase é montada</summary>
            <p>A frase sai da mesma lista de "O que fazer". <b>Atrasado</b>: algum prazo vencido (pedido do titular, comunicação de incidente,
            ação corretiva, avaliação de terceiro); a frase nomeia o mais grave. <b>Atenção</b>: nada vencido, mas algo vence em até 7 dias ou há
            pendência exigida. <b>Em dia</b>: nenhuma das duas; a frase diz o próximo prazo. <b>Começando</b>: o projeto ainda não tem o cadastro
            mínimo, e projeto vazio nunca é dado como em dia. <b>Sua vez</b>: há pedido de aprovação ou ciência para você.</p></details></section>`;
}

/**
 * Lista "O que fazer", em grupos de prazo; cada item tem um botão com nome acessível único (a ação e o texto). Só o
 * primeiro item (o mais urgente) é primário: uma ação principal por tela (DESIGN.md).
 */
function listaFazer(itens, comModulo) {
    const lista = Array.isArray(itens) ? itens : [];
    if (!lista.length) return '<p class="pn-vazio-tx">Nenhuma pendência calculada a partir do que está cadastrado.</p>';
    const grupos = ['atraso', 'semana', 'plano'];
    const primeiro = grupos.map((g) => lista.find((i) => i.grupo === g)).find(Boolean);
    return grupos.map((g) => {
        const doGrupo = lista.filter((i) => i.grupo === g);
        if (!doGrupo.length) return '';
        return `<p class="pn-gt">${estado(g, ROTULO_ESTADO[g])}<span class="pn-num">${doGrupo.length}</span></p><ul class="pn-grupo">${doGrupo.map((i) => `
            <li><span class="pn-meta">${e(i.quando)}</span><div><div class="pn-tx">${comModulo && i.modulo ? `<span class="pn-tag">${e(NOME[i.modulo] || i.modulo)}</span>` : ''}${e(i.texto)}</div>${i.contexto ? `<div class="pn-cx">${e(i.contexto)}</div>` : ''}</div>
            <button type="button" class="btn btn-sm${i === primeiro ? ' btn-primary' : ''}" data-action="painelAbrir" data-args='${args(i.tela, i.aba || null, i.filtro || null)}' aria-label="${e(`${i.acao}: ${i.texto}${comModulo && i.modulo ? ` (${NOME[i.modulo] || i.modulo})` : ''}`)}">${e(i.acao)}</button></li>`).join('')}</ul>`;
    }).join('');
}

/** O que espera a decisão do cliente; a primeira decisão é a ação primária da tela. `semNada` completa o vazio. */
function listaDecisoes(decisoes, semNada = '') {
    const lista = Array.isArray(decisoes) ? decisoes : [];
    if (!lista.length) return `<p class="pn-vazio-tx">Nada esperando a sua decisão agora.</p>${semNada}`;
    return `<ul class="pn-grupo">${lista.map((p, n) => `<li><span class="pn-meta">Desde ${e(String(p.desde || '').split('-').reverse().join('/'))}</span>
        <div><div class="pn-tx">${e(p.titulo)}</div><div class="pn-cx">${p.papel === 'ciente' ? 'Ciência' : `Aprovação (${e(String(p.papel || '').toUpperCase())})`}</div></div>
        <button type="button" class="btn btn-sm${n === 0 ? ' btn-primary' : ''}" data-action="abrirPedido" data-args='${args(p.id)}' aria-label="${e(`${p.acao}: ${p.titulo}`)}">${e(p.acao)}</button></li>`).join('')}</ul>`;
}

function passos(lista) {
    const ps = Array.isArray(lista) ? lista : [];
    return `<ol class="pn-passos">${ps.map((p, n) => `<li><div><div class="pn-tx">${e(p.texto)}</div><div class="pn-meta">${e(p.contexto)}</div></div>
        ${p.feito ? estado('ok', 'Feito') : `<button type="button" class="btn btn-sm${n === ps.findIndex((x) => !x.feito) ? ' btn-primary' : ''}" data-action="painelAbrir" data-args='${args(p.tela, null)}' aria-label="${e(`${p.acao}: ${p.texto}`)}">${e(p.acao)}</button>`}</li>`).join('')}</ol>`;
}

const DEPOIS = '<p class="pn-vazio-tx">Quando houver o primeiro registro, este lado mostra a cobertura do programa por tema, o mapa de risco e os próximos vencimentos.</p>'
    + '<p class="pn-vazio-tx pn-meta">Nada aparece zerado de propósito: zero aqui significaria "em dia", e um projeto sem cadastro não está em dia.</p>';

/** Uma linha por módulo (n.360): estado, frase, três números e "Abrir"; o módulo fora do projeto diz quem habilita. */
function linhaModulo(m, d, proj) {
    const b = d.modulos && d.modulos[m];
    if (b) {
        // Abrir o módulo é sempre secundário: o primário é o item mais urgente (equipe) ou a decisão (cliente).
        // Projeto começando não mostra números zerados ao cliente.
        const cliente = d.visao === 'cliente';
        const numeros = cliente && b.comecando ? '<div></div>'
            : `<dl class="pn-fig">${(Array.isArray(b.numeros) ? b.numeros : []).map(([v, r]) => `<div><dt>${e(r)}</dt><dd class="pn-num">${e(v)}</dd></div>`).join('')}</dl>`;
        return `<div class="pn-m">${nomeDoModulo(m)}<div>${estado(b.saude.tom, b.saude.rotulo)}<div class="pn-m-frase">${e(b.saude.frase)}</div></div>
            ${numeros}
            <button type="button" class="btn btn-sm" data-action="abrirModulo" data-args='${args(m)}'>Abrir o ${NOME[m]}</button></div>`;
    }
    const doProjeto = modulosDe(proj).includes(m);
    const texto = doProjeto ? `Você ainda não tem acesso ao ${NOME[m]} neste projeto. Quem administra as contas da consultoria concede em Usuários.`
        : ehEquipe() ? `O ${NOME[m]} não está habilitado neste projeto. Ao habilitar, o que já está no cadastro (pessoas, sistemas, documentos) entra pronto.`
            : `O ${NOME[m]} não está habilitado neste projeto. Fale com a ness. para contratar; o que já está no cadastro entra pronto.`;
    const acao = !doProjeto && podeGerirModulos() ? `<button type="button" class="btn btn-sm" data-action="abrirProdutosDoProjeto" data-args='${args(proj.id)}'>Habilitar no projeto</button>` : '';
    return `<div class="pn-m">${nomeDoModulo(m)}<div>${estado('plano', doProjeto ? 'Sem acesso' : 'Não habilitado neste projeto')}<div class="pn-m-frase pn-meta">${e(texto)}</div></div><div></div>${acao || '<div></div>'}</div>`;
}

function colunas(esquerda, direita) {
    return `<div class="pn-cols"><div class="pn-col">${esquerda.join('')}</div><div class="pn-col">${direita.join('')}</div></div>`;
}

/**
 * A jornada como o cliente a lê no n.iso (o servidor manda `jornada` só na visão dele): a fase em curso e quantas passaram,
 * sem os números da consultoria. `fazendo` é a frase curta para o vazio de "Esperando a sua decisão".
 */
function jornadaDoCliente(j) {
    if (!j || !j.atual) {
        const texto = !j ? 'A jornada deste projeto ainda não foi aberta pela consultoria.' : 'Todas as fases da jornada estão concluídas.';
        return { fazendo: `<p class="pn-vazio-tx pn-meta">${e(texto)}</p>`, quadro: `<p class="pn-vazio-tx">${e(texto)}</p>` };
    }
    const fase = `Fase ${j.atual.numero} de ${j.total}: ${j.atual.titulo}`;
    return {
        fazendo: `<p class="pn-vazio-tx pn-meta">${e(`A consultoria está conduzindo a fase ${j.atual.numero}: ${j.atual.titulo}.`)}</p>`,
        quadro: `<p class="pn-tx">${e(fase)}</p><p class="pn-meta">${e(`${j.concluidas} de ${j.total} fases concluídas`)}</p>
            <p><button type="button" class="btn btn-sm" data-action="painelAbrir" data-args='${args('project-detail', null)}'>Ver a jornada</button></p>`,
    };
}

/** Entrada de um módulo (n.iso ou n.privacy). */
function telaDoModulo(d, m, proj) {
    const b = (d.modulos && d.modulos[m]) || {};
    const topo = `${identidade(d, proj)}${saude(d.saude, d.gerado_em)}`;
    if (d.visao === 'cliente') {
        // Dentro do módulo não há "Abrir o módulo"; no n.iso o lado direito é a jornada (o próximo marco), não números.
        if (m === 'iso') {
            const j = jornadaDoCliente(b.jornada);
            return `${topo}${colunas([quadro('pn-dec', 'Esperando a sua decisão', listaDecisoes(d.decisoes, j.fazendo))],
                [quadro('pn-jornada', 'Onde o programa está', j.quadro)])}`;
        }
        return `${topo}${colunas([quadro('pn-dec', 'Esperando a sua decisão', listaDecisoes(d.decisoes))],
            [`<section class="pn-modulos" aria-label="Este módulo">${linhaModulo(m, d, proj)}</section>`])}`;
    }
    if (b.comecando) return `${topo}${colunas([quadro('pn-passos-t', 'Primeiros passos', passos(b.passos))], [quadro('pn-depois', 'O que vai aparecer aqui', DEPOIS)])}`;
    // Ações das atividades por faixa de prazo (F4): o modal de encarregado.js, com as faixas que vieram no painel.
    const faixas = m === 'privacy' && Array.isArray(b.acoes_por_prazo) ? b.acoes_por_prazo : null;
    if (faixas && typeof window.guardarFaixasPrazo === 'function') window.guardarFaixasPrazo(faixas);
    const porPrazo = faixas ? `<button type="button" class="btn btn-ghost btn-sm" data-action="abrirPrazosDasAcoes" data-args='${args(proj.id)}'>Ações por prazo</button>` : '';
    const esquerda = [quadro('pn-fazer', 'O que fazer agora', listaFazer(b.fazer, false)), quadro('pn-venc', 'Próximos vencimentos, 90 dias', graficoVencimentos(b.vencimentos), porPrazo)];
    const riscos = Array.isArray(b.riscos) ? b.riscos : [];
    const totalRiscos = riscos.reduce((t, c) => t + (Number(c.n) || 0), 0);
    const direita = [quadro('pn-cob', 'Cobertura do programa', graficoCobertura(b.cobertura), '<span class="pn-meta">mesma escala em todos os temas</span>'),
        quadro('pn-mapa-t', 'Mapa de risco', totalRiscos ? graficoMapa(riscos) : `<p class="pn-vazio-tx">Nenhum risco registrado${m === 'privacy' ? ' nas atividades de tratamento' : ''}. Os riscos aparecem aqui por probabilidade e impacto.</p>`,
            totalRiscos ? `<span class="pn-meta">${totalRiscos} ${totalRiscos === 1 ? 'risco' : 'riscos'}${m === 'privacy' ? ' das atividades' : ''}</span>` : '')];
    if (m === 'privacy' && Array.isArray(b.pedidos_mes)) {
        const total = b.pedidos_mes.reduce((t, n) => t + (Number(n) || 0), 0);
        direita.push(quadro('pn-ped', 'Pedidos do titular recebidos', total ? graficoPedidos(b.pedidos_mes, b.meses_pedidos) : '<p class="pn-vazio-tx">Nenhum pedido recebido nos últimos 12 meses.</p>'));
    }
    return `${topo}${colunas(esquerda, direita)}`;
}

/** Início do n.360: a frase dos dois módulos, uma linha por módulo e a lista que junta os dois. */
function telaDoN360(d, proj) {
    const topo = `${identidade(d, proj)}${saude(d.saude, d.gerado_em)}`;
    const linhas = `<section class="pn-modulos" aria-label="Módulos deste projeto">${MODULOS.map((m) => linhaModulo(m, d, proj)).join('')}</section>`;
    // Para o cliente, a decisão vem antes das linhas dos módulos: é a ação dele.
    if (d.visao === 'cliente') return `${topo}${colunas([quadro('pn-dec', 'Esperando a sua decisão', listaDecisoes(d.decisoes))], [])}${linhas}`;
    // A mesma ordem da frase do servidor: o n.privacy primeiro em cada grupo (o prazo dele é legal).
    const blocos = ['privacy', 'iso'].map((m) => d.modulos && d.modulos[m]).filter(Boolean);
    const juntos = ['atraso', 'semana', 'plano'].flatMap((g) => blocos.flatMap((b) => (Array.isArray(b.fazer) ? b.fazer : []).filter((i) => i.grupo === g)));
    const mostrados = juntos.slice(0, 8);
    const resto = juntos.length - mostrados.length;
    const esquerda = blocos.every((b) => b.comecando)
        ? quadro('pn-passos-t', 'Primeiros passos', `<p class="pn-vazio-tx">Comece por um dos módulos acima: cada um abre com os primeiros passos dele.</p>`)
        : quadro('pn-fazer', 'O que fazer agora, nos dois módulos', `${listaFazer(mostrados, true)}${resto > 0 ? `<p class="pn-meta">E mais ${resto}. Abra o módulo para a lista inteira.</p>` : ''}`);
    return `${topo}${linhas}${colunas([esquerda], ['<div id="inicio-ponto-de-partida"></div>'])}`;
}

function esqueleto(entrada) {
    const b = (cls) => `<div class="pn-esq ${cls}"></div>`;
    const lista = [1, 2, 3, 4].map(() => b('pn-esq-linha')).join('');
    return `<div class="pn" aria-busy="true" aria-label="Carregando o painel">
        <div class="pn-ident"><div class="pn-esq-grupo">${b('pn-esq-titulo')}${b('pn-esq-texto')}</div></div>
        <div class="pn-saude">${b('pn-esq-rotulo')}${b('pn-esq-frase')}${b('pn-esq-texto')}</div>
        ${entrada === 'n360' ? `<div class="pn-modulos">${b('pn-esq-linha')}${b('pn-esq-linha')}</div>` : ''}
        <div class="pn-cols"><div class="pn-col"><div class="pn-quadro">${b('pn-esq-rotulo')}${lista}</div></div>
        <div class="pn-col"><div class="pn-quadro">${b('pn-esq-rotulo')}${[1, 2, 3, 4, 5, 6].map(() => b('pn-esq-barra')).join('')}</div></div></div></div>`;
}

// ─── Carteira (Fase 3) ─────────────────────────────────────────────────────────────────────────────────

const quandoFoi = (iso) => {
    if (!iso) return 'sem registro';
    const d = Math.floor((Date.now() - new Date(String(iso).replace(' ', 'T') + (String(iso).length <= 19 ? 'Z' : '')).getTime()) / 86_400_000);
    return Number.isNaN(d) ? 'sem registro' : d <= 0 ? 'hoje' : d === 1 ? 'ontem' : `há ${d} dias`;
};

function telaDaCarteira(dados) {
    const lista = Array.isArray(dados && dados.projetos) ? dados.projetos : [];
    const atrasados = lista.filter((p) => p.tom === 'atraso').length;
    const frase = !lista.length ? 'Nenhum projeto na sua carteira.'
        : `${lista.length} ${lista.length === 1 ? 'projeto' : 'projetos'}. ${atrasados ? `${atrasados === 1 ? 'Um precisa' : `${atrasados} precisam`} de você hoje.` : 'Nenhum com prazo vencido.'}`;
    const tabela = `<table class="pn-tabela pn-carteira"><thead><tr><th scope="col">Empresa</th><th scope="col">Módulos</th><th scope="col">Situação</th><th scope="col">O mais urgente</th>
        <th scope="col">Último movimento</th><th scope="col"><span class="sr-only">Ação</span></th></tr></thead><tbody>${lista.map((p, n) => `<tr>
        <td class="pn-tx">${e(p.nome)}</td><td class="pn-meta">${(p.modulos || []).map((m) => e(NOME[m] || m)).join(', ')}</td><td>${estado(p.tom, p.situacao)}</td>
        <td>${e(p.urgente)}</td><td class="pn-meta">${e(quandoFoi(p.ultimo_movimento))}</td>
        <td class="n"><button type="button" class="btn btn-sm${n === 0 ? ' btn-primary' : ''}" data-action="painelAbrirProjeto" data-args='${args(p.id, p.modulo_urgente)}' aria-label="Abrir ${e(p.nome)}">Abrir</button></td></tr>`).join('')}</tbody></table>`;
    return `<div class="pn"><section class="pn-saude" aria-labelledby="pn-cart-t"><h2 id="pn-cart-t" class="sr-only">Sua carteira</h2>${estado(atrasados ? 'atraso' : 'ok', atrasados ? 'Atenção hoje' : 'Em dia')}
        <p class="pn-frase">${e(frase)}</p><p class="pn-apoio">A lista começa pelo que tem prazo legal vencido. Abrir leva ao projeto, no módulo onde está a pendência.</p></section>
        ${quadro('pn-cart-l', 'Projetos por urgência', lista.length ? tabela : '<p class="pn-vazio-tx">Quando você for designado num projeto, ele aparece aqui.</p>')}</div>`;
}

window.painelAbrirProjeto = function (projectId, modulo) {
    const p = (S.projects || []).find((x) => x.id === projectId);
    if (!p) return;
    S.activeProject = p;
    S.currentProject = p;
    try { localStorage.setItem('niso_activeProject', JSON.stringify(p)); } catch (err) { /* o módulo abre no projeto que tiver */ }
    const destino = modulosVisiveis(p).includes(modulo) ? modulo : modulosVisiveis(p)[0];
    if (destino) irPara(enderecoDoProduto(destino));
};

// ─── Desenho e dados ───────────────────────────────────────────────────────────────────────────────────

function cabecalho(a, entrada, proj, d) {
    const botoes = [];
    if (entrada === 'n360' && temCarteira()) botoes.push(alternancia('projeto'));
    if (entrada === 'privacy' && d && d.visao === 'equipe') botoes.push(`<button type="button" class="btn" data-action="painelExportar" data-args='${args(proj.id)}'>Exportar</button>`);
    a.innerHTML = botoes.join('');
}

function desenhar(c, a, entrada, proj, d) {
    cabecalho(a, entrada, proj, d);
    c.innerHTML = `<div class="pn">${entrada === 'n360' ? telaDoN360(d, proj) : telaDoModulo(d, entrada, proj)}</div>`;
    ligarDicas(c.firstElementChild);
    const selos = entrada === 'iso' ? d.modulos && d.modulos.iso && d.modulos.iso.selos : d.selos;
    if (selos) aplicarSelos(selos);
    const pp = c.querySelector('#inicio-ponto-de-partida');
    if (pp) renderPontoDePartida(pp, proj.id, 'n360');
}

function semModulo(c, entrada, proj) {
    const nome = NOME[entrada];
    const acao = podeGerirModulos() ? `<button type="button" class="btn btn-primary" data-action="abrirProdutosDoProjeto" data-args='${args(proj.id)}'>Habilitar no projeto</button>` : '';
    c.innerHTML = renderEmptyState({ id: 'pn-sem-modulo', titulo: `O ${nome} não está habilitado neste projeto`,
        texto: ehEquipe() ? 'A consultoria habilita o módulo no projeto; o que já está no cadastro (pessoas, sistemas, documentos) entra pronto.'
            : 'Fale com a ness. para contratar. O que já está no cadastro entra pronto quando o módulo for habilitado.',
        acao: `${acao}<a class="btn" href="${e(enderecoDoProduto('n360'))}">Voltar ao início do n.360</a>` });
}

const valido = (x) => x && Date.now() - x.t < VALIDADE_MS;

async function carregar(c, a, entrada, proj, chave, buscar, desenho) {
    S.painel = S.painel || {};
    const guardado = S.painel[chave];
    const eu = ++rodada;
    const tela = S.view;
    if (valido(guardado)) { desenho(guardado.dados); return; }
    if (guardado) {
        desenho(guardado.dados);
        if (c.firstElementChild) c.firstElementChild.classList.add('pn-recarregando');
        c.setAttribute('aria-busy', 'true');
    } else {
        c.innerHTML = esqueleto(entrada);
    }
    let dados;
    try { dados = await buscar(); } catch (err) {
        if (eu !== rodada || S.view !== tela) return;
        c.removeAttribute('aria-busy');
        if (err && err.status === 403 && entrada !== 'n360' && proj) { semModulo(c, entrada, proj); return; }
        console.error('Falha ao montar o painel', err);
        c.innerHTML = renderErrorState('Não foi possível montar o painel.', { erro: err });
        return;
    }
    if (eu !== rodada || S.view !== tela) return;
    c.removeAttribute('aria-busy');
    if (!dados || typeof dados !== 'object' || Array.isArray(dados)) {
        c.innerHTML = renderErrorState('Não foi possível montar o painel.');
        return;
    }
    S.painel[chave] = { t: Date.now(), dados };
    desenho(dados);
}

/** A entrada: `entrada` é 'n360', 'iso' ou 'privacy'. */
export async function renderPainel(c, h, a, entrada) {
    if (h) h.textContent = entrada === 'n360' ? 'Início' : 'Painel';
    if (a) a.innerHTML = '';
    const proj = projetoDaEntrada();
    if (!proj) {
        c.innerHTML = entrada === 'n360'
            ? renderEmptyState({ titulo: 'Nenhum projeto ainda', texto: 'Quando um projeto seu tiver um módulo habilitado, ele aparece aqui.' })
            : window.renderSemProjeto();
        return;
    }
    if (entrada === 'n360' && vistaDoN360() === 'carteira') {
        if (a) a.innerHTML = alternancia('carteira');
        await carregar(c, a, entrada, null, 'carteira', () => api('GET', '/api/v1/carteira'), (dados) => {
            c.innerHTML = telaDaCarteira(dados);
            if (a) a.innerHTML = alternancia('carteira');
        });
        return;
    }
    const q = entrada === 'n360' ? '' : `?modulo=${entrada}`;
    await carregar(c, a, entrada, proj, `${proj.id}|${entrada}`, () => api('GET', `/api/v1/projects/${encodeURIComponent(proj.id)}/painel${q}`),
        (dados) => (dados && dados.modulos ? desenhar(c, a, entrada, proj, dados)
            : (c.innerHTML = renderErrorState('Não foi possível montar o painel.'))));
}

/**
 * Botão de um item: a tela do destino (lista fechada), com a aba quando há e a lista já filtrada pela situação do item
 * (filtro-painel.js; chave desconhecida não filtra). "Indicar o encarregado" abre o modal ali mesmo; as ações vencidas das
 * atividades abrem a faixa "vencidas" das ações por prazo, que é a lista delas.
 */
window.painelAbrir = function (tela, aba, filtro) {
    if (!TELAS_DO_PAINEL.has(tela)) return;
    const proj = S.activeProject;
    if (tela === 'encarregado' && proj && typeof window.abrirIndicarEncarregado === 'function' && window.podeIndicarEncarregado && window.podeIndicarEncarregado()) {
        window.abrirIndicarEncarregado(proj.id);
        return;
    }
    // As faixas são as do painel do n.privacy desenhado agora (encarregado.js as guarda); em outra entrada, a tela das atividades.
    if (filtro === 'acoes_vencidas' && proj && S.view === 'encarregado' && typeof window.abrirFaixaPrazo === 'function' && window.abrirFaixaPrazo(proj.id, 'vencidas')) return;
    if (aba === 'pedidos' || aba === 'incidentes' || aba === 'consentimentos') S.titularAba = aba;
    const filtroPainel = filtro ? filtroValido(tela, aba, filtro) : null;
    if (typeof window.navigate === 'function') { if (filtroPainel) window.navigate(tela, { filtroPainel }); else window.navigate(tela); }
};

// Exportar (F4): as listas CSV do n.privacy que a exportação já entrega, num lugar só.
const EXPORTACOES = [
    ['atividades', 'Atividades de tratamento'], ['ripd', 'RIPD'], ['lia', 'LIA'], ['riscos-atividade', 'Riscos das atividades'], ['acoes-atividade', 'Ações das atividades'],
];
window.painelExportar = function (projectId) {
    openModal(`<div class="modal-header"><span class="modal-title">Exportar (CSV)</span></div>
        <p class="pn-meta">Cada arquivo traz a lista inteira do projeto, como está agora.</p>
        <ul class="pn-export">${EXPORTACOES.map(([tipo, rotulo]) => `<li><span>${e(rotulo)}</span><button type="button" class="btn btn-sm" data-action="painelBaixar" data-args='${args(projectId, tipo)}' aria-label="Baixar ${e(rotulo)} em CSV">Baixar</button></li>`).join('')}</ul>`);
};
window.painelBaixar = function (projectId, tipo) {
    const p = encodeURIComponent(projectId);
    const caminho = {
        atividades: `/api/v1/projects/${p}/export/atividades`, ripd: `/api/v1/projects/${p}/export/ripd`, lia: `/api/v1/projects/${p}/export/lia`,
        'riscos-atividade': `/api/v1/projects/${p}/export/riscos-atividade`, 'acoes-atividade': `/api/v1/projects/${p}/export/acoes-atividade`,
    }[tipo];
    if (!caminho) return undefined;
    return baixarArquivo(caminho).catch((err) => showToast((err && err.message) || 'Não foi possível baixar o arquivo', 'error'));
};

/** "Abrir o n.x" da linha do módulo: só os módulos conhecidos viram endereço (data-args é atributo do DOM). */
window.abrirModulo = function abrirModulo(m) {
    if (MODULOS.includes(m)) irPara(enderecoDoProduto(m));
};

window.renderPainel = renderPainel;
/** Início do n.360. */
window.renderInicio = (c, h, a) => renderPainel(c, h, a, 'n360');
