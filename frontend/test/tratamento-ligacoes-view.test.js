// Ligações que as abas usam (partes e transferências do tratamento) e a importação de planilha do RoPA. O modal de Ligações saiu
// (PR3 do RoPA em abas): seus testes saíram com ele; as ações que ficam são testadas aqui. api() REAL; só o fetch é dublado.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { servir } from './servir-api.js';

vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import { S } from '../src/state.js';
import '../src/ui.js';
import '../src/views/tratamento-ligacoes.js';

const B = '/api/v1/projects/p9/ropa/r1';
const chamadas = (f) => f.mock.calls.map(([u, o]) => `${o?.method || 'GET'} ${new URL(u, 'http://localhost').pathname}`);
const corpoDe = (f, chave) => {
    const c = f.mock.calls.find(([u, o]) => `${o?.method || 'GET'} ${new URL(u, 'http://localhost').pathname}` === chave);
    return c ? JSON.parse(c[1].body) : undefined;
};
const el = (id) => document.getElementById(id);

/** Os campos que as ações lêem (o modal de antes os tinha; a aba de Agentes tem os mesmos ids). */
async function abrir(extra = {}) {
    document.querySelectorAll('.toast').forEach((t) => t.remove());
    document.body.innerHTML = `<div id="tl-agentes">
        <select id="tl-parte"><option value="pa1">Operadora</option></select>
        <select id="tl-papel"><option value="operador">Operador</option><option value="suboperador">Suboperador</option></select>
        <input id="tl-pais"><select id="tl-dest"><option value="">— não informado —</option><option value="pa1">Operadora</option></select>
        <input id="tl-mec"></div>`;
    return servir(extra);
}

beforeEach(() => {
    S.token = 'tok';
    S.user = { role: 'consultor' };
    S.ropa = [{ id: 'r1', processing_purpose: 'Folha de pagamento' }];
    window.render = vi.fn();
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('ações de partes e transferências', () => {
    it('ligar parte usa o vínculo existente com alvo tratamento; remover chama o DELETE do vínculo', async () => {
        const f = await abrir({ 'POST /api/v1/projects/p9/partes/pa1/vinculos': { ok: true, id: 'v2' }, 'DELETE /api/v1/projects/p9/partes/pa1/vinculos/v1': { ok: true } });
        el('tl-papel').value = 'suboperador';
        await window.adicionarParteTratamento('p9', 'r1');
        expect(corpoDe(f, 'POST /api/v1/projects/p9/partes/pa1/vinculos')).toEqual({ papel: 'suboperador', alvo_tipo: 'tratamento', alvo_id: 'r1' });
        await window.removerParteTratamento('p9', 'r1', 'pa1', 'v1');
        expect(chamadas(f)).toContain('DELETE /api/v1/projects/p9/partes/pa1/vinculos/v1');
    });

    it('transferência: país obrigatório (não envia sem ele); com país manda destinatário e mecanismo; remover chama o DELETE', async () => {
        const f = await abrir({ [`POST ${B}/transferencias`]: { ok: true, id: 't2' }, [`DELETE ${B}/transferencias/t1`]: { ok: true } });
        el('tl-pais').value = '  ';
        await window.adicionarTransferenciaTratamento('p9', 'r1');
        expect(chamadas(f)).not.toContain(`POST ${B}/transferencias`);
        el('tl-pais').value = ' Estados Unidos ';
        el('tl-dest').value = 'pa1';
        el('tl-mec').value = ' cláusulas-padrão ';
        await window.adicionarTransferenciaTratamento('p9', 'r1');
        expect(corpoDe(f, `POST ${B}/transferencias`)).toEqual({ pais: 'Estados Unidos', destinatario_parte_id: 'pa1', mecanismo: 'cláusulas-padrão' });
        await window.removerTransferenciaTratamento('p9', 'r1', 't1');
        expect(chamadas(f)).toContain(`DELETE ${B}/transferencias/t1`);
    });

});

describe('importação do RoPA por planilha', () => {
    const abrirImportar = () => {
        document.body.innerHTML = '<div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>';
        window.openImportarRopaModal('p9');
    };
    const arquivo = (texto) => {
        const f = new File([texto], 'ropa.csv', { type: 'text/csv' });
        Object.defineProperty(el('ri-arquivo'), 'files', { value: [f], configurable: true });
    };

    it('o modal explica o formato e oferece importar e baixar o modelo', () => {
        abrirImportar();
        expect(el('modal-content').textContent).toContain('finalidade');
        expect(document.querySelector('[data-action="enviarImportacaoRopa"]')).not.toBeNull();
        expect(document.querySelector('[data-action="baixarModeloRopa"]')).not.toBeNull();
    });

    it('sem arquivo não chama a API', async () => {
        const f = servir({});
        abrirImportar();
        await window.enviarImportacaoRopa('p9');
        expect(chamadas(f)).toEqual([]);
    });

    it('manda o texto do arquivo e mostra criados, existentes e recusadas (motivo escapado)', async () => {
        const f = servir({ 'POST /api/v1/projects/p9/ropa/importar': { ok: true, criados: 2, ja_existiam: 1, recusadas: [{ linha: 4, motivo: 'retention_period: <b>grande</b>' }] } });
        abrirImportar();
        arquivo('finalidade\nA\nB');
        await window.enviarImportacaoRopa('p9');
        expect(corpoDe(f, 'POST /api/v1/projects/p9/ropa/importar')).toEqual({ csv: 'finalidade\nA\nB' });
        const rel = el('ri-relatorio');
        expect(rel.textContent).toContain('2 criados, 1 já existiam, 1 recusadas');
        expect(rel.textContent).toContain('retention_period: <b>grande</b>');
        expect(rel.querySelector('b')).toBeNull();
        expect(window.render).toHaveBeenCalled();
    });

    it('erro do servidor vira aviso e o relatório fica vazio', async () => {
        servir({}); // sem dublê: 404 do Worker, que api() lança como erro
        abrirImportar();
        arquivo('finalidade\nA');
        await window.enviarImportacaoRopa('p9');
        expect(el('ri-relatorio').innerHTML).toBe('');
    });
});

