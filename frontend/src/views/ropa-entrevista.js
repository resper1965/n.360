// A entrevista do RoPA virou o MODO GUIADO da ficha em abas (PR3, spec 2026-10-16 seção 14): um painel sobre as mesmas abas,
// gravando nos mesmos campos. Não há mais motor de entrevista nem `sessionStorage` de respostas. Esta rota só redireciona para a
// atividade em modo guiado e reexporta o que outras telas ainda importam.
import { S } from '../state.js';
import { navigate } from '../router.js';
import { podeEntrevistar, temAprovacao, confirmaEdicaoAprovada } from '../atividade/estado.js';

export { podeEntrevistar, temAprovacao, confirmaEdicaoAprovada };

/** Abre a atividade no modo guiado (`?modo=guiado`, lido pela casca da atividade). */
export function abrirNoGuiado(projectId, ropaId) {
    S.atividade = { projectId, ropaId, modo: 'guiado', avancou: true };
    navigate('ropa-atividade');
}

/** Rota antiga `ropa-entrevista`: leva à atividade aberta, ou à lista se não há nenhuma. */
export function renderRopaEntrevista() {
    if (S.atividade) navigate('ropa-atividade');
    else navigate('ropa');
}

window.abrirRopaEntrevista = function (projectId, recordId) {
    // Sem atividade, a entrada é a criação ("Nova atividade", com a escolha guiada ou direta).
    if (!recordId) return typeof window.abrirNovaAtividade === 'function' ? window.abrirNovaAtividade(projectId) : undefined;
    return abrirNoGuiado(projectId, recordId);
};
window.renderRopaEntrevista = renderRopaEntrevista;
