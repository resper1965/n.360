// Painel do copiloto da Bancada (coluna da direita). Pacote D implementa; pacote C só monta.
/**
 * @param {object} p
 * @param {HTMLElement} p.el              contêiner `<aside>` da coluna
 * @param {string} p.projectId
 * @param {object} p.passo                Passo do catálogo (campos, titulo, ...)
 * @param {() => Record<string,string>} p.valoresAtuais   valores hoje na tela, por id de campo
 * @param {(campoId: string, valor: string) => void} p.aoAceitar   o painel pede; a tela grava (autosave) e mostra
 * @param {(campoId: string) => void} p.focarCampo
 * @param {boolean} p.podeUsar            false: papel sem direito ao copiloto (mostra a explicação)
 */
export function montarCopiloto({ el, projectId, passo, valoresAtuais, aoAceitar, focarCampo, podeUsar }) {
    el.textContent = '';
}
