// Tela Requisitos (fatia 2): fontes, requisitos, cobertura da LGPD e equivalências. api() REAL; só o fetch é dublado,
// com o corpo de cada handler (src/routes/requisitos.ts). A query string não entra na chave do dublê.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { servir } from './servir-api.js';

vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import { S } from '../src/state.js';
import '../src/ui.js';
import { selecionarLinhas, filtroEfetivo } from '../src/views/requisitos.js';

const FONTES = [
    { id: 'iso27001:2022', nome: 'ISO/IEC 27001:2022', versao: '2022', vigente_desde: null, requisitos: 93 },
    { id: 'lgpd', nome: 'Lei Geral de Proteção de Dados (Lei 13.709/2018)', versao: '2018', vigente_desde: null, requisitos: 3 },
    { id: 'gdpr', nome: 'GDPR', versao: '2016', vigente_desde: null, requisitos: 0 },
];
const LGPD = [
    { id: 'lgpd:art7', fonte_id: 'lgpd', referencia: 'art. 7', titulo: 'Bases <b>legais</b>', pai_id: null, papel: null },
    { id: 'lgpd:art37', fonte_id: 'lgpd', referencia: 'art. 37', titulo: 'Registro', pai_id: null, papel: null },
    { id: 'lgpd:art46', fonte_id: 'lgpd', referencia: 'art. 46', titulo: 'Segurança', pai_id: null, papel: null },
];
const LACUNAS = {
    fonte: 'lgpd',
    resumo: { total: 3, cobertos: 1, parciais: 1, lacunas: 1 },
    itens: [
        { requisito_id: 'lgpd:art7', referencia: 'art. 7', titulo: 'Bases', pai_id: null, situacao: 'lacuna', origens: [] },
        { requisito_id: 'lgpd:art37', referencia: 'art. 37', titulo: 'Registro', pai_id: null, situacao: 'parcial', origens: [{ tipo: 'controle', id: 'c1', titulo: 'A.5.2 — <i>x</i>', status: 'Implemented', mapeamento: 'parcial' }] },
        { requisito_id: 'lgpd:art46', referencia: 'art. 46', titulo: 'Segurança', pai_id: null, situacao: 'coberto', origens: [{ tipo: 'documento', id: 'd1', titulo: 'Política de <b>Acesso</b>' }, { tipo: 'evidencia', id: 'e1', titulo: 'x.pdf' }] },
    ],
};
const rotas = (extra = {}) => ({
    'GET /api/v1/requisitos/fontes': FONTES,
    'GET /api/v1/requisitos': LGPD,
    'GET /api/v1/projects/p9/requisitos/lacunas': LACUNAS,
    ...extra,
});
const chamadas = (f) => f.mock.calls.map(([u, o]) => `${o?.method || 'GET'} ${new URL(u, 'http://localhost').pathname}`);
const el = (id) => document.getElementById(id);

async function abrir() {
    document.body.innerHTML = '<h1 id="h"></h1><div id="a"></div><div id="c"></div><div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>';
    await window.renderRequisitos(el('c'), el('h'), el('a'));
}

beforeEach(() => {
    S.token = 'tok';
    S.user = { role: 'consultor' };
    S.activeProject = { id: 'p9' };
    S.fonteRequisitos = undefined;
    window.render = vi.fn();
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('lista', () => {
    it('abre na primeira fonte com requisitos (a ISO tem 93 e vem primeiro), sem coluna de cobertura', async () => {
        const f = servir(rotas({ 'GET /api/v1/requisitos': [{ id: 'iso27001:2022:A.5.1', fonte_id: 'iso27001:2022', referencia: 'A.5.1', titulo: 'Políticas', pai_id: null, papel: null }] }));
        await abrir();
        expect(el('req-fonte').value).toBe('iso27001:2022');
        expect(el('c').textContent).toContain('A.5.1');
        expect(el('c').textContent).not.toContain('Cobertura');
        expect(chamadas(f).some((k) => k.includes('/lacunas'))).toBe(false);
        // o n.iso segue catálogo puro: as mesmas quatro colunas de sempre, sem situação, filtro, busca nem explicação
        expect([...el('c').querySelectorAll('th')].map((t) => t.textContent)).toEqual(['Referência', 'Título', 'Papel', 'Ações']);
        expect(el('c').querySelector('.cob-resumo, .cob-como, #req-busca, #req-lista')).toBeNull();
    });

    it('na LGPD mostra a cobertura do projeto, o resumo e a origem, tudo escapado', async () => {
        S.fonteRequisitos = 'lgpd'; S.reqFiltro = 'todas';
        servir(rotas());
        await abrir();
        const t = el('c').textContent;
        expect(t).toContain('1 de 3 requisitos cobertos (33%)');
        expect(t).toContain('Como a cobertura é calculada');
        expect(t).toContain('Lacuna');
        expect(t).toContain('Parcial');
        expect(t).toContain('Coberto');
        expect(t).toContain('Documento: Política de <b>Acesso</b>');
        expect(t).toContain('Evidência: x.pdf');
        expect(t).not.toContain('Evidência ainda não entra na conta');
        expect(t).toContain('Controle: A.5.2 — <i>x</i>');
        expect(t).toContain('Bases <b>legais</b>');
        expect(el('c').querySelector('b')).toBeNull();
        expect(el('c').querySelector('i')).toBeNull();
    });

    it('fonte sem requisitos carregados: aviso, sem tabela', async () => {
        S.fonteRequisitos = 'gdpr';
        servir(rotas({ 'GET /api/v1/requisitos/fontes': FONTES.map((x) => ({ ...x, requisitos: x.id === 'gdpr' ? 0 : 0 })) }));
        await abrir();
        expect(el('c').textContent).toContain('Catálogo ainda não carregado');
        expect(el('c').querySelector('table')).toBeNull();
    });

    it('catálogo vazio: sem seletor de fonte; o admin tem o primário de carregar e os demais sabem a quem pedir', async () => {
        history.replaceState(null, '', '/privacy');
        try {
            const vazias = FONTES.map((x) => ({ ...x, requisitos: 0 }));
            S.user = { role: 'platform_admin' };
            servir(rotas({ 'GET /api/v1/requisitos/fontes': vazias }));
            await abrir();
            expect(el('req-fonte')).toBeNull();
            const carregar = el('c').querySelector('.empty-state [data-action="semearRequisitos"]');
            expect(carregar.className).toContain('btn-primary');
            expect(carregar.textContent).toBe('Carregar catálogo LGPD/ANPD');
            S.user = { role: 'consultor' };
            servir(rotas({ 'GET /api/v1/requisitos/fontes': vazias }));
            await abrir();
            expect(el('c').querySelector('[data-action="semearRequisitos"]')).toBeNull();
            expect(el('c').textContent).toContain('O catálogo é carregado pelo administrador da plataforma. Peça a ele para habilitar os requisitos da LGPD e da ANPD.');
        } finally { history.replaceState(null, '', '/'); }
    });

    it('trocar a fonte no seletor guarda a escolha e redesenha', async () => {
        servir(rotas());
        await abrir();
        window.escolherFonteRequisitos('lgpd');
        expect(S.fonteRequisitos).toBe('lgpd');
        expect(window.render).toHaveBeenCalled();
    });

    it('só o administrador da plataforma vê Carregar catálogo', async () => {
        servir(rotas());
        S.user = { role: 'platform_admin' };
        await abrir();
        expect(el('a').querySelector('[data-action="semearRequisitos"]').textContent).toBe('Carregar catálogo');
        S.user = { role: 'consultor' };
        await abrir();
        expect(el('a').innerHTML).toBe('');
    });

    it('sem projeto ativo a LGPD aparece sem cobertura, e a lista não quebra', async () => {
        S.fonteRequisitos = 'lgpd'; S.activeProject = null; S.projects = [];
        servir(rotas());
        await abrir();
        expect(el('c').textContent).toContain('art. 37');
        expect(el('c').textContent).not.toContain('Cobertura');
        expect(el('c').textContent).toContain('Selecione um projeto');
    });
});

describe('cobertura: filtro, busca e próximo passo', () => {
    const abrirLgpd = async () => { S.fonteRequisitos = 'lgpd'; await abrir(); };
    const refs = () => [...el('c').querySelectorAll('tbody th')].map((t) => t.textContent);
    beforeEach(() => { S.reqFiltro = undefined; S.reqBusca = ''; });

    it('abre nas lacunas, com o filtro marcado e o passo de cada lacuna', async () => {
        servir(rotas());
        await abrirLgpd();
        expect(refs()).toEqual(['art. 7']);
        expect(el('c').querySelector('.cob-cartao[aria-pressed="true"]').textContent).toContain('Lacunas');
        expect(el('c').querySelector('tbody [data-action="irParaDocumentos"]')).not.toBeNull();
        expect(el('c').querySelector('tbody').textContent).toContain('Nada ligado ainda');
        expect(el('c').textContent).toContain('Para cobrir uma lacuna, ligue a ela um documento vigente');
    });

    it('sem lacuna abre em Total; coberto não tem passo, parcial tem', async () => {
        servir(rotas({ 'GET /api/v1/projects/p9/requisitos/lacunas': { ...LACUNAS, resumo: { total: 3, cobertos: 2, parciais: 1, lacunas: 0 }, itens: LACUNAS.itens.map((i) => (i.situacao === 'lacuna' ? { ...i, situacao: 'coberto' } : i)) } }));
        await abrirLgpd();
        expect(el('c').querySelector('.cob-cartao[aria-pressed="true"]').textContent).toContain('Total');
        const linhas = [...el('c').querySelectorAll('tbody tr')];
        expect(linhas.map((l) => !!l.querySelector('[data-action="irParaDocumentos"]'))).toEqual([true, false, false]);
    });

    it('escolher a situação filtra sem nova chamada, guarda a escolha e marca só o cartão escolhido', async () => {
        const f = servir(rotas());
        await abrirLgpd();
        const n = f.mock.calls.length;
        window.filtrarRequisitos('parcial');
        expect(refs()).toEqual(['art. 37']);
        expect(S.reqFiltro).toBe('parcial');
        expect(el('c').querySelectorAll('.cob-cartao[aria-pressed="true"]').length).toBe(1);
        window.filtrarRequisitos('todas');
        expect(refs()).toEqual(['art. 7', 'art. 37', 'art. 46']);
        expect(f.mock.calls.length).toBe(n);
    });

    it('a busca ignora caixa e acento, olha o título da origem e não troca o campo de busca', async () => {
        servir(rotas());
        S.reqFiltro = 'todas';
        await abrirLgpd();
        const campo = el('req-busca');
        window.buscarRequisitos('SEGURANCA');
        expect(refs()).toEqual(['art. 46']);
        window.buscarRequisitos('registro');
        expect(refs()).toEqual(['art. 37']);
        window.buscarRequisitos('ACESSO');
        expect(refs()).toEqual(['art. 46']);
        expect(el('req-busca')).toBe(campo);
    });

    it('sem resultado: mensagem e "Limpar filtros" volta a lista inteira', async () => {
        servir(rotas());
        await abrirLgpd();
        window.buscarRequisitos('zzz');
        expect(el('c').textContent).toContain('Nenhum requisito com este filtro');
        window.limparFiltrosRequisitos();
        expect(refs()).toEqual(['art. 7', 'art. 37', 'art. 46']);
        expect(el('req-busca').value).toBe('');
    });

    it('a lei sem lacuna celebra em vez de mostrar tabela vazia', async () => {
        const todas = LACUNAS.itens.map((i) => ({ ...i, situacao: 'coberto' }));
        servir(rotas({ 'GET /api/v1/projects/p9/requisitos/lacunas': { ...LACUNAS, resumo: { total: 3, cobertos: 3, parciais: 0, lacunas: 0 }, itens: todas } }));
        await abrirLgpd();
        window.filtrarRequisitos('lacuna');
        expect(el('c').textContent).toContain('Nenhuma lacuna');
        expect(el('c').querySelector('table')).toBeNull();
    });

    it('falha ao carregar a cobertura mostra o erro com "Tentar de novo"', async () => {
        const { 'GET /api/v1/projects/p9/requisitos/lacunas': _fora, ...semLacunas } = rotas();
        servir(semLacunas);
        vi.spyOn(console, 'error').mockImplementation(() => {});
        await abrirLgpd();
        expect(el('c').textContent).toContain('Não foi possível carregar a cobertura do projeto.');
        expect(el('c').textContent).toContain('Tentar de novo');
    });
});

describe('selecionarLinhas e filtroEfetivo', () => {
    const reqs = [{ id: 'a', referencia: 'art. 1', titulo: 'A' }, { id: 'b', referencia: 'art. 2', titulo: 'B' }, { id: 'c', referencia: 'art. 3', titulo: 'C' }, { id: 'd', referencia: 'art. 4', titulo: 'D' }];
    const cob = new Map([['a', { situacao: 'coberto', origens: [] }], ['b', { situacao: 'lacuna', origens: [] }], ['c', { situacao: 'parcial', origens: [] }], ['d', { situacao: 'lacuna', origens: [] }]]);
    it('ordena lacuna, parcial, coberto e mantém a ordem do catálogo no empate', () => {
        expect(selecionarLinhas(reqs, cob, 'todas', '').map((l) => l.r.id)).toEqual(['b', 'd', 'c', 'a']);
    });
    it('requisito sem cobertura só aparece em todas, no fim', () => {
        const so = new Map([['b', { situacao: 'lacuna', origens: [] }]]);
        expect(selecionarLinhas(reqs, so, 'todas', '').map((l) => l.r.id)).toEqual(['b', 'a', 'c', 'd']);
        expect(selecionarLinhas(reqs, so, 'lacuna', '').map((l) => l.r.id)).toEqual(['b']);
    });
    it('filtroEfetivo: o escolhido vale; senão lacunas se houver, senão todas; valor estranho é ignorado', () => {
        expect(filtroEfetivo('coberto', { lacunas: 5 })).toBe('coberto');
        expect(filtroEfetivo(undefined, { lacunas: 5 })).toBe('lacuna');
        expect(filtroEfetivo(undefined, { lacunas: 0 })).toBe('todas');
        expect(filtroEfetivo('xyz', { lacunas: 0 })).toBe('todas');
    });
});

describe('ações', () => {
    it('carregar catálogo chama o seed e avisa quantos', async () => {
        const f = servir(rotas({ 'POST /api/v1/requisitos/semear': { ok: true, fontes: 4, requisitos: 160, controles_ligados: 12 } }));
        await window.semearRequisitos();
        expect(chamadas(f)).toContain('POST /api/v1/requisitos/semear');
        expect(document.body.textContent).toContain('160 requisitos criados, 12 controles ligados');
    });

    it('abrir requisito mostra as equivalências; proposto com selo, validado com quem e quando; tudo escapado', async () => {
        servir(rotas({
            'GET /api/v1/requisitos/lgpd%3Aart37': {
                ...LGPD[1],
                mapeamentos: [
                    { de_id: 'iso27001:2022:A.5.2', para_id: 'lgpd:art37', tipo: 'parcial', estado: 'validado_juridico', validado_por: 'Dra. <b>X</b>', validado_em: '2026-10-01', nota: 'nota <i>n</i>' },
                    { de_id: 'lgpd:art37', para_id: 'iso27701:2025:A.1.2.6', tipo: 'equivalente', estado: 'proposto', validado_por: null, validado_em: null, nota: null },
                ],
            },
        }));
        await abrir();
        await window.abrirRequisito('lgpd:art37');
        const m = el('modal-content');
        expect(m.textContent).toContain('iso27001:2022:A.5.2');
        expect(m.textContent).toContain('iso27701:2025:A.1.2.6');
        expect(m.textContent).toContain('Validado por Dra. <b>X</b> em 01/10/2026');
        expect(m.textContent).toContain('Proposto');
        expect(m.querySelector('b')).toBeNull();
        expect(m.querySelector('i')).toBeNull();
    });

    it('requisito sem equivalência: mensagem', async () => {
        servir(rotas({ 'GET /api/v1/requisitos/lgpd%3Aart7': { ...LGPD[0], mapeamentos: [] } }));
        await abrir();
        await window.abrirRequisito('lgpd:art7');
        expect(el('modal-content').textContent).toContain('Nenhuma equivalência registrada');
    });
});

describe('validação dos mapeamentos', () => {
    const MAP = { de_id: 'lgpd:art37', para_id: 'iso27701:2025:A.1.2.6', tipo: 'equivalente', estado: 'proposto', validado_por: null, validado_em: null, nota: null };
    const REQ = { ...LGPD[1], mapeamentos: [MAP] };
    const GET = 'GET /api/v1/requisitos/lgpd%3Aart37';
    const corpos = (f, m) => f.mock.calls.filter(([, o]) => o?.method === m);

    it('administrador vê validar e recusar no proposto; org_user não', async () => {
        servir(rotas({ [GET]: REQ }));
        S.user = { role: 'platform_admin', name: 'Ana Jurídico' };
        await abrir(); await window.abrirRequisito('lgpd:art37');
        expect(el('modal-content').querySelector('[data-action="validarMapeamento"]')).not.toBeNull();
        expect(el('modal-content').querySelector('[data-action="recusarMapeamento"]')).not.toBeNull();
        S.user = { role: 'org_user' };
        await window.abrirRequisito('lgpd:art37');
        expect(el('modal-content').querySelector('[data-action="validarMapeamento"]')).toBeNull();
        expect(el('modal-content').querySelector('[data-action="recusarMapeamento"]')).toBeNull();
    });

    it('validar envia PUT sem validador nem data (quem valida é a sessão) e reabre', async () => {
        const f = servir(rotas({ [GET]: REQ, 'PUT /api/v1/requisitos/mapeamentos': { ok: true } }));
        S.user = { role: 'platform_admin', name: 'Ana Jurídico' };
        await abrir();
        await window.validarMapeamento(MAP.de_id, MAP.para_id, 'equivalente', 'lgpd:art37', 'nota <b>jurídica</b>');
        const [[, o]] = corpos(f, 'PUT');
        expect(JSON.parse(o.body)).toEqual({ de_id: MAP.de_id, para_id: MAP.para_id, tipo: 'equivalente', estado: 'validado_juridico', nota: 'nota <b>jurídica</b>' });
        expect(chamadas(f).filter((k) => k === `GET ${new URL('/api/v1/requisitos/lgpd%3Aart37', 'http://localhost').pathname}`).length).toBe(1);
    });

    it('recusar só apaga depois de Confirmar recusa', async () => {
        const f = servir(rotas({ [GET]: REQ, 'DELETE /api/v1/requisitos/mapeamentos': { ok: true } }));
        S.user = { role: 'platform_admin', name: 'Ana' };
        await abrir();
        await window.recusarMapeamento(MAP.de_id, MAP.para_id, 'lgpd:art37');
        expect(corpos(f, 'DELETE').length).toBe(0);
        const b = [...el('modal-content').querySelectorAll('button')].find((x) => x.textContent === 'Confirmar recusa');
        expect(b).toBeTruthy();
        await window[b.dataset.action](...JSON.parse(b.dataset.args));
        const [[u]] = corpos(f, 'DELETE');
        expect(new URL(u, 'http://localhost').searchParams.get('de')).toBe(MAP.de_id);
        expect(new URL(u, 'http://localhost').searchParams.get('para')).toBe(MAP.para_id);
    });

    it('o botão Validar leva a nota do mapeamento; reabrir a janela descarta a recusa pendente', async () => {
        servir(rotas({ [GET]: { ...REQ, mapeamentos: [{ ...MAP, nota: 'n1' }] } }));
        S.user = { role: 'platform_admin', name: 'Ana' };
        await abrir(); await window.abrirRequisito('lgpd:art37');
        expect(JSON.parse(el('modal-content').querySelector('[data-action="validarMapeamento"]').dataset.args)[4]).toBe('n1');
        await window.recusarMapeamento(MAP.de_id, MAP.para_id, 'lgpd:art37');
        expect(el('modal-content').textContent).toContain('Confirmar recusa');
        await window.abrirRequisito('lgpd:art37');
        expect(el('modal-content').textContent).not.toContain('Confirmar recusa');
    });

    it('validado mostra quem e quando (DD/MM/AAAA) e nenhum botão', async () => {
        servir(rotas({ [GET]: { ...REQ, mapeamentos: [{ ...MAP, estado: 'validado_juridico', validado_por: 'Ana', validado_em: '2026-10-01' }] } }));
        S.user = { role: 'platform_admin', name: 'Ana' };
        await abrir(); await window.abrirRequisito('lgpd:art37');
        expect(el('modal-content').textContent).toContain('Validado por Ana em 01/10/2026');
        expect(el('modal-content').querySelector('button[data-action$="Mapeamento"]')).toBeNull();
    });
});

describe('requisito não aplicável (migration 0107)', () => {
    const NA = {
        fonte: 'lgpd',
        resumo: { total: 1, cobertos: 0, parciais: 0, lacunas: 1, nao_aplicaveis: 2 },
        itens: [
            { requisito_id: 'lgpd:art7', referencia: 'art. 7', titulo: 'Bases', pai_id: null, situacao: 'nao_aplicavel', origens: [{ tipo: 'documento', id: 'd1', titulo: 'Política' }],
                exclusao: { justificativa: 'Empresa <b>privada</b>, sem tratamento público', decidido_por: 'cons@ness.lat', decidido_em: '2026-11-09 12:00:00' } },
            { requisito_id: 'lgpd:art37', referencia: 'art. 37', titulo: 'Registro', pai_id: 'lgpd:art7', situacao: 'nao_aplicavel', origens: [],
                exclusao: { justificativa: 'Empresa privada, sem tratamento público', decidido_por: 'cons@ness.lat', decidido_em: '2026-11-09 12:00:00', herdada_de: 'art. 7' } },
            { requisito_id: 'lgpd:art46', referencia: 'art. 46', titulo: 'Segurança', pai_id: null, situacao: 'lacuna', origens: [] },
        ],
    };
    const linha = (ref) => [...el('c').querySelectorAll('tbody tr')].find((tr) => tr.querySelector('th').textContent === ref);

    beforeEach(() => { S.fonteRequisitos = 'lgpd'; S.reqFiltro = 'todas'; window.ehEquipeNess = () => ['consultor', 'platform_admin'].includes(S.user.role); });

    it('cartão e filtro "Não aplicáveis"; a justificativa, o autor e a data na linha; herdada diz de onde; sem "Ir a Documentos"', async () => {
        servir(rotas({ 'GET /api/v1/projects/p9/requisitos/lacunas': NA }));
        await abrir();
        const cartao = [...el('c').querySelectorAll('.cob-cartao')].find((b) => b.textContent.includes('Não aplicáveis'));
        expect(cartao.textContent).toContain('2');
        expect(el('cob-resumo-t').textContent).toContain('0 de 1 requisitos cobertos');
        const art7 = linha('art. 7');
        expect(art7.textContent).toContain('Não aplicável');
        expect(art7.textContent).toContain('Empresa <b>privada</b>');
        expect(art7.textContent).toContain('cons@ness.lat');
        expect(art7.textContent).toContain('Ligado antes da exclusão');
        expect(art7.querySelector('b')).toBeNull();
        expect(art7.querySelector('[data-action="irParaDocumentos"]')).toBeNull();
        expect(linha('art. 37').textContent).toContain('Herdada de art. 7');
        window.filtrarRequisitos('nao_aplicavel');
        expect([...el('c').querySelectorAll('tbody th')].map((th) => th.textContent)).toEqual(['art. 7', 'art. 37']);
        expect(el('c').querySelector('.cob-contagem').textContent).toBe('2 requisitos de 3'); // o "de M" conta todos, como o cartão Total
    });

    it('as resoluções da ANPD também mostram a cobertura do projeto (e, com ela, a aplicabilidade)', async () => {
        S.fonteRequisitos = 'anpd';
        const f = servir(rotas({ 'GET /api/v1/requisitos/fontes': [...FONTES, { id: 'anpd', nome: 'Resoluções da ANPD', versao: '2026', vigente_desde: null, requisitos: 3 }],
            'GET /api/v1/projects/p9/requisitos/lacunas': { ...NA, fonte: 'anpd' } }));
        await abrir();
        expect(chamadas(f)).toContain('GET /api/v1/projects/p9/requisitos/lacunas');
        expect(el('c').querySelector('.cob-resumo')).not.toBeNull();
    });

    it('a equipe marca (com 20+ caracteres) e volta a aplicar; herdado e cliente não têm botão', async () => {
        const f = servir(rotas({ 'GET /api/v1/projects/p9/requisitos/lacunas': NA,
            'GET /api/v1/requisitos/lgpd%3Aart46': { ...LGPD[2], mapeamentos: [] }, 'GET /api/v1/requisitos/lgpd%3Aart37': { ...LGPD[1], mapeamentos: [] },
            'GET /api/v1/requisitos/lgpd%3Aart7': { ...LGPD[0], mapeamentos: [] },
            'PUT /api/v1/projects/p9/requisitos/lgpd%3Aart46/exclusao': { ok: true }, 'DELETE /api/v1/projects/p9/requisitos/lgpd%3Aart7/exclusao': { ok: true } }));
        await abrir();
        await window.abrirRequisito('lgpd:art37');
        expect(el('req-aplicabilidade').textContent).toContain('Herdada de art. 7');
        expect(el('req-aplicabilidade').querySelector('button')).toBeNull();
        await window.abrirRequisito('lgpd:art46');
        expect(el('req-aplicabilidade').querySelector('[data-action="marcarRequisitoNaoAplicavel"]')).not.toBeNull();
        const pedir = vi.spyOn(window, 'pedirTexto').mockResolvedValueOnce('curto').mockResolvedValueOnce('  Artigo dirigido ao poder público.  ');
        await window.marcarRequisitoNaoAplicavel('lgpd:art46');
        expect(chamadas(f)).not.toContain('PUT /api/v1/projects/p9/requisitos/lgpd%3Aart46/exclusao');
        await window.marcarRequisitoNaoAplicavel('lgpd:art46');
        expect(pedir).toHaveBeenCalledTimes(2);
        const put = f.mock.calls.find(([u, o]) => o?.method === 'PUT');
        expect(JSON.parse(put[1].body)).toEqual({ justificativa: 'Artigo dirigido ao poder público.' });
        vi.spyOn(window, 'confirmar').mockResolvedValue(true);
        await window.voltarAAplicarRequisito('lgpd:art7');
        expect(chamadas(f)).toContain('DELETE /api/v1/projects/p9/requisitos/lgpd%3Aart7/exclusao');
        S.user = { role: 'org_admin' };
        await window.abrirRequisito('lgpd:art46');
        expect(el('req-aplicabilidade').querySelector('button')).toBeNull();
    });
});
