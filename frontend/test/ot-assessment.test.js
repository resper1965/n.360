// n.ot, tela Assessment (E5 Task 3): agrupamento, selos, item técnico só leitura, gravar, confirmar, evidências, filtro. api() REAL, fetch dublado.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resposta } from './servir-api.js';

vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import { S } from '../src/state.js';
import '../src/ui.js';
import '../src/views/ot.js';
import { montarAssessment } from '../src/views/ot-assessment.js';
import { permissoesPeloPapel } from './ot-abrir.js';

// GET /ot/permissoes: a tela lê do servidor (spec 2026-11-26 §6); aqui, a resposta que o servidor daria ao papel do teste.
beforeEach(permissoesPeloPapel);

const B = '/api/v1/projects/p9/ot/assessment';
const el = (id) => document.getElementById(id);
const pausa = () => new Promise((r) => setTimeout(r, 0));
const ITENS = { resumo: { atende: 1, parcial: 0, nao_atende: 1, nao_se_aplica: 0, nao_avaliado: 2, revisar: 1, a_confirmar: 1 }, itens: [
    { codigo: '4.1.1', titulo: 'Zonas <b id="xss1">x</b>', categoria: 'Rede', prazo: '2023-01-09', tipo: 'tecnico', situacao_org: 'nao_atende',
        por_site: [{ site_id: 's1', site_nome: 'SE <i id="xss2">N</i>', fase: 'em_levantamento', situacao: 'nao_atende', evidencia: '1 de 1 sem VPN' }] },
    { codigo: '4.2.1', titulo: 'Gestor', categoria: 'Governança', prazo: null, tipo: 'politica', revisar: true, subsidio: [{ levantamento_id: 'lv1', site_nome: 'SE Norte', pergunta: 'Há pendrive?', resposta: 'sim', realizado_em: '2026-11-01', site_id: 's1' }],
        avaliacao: { situacao: 'atende', justificativa: 'Feito <u id="xss3">j</u>', responsavel_id: 'u2', responsavel_nome: 'Ana', proxima_revisao: '2027-01-10', confirmado: false, confirmado_por_nome: null, confirmado_em: null },
        evidencias: [{ id: 'e1', file_name: 'ata.pdf', valido_ate: '2027-03-01', vencida: false }] },
    { codigo: '4.2.2', titulo: 'Papéis', categoria: 'Governança', prazo: null, tipo: 'politica', revisar: false, avaliacao: null, evidencias: [], subsidio: [] },
    { codigo: '5.1.1', titulo: 'Exceções', categoria: 'Exceções', prazo: null, tipo: 'excecao', situacao: 'nao_avaliado', evidencia: 'Não avaliado neste ciclo' }] };
let chamadas;
function servir(extra = {}) {
    chamadas = [];
    const rotas = { [`GET ${B}`]: ITENS, 'GET /api/v1/users': [{ id: 'u2', name: 'Ana', email: 'ana@x.com', client_project_id: 'p9' }, { id: 'u3', email: 'fora@x.com', client_project_id: 'p1' }], ...extra };
    vi.stubGlobal('fetch', vi.fn(async (url, opts = {}) => {
        const u = new URL(url, 'http://localhost');
        const k = `${opts.method || 'GET'} ${u.pathname}`;
        chamadas.push({ k, opts });
        return k in rotas ? resposta(rotas[k]) : resposta({ error: `API route not found: ${k}` }, 404);
    }));
}
async function abrir(papel = 'consultor', extra) {
    S.user = { id: 'u1', role: papel };
    servir(extra);
    await montarAssessment(el('c'), el('a'), S.activeProject);
}
beforeEach(() => {
    document.body.innerHTML = '<h1 id="h"></h1><div id="a"></div><div id="c"></div><div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>';
    S.token = 'tok'; S.activeProject = { id: 'p9', modulos: ['ot'] };
    window.render = vi.fn(); window.otTela = vi.fn();
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('tela Assessment', () => {
    it('leitor (spec 2026-11-26, decisão 4): sem "Abrir site" no item técnico e sem o bloco "Subsídio do levantamento"', async () => {
        await abrir('client');
        window.otAssAbrir('4.1.1');
        expect(el('modal-content').textContent).toContain('1 de 1 sem VPN');
        expect(el('modal-content').querySelector('[data-action="otAssIrSite"]')).toBeNull();
        window.otAssAbrir('4.2.1');
        expect(el('modal-content').textContent).not.toContain('Subsídio do levantamento');
        expect(el('modal-content').querySelector('[data-action="otAssIrLevantamento"]')).toBeNull();
        await abrir('consultor');
        window.otAssAbrir('4.1.1');
        expect(el('modal-content').querySelector('[data-action="otAssIrSite"]')).not.toBeNull();
        window.otAssAbrir('4.2.1');
        expect(el('modal-content').textContent).toContain('Subsídio do levantamento');
    });
    it('item técnico sem site com base aprovada diz "Aguardando base aprovada", não "Não avaliado"', async () => {
        const tec = { codigo: '4.1.1', titulo: 'Zonas', categoria: 'Rede', prazo: null, tipo: 'tecnico', situacao_org: 'nao_avaliado',
            por_site: [{ site_id: 's1', site_nome: 'SE Norte', fase: 'em_levantamento', situacao: 'nao_atende', evidencia: 'sem zonas' }] };
        await abrir('consultor', { [`GET ${B}`]: { resumo: {}, itens: [tec] } });
        const linha = [...el('c').querySelectorAll('tr')].find((tr) => tr.textContent.includes('4.1.1'));
        expect(linha.textContent).toContain('Aguardando base aprovada');
        expect(linha.textContent).not.toContain('Não avaliado');
    });
    it('agrupa por categoria, mostra selos, prazo em dd/mm/aaaa e escapa o que vem da API', async () => {
        await abrir();
        const t = el('c').textContent;
        for (const x of ['Rede', 'Governança', 'Exceções', 'Não atende', 'Atende', 'Não avaliado', '09/01/2023', 'Ana', '10/01/2027', 'A confirmar', 'Revisar']) expect(t).toContain(x);
        expect(el('c').querySelectorAll('h3').length).toBe(3);
        expect(el('xss1')).toBeNull(); expect(el('xss3')).toBeNull();
        window.otAssAbrir('4.1.1'); expect(el('xss2')).toBeNull();
    });

    it('item técnico é só leitura: tabela por site, aviso e link para o site', async () => {
        await abrir();
        window.otAssAbrir('4.1.1');
        const m = el('modal-content');
        expect(m.textContent).toContain('Calculado pelo inventário; não editável');
        expect(m.textContent).toContain('1 de 1 sem VPN');
        expect(m.querySelector('#ass-sit')).toBeNull();
        expect(m.textContent).toContain('Situação na organização');
        await abrir('org_user', { [`GET ${B}`]: { ...ITENS, restrito: true } });
        window.otAssAbrir('4.1.1');
        expect(el('modal-content').textContent).toContain('Situação nos seus sites');
        window.otAssIrSite('s1');
        expect(window.otTela).toHaveBeenCalledWith('site', 's1', 'base');
    });

    it('5.1.1 mostra "Não avaliado neste ciclo"', async () => {
        await abrir();
        window.otAssAbrir('5.1.1');
        expect(el('modal-content').textContent).toContain('Não avaliado neste ciclo');
    });

    it('gravar envia o corpo certo e é o único .btn-primary; responsável lista só usuários do projeto', async () => {
        await abrir('consultor', { 'PUT /api/v1/projects/p9/ot/assessment/4.2.2': { ok: true } });
        window.otAssAbrir('4.2.2');
        expect(document.querySelectorAll('.btn-primary').length).toBe(1);
        expect(el('ass-just').maxLength).toBe(2000); // o mesmo teto do otAvaliacaoSchema
        expect([...el('ass-resp').options].map((o) => o.value)).toEqual(['', 'u2']);
        el('ass-sit').value = 'parcial'; el('ass-just').value = ' Em curso '; el('ass-resp').value = 'u2'; el('ass-rev').value = '2027-02-01';
        await window.otAssGravar('4.2.2');
        const c = chamadas.find((x) => x.k === `PUT ${B}/4.2.2`);
        expect(JSON.parse(c.opts.body)).toEqual({ situacao: 'parcial', justificativa: 'Em curso', responsavel_id: 'u2', proxima_revisao: '2027-02-01' });
    });

    it('Confirmar só para o Gestor, e só com avaliação sem confirmação', async () => {
        await abrir('consultor');
        window.otAssAbrir('4.2.1');
        expect(el('modal-content').textContent).not.toContain('Confirmar');
        expect(el('modal-content').textContent).toContain('Editar tira a confirmação do Gestor');
        await abrir('org_admin', { [`POST ${B}/4.2.1/confirmar`]: { ok: true } });
        window.otAssAbrir('4.2.2'); expect(el('modal-content').textContent).not.toContain('Confirmar');
        window.otAssAbrir('4.2.1');
        expect(el('modal-content').querySelector('[data-action="otAssConfirmar"]')).not.toBeNull();
        expect(document.querySelectorAll('.btn-primary').length).toBe(1);
    });

    it('quem avaliou o item (eu_avaliei) não vê Confirmar: vê a nota', async () => {
        const meus = structuredClone(ITENS); meus.itens[1].avaliacao.eu_avaliei = true;
        await abrir('org_admin', { [`GET ${B}`]: meus });
        window.otAssAbrir('4.2.1');
        expect(el('modal-content').querySelector('[data-action="otAssConfirmar"]')).toBeNull();
        expect(el('modal-content').textContent).toContain('Quem avaliou o item não o confirma: peça a outra pessoa.');
    });

    it('anexar faz o upload multipart e depois liga a evidência; remover só desliga', async () => {
        await abrir('consultor', { 'POST /api/v1/projects/p9/evidence/upload': { ok: true, id: 'ev9' }, [`POST ${B}/4.2.2/evidencias`]: { ok: true }, [`DELETE ${B}/4.2.1/evidencias/e1`]: { ok: true } });
        window.otAssAbrir('4.2.2');
        const input = el('ass-arq');
        Object.defineProperty(input, 'files', { value: [new File(['x'], 'ata.pdf')] });
        await window.otAssAnexar('4.2.2');
        const ks = chamadas.map((x) => x.k);
        expect(ks.indexOf('POST /api/v1/projects/p9/evidence/upload')).toBeGreaterThan(-1);
        expect(ks.indexOf(`POST ${B}/4.2.2/evidencias`)).toBeGreaterThan(ks.indexOf('POST /api/v1/projects/p9/evidence/upload'));
        expect(JSON.parse(chamadas.find((x) => x.k === `POST ${B}/4.2.2/evidencias`).opts.body)).toEqual({ evidencia_id: 'ev9' });
        await window.otAssRemoverEv('4.2.1', 'e1');
        expect(ks.concat(chamadas.map((x) => x.k))).toContain(`DELETE ${B}/4.2.1/evidencias/e1`);
        expect(chamadas.some((x) => x.k.startsWith('DELETE /api/v1/projects/p9/evidence'))).toBe(false);
    });

    it('filtro "Só o que espera por mim": consultor vê o sem preencher; Gestor vê o a confirmar', async () => {
        await abrir('consultor');
        window.otAssFiltrar({ checked: true });
        const linhas = () => [...el('c').querySelectorAll('tbody tr')].map((r) => r.cells[0].textContent);
        expect(linhas()).toEqual(['4.2.2']);
        await abrir('org_admin');
        window.otAssFiltrar({ checked: true });
        expect(linhas()).toEqual(['4.2.1']);
        window.otAssFiltrar({ checked: false });
    });

    it('filtro passado pelo Início (S.otAssFiltro) vale uma vez: "revisar" mostra só o que precisa de revisão', async () => {
        S.otAssFiltro = 'revisar';
        await abrir('org_admin');
        expect(S.otAssFiltro).toBeNull();
        expect([...el('c').querySelectorAll('tbody tr')].map((r) => r.cells[0].textContent)).toEqual(['4.2.1']);
        expect(el('ass-revisar').checked).toBe(true);
        window.otAssFiltrar({ id: 'ass-revisar', checked: false });
        expect(el('c').querySelectorAll('tbody tr').length).toBe(4);
        S.otAssFiltro = 'meus';
        await abrir('consultor');
        expect(el('ass-meus').checked).toBe(true);
        await abrir();
        expect(el('ass-meus').checked).toBe(false);
    });

    it('anexar e remover mantêm o que foi digitado no formulário', async () => {
        await abrir('consultor', { 'POST /api/v1/projects/p9/evidence/upload': { ok: true, id: 'ev9' }, [`POST ${B}/4.2.1/evidencias`]: { ok: true } });
        window.otAssAbrir('4.2.1');
        el('ass-sit').value = 'parcial'; el('ass-just').value = 'rascunho não gravado';
        Object.defineProperty(el('ass-arq'), 'files', { value: [new File(['x'], 'a.pdf')] });
        await window.otAssAnexar('4.2.1');
        expect(el('ass-sit').value).toBe('parcial'); expect(el('ass-just').value).toBe('rascunho não gravado');
    });

    it('Ver levantamento abre o Levantamento do site; resposta fora de sim/nao aparece escapada; remontar zera o filtro', async () => {
        await abrir();
        window.otAssAbrir('4.2.1');
        const b = el('modal-content').querySelector('[data-action="otAssIrLevantamento"]');
        const [site, lev] = JSON.parse(b.dataset.args);
        window.otAssIrLevantamento(site, lev);
        expect(window.otTela).toHaveBeenCalledWith('site', 's1', 'levantamento', { otLevantamento: 'lv1' });
        const it = ITENS.itens[1]; const antes = it.subsidio[0].resposta;
        it.subsidio[0].resposta = 'talvez<b id="xss4">';
        await abrir(); window.otAssAbrir('4.2.1');
        expect(el('modal-content').textContent).toContain('talvez<b id="xss4">'); expect(el('xss4')).toBeNull();
        it.subsidio[0].resposta = antes;
        window.otAssFiltrar({ checked: true });
        await abrir();
        expect(el('ass-meus').checked).toBe(false);
    });
});
