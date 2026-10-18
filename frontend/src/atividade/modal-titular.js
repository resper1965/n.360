import { api } from '../api.js';
import { escapeHTML } from '../ui.js';
import { abrirSelecao } from './modal-selecao.js';
import { listarItens, formularioDeCriacao, TEXTO_VAZIO } from './catalogo-inline.js';
import { url } from './estado.js';

// Modais do titular (spec seção 5): "Dados de titular" na Coleta (escolhe o tipo de titular e os dados que ele fornece) e o modal
// do mesmo titular em cada outra etapa (só os dados que a Coleta definiu para ele, e "Dados não usados nesse tratamento").
// Toda regra (subconjunto, travas, remoção em cascata) é do servidor; aqui só se escolhe e se envia.

const TEXTO_DADOS_DA_COLETA = 'Este titular ainda não tem dados definidos na Coleta. Defina-os lá primeiro.';

/** Coleta: escolhe o tipo de titular e os dados. Grava a lista inteira (`PUT .../etapas/coleta/titulares`), trocando só este titular. */
export async function abrirTitularNaColeta({ pid, rid, coleta, titularId = null, aoGravado }) {
    const [tipos, dados] = await Promise.all([listarItens(pid, 'titular'), listarItens(pid, 'dado')]);
    const doColeta = (tid) => (coleta.titulares || []).find((t) => t.titular_id === tid);
    const selecionadosDe = (tid) => ((doColeta(tid) && doColeta(tid).dados) || []).map((d) => d.id);
    const antes = `<div class="form-group"><label class="form-label" for="mt-tipo">Tipo de titular</label>
        <p class="at-ajuda">Escolha o tipo antes de marcar os dados. Se o tipo não existe, crie-o com o botão +.</p>
        <div class="es-linha"><button type="button" class="btn btn-sm" data-mt-mais aria-label="Criar tipo de titular">+</button>
            <select class="form-input" id="mt-tipo"><option value="">Selecione o tipo de titular</option>${tipos.map((t) => `<option value="${escapeHTML(t.id)}"${t.id === titularId ? ' selected' : ''}>${escapeHTML(t.nome)}</option>`).join('')}</select></div>
        <div class="es-criar-area" data-mt-criar></div></div>`;
    let controle;
    const raiz = () => document.getElementById('modal-content');
    controle = abrirSelecao({
        titulo: 'Dados de titular',
        ajuda: 'Selecione o tipo de titular e os dados pessoais envolvidos na Coleta.',
        pid,
        itens: dados,
        selecionados: titularId ? selecionadosDe(titularId) : [],
        antes,
        buscaRotulo: 'Buscar dados de titular',
        tipo: 'dado',
        criarRotulo: '+ Criar Dado Pessoal',
        vazio: TEXTO_VAZIO.dado,
        pronto: (sel, r) => sel.size > 0 && !!r.querySelector('#mt-tipo').value,
        aoMudar: (c) => c.definir(selecionadosDe(raiz().querySelector('#mt-tipo').value)),
        aoGravar: async (ids, r) => {
            const tid = r.querySelector('#mt-tipo').value;
            const outros = (coleta.titulares || []).filter((t) => t.titular_id !== tid)
                .map((t) => ({ titular_id: t.titular_id, dados_ids: (t.dados || []).map((d) => d.id) }))
                .filter((t) => t.dados_ids.length);
            await api('PUT', url(pid, rid, '/etapas/coleta/titulares'), { titulares: [...outros, { titular_id: tid, dados_ids: ids }] });
            await aoGravado();
        },
    });
    raiz().querySelector('[data-mt-mais]').addEventListener('click', () => {
        formularioDeCriacao(raiz().querySelector('[data-mt-criar]'), {
            pid, tipo: 'titular', existentes: tipos, rotulo: 'Criar tipo de titular',
            aoCriado: (item) => {
                tipos.push(item);
                const sel = raiz().querySelector('#mt-tipo');
                sel.insertAdjacentHTML('beforeend', `<option value="${escapeHTML(item.id)}">${escapeHTML(item.nome)}</option>`);
                sel.value = item.id;
                raiz().querySelector('[data-mt-criar]').innerHTML = '';
                controle.definir(selecionadosDe(item.id));
            },
            aoUsar: (ex) => {
                const sel = raiz().querySelector('#mt-tipo');
                if (!sel.querySelector(`option[value="${ex.id}"]`)) sel.insertAdjacentHTML('beforeend', `<option value="${escapeHTML(ex.id)}">${escapeHTML(ex.nome)}</option>`);
                sel.value = ex.id;
                raiz().querySelector('[data-mt-criar]').innerHTML = '';
                controle.definir(selecionadosDe(ex.id));
            },
        });
    });
}

/** Etapas 2 a 6: o titular da Coleta, com os dados que a Coleta definiu para ele. "Dados não usados" desmarca os outros. */
export function abrirTitularNaEtapa({ pid, rid, etapa, titular, dadosDaColeta, situacao, dadosIds, aoGravado }) {
    const naoUsa = situacao === 'nao_usa';
    return abrirSelecao({
        titulo: titular.nome,
        ajuda: 'Marque os dados desta pessoa usados nesta etapa. Só aparecem os dados que a Coleta definiu para ela.',
        pid,
        itens: dadosDaColeta,
        selecionados: naoUsa ? [] : dadosIds,
        buscaRotulo: 'Buscar dados de titular',
        vazio: { titulo: 'Sem dados definidos na Coleta', texto: TEXTO_DADOS_DA_COLETA },
        extra: `<label class="es-check"><input type="checkbox" data-es-nao-usa${naoUsa ? ' checked' : ''}><span>Dados não usados nesse tratamento</span></label>`,
        bloqueadoPor: (r) => !!r.querySelector('[data-es-nao-usa]').checked,
        pronto: (sel, r) => r.querySelector('[data-es-nao-usa]').checked || sel.size > 0,
        aoGravar: async (ids, r) => {
            const marcado = r.querySelector('[data-es-nao-usa]').checked;
            await api('PUT', url(pid, rid, `/etapas/${etapa}/titulares/${titular.titular_id}`), marcado ? { dados_ids: [], nao_usa: true } : { dados_ids: ids });
            await aoGravado();
        },
    });
}
