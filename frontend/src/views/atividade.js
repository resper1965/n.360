import { S } from '../state.js';
import { api } from '../api.js';
import { showToast, escapeHTML, renderEmptyState } from '../ui.js';
import { navigate } from '../router.js';
import { rotuloBase } from '../bases-legais.js';
import { textoRecomendacao } from '../recomendacao-ripd.js';
import { podeEntrevistar } from './ropa-entrevista.js';
import { blocoRiscos, blocoAcoes, formularioLia, podeEditar, ORIGEM_MUDOU } from './tratamento-ligacoes.js';

// A atividade de tratamento como um fluxo (n.privacy, onda 2 do diagnóstico de 15/10/2026): uma página por atividade, com as cinco
// etapas à vista (dados, teste de impacto, RIPD ou LIA, riscos e ações, aprovação), o estado escrito de cada uma e o próximo passo
// como a ÚNICA ação primária. É página e não painel lateral: o app tem um modal só (openModal troca o conteúdo), e daqui se abrem
// o pedido de aprovação, o RIPD e as ligações, que são modais. Os formulários são os de sempre (tratamento-ligacoes.js); toda regra
// é do servidor e todo texto dele é escapado.

const args = (...v) => escapeHTML(JSON.stringify(v));
const lista = (r) => (Array.isArray(r) ? r : []);
const dataBr = (d) => (d ? `${String(d).slice(8, 10)}/${String(d).slice(5, 7)}/${String(d).slice(0, 4)}` : '');
const podePedir = () => typeof window.podePedirAprovacao === 'function' && window.podePedirAprovacao(S.user);
// No n.privacy quem aprova é o encarregado e a direção (o papel `ciso` do pedido vem do cargo: CISO ou DPO).
const PAPEL = { ciso: 'Encarregado (DPO)', ceo: 'Direção' };
export const ESTADOS = { feito: 'Feito', pendente: 'Pendente', na: 'Não se aplica', mudou: 'Mudou depois da aprovação', aguardando: 'Aguardando decisão' };
const RESPOSTAS = [['sim', 'Sim'], ['nao', 'Não'], ['nao_sei', 'Não sei agora']];
const ROTULO_RESPOSTA = Object.fromEntries(RESPOSTAS);

const quemAprovou = (ap) => ['ciso', 'ceo'].filter((k) => ap && ap[k]).map((k) => `${PAPEL[k]}: ${ap[k].por}, em ${dataBr(ap[k].em)}`).join('; ');

/**
 * As cinco etapas e o estado de cada uma, a partir do que o servidor devolveu. Pura: a tela e o teste leem a mesma conta.
 * `d` = { registro, lig, impacto, ciclo, lia, riscos, acoes }.
 */
export function etapasDaAtividade(d) {
    const r = d.registro || {};
    const lig = d.lig || {};
    const imp = d.impacto;
    const perguntas = lista(imp && imp.perguntas);

    // 1. Dados: o que o RoPA exige e o ciclo de vida, que só existe depois do primeiro salvamento.
    const faltas = [];
    if (!String(r.data_subjects || '').trim()) faltas.push('titulares');
    if (!String(r.data_categories || '').trim()) faltas.push('tipos de dado');
    if (!String(r.legal_basis || r.base_legal_id || '').trim()) faltas.push('base legal');
    const ciclo = lista(d.ciclo);
    const cicloFeito = ciclo.filter((e) => e.situacao).length;
    if (ciclo.length && !cicloFeito) faltas.push('ciclo de vida');
    const dados = { n: 1, id: 'dados', nome: 'Dados da atividade', estado: faltas.length ? 'pendente' : 'feito',
        resumo: faltas.length ? `Falta: ${faltas.join(', ')}.` : 'Inventário completo.' };

    // 2. Teste de impacto: feito quando uma pessoa finaliza.
    const respondidas = perguntas.filter((p) => p.resposta).length;
    const impacto = { n: 2, id: 'impacto', nome: 'Teste de impacto', estado: !imp ? 'pendente' : imp.finalizado_em ? 'feito' : 'pendente',
        resumo: !imp ? 'Não foi possível ler o teste.' : imp.finalizado_em ? `Finalizado em ${dataBr(imp.finalizado_em)}.` : `${respondidas} de ${perguntas.length} respondidas.` };

    // 3. RIPD (recomendado pelo teste, exigido na atividade ou já criado) e LIA (base em legítimo interesse).
    const resultado = imp && imp.recomendacao ? imp.recomendacao.resultado : 'incompleto';
    const dpias = lista(lig.dpias);
    const precisaRipd = !!r.dpia_required || resultado === 'recomendado' || dpias.length > 0;
    const precisaLia = !!(lig.lia && lig.lia.exigida) || !!d.lia;
    const partes = [];
    if (precisaRipd) partes.push(dpias.some((x) => x.status === 'Approved') ? 'feito' : 'pendente');
    if (precisaLia) partes.push(d.lia && d.lia.status === 'concluida' ? 'feito' : 'pendente');
    const nome3 = precisaRipd && precisaLia ? 'RIPD e LIA' : precisaRipd ? 'RIPD' : precisaLia ? 'LIA' : 'RIPD ou LIA';
    let estado3, resumo3, aguardaImpacto = false;
    if (partes.length) {
        estado3 = partes.every((x) => x === 'feito') ? 'feito' : 'pendente';
        resumo3 = [precisaRipd && (dpias.length ? `RIPD: ${dpias.some((x) => x.status === 'Approved') ? 'aprovado' : 'em elaboração'}` : 'RIPD ainda não criado'),
            precisaLia && `LIA: ${!d.lia ? 'ainda não feita' : d.lia.status === 'concluida' ? 'concluída' : 'em rascunho'}`].filter(Boolean).join('; ') + '.';
    } else if (resultado === 'incompleto') {
        estado3 = 'pendente'; resumo3 = 'Depende do teste de impacto.'; aguardaImpacto = true;
    } else { estado3 = 'na'; resumo3 = 'O teste de impacto não recomenda o RIPD e a base não é legítimo interesse.'; }
    const avaliacoes = { n: 3, id: 'avaliacoes', nome: nome3, estado: estado3, resumo: resumo3, aguardaImpacto };

    // 4. Riscos e ações: feito com ao menos um risco registrado.
    const riscos = lista(d.riscos);
    const abertas = lista(d.acoes).filter((a) => a.status !== 'Closed').length;
    const risco = { n: 4, id: 'riscos', nome: 'Riscos e ações', estado: riscos.length ? 'feito' : 'pendente',
        resumo: riscos.length ? `${riscos.length} ${riscos.length === 1 ? 'risco' : 'riscos'}, ${abertas} ${abertas === 1 ? 'ação aberta' : 'ações abertas'}.` : 'Nenhum risco registrado.' };

    // 5. Aprovação: o pedido de aprovação (conteúdo congelado). A assinatura direta antiga continua valendo onde existe.
    const ap = lig.aprovacao || {};
    const direta = r.ciso_approved_by || r.ceo_approved_by;
    let estado5, resumo5;
    if (ap.ciso || ap.ceo) { estado5 = 'feito'; resumo5 = `Aprovada. ${quemAprovou(ap)}.`; }
    else if (lig.aprovacao_anterior) { estado5 = 'mudou'; resumo5 = `Aprovada por ${lig.aprovacao_anterior.por} em ${dataBr(lig.aprovacao_anterior.em)}, mas a atividade mudou depois. Peça de novo.`; }
    else if (lig.pedidos_abertos) { estado5 = 'aguardando'; resumo5 = 'Pedido enviado, aguardando a decisão.'; }
    else if (direta) { estado5 = 'feito'; resumo5 = 'Aprovada pela assinatura direta, anterior ao pedido de aprovação.'; }
    else { estado5 = 'pendente'; resumo5 = 'Ainda não pedida.'; }
    const aprovacao = { n: 5, id: 'aprovacao', nome: 'Aprovação', estado: estado5, resumo: resumo5 };

    return [dados, impacto, avaliacoes, risco, aprovacao];
}

/** A primeira etapa que pede trabalho (pendente ou mudou), ou null quando está tudo feito, à espera ou fora do caso. */
export const etapaDoProximoPasso = (etapas) => etapas.find((e) => e.estado === 'pendente' || e.estado === 'mudou') || null;

/** O botão do próximo passo, para o papel de quem vê. null: a etapa não é dele (ou não tem ação daqui). */
function acaoDoPasso(e, d, pid, rid) {
    const dpias = lista(d.lig && d.lig.dpias);
    if (e.id === 'dados') return podeEntrevistar() ? { rotulo: 'Continuar a entrevista', action: 'abrirRopaEntrevista', args: [pid, rid] } : null;
    if (e.id === 'impacto') {
        if (!podeEntrevistar() || !d.impacto) return null;
        // O foco vai à primeira pergunta ainda sem resposta gravada.
        const q = d.impacto.perguntas.find((x) => !x.resposta) || d.impacto.perguntas[0];
        return { rotulo: 'Responder o teste de impacto', action: 'atIrPara', args: ['at-e2', q ? `at-imp-${q.id}-${q.resposta || q.da_atividade || 'sim'}` : ''] };
    }
    if (e.id === 'avaliacoes') {
        if (e.aguardaImpacto) return null;
        if (d.lig.lia && d.lig.lia.exigida && !(d.lia && d.lia.status === 'concluida') && podeEditar()) return { rotulo: 'Fazer a LIA', action: 'atIrPara', args: ['at-e3', 'tl-lia-fin'] };
        if (!dpias.length && podeEditar()) return { rotulo: 'Criar o RIPD a partir da atividade', action: 'criarDpiaDoTratamento', args: [pid, rid] };
        const aberto = dpias.find((x) => x.status !== 'Approved');
        return aberto ? { rotulo: 'Abrir o RIPD', action: 'atAbrirRipd', args: [pid, aberto.id] } : null;
    }
    if (e.id === 'riscos') return podeEditar() ? { rotulo: 'Registrar um risco', action: 'atIrPara', args: ['at-e4', 'tl-rk-ameaca'] } : null;
    if (e.id === 'aprovacao') return podePedir() ? { rotulo: e.estado === 'mudou' ? 'Pedir a aprovação de novo' : 'Pedir aprovação', action: 'pedirAprovacaoTratamento', args: [pid, rid] } : null;
    return null;
}

function desenharTrilha(etapas, proxima) {
    return `<nav aria-label="Etapas da atividade"><ol class="at-trilha" id="at-trilha">${etapas.map((e) => `<li class="at-etapa" data-estado="${e.estado}"${proxima === e ? ' aria-current="step"' : ''}>
        <button type="button" class="at-etapa-link" data-action="atIrPara" data-args='${args(`at-e${e.n}`)}'>
            <span class="at-etapa-n" aria-hidden="true">${e.n}</span>
            <span class="at-etapa-texto"><span class="at-etapa-nome">${escapeHTML(e.nome)}</span><span class="at-etapa-estado">${escapeHTML(ESTADOS[e.estado])}${proxima === e ? ', próximo passo' : ''}</span></span>
        </button></li>`).join('')}</ol></nav>`;
}

function desenharProximo(etapas, proxima, d, pid, rid) {
    if (!proxima) {
        const espera = etapas.find((e) => e.estado === 'aguardando');
        return `<section class="at-proximo" aria-labelledby="at-proximo-t"><h2 class="at-proximo-titulo" id="at-proximo-t">${espera ? 'Aguardando a decisão de quem aprova' : 'Atividade completa'}</h2>
            <p class="at-nota">${espera ? 'O pedido de aprovação está com os destinatários, em Meus pedidos.' : 'Todas as etapas estão feitas ou não se aplicam. Se algo mudar, a etapa volta a pedir trabalho.'}</p></section>`;
    }
    const a = acaoDoPasso(proxima, d, pid, rid);
    return `<section class="at-proximo" aria-labelledby="at-proximo-t">
        <h2 class="at-proximo-titulo" id="at-proximo-t">Próximo passo, etapa ${proxima.n}: ${escapeHTML(proxima.nome)}</h2>
        <p class="at-nota">${escapeHTML(proxima.resumo)}</p>
        ${a ? `<button type="button" class="btn btn-primary" id="at-proximo-acao" data-action="${a.action}" data-args='${args(...a.args)}'>${escapeHTML(a.rotulo)}</button>`
            : '<p class="at-nota">Esta etapa é da equipe da consultoria.</p>'}
    </section>`;
}

const secao = (e, corpo) => `<section class="at-secao" id="at-e${e.n}" aria-labelledby="at-e${e.n}-t">
    <div class="at-secao-cabeca"><h2 class="at-secao-titulo" id="at-e${e.n}-t" tabindex="-1">${e.n}. ${escapeHTML(e.nome)}</h2>
        <span class="at-selo" data-estado="${e.estado}">${escapeHTML(ESTADOS[e.estado])}</span></div>
    <p class="at-nota">${escapeHTML(e.resumo)}</p>${corpo}</section>`;

const linha = (rotulo, valor) => `<dt>${escapeHTML(rotulo)}</dt><dd>${valor ? escapeHTML(valor) : '<span class="at-vazio">Sem resposta</span>'}</dd>`;
const simNao = (v) => (v ? 'Sim' : 'Não');

function corpoDados(d, pid, rid) {
    const r = d.registro;
    const lig = d.lig;
    const ciclo = lista(d.ciclo);
    return `<dl class="at-dados">
        ${linha('Responsável', r.owner_parte_nome || r.owner)}
        ${linha('Titulares', r.data_subjects)}
        ${linha('Tipos de dado', r.data_categories)}
        ${linha('Dados sensíveis', simNao(r.dados_sensiveis))}
        ${linha('Crianças ou adolescentes', simNao(r.criancas_adolescentes))}
        ${linha('Base legal', rotuloBase(r.legal_basis) || (lig.base_legal && lig.base_legal.titulo))}
        ${linha('Retenção', r.retention_period)}
        ${linha('Compartilha com', r.recipients)}
        ${linha('Transferência internacional', lista(lig.transferencias).length ? lig.transferencias.map((t) => t.pais).join(', ') : simNao(r.international_transfers))}
        ${linha('Sistemas e arquivos', lista(lig.itens).map((i) => i.nome).join(', '))}
        ${linha('Áreas', lista(lig.departamentos).map((x) => x.nome).join(', '))}
        ${linha('Ciclo de vida', ciclo.length ? `${ciclo.filter((e) => e.situacao).length} de ${ciclo.length} etapas registradas` : '')}
    </dl>
    ${lista(lig.terceiros_com_avaliacao_vencida).length ? `<p class="re-aviso" id="at-vencidos">Terceiro com avaliação vencida: ${lig.terceiros_com_avaliacao_vencida.map((x) => escapeHTML(x.nome)).join(', ')}. Renove na tela Terceiros.</p>` : ''}
    <div class="at-acoes">
        ${podeEntrevistar() ? `<button type="button" class="btn btn-sm" data-action="abrirRopaEntrevista" data-args='${args(pid, rid)}'>Revisar na entrevista</button>` : ''}
        <button type="button" class="btn btn-sm" data-action="openLigacoesTratamento" data-args='${args(pid, rid)}'>${podeEditar() ? 'Editar ligações' : 'Ver ligações'}</button>
    </div>`;
}

/** O teste de impacto inteiro: a resposta gravada, ou a proposta que a atividade já garante (marcada até a pessoa salvar). */
function corpoImpacto(d) {
    const imp = d.impacto;
    if (!imp) return '<p class="at-nota">Tente recarregar a página.</p>';
    const pode = podeEntrevistar();
    const pergunta = (q) => {
        const marcada = q.resposta || q.da_atividade || '';
        const proposta = !q.resposta && q.da_atividade;
        const diverge = q.resposta && q.da_atividade && q.resposta !== q.da_atividade;
        const idq = `at-imp-${escapeHTML(q.id)}`;
        return `<fieldset class="at-pergunta" role="radiogroup" aria-labelledby="${idq}-t">
            <p class="at-pergunta-texto" id="${idq}-t">${escapeHTML(q.texto)}</p>
            ${proposta ? '<p class="re-selo at-origem">Vindo da atividade: confira</p>' : ''}
            ${diverge ? `<p class="at-nota">A atividade registra ${escapeHTML(ROTULO_RESPOSTA[q.da_atividade])}. Confira a resposta.</p>` : ''}
            <div class="at-opcoes">${RESPOSTAS.map(([v, rot]) => `<label class="re-opcao" for="${idq}-${v}">
                <input type="radio" id="${idq}-${v}" name="at-imp-${escapeHTML(q.id)}" value="${v}" data-pergunta="${escapeHTML(q.id)}" ${marcada === v ? 'checked' : ''} ${pode && !imp.finalizado_em ? '' : 'disabled'}>
                <span class="re-opcao-texto">${rot}</span></label>`).join('')}</div></fieldset>`;
    };
    const grupo = (g, titulo) => `<fieldset class="at-grupo"><legend class="at-grupo-titulo">${titulo}</legend>${imp.perguntas.filter((q) => q.grupo === g).map(pergunta).join('')}</fieldset>`;
    const botoes = !pode ? '' : imp.finalizado_em
        ? `<button type="button" class="btn btn-sm" data-action="atFinalizarImpacto" data-args='${args(false)}'>Reabrir o teste</button>`
        : `<button type="submit" class="btn btn-sm">Salvar respostas</button>
           <button type="button" class="btn btn-sm" data-action="atFinalizarImpacto" data-args='${args(true)}'>Salvar e finalizar</button>`;
    return `<p class="at-recomendacao" id="at-recomendacao">${escapeHTML(textoRecomendacao(imp))}</p>
        <p class="at-nota">Com ao menos um critério geral e um específico marcados "Sim", o sistema recomenda o RIPD. A decisão de exigir o RIPD continua de uma pessoa.</p>
        <form id="at-impacto" class="at-impacto" data-action-submit="atSalvarImpacto" data-prevent novalidate>
            ${grupo('geral', 'Critérios gerais')}${grupo('especifico', 'Critérios específicos')}
            <p class="re-erro" id="at-impacto-erro" aria-live="polite"></p>
            <div class="at-acoes">${botoes}</div>
        </form>`;
}

function corpoAvaliacoes(d, pid, rid) {
    const lig = d.lig;
    const dpias = lista(lig.dpias);
    const editar = podeEditar();
    const ripd = dpias.length
        ? `<ul class="at-lista">${dpias.map((x) => `<li>${escapeHTML(x.nome || 'RIPD sem nome')}: ${escapeHTML(window.traduzStatus ? window.traduzStatus(x.status || 'Draft') : x.status)}${x.origem_mudou ? ` <span class="tl-origem">${ORIGEM_MUDOU}</span>` : ''}
            <button type="button" class="btn btn-sm" data-action="atAbrirRipd" data-args='${args(pid, x.id)}'>Abrir o RIPD</button></li>`).join('')}</ul>
           <p class="at-nota">A aprovação do RIPD é pedida no próprio RIPD, com o conteúdo dele congelado.</p>`
        : `<p class="at-nota">RIPD: ${d.registro.dpia_required ? 'a atividade exige e ele ainda não foi criado.' : 'nenhum criado.'}</p>
           ${editar ? `<button type="button" class="btn btn-sm" data-action="criarDpiaDoTratamento" data-args='${args(pid, rid)}'>Criar o RIPD a partir da atividade</button>` : ''}`;
    const liaTexto = lig.lia && lig.lia.exigida ? 'A base é legítimo interesse: a LIA é exigida.' : 'A base não é legítimo interesse: a LIA não é exigida.';
    const lia = lig.lia && (lig.lia.exigida || d.lia)
        ? `<h3 class="at-sub">LIA (teste de legítimo interesse)</h3><p class="at-nota">${liaTexto}${lig.lia.origem_mudou ? ` <span class="tl-origem">${ORIGEM_MUDOU}</span>` : ''}</p>
           ${editar ? formularioLia(d.lia, pid, rid, false) : (d.lia ? `<p class="at-nota">${escapeHTML(d.lia.finalidade_legitima || '')}</p>` : '')}
           ${d.lia ? `<button type="button" class="btn btn-ghost btn-sm" data-action="baixarWordLia" data-args='${args(pid, rid)}'>Baixar a LIA em Word</button>` : ''}`
        : '';
    return `<h3 class="at-sub">RIPD</h3>${ripd}${lia}`;
}

function corpoRiscos(d, pid, rid) {
    const editar = podeEditar();
    return `<h3 class="at-sub">Riscos</h3>${blocoRiscos(pid, rid, d.riscos, lista(d.lig.itens), d.partes, editar, d.registro.owner_parte_id || '', false)}
        <h3 class="at-sub">Ações</h3>${blocoAcoes(pid, rid, d.acoes, d.riscos, d.partes, editar, d.registro.owner_parte_id || '', false)}`;
}

function corpoAprovacao(e, d, pid, rid) {
    const r = d.registro;
    const lig = d.lig;
    const direta = ['ciso', 'ceo'].filter((k) => r[`${k}_approved_by`]).map((k) => `${PAPEL[k]}: ${r[`${k}_approved_by`]}, em ${dataBr(r[`${k}_approved_at`])}`);
    const pedir = podePedir() && e.estado !== 'feito' && e.estado !== 'aguardando'
        ? `<button type="button" class="btn btn-sm" data-action="pedirAprovacaoTratamento" data-args='${args(pid, rid)}'>${e.estado === 'mudou' ? 'Pedir a aprovação de novo' : 'Pedir aprovação'}</button>` : '';
    return `<p class="at-nota">A aprovação é por pedido: o conteúdo da atividade e das ligações fica congelado no pedido, e qualquer mudança depois tira a validade sem apagar a prova.</p>
        ${lig.aprovacao && (lig.aprovacao.ciso || lig.aprovacao.ceo) ? `<p id="at-aprovada">${escapeHTML(quemAprovou(lig.aprovacao))}.</p>` : ''}
        ${direta.length ? `<p class="at-nota" id="at-direta">Assinatura direta, anterior ao pedido de aprovação: ${escapeHTML(direta.join('; '))}.</p>` : ''}
        <div class="at-acoes">${pedir}</div>`;
}

let sequencia = 0;

async function renderAtividade(c, h, a) {
    const pedido = S.atividade;
    a.innerHTML = '<button type="button" class="btn" data-action="atVoltar">Voltar aos tratamentos</button>';
    if (!pedido) {
        h.textContent = 'Atividade';
        c.innerHTML = renderEmptyState({ titulo: 'Nenhuma atividade aberta', texto: 'Abra uma atividade pela lista de tratamentos.',
            acao: '<button class="btn btn-primary" data-action="atVoltar">Abrir os tratamentos</button>' });
        return;
    }
    const { projectId: pid, ropaId: rid } = pedido;
    const minha = ++sequencia;
    const viva = () => minha === sequencia && S.view === 'ropa-atividade';
    if (!c.querySelector('.at')) c.innerHTML = '<p class="at-nota" aria-live="polite">Carregando a atividade...</p>';
    let registros, lig;
    try {
        registros = await api('GET', `/api/v1/projects/${pid}/ropa`);
        lig = await api('GET', `/api/v1/projects/${pid}/ropa/${rid}/ligacoes`);
    } catch (e) { if (viva()) window.falhaDeCarga(c, a, 'Não foi possível carregar a atividade.', e); return; }
    S.ropa = lista(registros);
    const registro = S.ropa.find((x) => x.id === rid);
    if (!viva()) return;
    if (!registro) {
        h.textContent = 'Atividade';
        c.innerHTML = renderEmptyState({ titulo: 'Atividade não encontrada', texto: 'Ela pode ter sido excluída.', acao: '<button class="btn btn-primary" data-action="atVoltar">Abrir os tratamentos</button>' });
        return;
    }
    const opcional = async (fazer, padrao) => { try { return await fazer(); } catch (e) { return padrao; } };
    const impacto = await opcional(() => api('GET', `/api/v1/projects/${pid}/ropa/${rid}/impacto`), null);
    const ciclo = lista((await opcional(() => api('GET', `/api/v1/projects/${pid}/ropa/${rid}/ciclo`), {}))?.etapas);
    const lia = (await opcional(() => api('GET', `/api/v1/projects/${pid}/ropa/${rid}/lia`), {}))?.lia || null;
    const riscos = lista((await opcional(() => api('GET', `/api/v1/projects/${pid}/ropa/${rid}/riscos`), {}))?.riscos);
    const acoes = lista((await opcional(() => api('GET', `/api/v1/projects/${pid}/ropa/${rid}/acoes`), {}))?.acoes);
    const partes = podeEditar() ? lista(await opcional(() => api('GET', `/api/v1/projects/${pid}/partes`), [])).filter((p) => p.status !== 'inativa') : [];
    if (!viva()) return;
    // Os formulários de risco e ação editam a partir daqui (tratamento-ligacoes.js).
    S.riscosAtividade = riscos;
    S.acoesAtividade = acoes;
    const d = { registro, lig, impacto: impacto && Array.isArray(impacto.perguntas) ? impacto : null, ciclo, lia, riscos, acoes, partes };
    const etapas = etapasDaAtividade(d);
    const proxima = etapaDoProximoPasso(etapas);
    h.textContent = `Atividade: ${registro.processing_purpose || ''}`;
    const [e1, e2, e3, e4, e5] = etapas;
    c.innerHTML = `<div class="at">
        ${desenharTrilha(etapas, proxima)}
        ${desenharProximo(etapas, proxima, d, pid, rid)}
        ${secao(e1, corpoDados(d, pid, rid))}
        ${secao(e2, corpoImpacto(d))}
        ${secao(e3, corpoAvaliacoes(d, pid, rid))}
        ${secao(e4, corpoRiscos(d, pid, rid))}
        ${secao(e5, corpoAprovacao(e5, d, pid, rid))}
    </div>`;
    S.atividadeDados = d;
}

window.abrirAtividade = function (projectId, ropaId) {
    if (typeof window.forceCloseModal === 'function') window.forceCloseModal();
    S.atividade = { projectId, ropaId };
    navigate('ropa-atividade');
};
window.atVoltar = function () { S.atividade = null; navigate('ropa'); };

/** Leva à etapa (e ao campo, quando há um) sem recarregar nada. */
window.atIrPara = function (secaoId, campoId) {
    const s = document.getElementById(secaoId);
    if (!s) return;
    if (typeof s.scrollIntoView === 'function') s.scrollIntoView({ block: 'start' });
    const alvo = (campoId && document.getElementById(campoId)) || s.querySelector('.at-secao-titulo');
    if (alvo && typeof alvo.focus === 'function') alvo.focus();
};

/** As respostas marcadas no formulário que diferem do que está gravado (inclui a proposta da atividade, que vira resposta ao salvar). */
function respostasMarcadas() {
    const imp = S.atividadeDados && S.atividadeDados.impacto;
    if (!imp) return {};
    const gravada = Object.fromEntries(imp.perguntas.map((q) => [q.id, q.resposta]));
    const out = {};
    document.querySelectorAll('#at-impacto input[type="radio"]:checked').forEach((i) => {
        const id = i.getAttribute('data-pergunta');
        if (id && i.value !== gravada[id]) out[id] = i.value;
    });
    return out;
}

async function gravarImpacto(corpo, sucesso) {
    const { projectId: pid, ropaId: rid } = S.atividade || {};
    if (!pid) return;
    try { await api('PUT', `/api/v1/projects/${pid}/ropa/${rid}/impacto`, corpo); }
    catch (e) { const n = document.getElementById('at-impacto-erro'); if (n) n.textContent = `Não foi possível gravar o teste de impacto: ${e.message}`; return; }
    showToast(sucesso, 'success');
    window.render();
}
window.atSalvarImpacto = () => gravarImpacto({ respostas: respostasMarcadas() }, 'Teste de impacto salvo.');
// Finalizar e reabrir são atos humanos (o servidor recusa ao agente). Vai junto o que a pessoa marcou e ainda não salvou.
window.atFinalizarImpacto = (finalizar) => gravarImpacto({ respostas: finalizar ? respostasMarcadas() : {}, finalizar }, finalizar ? 'Teste de impacto finalizado.' : 'Teste de impacto reaberto.');

/** O RIPD abre no detalhe dele (onde fica o pedido de aprovação do RIPD), com a lista carregada. */
window.atAbrirRipd = async function (projectId, id) {
    try { S.dpia = lista(await api('GET', `/api/v1/projects/${projectId}/dpia`)); }
    catch (e) { showToast(`Não foi possível abrir o RIPD: ${e.message}`, 'error'); return; }
    window.openDPIADetailsModal(id);
};

export { renderAtividade };
window.renderAtividade = renderAtividade;
