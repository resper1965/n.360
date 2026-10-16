import { escapeHTML, formatarData } from '../ui.js';
import { posicaoNaFase } from './estado.js';

const TETO = { texto: 300, texto_longo: 4000 };
const arg = (...a) => escapeHTML(JSON.stringify(a));
const rotuloAvaliacao = (status) => (window.seloDaAvaliacao ? window.seloDaAvaliacao(status).rotulo : '');

function controle(campo, v) {
    const id = `campo-${campo.id}`;
    const valor = v ? v.valor : '';
    const desc = `aria-describedby="${id}-exemplo"`;
    const evento = `data-args='${arg(campo.id)}'`;
    if (campo.tipo === 'escolha') {
        const ops = campo.opcoes.map((o) => `<option value="${escapeHTML(o)}"${o === valor ? ' selected' : ''}>${escapeHTML(o)}</option>`).join('');
        return `<select id="${id}" name="${campo.id}" class="form-select" ${desc} data-action-change="bancadaDigitou" ${evento} data-arg-val><option value="">Selecione</option>${ops}</select>`;
    }
    if (campo.tipo === 'multipla') {
        const marcados = valor ? valor.split('||') : [];
        const itens = campo.opcoes.map((o) => `<label class="opcao-check"><input type="checkbox" name="${campo.id}" value="${escapeHTML(o)}"${marcados.includes(o) ? ' checked' : ''} data-action-change="bancadaMarcou" ${evento}> ${escapeHTML(o)}</label>`).join('');
        return `<fieldset id="${id}" class="bancada-grupo" ${desc}><legend class="rotulo-campo">${escapeHTML(campo.rotulo)} <span class="bancada-nota">(${campo.obrigatorio ? 'obrigatório' : 'opcional'})</span></legend>${itens}</fieldset>`;
    }
    if (campo.tipo === 'data') {
        return `<input type="date" id="${id}" name="${campo.id}" class="form-input" value="${escapeHTML(valor)}" ${desc} data-action-change="bancadaDigitou" ${evento} data-arg-val>`;
    }
    const linhas = campo.tipo === 'texto_longo' ? 8 : 3;
    return `<textarea id="${id}" name="${campo.id}" class="form-input${campo.tipo === 'texto' ? ' curto' : ''}" rows="${linhas}" maxlength="${TETO[campo.tipo]}" placeholder="${escapeHTML(campo.exemplo ? `Ex.: ${campo.exemplo}` : '')}" ${desc} data-action-input="bancadaDigitou" ${evento} data-arg-val>${escapeHTML(valor)}</textarea>`;
}

function blocoDoCampo(campo, v) {
    const id = `campo-${campo.id}`;
    const rotulo = campo.tipo === 'multipla' ? ''
        : `<label for="${id}" class="rotulo-campo">${escapeHTML(campo.rotulo)} <span class="bancada-nota">(${campo.obrigatorio ? 'obrigatório' : 'opcional'})</span></label>`;
    return `<div class="bancada-campo" data-campo="${campo.id}">${rotulo}${controle(campo, v)}
        <span class="sr-only" id="${id}-exemplo">${campo.exemplo ? `Exemplo: ${escapeHTML(campo.exemplo)}. ` : ''}${campo.ajuda ? escapeHTML(campo.ajuda) : ''}</span>
        ${campo.ajuda ? `<p class="bancada-nota">${escapeHTML(campo.ajuda)}</p>` : ''}
        ${v && v.herdado ? '<p class="bancada-nota">Veio do preenchimento anterior; fica salvo no primeiro ajuste.</p>' : ''}
        ${v && v.por ? `<p class="bancada-nota">Última alteração de ${escapeHTML(v.por)} em ${escapeHTML(formatarData(v.atualizado_em, { hora: true }))}</p>` : ''}</div>`;
}

export const htmlDosCriterios = (avaliacao) => avaliacao.criterios.map((c) =>
    `<li class="${c.ok ? 'ok' : 'falta'}"><span class="bancada-selo">${c.ok ? 'Feito' : 'Falta'}</span>${escapeHTML(c.rotulo)}${!c.ok && c.detalhe ? ` <span class="bancada-nota">(${escapeHTML(c.detalhe)})</span>` : ''}</li>`).join('');

/** O cartão do passo (coluna do meio). Puro: tudo o que decide o que aparece entra por parâmetro. */
export function htmlDoCartao({ ind, passo, detalhe, equipe, podeAdmin, ultimo, opcoesResponsavel, salvo }) {
    const fase = ind.fase(passo.fase);
    const pos = posicaoNaFase(ind, passo.id);
    const estado = detalhe.passo.estado;
    const bloqueado = estado === 'bloqueado';
    const concluido = estado === 'concluido';
    const aviso = bloqueado
        ? `<p class="bancada-aviso" role="status">Bloqueado por ${escapeHTML(detalhe.bloqueio.responsavel)}: ${escapeHTML(detalhe.bloqueio.motivo)}</p>`
        : concluido
            ? `<p class="bancada-aviso" role="status">${detalhe.excecao ? (detalhe.excecao.motivo ? `Concluído com justificativa registrada: ${escapeHTML(detalhe.excecao.motivo)}` : 'Concluído com justificativa registrada') : 'Passo concluído'}</p>${!detalhe.avaliacao.ok && !detalhe.excecao ? '<p class="bancada-aviso" role="status">Desde a conclusão, algo mudou: confira o "Concluído quando".</p>' : ''}`
            : '';
    const prova = `<h4>Prova esperada</h4>
        <p>${escapeHTML(passo.prova.descricao)} <span class="bancada-nota">(${passo.prova.obrigatoria ? 'obrigatória' : 'opcional'})</span></p>
        ${detalhe.prova.arquivo ? `<p>Anexada: ${escapeHTML(detalhe.prova.arquivo)}${detalhe.prova.avaliacao ? ` · ${escapeHTML(rotuloAvaliacao(detalhe.prova.avaliacao))}` : ''}</p>` : '<p class="bancada-nota">Nenhum arquivo ligado a este passo.</p>'}
        <p><button type="button" class="btn" id="bancada-prova" data-action="bancadaEnviarProva">Enviar arquivo</button>
        ${passo.gera ? '<button type="button" class="btn" data-action="bancadaGerarDocumento">Gerar o documento</button>' : '<button type="button" class="btn" data-action="bancadaRegistrarProva">Registrar como prova</button>'}</p>
        <div id="bancada-rascunho"></div>`;
    const onde = passo.ondeVive.length
        ? `<h4>Onde isto vive</h4><p>${passo.ondeVive.map((o) => `<button type="button" class="bancada-link" data-action="bancadaAbrirTela" data-args='${arg(o.tela)}'>${escapeHTML(o.rotulo)}</button>`).join(' · ')}</p>` : '';
    const anotacao = detalhe.anotacao_anterior
        ? `<div class="bancada-aviso"><strong>Anotação anterior</strong> (do campo livre antigo, só leitura)<p>${escapeHTML(detalhe.anotacao_anterior)}</p>
           <button type="button" class="bancada-link" data-action="bancadaCopiarAnotacao">Copiar para o primeiro campo de texto</button> · <button type="button" class="bancada-link" data-action="bancadaDescartarAnotacao">Já usei</button></div>` : '';
    const rodape = `<div class="bancada-rodape">
        <button type="button" class="btn btn-primary" data-action="bancadaSalvarEIr">${ultimo ? 'Salvar e ver a prontidão' : 'Salvar e ir ao próximo passo'}</button>
        ${ultimo ? '' : '<button type="button" class="bancada-link" data-action="bancadaPular">Pular para o próximo sem concluir</button>'}
        ${podeAdmin && !concluido ? (bloqueado ? '<button type="button" class="bancada-link" data-action="bancadaDesbloquear">Desbloquear este passo</button>' : '<button type="button" class="bancada-link" data-action="bancadaBloquear">Bloquear este passo</button>') : ''}
        ${equipe && !concluido && !bloqueado ? '<button type="button" class="bancada-link" data-action="bancadaConcluirComExcecao">Concluir com exceção...</button>' : ''}
        ${concluido ? '<button type="button" class="bancada-link" data-action="bancadaReabrir">Reabrir este passo</button>' : ''}</div>`;
    return `<article class="bancada-cartao" aria-labelledby="bancada-h3">
        <h2>Fase ${passo.fase} · ${escapeHTML(fase ? fase.titulo : '')}</h2>
        <h3 id="bancada-h3">Passo ${pos.n} de ${pos.total} · ${escapeHTML(passo.clausula)} · ${escapeHTML(passo.titulo)}</h3>
        ${aviso}${anotacao}
        <div class="bancada-meta">
            <div><label for="bancada-responsavel" class="rotulo-campo">Responsável</label>
                <select id="bancada-responsavel" class="form-select" data-action-change="bancadaMeta" data-args='${arg('assigned_to')}' data-arg-val>${opcoesResponsavel}</select></div>
            <div><label for="bancada-prazo" class="rotulo-campo">Prazo</label>
                <input type="date" id="bancada-prazo" class="form-input" value="${escapeHTML(detalhe.prazo || '')}" data-action-change="bancadaMeta" data-args='${arg('due_date')}' data-arg-val></div>
            <p class="bancada-salvo" id="bancada-salvo" aria-live="polite">${escapeHTML(salvo)}</p>
        </div>
        <h4>O que o auditor vai pedir</h4><p>${escapeHTML(passo.porQue)}</p>
        <h4>Escreva</h4>${passo.campos.map((c) => blocoDoCampo(c, detalhe.valores[c.id])).join('')}
        ${prova}${onde}
        <h4>Concluído quando</h4><ul class="bancada-criterios" id="bancada-criterios">${htmlDosCriterios(detalhe.avaliacao)}</ul>
        <p class="bancada-nota" id="bancada-faltas" role="status"></p>
        ${rodape}</article>`;
}
