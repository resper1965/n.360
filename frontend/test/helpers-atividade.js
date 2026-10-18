// Apoio dos testes da ficha em abas: a ficha de exemplo é a do contrato congelado (contracts/ropa-abas/ficha.json), que o backend
// compara com a saída real. `api()` e a delegação são as REAIS; só o `fetch` é dublado (molde: test/servir-api.js). Dados fictícios.
import { vi } from 'vitest';
import contratoFicha from '../../contracts/ropa-abas/ficha.json';
import { servir, resposta } from './servir-api.js';
import { S } from '../src/state.js';

export const P = '/api/v1/projects/p9';
export const B = `${P}/ropa/r1`;
export { servir, resposta };

export const FICHA = (mudar = (f) => f) => mudar(structuredClone(contratoFicha));
export const REGISTRO = (extra = {}) => ({ id: 'r1', processing_purpose: 'Formalizar a rescisão do contrato de trabalho.', volume_mensal: 'N/A',
    processamento_automatizado: 'nao', papel_controlador: 1, papel_operador: 0, international_transfers: 0, transfer_safeguards: null,
    recipients: null, data_subjects: 'Titular exemplo A', data_categories: 'Dado exemplo 1', ...extra });

/** Rotas comuns à casca; `extra` acrescenta ou troca. */
export const rotas = (extra = {}, ficha = FICHA()) => ({
    [`GET ${B}/ficha`]: ficha,
    [`GET ${P}/ropa`]: { ok: true, records: [REGISTRO()] },
    ...extra,
});

export const el = (id) => document.getElementById(id);
export const chamadas = (f) => f.mock.calls.map(([u, o]) => `${o?.method || 'GET'} ${new URL(u, 'http://localhost').pathname}`);
export const corpoDe = (f, chave) => {
    const c = f.mock.calls.filter(([u, o]) => `${o?.method || 'GET'} ${new URL(u, 'http://localhost').pathname}` === chave).pop();
    return c ? JSON.parse(c[1].body) : undefined;
};

export function prepararDom() {
    document.body.innerHTML = '<h1 id="h"></h1><div id="a"></div><div id="c"></div><div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>';
    S.token = 'tok';
    S.user = { role: 'consultor' };
    S.activeProject = { id: 'p9', modulos: ['privacy'] };
    S.projects = [S.activeProject];
    S.view = 'ropa-atividade';
    S.atividade = { projectId: 'p9', ropaId: 'r1' };
    window.history.replaceState(null, '', '/');
}

/** Abre a ficha com o fetch dublado. */
export async function abrir(renderAtividade, extra = {}, ficha = FICHA()) {
    const f = servir(rotas(extra, ficha));
    await renderAtividade(el('c'), el('h'), el('a'));
    return f;
}

export const esperar = (fn) => vi.waitFor(fn, { timeout: 2000 });
