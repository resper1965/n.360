import { S } from '../state.js';
import { escapeHTML, renderEmptyState, renderMaisAcoes, falhaDeCarga } from '../ui.js';
import { navigate } from '../router.js';
import { ABAS } from '../atividade/contrato.js';
import { carregarFicha, carregarRegistro, abaDoEndereco, gravarAbaNoEndereco, podeEscrever, esvaziarTudo, limparAutosaves } from '../atividade/estado.js';
import { desenharAbas, abaParaTecla } from '../atividade/abas.js';
import { desenharCabecalho, montarCabecalho } from '../atividade/cabecalho.js';
import { itensDoMenu } from '../atividade/acoes.js';
import { montar as montarEscopo } from '../atividade/aba-escopo.js';
import { montar as montarPonte } from '../atividade/aba-tratamento-ponte.js';
import { montar as montarAgentes } from '../atividade/aba-agentes.js';
import { montar as montarMedidas } from '../atividade/aba-medidas.js';
import { montar as montarLogs } from '../atividade/aba-logs.js';

// A atividade de tratamento como FICHA EM ABAS (n.privacy, spec 2026-10-16): cabeçalho, nove abas livres e o menu "Ações". Sem
// assistente e sem botão "Salvar" global: cada aba grava sozinha ou ao confirmar o próprio modal. Toda regra é do servidor
// (`GET .../ficha`); a casca só mostra. Um módulo por aba em `frontend/src/atividade/`.

// As abas com modal (pacote D) entram sozinhas quando o arquivo existe: sem importação fixa, a casca não depende da ordem dos merges.
const DO_PACOTE_D = import.meta.glob('../atividade/aba-{base,gaps,impacto,riscos}.js', { eager: true });
const externa = (arq) => { const m = DO_PACOTE_D[`../atividade/${arq}.js`]; return m && m.montar; };
const montadores = () => ({
    escopo: montarEscopo, tratamento: montarPonte, agentes: montarAgentes, medidas: montarMedidas, logs: montarLogs,
    base_juridica: externa('aba-base'), gaps: externa('aba-gaps'), impacto: externa('aba-impacto'), riscos: externa('aba-riscos'),
});

const voltar = '<button type="button" class="btn" data-action="atVoltar">Voltar aos tratamentos</button>';
let sequencia = 0;
let ultimo = null;

export async function renderAtividade(c, h, a) {
    ultimo = { c, h, a };
    const pedido = S.atividade;
    a.innerHTML = voltar;
    if (!pedido) {
        h.textContent = 'Atividade';
        c.innerHTML = renderEmptyState({ titulo: 'Nenhuma atividade aberta', texto: 'Abra uma atividade pela lista de tratamentos.',
            acao: '<button type="button" class="btn" data-action="atVoltar">Voltar aos tratamentos</button>' });
        return;
    }
    const { projectId: pid, ropaId: rid } = pedido;
    const minha = ++sequencia;
    const viva = () => minha === sequencia && S.view === 'ropa-atividade';
    await esvaziarTudo();
    limparAutosaves();
    if (!c.querySelector('.at')) c.innerHTML = '<p class="at-nota" role="status">Carregando a atividade...</p>';
    let ficha; let registro;
    try { [ficha, registro] = await Promise.all([carregarFicha(pid, rid), carregarRegistro(pid, rid)]); }
    catch (e) {
        if (!viva()) return;
        if (e && e.status === 404) {
            h.textContent = 'Atividade';
            c.innerHTML = renderEmptyState({ titulo: 'Atividade não encontrada', texto: 'Ela pode ter sido excluída.', acao: '<button type="button" class="btn" data-action="atVoltar">Voltar aos tratamentos</button>' });
        } else falhaDeCarga(c, a, 'Não foi possível carregar a atividade.', e);
        return;
    }
    if (!viva()) return;
    const aba = abaDoEndereco();
    const editavel = podeEscrever(ficha);
    const cancelada = ficha.situacao.codigo === 'cancelada';
    const rotulo = ABAS.find((x) => x.id === aba).rotulo;
    h.textContent = ficha.registro.nome;
    a.innerHTML = voltar + renderMaisAcoes(itensDoMenu(ficha), { rotulo: 'Ações', nome: ficha.registro.nome });
    c.innerHTML = `<div class="at">
        ${cancelada ? '<p class="at-faixa-cancelada" role="status">Atividade cancelada. Reative para editar.</p>' : ''}
        ${desenharCabecalho(ficha, editavel)}
        ${desenharAbas(ficha, aba)}
        <div role="tabpanel" id="at-painel" aria-labelledby="at-aba-${aba}" tabindex="0"><h2 class="at-painel-titulo">${escapeHTML(rotulo)}</h2><div id="at-corpo"></div></div>
    </div>`;
    const ctx = { projectId: pid, ropaId: rid, ficha, registro: registro || {}, editavel, recarregarFicha: repintar };
    montarCabecalho(c, ctx);
    const montar = montadores()[aba];
    const corpo = c.querySelector('#at-corpo');
    if (montar) await montar(corpo, ctx);
    else corpo.innerHTML = renderEmptyState({ titulo: 'Esta aba ainda não está disponível', texto: 'Ela chega na próxima atualização. Os dados desta atividade não são afetados.' });
}

const repintar = () => (ultimo ? renderAtividade(ultimo.c, ultimo.h, ultimo.a) : undefined);
window.atRepintar = repintar;

window.abrirAtividade = function (projectId, ropaId) {
    if (typeof window.forceCloseModal === 'function') window.forceCloseModal();
    S.atividade = { projectId, ropaId };
    // Uma atividade nova abre no Escopo, não na aba em que a anterior ficou.
    const u = new URL(window.location.href);
    if (u.searchParams.has('aba')) { u.searchParams.delete('aba'); window.history.replaceState(null, '', u); }
    navigate('ropa-atividade');
};
window.atVoltar = function () { S.atividade = null; navigate('ropa'); };

// Aba: o id vem do `data-aba` do botão (a delegação chama a função com `this` = o botão). Antes de trocar, o que estiver pendente grava.
async function irParaAba(id) {
    await esvaziarTudo();
    gravarAbaNoEndereco(id);
    await repintar();
    const botao = document.getElementById(`at-aba-${id}`);
    if (botao) botao.focus();
}
window.atIrParaAba = function () { return irParaAba(this.dataset.aba); };
window.atTeclaAba = function (e) {
    const proxima = abaParaTecla(this.dataset.aba, e.key);
    if (!proxima) return;
    e.preventDefault();
    return irParaAba(proxima);
};

window.renderAtividade = renderAtividade;
