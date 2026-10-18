import { api } from '../api.js';
import { escapeHTML, confirmar, showToast, renderEmptyState } from '../ui.js';
import { url, novoAutosave, gravarAgora } from './estado.js';
import { abrirSelecao } from './modal-selecao.js';
import { listarItens, TEXTO_VAZIO, ORIGENS } from './catalogo-inline.js';
import { abrirTitularNaColeta, abrirTitularNaEtapa } from './modal-titular.js';
import { botaoRascunho, ligarRascunho } from './copiloto-etapa.js';

// Corpo de cada etapa do Tratamento de Dados (spec 2026-10-16, seção 5). Toda regra (situação, faltas, bloqueio, subconjunto de
// dados) vem do servidor (`GET .../etapas`); aqui se mostra, se escolhe e se envia. Texto grava sozinho (800 ms), caixa e escolha
// gravam na hora, cada seletor grava no próprio modal, e "Não Aplicável" bloqueia os campos da etapa.

const TEXTO_SITUACAO = { concluida: 'Concluído', nao_aplicavel: 'Não Aplicável', pendente: 'Pendente', bloqueada: 'Conclua a Coleta primeiro' };
const MAX = { descricao: 4000, descarte: 2000, prazo: 500, local: 500 };
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
const txt = (v) => escapeHTML(v == null ? '' : v);
const ativosDe = (e) => (e && e.ativos) || [];
const ids = (lista) => lista.map((x) => x.item_id);

/** Situação da etapa como texto e como nome acessível ("Coleta, concluída"). */
export function situacaoDaEtapa(e) {
    if (e.bloqueada) return { sit: 'bloqueada', texto: TEXTO_SITUACAO.bloqueada, nome: 'bloqueada' };
    if (e.nao_aplicavel || e.situacao === 'nao_aplicavel') return { sit: 'nao_aplicavel', texto: TEXTO_SITUACAO.nao_aplicavel, nome: 'não aplicável' };
    if (e.situacao === 'concluida') return { sit: 'concluida', texto: TEXTO_SITUACAO.concluida, nome: 'concluída' };
    return { sit: 'pendente', texto: TEXTO_SITUACAO.pendente, nome: 'pendente' };
}

/** Situação do titular numa etapa: pendente (sem linha), definido ou dados não usados. */
export function situacaoDoTitular(etapa, tid) {
    const linha = ((etapa && etapa.titulares) || []).find((t) => t.titular_id === tid);
    if (linha && (linha.situacao === 'nao_usa' || linha.nao_usa)) return { sit: 'nao_usa', texto: 'Dados não usados', linha };
    if (linha && linha.situacao === 'definido') return { sit: 'definido', texto: 'Definido', linha };
    return { sit: 'pendente', texto: 'Pendente', linha };
}

/** Corpo HTML de uma etapa. `ctx`: { pid, rid, editavel, ficha, porId } (porId = etapas do servidor indexadas pelo id). */
export function corpoDaEtapa(id, ctx) {
    const e = ctx.porId[id];
    const off = !ctx.editavel || e.nao_aplicavel ? ' disabled' : '';
    const coleta = ctx.porId.coleta;
    const titularesColeta = (coleta && coleta.titulares) || [];
    const painel = (titulo, sufixo, conteudo) => `<section class="et-painel" id="at-et-${id}-${sufixo}"><h4 class="et-painel-titulo">${titulo}</h4>${conteudo}</section>`;
    const acrescentar = (acao, rotulo) => `<div class="et-acoes"><button type="button" class="btn btn-sm" data-acao="${acao}"${off}>${rotulo}</button></div>`;
    const lista = (itens, vazio) => (itens.length ? `<ul class="et-lista">${itens.join('')}</ul>` : renderEmptyState({ compacto: true, titulo: vazio.titulo, texto: vazio.texto }));
    const tirar = (nome, acao, dataset) => `<span class="et-linha-acoes"><button type="button" class="btn btn-ghost btn-sm" data-acao="${acao}" data-id="${txt(dataset)}"${off} aria-label="Tirar ${txt(nome)} desta etapa">Tirar</button></span>`;
    const linhaAtivo = (a) => `<li class="et-linha"><span>${txt(a.nome)}</span>${tirar(a.nome, 'remover-ativo', a.item_id)}</li>`;
    const ativos = ativosDe(e);
    let paineis = '';

    if (id === 'coleta') {
        const linhas = titularesColeta.map((t) => `<li class="et-linha"><span><strong>${txt(t.nome)}</strong> <span class="at-nota">(${plural((t.dados || []).length, 'dado selecionado', 'dados selecionados')})</span></span>
            <span class="et-linha-acoes"><button type="button" class="btn btn-ghost btn-sm" data-acao="editar-titular" data-tid="${txt(t.titular_id)}"${off} aria-label="Editar os dados de ${txt(t.nome)}">Editar</button>
            <button type="button" class="btn btn-ghost btn-sm" data-acao="remover-titular" data-tid="${txt(t.titular_id)}"${off} aria-label="Remover ${txt(t.nome)}">Remover</button></span></li>`);
        paineis += painel('Titulares', 'titulares', `${lista(linhas, { titulo: 'Nenhum titular nesta atividade', texto: 'Titular é a pessoa cujos dados são tratados, como um colaborador ou um cliente.' })}${acrescentar('add-titular', '+ Adicionar Titulares')}`);
        paineis += painel('Ativos', 'ativos', `${lista(ativos.map(linhaAtivo), TEXTO_VAZIO.ativo)}${acrescentar('add-ativo', '+ Adicionar Ativos')}`);
    } else if (id === 'uso') {
        paineis += painel('Ativos', 'ativos', `${lista(ativos.map(linhaAtivo), TEXTO_VAZIO.ativo)}${acrescentar('add-ativo', '+ Adicionar Ativos')}`);
    } else if (id === 'compartilhamento_interno') {
        const propria = ((ctx.ficha && ctx.ficha.registro && ctx.ficha.registro.areas) || []);
        const linhas = [
            ...propria.map((a) => `<li class="et-linha es-travado" aria-disabled="true"><span>${txt(a.nome)} <span class="es-selo es-selo-neutro">já é a área da atividade</span></span></li>`),
            ...(e.areas || []).map((a) => `<li class="et-linha"><span>${txt(a.nome)}</span>${tirar(a.nome, 'remover-area', a.id)}</li>`),
        ];
        paineis += painel('Áreas', 'areas', `${lista(linhas, TEXTO_VAZIO.area)}${acrescentar('add-area', '+ Adicionar Áreas')}`);
        paineis += painel('Ativos', 'ativos', `${lista(ativos.map(linhaAtivo), TEXTO_VAZIO.ativo)}${acrescentar('add-ativo', '+ Adicionar Ativos')}`);
    } else if (id === 'compartilhamento_externo') {
        const linhas = (e.parceiros || []).map((p) => `<li class="et-linha"><span>${txt(p.nome)}</span>${tirar(p.nome, 'remover-parceiro', p.id)}</li>`);
        paineis += painel('Parceiros', 'parceiros', `${lista(linhas, TEXTO_VAZIO.parceiro)}${acrescentar('add-parceiro', '+ Adicionar Parceiros')}`);
        paineis += painel('Ativos', 'ativos', `${lista(ativos.map(linhaAtivo), TEXTO_VAZIO.ativo)}${acrescentar('add-ativo', '+ Adicionar Ativos')}`);
    } else if (id === 'armazenamento') {
        const corpoTab = ativos.map((a) => `<tr><th scope="row">${txt(a.nome)}</th>
            <td><input class="form-input" data-item="${txt(a.item_id)}" value="${txt(a.local_armazenamento)}" maxlength="${MAX.local}" aria-label="Armazenamento de ${txt(a.nome)}"${off}></td>
            <td class="et-linha-acoes"><button type="button" class="btn btn-ghost btn-sm" data-acao="remover-ativo" data-id="${txt(a.item_id)}"${off} aria-label="Tirar ${txt(a.nome)} desta etapa">Tirar</button></td></tr>`);
        const tabela = ativos.length ? `<table class="et-tabela"><caption class="sr-only">Ativos e local de armazenamento</caption>
            <thead><tr><th scope="col">Ativos</th><th scope="col">Armazenamento</th><th scope="col"><span class="sr-only">Ações</span></th></tr></thead>
            <tbody>${corpoTab.join('')}</tbody></table>`
            : renderEmptyState({ compacto: true, titulo: TEXTO_VAZIO.ativo.titulo, texto: 'Ativo é um sistema, arquivo ou base que guarda ou usa dados. Cada ativo pede o local onde os dados ficam.' });
        paineis += painel('Ativos e armazenamento', 'ativos', `${tabela}${acrescentar('add-ativo', '+ Adicionar Ativos')}`);
    } else if (id === 'eliminacao') {
        const herdados = ativosDe(ctx.porId.armazenamento);
        const tabela = herdados.length ? `<table class="et-tabela"><caption class="sr-only">Ativos herdados do Armazenamento</caption>
            <thead><tr><th scope="col">Ativos</th><th scope="col">Armazenamento</th></tr></thead>
            <tbody>${herdados.map((a) => `<tr><th scope="row">${txt(a.nome)}</th><td>${txt(a.local_armazenamento) || 'Local não informado'}</td></tr>`).join('')}</tbody></table>`
            : renderEmptyState({ compacto: true, titulo: 'Nenhum ativo para eliminar', texto: 'Os ativos desta etapa vêm da etapa Armazenamento.' });
        paineis += painel('Ativos (vêm do Armazenamento)', 'ativos', tabela);
        paineis += `<div class="et-duas">
            <div class="form-group"><label class="form-label" for="et-prazo-eliminacao">Prazo</label>
                <input class="form-input" id="et-prazo-eliminacao" data-campo="prazo" maxlength="${MAX.prazo}" value="${txt(e.prazo)}"${off}></div>
            <div class="form-group"><label class="form-label" for="et-descarte-eliminacao">Descarte</label>
                <textarea class="form-input" id="et-descarte-eliminacao" data-campo="descarte" rows="3" maxlength="${MAX.descarte}"${off}>${txt(e.descarte)}</textarea></div></div>`;
    }

    if (id !== 'coleta') {
        // Titulares só de status: a Coleta define quem são e o que cada um fornece; esta etapa só diz se ele é usado aqui.
        const linhas = titularesColeta.map((t) => {
            const s = situacaoDoTitular(e, t.titular_id);
            return `<li class="et-linha"><button type="button" class="et-titular-botao" data-acao="abrir-titular" data-tid="${txt(t.titular_id)}"${off}>${txt(t.nome)}</button>
                <span class="et-selo" data-sit="${s.sit}">${txt(s.texto)}</span></li>`;
        });
        paineis += painel('Titulares', 'titulares', linhas.length
            ? `<ul class="et-lista et-titulares-status">${linhas.join('')}</ul>`
            : renderEmptyState({ compacto: true, titulo: 'Nenhum titular definido na Coleta', texto: 'Os titulares desta atividade são definidos na etapa Coleta.' }));
    }

    const faltas = (e.faltas || []).length && !e.nao_aplicavel ? `<p class="at-ajuda">Falta preencher: ${txt(e.faltas.join(', '))}.</p>` : '';
    const migrado = id === 'coleta' && e.migrado ? '<p class="et-faixa" role="status">Migrado do cadastro anterior: confirme os dados de cada titular</p>' : '';
    const extrasColeta = id === 'coleta' ? `
        <fieldset class="et-fieldset"><legend>Origem dos Dados</legend>
            ${ORIGENS.map(([v, r]) => `<label class="es-check"><input type="checkbox" data-origem value="${v}"${(e.origem || []).includes(v) ? ' checked' : ''}${off}><span>${txt(r)}</span></label>`).join('')}
        </fieldset>
        <label class="es-check"><input type="checkbox" data-bool="solicita_consentimento"${e.solicita_consentimento ? ' checked' : ''}${off}><span>Solicita consentimento?</span></label>
        <label class="es-check"><input type="checkbox" data-bool="criancas_adolescentes"${e.criancas_adolescentes ? ' checked' : ''}${off}><span>Há tratamento de Dados Pessoais de Crianças e/ou Adolescentes neste Processo?</span></label>` : '';

    return `<div class="et-corpo">
        <p class="at-salvo" role="status"></p>
        ${migrado}
        ${faltas}
        <label class="es-check"><input type="checkbox" data-na${e.nao_aplicavel ? ' checked' : ''}${ctx.editavel ? '' : ' disabled'}><span>Não Aplicável</span></label>
        <div class="form-group"><label class="form-label" for="et-desc-${id}">Descrição do tratamento</label>
            <textarea class="form-input" id="et-desc-${id}" data-campo="descricao" rows="3" maxlength="${MAX.descricao}"${off}>${txt(e.descricao)}</textarea>
            <p class="at-ajuda">Descreva como esta etapa acontece na prática. Até 4.000 caracteres.</p></div>
        ${botaoRascunho(id, { editavel: ctx.editavel, nao_aplicavel: !!e.nao_aplicavel })}
        ${extrasColeta}
        ${paineis}
    </div>`;
}

/**
 * Liga os controles de uma etapa já desenhada. `ctx.recarregar()` refaz a leitura do servidor (depois de cada gravação que muda
 * situação, lista ou bloqueio). Devolve o elemento do corpo, ou null se a etapa está bloqueada (sem corpo).
 */
export function ligarEtapa(secao, id, ctx) {
    const corpo = secao.querySelector('.et-corpo');
    if (!corpo) return null;
    const status = corpo.querySelector('.at-salvo');
    const { pid, rid } = ctx;
    const rota = `/etapas/${id}`;
    const salvo = novoAutosave({ pid, rid, rota, status, montar: (lote) => lote });
    const salvoLocal = novoAutosave({ pid, rid, rota: `/etapas/${id}/ativos`, status,
        montar: (lote) => ({ ativos: ativosDe(ctx.porId[id]).map((a) => ({ item_id: a.item_id, local_armazenamento: Object.prototype.hasOwnProperty.call(lote, a.item_id) ? lote[a.item_id] : a.local_armazenamento })) }) });

    corpo.querySelectorAll('[data-campo]').forEach((c) => {
        c.addEventListener('input', () => salvo.agendar(c.dataset.campo, c.value));
        c.addEventListener('blur', () => salvo.esvaziar());
    });
    corpo.querySelectorAll('input[data-item]').forEach((c) => {
        c.addEventListener('input', () => {
            const a = ativosDe(ctx.porId[id]).find((x) => x.item_id === c.dataset.item);
            if (a) a.local_armazenamento = c.value;
            salvoLocal.agendar(c.dataset.item, c.value);
        });
        c.addEventListener('blur', () => salvoLocal.esvaziar());
    });

    corpo.addEventListener('change', async (ev) => {
        const t = ev.target;
        if (t.matches('[data-na]')) return marcarNaoAplicavel(t);
        if (t.matches('[data-bool]')) {
            await salvo.esvaziar();
            const chave = t.dataset.bool;
            if (await gravarAgora({ pid, rid, rota, corpo: { [chave]: t.checked }, status })) ctx.porId.coleta[chave] = t.checked;
        } else if (t.matches('[data-origem]')) {
            const marcadas = [...corpo.querySelectorAll('[data-origem]:checked')].map((o) => o.value);
            await gravarAgora({ pid, rid, rota, corpo: { origem: marcadas }, status });
        }
        return undefined;
    });

    ligarRascunho(corpo, id, { pid, rid });

    corpo.addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-acao]');
        if (!b || b.disabled) return;
        acao(b.dataset.acao, b, id, ctx);
    });

    async function marcarNaoAplicavel(t) {
        const marcar = t.checked;
        const e = ctx.porId[id];
        const temConteudo = !!(e.descricao || ativosDe(e).length || (e.areas || []).length || (e.parceiros || []).length || (e.titulares || []).length || (e.origem || []).length);
        if (marcar && temConteudo) {
            const sim = await confirmar('Os dados desta etapa serão apagados.', { rotulo: 'Marcar como Não Aplicável', perigo: true });
            if (!sim) { t.checked = false; return; }
        }
        await salvo.esvaziar();
        if (await gravarAgora({ pid, rid, rota, corpo: { nao_aplicavel: marcar }, status })) await ctx.recarregar();
        else t.checked = !marcar;
    }

    return corpo;
}

/** Os botões de ação da etapa. Cada gravação refaz a leitura (`recarregar`). Erro vira aviso; nada some da tela. */
async function acao(nome, b, id, ctx) {
    const { pid, rid, recarregar } = ctx;
    const e = ctx.porId[id];
    const coleta = ctx.porId.coleta;
    const gravar = (sufixo, corpo) => api('PUT', url(pid, rid, sufixo), corpo);
    try {
        if (nome === 'add-titular') return await abrirTitularNaColeta({ pid, rid, coleta, aoGravado: recarregar });
        if (nome === 'editar-titular') return await abrirTitularNaColeta({ pid, rid, coleta, titularId: b.dataset.tid, aoGravado: recarregar });
        if (nome === 'remover-titular') {
            const t = (coleta.titulares || []).find((x) => x.titular_id === b.dataset.tid);
            if (!(await confirmar(`Tirar ${t ? t.nome : 'este titular'} desta atividade? Os dados dele saem de todas as etapas.`, { rotulo: 'Tirar', perigo: true }))) return undefined;
            const restantes = (coleta.titulares || []).filter((x) => x.titular_id !== b.dataset.tid)
                .map((x) => ({ titular_id: x.titular_id, dados_ids: (x.dados || []).map((d) => d.id) })).filter((x) => x.dados_ids.length);
            await gravar('/etapas/coleta/titulares', { titulares: restantes });
            return await recarregar();
        }
        if (nome === 'abrir-titular') {
            const t = (coleta.titulares || []).find((x) => x.titular_id === b.dataset.tid);
            if (!t) return undefined;
            const s = situacaoDoTitular(e, t.titular_id);
            return abrirTitularNaEtapa({
                pid, rid, etapa: id, aoGravado: recarregar,
                titular: { titular_id: t.titular_id, nome: t.nome },
                dadosDaColeta: (t.dados || []).map((d) => ({ id: d.id, nome: d.nome, sensivel: !!d.sensivel })),
                situacao: s.sit, dadosIds: ((s.linha && s.linha.dados) || []).map((d) => d.id),
            });
        }
        if (nome === 'add-ativo') {
            const itens = await listarItens(pid, 'ativo');
            const atuais = ids(ativosDe(e));
            return abrirSelecao({
                titulo: 'Ativos', pid, tipo: 'ativo', criarRotulo: '+ Criar ativo', buscaRotulo: 'Buscar ativo',
                ajuda: 'Sistemas, arquivos e bases que a etapa usa. Os que já estão na etapa aparecem travados.',
                vazio: TEXTO_VAZIO.ativo, selecionados: atuais,
                itens: itens.map((i) => ({ ...i, travado: atuais.includes(i.id), motivo: 'já usado nesta etapa' })),
                aoGravar: async (sel) => {
                    const local = (aid) => (ativosDe(e).find((a) => a.item_id === aid) || {}).local_armazenamento ?? null;
                    await gravar(`/etapas/${id}/ativos`, { ativos: sel.map((item_id) => (id === 'armazenamento' ? { item_id, local_armazenamento: local(item_id) } : { item_id })) });
                    await recarregar();
                },
            });
        }
        if (nome === 'remover-ativo') {
            if (!(await confirmar('Tirar este ativo desta etapa?', { rotulo: 'Tirar', perigo: true }))) return undefined;
            const restantes = ativosDe(e).filter((a) => a.item_id !== b.dataset.id)
                .map((a) => (id === 'armazenamento' ? { item_id: a.item_id, local_armazenamento: a.local_armazenamento ?? null } : { item_id: a.item_id }));
            await gravar(`/etapas/${id}/ativos`, { ativos: restantes });
            return await recarregar();
        }
        if (nome === 'add-area') {
            const propria = ((ctx.ficha && ctx.ficha.registro && ctx.ficha.registro.areas) || []).map((a) => a.id);
            const todas = await listarItens(pid, 'area');
            const atuais = (e.areas || []).map((a) => a.id);
            return abrirSelecao({
                titulo: 'Áreas', pid, tipo: 'area', criarRotulo: '+ Criar área', buscaRotulo: 'Buscar área',
                ajuda: 'Áreas da empresa que recebem os dados nesta etapa. A área da própria atividade já está fora.',
                vazio: TEXTO_VAZIO.area, selecionados: atuais,
                itens: todas.map((i) => (propria.includes(i.id)
                    ? { ...i, travado: true, motivo: 'já é a área da atividade' }
                    : { ...i, travado: atuais.includes(i.id), motivo: 'já usado nesta etapa' })),
                aoGravar: async (sel) => {
                    await gravar('/etapas/compartilhamento_interno/areas', { departamentos_ids: sel.filter((x) => !propria.includes(x)) });
                    await recarregar();
                },
            });
        }
        if (nome === 'remover-area') {
            await gravar('/etapas/compartilhamento_interno/areas', { departamentos_ids: (e.areas || []).filter((a) => a.id !== b.dataset.id).map((a) => a.id) });
            return await recarregar();
        }
        if (nome === 'add-parceiro') {
            const todos = await listarItens(pid, 'parceiro');
            const atuais = (e.parceiros || []).map((p) => p.id);
            return abrirSelecao({
                titulo: 'Parceiros', pid, tipo: 'parceiro', criarRotulo: '+ Criar parceiro', buscaRotulo: 'Buscar parceiro',
                ajuda: 'Empresas externas que recebem os dados nesta etapa.',
                vazio: TEXTO_VAZIO.parceiro, selecionados: atuais,
                itens: todos.map((i) => ({ ...i, travado: atuais.includes(i.id), motivo: 'já usado nesta etapa' })),
                aoGravar: async (sel) => {
                    await gravar('/etapas/compartilhamento_externo/parceiros', { partes_ids: sel });
                    await recarregar();
                },
            });
        }
        if (nome === 'remover-parceiro') {
            await gravar('/etapas/compartilhamento_externo/parceiros', { partes_ids: (e.parceiros || []).filter((p) => p.id !== b.dataset.id).map((p) => p.id) });
            return await recarregar();
        }
    } catch (err) {
        showToast((err && err.message) || 'Não foi possível gravar. Tente de novo.', 'error');
    }
    return undefined;
}
