// n.ot, N2–N4 (spec 2026-10-30-n-ot-modulo-n360-design §5, §7, §8): as abas da casca /ot sobre as rotas reais de
// src/routes/ot.ts e src/routes/ot-saidas.ts. api() REAL; só o fetch é dublado, com os corpos que os handlers devolvem.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resposta } from './servir-api.js';

vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import { S } from '../src/state.js';
import '../src/ui.js';
import '../src/views/ot.js';
import { montarSite, montarSites, resolverDesvio, SUBS } from '../src/views/ot-site.js';
import { desenhar } from './ot-abrir.js';

const B = '/api/v1/projects/p9/ot';
const el = (id) => document.getElementById(id);
const texto = () => el('c').textContent;
const acoes = (raiz = document) => [...raiz.querySelectorAll('[data-action]')].map((b) => b.getAttribute('data-action'));

// Corpos de src/routes/ot.ts (GET /sites, /zonas, /ativos; serializarAtivo em services/ot-inventario.ts).
const SITE = { id: 's1', nome: 'SE Norte <b id="xss">x</b>', tipo: 'subestacao', criticidade: 'alta', localizacao: null, status: 'ativo' };
const ZONAS = [{ id: 'z2', site_id: 's1', nome: 'Supervisão', nivel_purdue: 2, tipo: 'supervisao', descricao: null, status: 'ativo' },
    { id: 'z3', site_id: 's1', nome: 'DMZ', nivel_purdue: 3, tipo: 'dmz_operativa', descricao: null, status: 'ativo' }];
const ativo = (id, nome, zona_id, extra = {}) => ({ id, project_id: 'p9', site_id: 's1', zona_id, nome, no_arciber: true, categoria_arciber: 'centro_operacao',
    tipo_dispositivo: 'RTU', fabricante: 'ACME', modelo: 'X1', funcao: 'Telecontrole', firmware_so_versao: '1.2', firmware_nao_aplicavel: false,
    ultima_verificacao_em: null, verificado_por: null, status: 'ativo', protocolos_portas: [{ protocolo: 'DNP3', porta: 20000 }],
    ip: '•••', mac: 'aa:bb:cc:••:••:••', mascarado: true, ...extra });
const ATIVOS = [ativo('a1', 'RTU-01', 'z2'), ativo('a2', 'IHM-02', 'z3')];

let chamadas;
function servirOt(rotas, falhas = {}) {
    chamadas = [];
    const f = vi.fn(async (url, opts = {}) => {
        const u = new URL(url, 'http://localhost');
        const k = `${opts.method || 'GET'} ${u.pathname}`;
        chamadas.push({ k, url: u, opts });
        if (k in falhas) return resposta(falhas[k][1], falhas[k][0]);
        return k in rotas ? resposta(typeof rotas[k] === 'function' ? rotas[k](u, opts) : rotas[k]) : resposta({ error: `API route not found: ${k}` }, 404);
    });
    vi.stubGlobal('fetch', f);
    return f;
}
const INVENTARIO = { [`GET ${B}/sites`]: { sites: [SITE] }, [`GET ${B}/zonas`]: { zonas: ZONAS }, [`GET ${B}/ativos`]: { ativos: ATIVOS } };

async function abrir(aba) {
    await desenhar(aba);
}
const pausa = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
    document.body.innerHTML = '<h1 id="h"></h1><div id="a"></div><div id="c"></div>'
        + '<div id="modal-overlay"><div id="modal"><div id="modal-content"></div></div></div>';
    S.token = 'tok';
    S.user = { id: 'u-gestor', email: 'gestor@cliente.com', role: 'org_admin' };
    S.activeProject = { id: 'p9', modulos: ['ot'] };
    S.otSite = null; S.otZona = null; S.otLote = null;
    window.render = vi.fn();
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('inventário', () => {
    it('lista sites, zonas e ativos, com IP/MAC como a API devolve e todo texto escapado', async () => {
        servirOt(INVENTARIO);
        await abrir('inventario');
        expect(el('xss')).toBeNull();
        expect(texto()).toContain('SE Norte <b id="xss">x</b>');
        expect(texto()).toContain('RTU-01');
        expect(texto()).toContain('•••');
        expect(texto()).toContain('aa:bb:cc:••:••:••');
        expect(texto()).toContain('Supervisão');
    });

    it('site: faixas internas vão como array (uma por linha, vazias fora); editar mostra as gravadas; erro do servidor aparece', async () => {
        servirOt({ ...INVENTARIO, [`POST ${B}/sites`]: { id: 's2' }, [`PUT ${B}/sites/s1`]: { ok: true } });
        await abrir('inventario');
        window.otNovoSite();
        el('ot-s-nome').value = 'SE Leste';
        el('ot-s-faixas').value = ' 200.10.0.0/24 \n\n2001:db8::/32\n';
        await window.otSalvarSite('');
        expect(JSON.parse(chamadas.find((x) => x.k === `POST ${B}/sites`).opts.body).faixas_internas).toEqual(['200.10.0.0/24', '2001:db8::/32']);
        {
            servirOt({ [`GET ${B}/sites`]: { sites: [{ ...SITE, faixas_internas: ['200.10.0.0/24', '200.11.0.0/24'] }] }, [`GET ${B}/zonas`]: { zonas: ZONAS }, [`GET ${B}/ativos`]: { ativos: ATIVOS } },
                { [`PUT ${B}/sites/s1`]: [400, { error: 'Faixa inválida: use CIDR, como 200.10.0.0/24' }] });
            await abrir('inventario');
            window.otEditarSite('s1');
            expect(el('ot-s-faixas').value).toBe('200.10.0.0/24\n200.11.0.0/24');
            el('ot-s-faixas').value = 'x';
            await window.otSalvarSite('s1');
            expect(JSON.parse(chamadas.find((x) => x.k === `PUT ${B}/sites/s1`).opts.body).faixas_internas).toEqual(['x']);
            expect(document.body.textContent).toContain('Faixa inválida: use CIDR, como 200.10.0.0/24');
        }
    });

    it('filtro por site vai à API (?site_id=); filtro por zona recorta a lista carregada', async () => {
        servirOt(INVENTARIO);
        S.otSite = 's1';
        await abrir('inventario');
        const ativos = chamadas.find((x) => x.k === `GET ${B}/ativos`);
        expect(ativos.url.searchParams.get('site_id')).toBe('s1');
        S.otZona = 'z3';
        await abrir('inventario');
        expect(texto()).toContain('IHM-02');
        expect(texto()).not.toContain('RTU-01');
    });

    it('trocar de projeto zera os filtros de site e zona e o lote aberto: o projeto B não abre vazio pelo filtro do A', async () => {
        servirOt(INVENTARIO);
        S.otProjeto = 'p9';
        await abrir('inventario');
        window.otFiltrarSite('s1');
        window.otFiltrarZona('z2');
        S.otLote = 'l-do-a';
        const B2 = '/api/v1/projects/p8/ot';
        S.activeProject = { id: 'p8', modulos: ['ot'] };
        servirOt({ [`GET ${B2}/sites`]: { sites: [{ ...SITE, id: 's8', nome: 'SE Sul' }] }, [`GET ${B2}/zonas`]: { zonas: [] },
            [`GET ${B2}/ativos`]: { ativos: [{ ...ATIVOS[0], id: 'a8', site_id: 's8', zona_id: null, nome: 'RTU-SUL' }] } });
        await window.renderOt(el('c'), el('h'), el('a')); // a casca vê o projeto novo e zera o estado
        expect([S.otSite, S.otZona, S.otLote]).toEqual([null, null, null]);
        await abrir('inventario');
        expect(chamadas.filter((x) => /\/(zonas|ativos)$/.test(x.k)).map((x) => x.url.search)).toEqual(['', '']);
        expect(texto()).toContain('RTU-SUL');
        expect([S.otSite, S.otZona, S.otLote]).toEqual([null, null, null]);
    });

    it('client e org_user não veem criar, editar nem remover', async () => {
        for (const role of ['client', 'org_user']) {
            S.user = { id: 'u', role };
            servirOt(INVENTARIO);
            await abrir('inventario');
            const todas = [...acoes(el('a')), ...acoes(el('c'))];
            for (const a of ['otNovoAtivo', 'otNovoSite', 'otNovaZona', 'otEditarAtivo', 'otRemover', 'otRevelar', 'otSugerirZona']) expect(todas, `${role} ${a}`).not.toContain(a);
        }
    });

    it('quem edita tem novo ativo (principal) e, por linha, editar e o menu com remover', async () => {
        servirOt(INVENTARIO);
        await abrir('inventario');
        expect(el('a').querySelectorAll('.btn-primary').length).toBe(1);
        expect(acoes(el('a'))).toContain('otNovoAtivo');
        expect(acoes(el('c'))).toContain('otEditarAtivo');
        expect(acoes(el('c'))).toContain('otRemover');
    });

    it('criar ativo manda só os campos do esquema (4.3.1), com protocolos lidos e IP/MAC só se digitados', async () => {
        const f = servirOt({ ...INVENTARIO, [`POST ${B}/ativos`]: { ok: true, id: 'a9' } });
        await abrir('inventario');
        window.otNovoAtivo();
        el('ot-f-site').value = 's1';
        el('ot-f-nome').value = 'RTU-09';
        el('ot-f-arciber').checked = true;
        el('ot-f-categoria').value = 'centro_operacao';
        el('ot-f-tipo').value = 'RTU';
        el('ot-f-fabricante').value = 'ACME';
        el('ot-f-funcao').value = 'Telecontrole';
        el('ot-f-ip').value = '10.0.0.9';
        el('ot-f-protocolos').value = 'DNP3:20000, Modbus';
        el('ot-f-firmware-na').checked = true;
        await window.otSalvarAtivo('');
        const post = chamadas.find((x) => x.k === `POST ${B}/ativos`);
        expect(JSON.parse(post.opts.body)).toEqual({
            site_id: 's1', nome: 'RTU-09', zona_id: null, no_arciber: true, categoria_arciber: 'centro_operacao', tipo_dispositivo: 'RTU',
            fabricante: 'ACME', modelo: null, funcao: 'Telecontrole', protocolos_portas: [{ protocolo: 'DNP3', porta: 20000 }, { protocolo: 'Modbus' }],
            firmware_so_versao: null, firmware_nao_aplicavel: true, ip: '10.0.0.9',
        });
        expect(f).toHaveBeenCalled();
    });

    it('editar não preenche IP/MAC com o valor mascarado nem o devolve ao servidor', async () => {
        servirOt({ ...INVENTARIO, [`PUT ${B}/ativos/a1`]: { ok: true } });
        await abrir('inventario');
        window.otEditarAtivo('a1');
        expect(el('ot-f-ip').value).toBe('');
        expect(el('ot-f-mac').value).toBe('');
        await window.otSalvarAtivo('a1');
        const corpo = JSON.parse(chamadas.find((x) => x.k === `PUT ${B}/ativos/a1`).opts.body);
        expect(corpo).not.toHaveProperty('ip');
        expect(corpo).not.toHaveProperty('mac');
        expect(corpo.nome).toBe('RTU-01');
    });

    it('remover é exclusão lógica (DELETE) depois da confirmação', async () => {
        servirOt({ ...INVENTARIO, [`DELETE ${B}/ativos/a1`]: { ok: true } });
        await abrir('inventario');
        const p = window.otRemover('ativos', 'a1');
        await pausa();
        document.querySelector('[data-confirmar="sim"]').click();
        await p;
        expect(chamadas.some((x) => x.k === `DELETE ${B}/ativos/a1`)).toBe(true);
    });
});

describe('aviso de IP ou MAC faltando (decisão do dono: o 4.3.1 pede um dos dois)', () => {
    it('mostra "Falta MAC" e "Falta IP" sem esconder o que existe', async () => {
        S.user = { id: 'g', role: 'org_admin' };
        servirOt({ ...INVENTARIO, [`GET ${B}/ativos`]: { ativos: [
            ativo('a1', 'RTU-01', 'z2', { ip: '10.0.0.1', mac: null, mascarado: false }),
            ativo('a2', 'SW-02', 'z2', { ip: null, mac: 'aa:bb:cc:dd:ee:ff', mascarado: false }),
        ] } });
        await abrir('inventario');
        expect(texto()).toContain('Falta MAC');
        expect(texto()).toContain('Falta IP');
        expect(texto()).toContain('10.0.0.1');
        expect(texto()).toContain('aa:bb:cc:dd:ee:ff');
    });
});

describe('revelar IP/MAC', () => {
    it('só para o platform_admin e só em ativo mascarado; quem já vê completo não tem o botão', async () => {
        S.user = { id: 'pa', role: 'platform_admin' };
        servirOt(INVENTARIO);
        await abrir('inventario');
        expect(acoes(el('c'))).toContain('otRevelar');
        S.user = { id: 'g', role: 'org_admin' };
        servirOt({ ...INVENTARIO, [`GET ${B}/ativos`]: { ativos: [ativo('a1', 'RTU-01', 'z2', { ip: '10.0.0.1', mac: 'aa:bb:cc:dd:ee:ff', mascarado: false })] } });
        await abrir('inventario');
        expect(acoes(el('c'))).not.toContain('otRevelar');
        expect(texto()).toContain('10.0.0.1');
    });

    it('pede justificativa (obrigatória), mostra o valor só no modal e o apaga depois; nada vai a storage nem ao endereço', async () => {
        S.user = { id: 'pa', role: 'platform_admin' };
        servirOt({ ...INVENTARIO, [`POST ${B}/ativos/a1/revelar`]: ativo('a1', 'RTU-01', 'z2', { ip: '10.9.8.7', mac: 'aa:bb:cc:dd:ee:ff', mascarado: false }) });
        await abrir('inventario');
        const grava = vi.spyOn(Storage.prototype, 'setItem');
        const curto = window.otRevelar('a1');
        await pausa();
        document.querySelector('.confirmar input').value = 'curto';
        document.querySelector('[data-confirmar="sim"]').click();
        await curto;
        expect(chamadas.some((x) => x.k === `POST ${B}/ativos/a1/revelar`)).toBe(false);

        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        const p = window.otRevelar('a1');
        await Promise.resolve();
        document.querySelector('.confirmar input').value = 'Auditoria de campo do ONS';
        document.querySelector('[data-confirmar="sim"]').click();
        await p;
        const post = chamadas.find((x) => x.k === `POST ${B}/ativos/a1/revelar`);
        expect(JSON.parse(post.opts.body)).toEqual({ justificativa: 'Auditoria de campo do ONS' });
        expect(el('ot-revelado').textContent).toContain('10.9.8.7');
        expect(texto()).not.toContain('10.9.8.7');
        vi.advanceTimersByTime(30000);
        expect(el('ot-revelado')).toBeNull();
        expect(document.body.innerHTML).not.toContain('10.9.8.7');
        expect(grava).not.toHaveBeenCalled();
        expect(window.location.href).not.toContain('10.9.8.7');
    });

    it('o tempo de um "Revelar" antigo não fecha o modal do seguinte', async () => {
        S.user = { id: 'pa', role: 'platform_admin' };
        servirOt({ ...INVENTARIO, [`POST ${B}/ativos/a1/revelar`]: ativo('a1', 'RTU-01', 'z2', { ip: '10.9.8.7', mascarado: false }),
            [`POST ${B}/ativos/a2/revelar`]: ativo('a2', 'IHM-02', 'z3', { ip: '10.1.1.2', mascarado: false }) });
        await abrir('inventario');
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        const revelar = async (id) => {
            const p = window.otRevelar(id);
            await Promise.resolve();
            document.querySelector('.confirmar input').value = 'Auditoria de campo do ONS';
            document.querySelector('[data-confirmar="sim"]').click();
            await p;
        };
        await revelar('a1');
        vi.advanceTimersByTime(20000);
        await revelar('a2');
        vi.advanceTimersByTime(15000);
        expect(el('ot-revelado').textContent).toContain('10.1.1.2');
        vi.advanceTimersByTime(15000);
        expect(el('ot-revelado')).toBeNull();
    });
});

describe('IA: rascunho que a pessoa confirma', () => {
    it('sugestão de zona não grava; aplicar é um PUT só da zona, depois do clique', async () => {
        servirOt({ ...INVENTARIO,
            [`POST ${B}/ia/zona-sugerida`]: { rascunho: true, nivel_purdue: 3, zona_id: 'z3', zona_nome: 'DMZ', justificativa: 'Servidor de dados.' },
            [`PUT ${B}/ativos/a1`]: { ok: true } });
        await abrir('inventario');
        await window.otSugerirZona('a1');
        expect(el('modal-content').textContent).toContain('Rascunho');
        expect(el('modal-content').textContent).toContain('DMZ');
        expect(chamadas.some((x) => x.k === `PUT ${B}/ativos/a1`)).toBe(false);
        await window.otAplicarZona('a1', 'z3');
        expect(JSON.parse(chamadas.find((x) => x.k === `PUT ${B}/ativos/a1`).opts.body)).toEqual({ zona_id: 'z3' });
    });

    it('checagem de completude mostra o que falta e leva ao formulário sem salvar', async () => {
        servirOt({ ...INVENTARIO, [`POST ${B}/ia/completude`]: { rascunho: true,
            campos: { tipo_dispositivo: 'RTU', fabricante: 'ACME', modelo: null, funcao: null, ip: '10.0.0.5', mac: null, hostname: null, protocolos_portas: [{ protocolo: 'DNP3', porta: 20000 }], firmware_so_versao: null },
            faltando: ['Função', 'Firmware/SO'], completo: false, texto_apoio: 'Colete a função e o firmware.' } });
        await abrir('inventario');
        window.otRascunhoIa();
        el('ot-ia-desc').value = 'RTU ACME em 10.0.0.5 falando DNP3 na 20000';
        await window.otChecarCompletude();
        expect(el('modal-content').textContent).toContain('Função');
        expect(el('modal-content').textContent).toContain('Firmware/SO');
        window.otUsarRascunho();
        expect(el('ot-f-tipo').value).toBe('RTU');
        expect(el('ot-f-ip').value).toBe('10.0.0.5');
        expect(chamadas.some((x) => x.k === `POST ${B}/ativos`)).toBe(false);
    });
});

describe('fluxos', () => {
    // GET /fluxos (comViolacao em src/routes/ot.ts): booleanos e `violacoes`.
    const FLUXOS = [
        { id: 'f1', site_id: 's1', origem_ativo_id: 'a1', origem_zona_id: null, destino_ativo_id: null, destino_zona_id: null, protocolo: 'HTTPS', porta: 443, direcao: 'unidirecional', finalidade: null, externo: true, via_vpn: false, violacoes: ['4.1.2', '4.1.3'] },
        { id: 'f2', site_id: 's1', origem_ativo_id: null, origem_zona_id: 'z2', destino_ativo_id: null, destino_zona_id: 'z3', protocolo: 'DNP3', porta: 20000, direcao: 'bidirecional', finalidade: null, externo: false, via_vpn: false, violacoes: [] },
    ];
    it('destaca o fluxo externo sem VPN com os itens que ele viola', async () => {
        servirOt({ ...INVENTARIO, [`GET ${B}/fluxos`]: { fluxos: FLUXOS } });
        await abrir('fluxos');
        const linhas = [...el('c').querySelectorAll('tbody tr')];
        expect(linhas[0].textContent).toContain('externo sem VPN');
        expect(linhas[0].textContent).toContain('4.1.2');
        expect(linhas[0].querySelector('.selo-danger')).toBeTruthy();
        expect(linhas[1].textContent).not.toContain('4.1.2');
        expect(linhas[0].textContent).toContain('RTU-01');
    });
    it('criar manda as pontas (ativo ou zona) e avisa a violação devolvida', async () => {
        servirOt({ ...INVENTARIO, [`GET ${B}/fluxos`]: { fluxos: [] }, [`POST ${B}/fluxos`]: { ok: true, id: 'f9', violacoes: ['4.1.2', '4.1.3'] } });
        await abrir('fluxos');
        window.otNovoFluxo();
        el('ot-fl-site').value = 's1';
        el('ot-fl-origem').value = 'ativo:a1';
        el('ot-fl-destino').value = '';
        el('ot-fl-externo').checked = true;
        el('ot-fl-protocolo').value = 'HTTPS';
        el('ot-fl-porta').value = '443';
        await window.otSalvarFluxo();
        expect(JSON.parse(chamadas.find((x) => x.k === `POST ${B}/fluxos`).opts.body)).toEqual({
            site_id: 's1', origem_ativo_id: 'a1', protocolo: 'HTTPS', porta: 443, direcao: 'unidirecional', finalidade: null, externo: true, via_vpn: false,
        });
        expect(document.body.textContent).toContain('4.1.2');
    });
});

describe('acesso por site', () => {
    it('lista, concede ao técnico (org_user) do projeto e revoga', async () => {
        servirOt({ [`GET ${B}/sites`]: { sites: [SITE] },
            [`GET ${B}/acessos`]: { acessos: [{ user_id: 'u-tec', site_id: 's1', concedido_por: 'gestor@cliente.com', created_at: '2026-10-30 10:00:00' }] },
            'GET /api/v1/users': [{ id: 'u-tec', email: 'tec@cliente.com', role: 'org_user', client_project_id: 'p9' }, { id: 'u-cli', email: 'cli@cliente.com', role: 'client', client_project_id: 'p9' }],
            [`POST ${B}/acessos`]: { ok: true }, [`DELETE ${B}/acessos/s1/u-tec`]: { ok: true } });
        await abrir('acessos');
        expect(texto()).toContain('tec@cliente.com');
        window.otNovoAcesso();
        expect([...el('ot-ac-user').options].map((o) => o.value)).toEqual(['u-tec']);
        el('ot-ac-site').value = 's1';
        await window.otSalvarAcesso();
        expect(JSON.parse(chamadas.find((x) => x.k === `POST ${B}/acessos`).opts.body)).toEqual({ user_id: 'u-tec', site_id: 's1' });
        const p = window.otRevogarAcesso('s1', 'u-tec');
        await pausa();
        document.querySelector('[data-confirmar="sim"]').click();
        await p;
        expect(chamadas.some((x) => x.k === `DELETE ${B}/acessos/s1/u-tec`)).toBe(true);
    });
});

describe('coleta', () => {
    // GET /lotes e GET /lotes/:id (serializarItem em services/ot-coleta.ts).
    const LOTE = { id: 'l1', site_id: 's1', fonte: 'planilha', status: 'em_revisao', criado_por: 'u-tec', decidido_por: null, decidido_em: null, motivo: null, created_at: '2026-10-30 10:00:00', updated_at: '2026-10-30 10:00:00' };
    // Como o Gestor ARCiber (org_admin) recebe: IP em claro, `mascarado: false` (podeVerCompleto).
    const ITEM = (id, linha, extra) => ({ id, linha, decisao: 'pendente', motivo: null, erros: [], possivel_duplicata: false,
        dados: { zona_id: null, nome: `Item ${linha}`, tipo_dispositivo: 'RTU', fabricante: 'ACME', no_arciber: false, firmware_nao_aplicavel: false, protocolos_portas: [], ip: '10.0.0.5', mac: null, mascarado: false }, ...extra });
    const COLETA = { [`GET ${B}/sites`]: { sites: [SITE] }, [`GET ${B}/lotes`]: { lotes: [{ ...LOTE, itens: 2, com_erro: 1, gravados: 0 }] },
        [`GET ${B}/lotes/l1`]: { lote: LOTE, itens: [ITEM('i1', 2, { possivel_duplicata: true }), ITEM('i2', 3, { erros: [{ campo: 'mac', motivo: 'MAC inválido' }] })] } };

    it('aponta "Trazer dados" e lista os lotes', async () => {
        servirOt(COLETA);
        await abrir('coleta');
        expect(el('ot-coleta-privacidade').textContent).toContain('Trazer dados');
        expect(texto()).toContain('Em revisão');
        expect(texto()).toContain('Planilha');
    });

    it('a Coleta não tem mais "Enviar planilha": só a entrada manual', async () => {
        servirOt(COLETA);
        await abrir('coleta');
        expect(texto()).not.toContain('Enviar planilha');
        expect(el('ot-lote-arquivo')).toBeNull();
        expect(window.otEnviarPlanilha).toBeUndefined();
        expect([...document.querySelectorAll('[data-action]')].map((x) => x.dataset.action)).toContain('otEntradaManual');
    });

    it('entrada manual junta itens e manda o lote em JSON', async () => {
        servirOt({ ...COLETA, [`POST ${B}/lotes/manual`]: { id: 'l3', itens: 1, com_erro: 0, possiveis_duplicatas: 0, status: 'em_revisao' } });
        await abrir('coleta');
        window.otEntradaManual();
        el('ot-m-site').value = 's1';
        el('ot-f-nome').value = 'CLP-1';
        el('ot-f-fabricante').value = 'ACME';
        window.otManualAdicionar();
        expect(el('ot-m-itens').textContent).toContain('CLP-1');
        await window.otManualEnviar();
        expect(JSON.parse(chamadas.find((x) => x.k === `POST ${B}/lotes/manual`).opts.body)).toEqual({ site_id: 's1', itens: [{ nome: 'CLP-1', no_arciber: false, fabricante: 'ACME', firmware_nao_aplicavel: false }] });
    });

    it('revisão mostra a possível duplicata e os erros como a API devolve; quem aprova vê aprovar e rejeitar', async () => {
        servirOt(COLETA);
        S.otLote = 'l1';
        await abrir('coleta');
        const linhas = [...el('c').querySelectorAll('tbody tr')];
        expect(linhas[0].textContent).toContain('Possível duplicata');
        expect(linhas[1].textContent).toContain('MAC inválido');
        expect(acoes(el('a'))).toEqual(expect.arrayContaining(['otAprovarLote', 'otRejeitarLote']));
    });

    it('quem criou o lote, o técnico e o client não veem aprovar nem rejeitar', async () => {
        for (const user of [{ id: 'u-tec', role: 'org_admin' }, { id: 'x', role: 'org_user' }, { id: 'y', role: 'client' }, { id: 'z', role: 'platform_admin' }]) {
            S.user = user;
            servirOt(COLETA);
            S.otLote = 'l1';
            await abrir('coleta');
            expect(acoes(el('a')), user.role).not.toContain('otAprovarLote');
            expect(acoes(el('a')), user.role).not.toContain('otRejeitarLote');
        }
    });

    it('consultoria_admin não designado (a API devolve o lote mascarado) não vê aprovar nem rejeitar; designado vê', async () => {
        S.user = { id: 'ca', role: 'consultoria_admin' };
        const mascarado = (id, linha) => ITEM(id, linha, { dados: { ...ITEM(id, linha).dados, ip: '•••', mascarado: true } });
        servirOt({ ...COLETA, [`GET ${B}/lotes/l1`]: { lote: LOTE, itens: [mascarado('i1', 2), mascarado('i2', 3)] } });
        S.otLote = 'l1';
        await abrir('coleta');
        expect(acoes(el('a'))).not.toContain('otAprovarLote');
        expect(acoes(el('a'))).not.toContain('otRejeitarLote');
        expect(texto()).toContain('A aprovação é do Gestor ARCiber ou do consultor do projeto.');
        servirOt(COLETA);
        await abrir('coleta');
        expect(acoes(el('a'))).toEqual(expect.arrayContaining(['otAprovarLote', 'otRejeitarLote']));
    });

    it('aprovação conta os fluxos do sensor de rede que viraram achados, só quando há', async () => {
        for (const [n, esperado] of [[2, '2 fluxo(s) do sensor de rede viraram achados no levantamento de origem.'], [0, null]]) {
            servirOt({ ...COLETA, [`POST ${B}/lotes/l1/aprovar`]: { ok: true, criados: 1, atualizados: 0, recusados: 1, pendentes: 0, fluxos_pendentes_resolvidos: n } });
            document.querySelectorAll('.toast').forEach((t) => t.remove());
            S.otLote = 'l1';
            await abrir('coleta');
            const p = window.otAprovarLote('l1');
            await pausa();
            document.querySelector('[data-confirmar="sim"]').click();
            await p;
            if (esperado) expect(document.body.textContent).toContain(esperado);
            else expect(document.body.textContent).not.toContain('sensor de rede');
            expect(document.body.textContent).toContain('Lote aprovado: 1 criado(s)');
        }
    });

    it('403 na aprovação aparece claro, como falta de permissão', async () => {
        servirOt(COLETA, { [`POST ${B}/lotes/l1/aprovar`]: [403, { error: 'Forbidden: seu papel não aprova lote' }] });
        S.otLote = 'l1';
        await abrir('coleta');
        const p = window.otAprovarLote('l1');
        await pausa();
        document.querySelector('[data-confirmar="sim"]').click();
        await p;
        expect(document.body.textContent).toContain('Sem permissão: seu papel não aprova lote');
    });

    it('rejeitar pede o motivo e o manda no corpo', async () => {
        servirOt({ ...COLETA, [`POST ${B}/lotes/l1/rejeitar`]: { ok: true } });
        S.otLote = 'l1';
        await abrir('coleta');
        const p = window.otRejeitarLote('l1');
        await pausa();
        document.querySelector('.confirmar input').value = 'Planilha do site errado';
        document.querySelector('[data-confirmar="sim"]').click();
        await p;
        expect(JSON.parse(chamadas.find((x) => x.k === `POST ${B}/lotes/l1/rejeitar`).opts.body)).toEqual({ motivo: 'Planilha do site errado' });
    });

    it('client não vê envio de planilha nem entrada manual', async () => {
        S.user = { id: 'y', role: 'client' };
        servirOt(COLETA);
        await abrir('coleta');
        expect(el('ot-lote-arquivo')).toBeNull();
        expect([...acoes(el('a')), ...acoes(el('c'))]).not.toContain('otEntradaManual');
    });
});

describe('saídas', () => {
    // GET /indicadores (services/ot-indicadores.ts) e GET /conformidade (services/ot-conformidade.ts).
    const IND = { completude: { total: 4, completos: 3, percentual: 75, situacao: 'sem_evidencia', evidencia: '1 de 4 ativo(s) sem os 6 campos do 4.3.1', arciber: { total: 2, completos: 2 } },
        por_zona: [{ zona_id: 'z2', site_id: 's1', nome: 'Supervisão', nivel_purdue: 2, ativos: 3 }], por_nivel: { 2: 3 }, sem_zona: 1,
        fluxos_externos: { externos: 2, sem_vpn: 1, situacao: 'nao_atende' },
        prazos: [{ codigo: '4.1.2', titulo: 'Sem acesso pela internet', prazo_meses: 18, prazo_em: '2023-01-09', dias_restantes: -1390, vencido: true, situacao: 'nao_atende', evidencia: '1 fluxo(s) externo(s) sem VPN' }] };
    const CONF = { framework: 'ONS-RO-CB.BR.01', versao: 'Rev.00', vigencia: '2021-07-09', resumo: { nao_atende: 1, evidencia_no_inventario: 1, sem_evidencia: 1 }, itens: [
        { codigo: '4.1.2', titulo: 'Sem acesso pela internet', prazo_meses: 18, prazo_em: '2023-01-09', situacao: 'nao_atende', evidencia: '1 fluxo(s) externo(s) sem VPN' },
        { codigo: '4.1.3', titulo: 'VPN', prazo_meses: 18, prazo_em: '2023-01-09', situacao: 'evidencia_no_inventario', evidencia: 'Os 2 fluxo(s) externo(s) registrados passam por VPN' },
        { codigo: '5.1.1', titulo: 'Exceções', prazo_meses: null, prazo_em: null, situacao: 'sem_evidencia', evidencia: 'Fora do que o inventário registra' }] };
    const SAIDAS = { [`GET ${B}/indicadores`]: IND, [`GET ${B}/conformidade`]: CONF, [`GET ${B}/sites`]: { sites: [SITE] } };

    it('indicadores e conformidade nos três estados, sem afirmar "atende" nem "conforme"', async () => {
        servirOt(SAIDAS);
        await abrir('saidas');
        const t = texto();
        expect(t).toContain('75');
        expect(t).toContain('Supervisão');
        expect(t).toContain('Não atende');
        expect(t).toContain('Evidência no inventário');
        expect(t).toContain('Sem evidência');
        expect(t).toMatch(/vencido/i);
        expect(t.replace(/Não atende/g, '')).not.toMatch(/\batende\b/i);
        expect(t).not.toMatch(/conform[ea]\b/i);
    });

    it('exporta CSV por site com justificativa no corpo (POST) e o token no cabeçalho, nunca no endereço', async () => {
        servirOt(SAIDAS);
        const fetchExport = vi.fn(async () => ({ ok: true, status: 200, headers: { get: (h) => (h === 'content-disposition' ? 'attachment; filename="inventario-ot-2026-10-30.csv"' : null) }, blob: async () => new Blob(['a']) }));
        await abrir('saidas');
        vi.stubGlobal('fetch', fetchExport);
        URL.createObjectURL = vi.fn(() => 'blob:x');
        URL.revokeObjectURL = vi.fn();
        el('ot-exp-site').value = 's1';
        const curto = window.otExportar('csv');
        await pausa();
        document.querySelector('.confirmar input').value = 'curto';
        document.querySelector('[data-confirmar="sim"]').click();
        await curto;
        expect(fetchExport).not.toHaveBeenCalled();
        const p = window.otExportar('csv');
        await pausa();
        document.querySelector('.confirmar input').value = 'Entrega do inventário ao ONS';
        document.querySelector('[data-confirmar="sim"]').click();
        await p;
        const [url, opts] = fetchExport.mock.calls[0];
        const u = new URL(url, 'http://localhost');
        expect(u.pathname).toBe(`${B}/exportacao`);
        expect(u.search).toBe('');
        expect(opts.method).toBe('POST');
        expect(JSON.parse(opts.body)).toEqual({ formato: 'csv', site_id: 's1', justificativa: 'Entrega do inventário ao ONS' });
        expect(url).not.toContain('tok');
        expect(opts.headers.Authorization).toBe('Bearer tok');
    });

    it('client e org_user não veem a exportação', async () => {
        for (const role of ['client', 'org_user']) {
            S.user = { id: 'u', role };
            servirOt(SAIDAS);
            await abrir('saidas');
            expect(acoes(el('c')), role).not.toContain('otExportar');
        }
    });
});

// P1-1: revelar e exportar pedem TOTP dos últimos 10 min (403 totp_necessario), com teto por hora (429 teto_por_hora).
describe('step-up de TOTP e teto por hora', () => {
    const TOTP = { error: 'Confirme o código do seu autenticador (TOTP) para continuar', codigo: 'totp_necessario', totp_ativo: true };
    /** Responde a `k` com `respostas` em ordem (status, corpo); o resto como servirOt. */
    function emSequencia(k, respostas, rotas) {
        const f = servirOt(rotas);
        const base = f.getMockImplementation();
        let i = 0;
        f.mockImplementation(async (url, opts = {}) => {
            const chave = `${opts.method || 'GET'} ${new URL(url, 'http://localhost').pathname}`;
            if (chave === k && i < respostas.length) { chamadas.push({ k: chave, opts }); const [st, corpo] = respostas[i++]; return resposta(corpo, st); }
            return base(url, opts);
        });
    }
    const responder = async (valor) => { await pausa(); await pausa(); document.querySelector('.confirmar input').value = valor; document.querySelector('[data-confirmar="sim"]').click(); };

    it('revelar sem TOTP recente pede o código, confirma em /auth/mfa/verify e repete a chamada', async () => {
        S.user = { id: 'pa', role: 'platform_admin' };
        const revelado = ativo('a1', 'RTU-01', 'z2', { ip: '10.9.8.7', mac: 'aa:bb:cc:dd:ee:ff', mascarado: false });
        emSequencia(`POST ${B}/ativos/a1/revelar`, [[403, TOTP], [200, revelado]], { ...INVENTARIO, 'POST /api/v1/auth/mfa/verify': { ok: true, metodo: 'totp' } });
        await abrir('inventario');
        const p = window.otRevelar('a1');
        await responder('Auditoria de campo do ONS');
        await responder('123456');
        await p;
        const ks = chamadas.map((x) => x.k);
        expect(ks.filter((k) => k === `POST ${B}/ativos/a1/revelar`)).toHaveLength(2);
        const verify = chamadas.find((x) => x.k === 'POST /api/v1/auth/mfa/verify');
        expect(JSON.parse(verify.opts.body)).toEqual({ codigo: '123456' });
        expect(el('ot-revelado').textContent).toContain('10.9.8.7');
    });

    it('exportar sem TOTP recente pede o código e repete com a mesma justificativa', async () => {
        emSequencia(`POST ${B}/exportacao`, [[403, TOTP]], { [`GET ${B}/indicadores`]: {}, [`GET ${B}/conformidade`]: { itens: [] }, [`GET ${B}/sites`]: { sites: [SITE] },
            'POST /api/v1/auth/mfa/verify': { ok: true } });
        await abrir('saidas');
        const f = globalThis.fetch;
        const download = { ok: true, status: 200, headers: { get: () => null }, blob: async () => new Blob(['a']) };
        let exportacoes = 0;
        const corpos = [];
        vi.stubGlobal('fetch', vi.fn(async (url, opts = {}) => {
            if (!url.endsWith('/exportacao')) return f(url, opts);
            corpos.push(JSON.parse(opts.body));
            return exportacoes++ > 0 ? download : f(url, opts);
        }));
        URL.createObjectURL = vi.fn(() => 'blob:x');
        URL.revokeObjectURL = vi.fn();
        el('ot-exp-site').value = 's1';
        const p = window.otExportar('xlsx');
        await responder('Entrega do inventário ao ONS');
        await responder('654321');
        await p;
        expect(exportacoes).toBe(2);
        expect(chamadas.some((x) => x.k === 'POST /api/v1/auth/mfa/verify')).toBe(true);
        expect(corpos[1]).toEqual({ formato: 'xlsx', site_id: 's1', justificativa: 'Entrega do inventário ao ONS' });
    });

    it('código errado (401 do verify) pede o código de novo, sem perder a justificativa; o campo é de código numérico', async () => {
        S.user = { id: 'pa', role: 'platform_admin' };
        const revelado = ativo('a1', 'RTU-01', 'z2', { ip: '10.9.8.7', mac: 'aa:bb:cc:dd:ee:ff', mascarado: false });
        emSequencia(`POST ${B}/ativos/a1/revelar`, [[403, TOTP], [200, revelado]], INVENTARIO);
        const f = globalThis.fetch;
        const base = f.getMockImplementation();
        let tentativas = 0;
        f.mockImplementation(async (url, opts = {}) => (url.endsWith('/auth/mfa/verify')
            ? (chamadas.push({ k: 'POST /api/v1/auth/mfa/verify', opts }), resposta(tentativas++ ? { ok: true } : { error: 'Código inválido' }, tentativas > 1 ? 200 : 401))
            : base(url, opts)));
        await abrir('inventario');
        const p = window.otRevelar('a1');
        await responder('Auditoria de campo do ONS');
        await pausa(); await pausa();
        const campo = document.querySelector('.confirmar input');
        expect(campo.getAttribute('inputmode')).toBe('numeric');
        expect(campo.getAttribute('autocomplete')).toBe('one-time-code');
        await responder('000000');
        await responder('123456');
        await p;
        expect(chamadas.filter((x) => x.k === 'POST /api/v1/auth/mfa/verify').map((x) => JSON.parse(x.opts.body).codigo)).toEqual(['000000', '123456']);
        const revelar = chamadas.filter((x) => x.k === `POST ${B}/ativos/a1/revelar`);
        expect(revelar).toHaveLength(2);
        expect(JSON.parse(revelar[1].opts.body)).toEqual({ justificativa: 'Auditoria de campo do ONS' });
        expect(el('ot-revelado').textContent).toContain('10.9.8.7');
    });

    it('conta sem TOTP ativo: diz para ativar o segundo fator, sem pedir código', async () => {
        S.user = { id: 'pa', role: 'platform_admin' };
        emSequencia(`POST ${B}/ativos/a1/revelar`, [[403, { ...TOTP, error: 'Esta ação exige o segundo fator (TOTP) do n.360: ative-o no seu perfil e tente de novo', totp_ativo: false }]], INVENTARIO);
        await abrir('inventario');
        const p = window.otRevelar('a1');
        await responder('Auditoria de campo do ONS');
        await p;
        expect(chamadas.some((x) => x.k === 'POST /api/v1/auth/mfa/verify')).toBe(false);
        expect(document.body.textContent).toMatch(/ative-o no seu perfil/);
    });

    it('429 mostra a mensagem do teto por hora', async () => {
        S.user = { id: 'pa', role: 'platform_admin' };
        emSequencia(`POST ${B}/ativos/a1/revelar`, [[429, { error: 'Limite por hora atingido: revelações de IP/MAC (20 por pessoa e 60 por projeto). Tente de novo mais tarde.', codigo: 'teto_por_hora' }]], INVENTARIO);
        await abrir('inventario');
        const p = window.otRevelar('a1');
        await responder('Auditoria de campo do ONS');
        await p;
        expect(document.body.textContent).toContain('Limite por hora atingido');
    });
});

describe('lista de sites e tela do site (Task 4)', () => {
    const SITE2 = { id: 's2', nome: 'SE Sul', tipo: 'usina', criticidade: 'media', localizacao: null, status: 'ativo' };
    const lev = (id, site_id, funcao) => ({ id, site_id, tipo: 'entrevista', realizado_em: '2026-11-01', funcao, turno: null, achados: 0, situacao: 'em_andamento' });
    const des = (id, site_id) => ({ id, site_id, site_nome: site_id, tipo: 'ativo', situacao: 'tratado', origem: { ativo: `host-${id}` }, primeira_vez: '2026-11-01T10:00:00Z', ultima_vez: '2026-11-02T10:00:00Z', ocorrencias: 1 });
    const sit = (proximo_passo, extra = {}) => ({ fase: 'em_levantamento', base_pedida_em: null, base_aprovada_em: null, rascunhos: 0, lotes_em_revisao: 0, zonas_4_1_1: true, tem_conteudo: true, proximo_passo, lote_em_revisao_id: null, ...extra });
    const ROTAS = { [`GET ${B}/sites`]: { sites: [SITE, SITE2] }, [`GET ${B}/sites/s1/situacao`]: sit('comecar'), [`GET ${B}/sites/s2/situacao`]: sit('comecar'),
        [`GET ${B}/levantamentos`]: { levantamentos: [lev('l1', 's1', 'l1-texto-unico'), lev('l2', 's2', 'l2-texto-unico')] },
        [`GET ${B}/lotes`]: { lotes: [{ id: 'k1', site_id: 's1', fonte: 'planilha', status: 'em_revisao', created_at: '2026-11-01T10:00:00Z' }, { id: 'k2', site_id: 's2', fonte: 'manual', status: 'concluido', created_at: '2026-11-02T10:00:00Z' }] },
        [`GET ${B}/achados`]: { achados: [{ id: 'x1', entidade: 'ativo', situacao: 'rascunho', origem: 'consultor', dados: { nome: 'rev-texto-unico' }, evidencia: 'e', levantamento_id: 'l1', levantamento_tipo: 'entrevista', levantamento_realizado_em: '2026-11-01', desfecho: null }] },
        [`GET ${B}/desvios`]: { desvios: [des('d1', 's2'), des('d2', 's2')] }, [`GET ${B}/zonas`]: { zonas: [] }, [`GET ${B}/ativos`]: { ativos: [] }, [`GET ${B}/fluxos`]: { fluxos: [] } };
    const abas = () => [...el('c').querySelectorAll('[role="tab"]')].map((t) => t.textContent.trim());
    const primarios = () => el('c').querySelectorAll('.btn-primary').length + el('a').querySelectorAll('.btn-primary').length;
    const ir = (o) => montarSite(el('c'), el('a'), S.activeProject, o);
    beforeEach(() => { S.otSub = null; S.otDesvioFiltro = null; S.otLevantamento = null; });

    it('lista de sites: Abrir leva ao site em modo projeto; cadastro de site fica aqui', async () => {
        servirOt(ROTAS);
        await montarSites(el('c'), el('a'), S.activeProject);
        expect(el('c').textContent).toContain('SE Sul');
        expect(el('xss')).toBeNull();
        const abrirS2 = [...el('c').querySelectorAll('[data-action="otTela"]')].find((b) => b.getAttribute('aria-label') === 'Abrir SE Sul');
        expect(JSON.parse(abrirS2.getAttribute('data-args'))).toEqual(['site', 's2', null]);
        expect(acoes(el('a'))).toContain('otNovoSite');
        window.otEditarSiteDaLista('s2');
        expect(el('ot-s-nome').value).toBe('SE Sul');
        expect(primarios()).toBe(1);
    });

    it('modo projeto: Levantamento, Lote de aprovação e Base; a lista só tem as linhas do site', async () => {
        servirOt(ROTAS);
        await ir({ site: 's1', modo: 'projeto', sub: 'levantamento' });
        expect(abas()).toEqual(expect.arrayContaining(['Modo projeto', 'Modo operação', 'Levantamento', 'Revisão e aprovação', 'Base']));
        expect(el('c').textContent).toContain('l1-texto-unico');
        expect(el('c').textContent).not.toContain('l2-texto-unico');
        window.otNovoLevantamento();
        expect(el('lev-f-site').type).toBe('hidden');
        expect(el('lev-f-site').value).toBe('s1');
        expect(primarios()).toBe(1); // o do cartão Próximo passo
    });

    it('lote de aprovação e base: recorte por site, sem seletor de site e um só botão primário', async () => {
        servirOt(ROTAS);
        await ir({ site: 's1', modo: 'projeto', sub: 'aprovacao' });
        expect(el('c').textContent).toContain('SE Norte');
        expect(el('c').textContent).toContain('rev-texto-unico');
        expect(el('c').querySelectorAll('#ot-rev-lotes tbody tr')).toHaveLength(1);
        expect(primarios()).toBe(1);
        expect(el('ot-lote-site')).toBeNull();
        await ir({ site: 's1', modo: 'projeto', sub: 'base' });
        expect(el('ot-filtro-site')).toBeNull();
        expect(el('c').textContent).not.toContain('Cadastrar o primeiro site');
        expect(acoes(el('a'))).toEqual(expect.arrayContaining(['otNovoAtivo', 'otNovoFluxo']));
        expect(primarios()).toBe(1);
        expect(chamadas.some((x) => x.k === `GET ${B}/ativos` && x.url.search === '?site_id=s1')).toBe(true);
    });

    it('modo operação: Saúde da coleta, Desvios e Inventário; Desvios com o site fixo no filtro', async () => {
        servirOt(ROTAS);
        await ir({ site: 's1', modo: 'operacao', sub: 'desvios' });
        expect(abas()).toEqual(expect.arrayContaining(['Saúde da coleta', 'Desvios', 'Inventário']));
        expect(S.otDesvioFiltro).toEqual({ situacao: 'aberto', site_id: 's1', tipo: '' });
        expect(el('des-f-site')).toBeNull();
        expect(chamadas.some((x) => x.k === `GET ${B}/desvios` && x.url.search === '?situacao=aberto&site_id=s1')).toBe(true);
        await ir({ site: 's1', modo: 'operacao', sub: 'saude' });
        expect(el('ot-sondas')).not.toBeNull();
        await ir({ site: 's1', modo: 'operacao', sub: 'inventario' });
        expect(el('ot-filtro-site')).toBeNull();
        expect(SUBS.operacao).toEqual(['saude', 'desvios', 'inventario']);
    });

    it('Saúde da coleta do site: só o cartão de saúde, sem pontos nem contagem de desvios do projeto', async () => {
        servirOt({ ...ROTAS, [`GET ${B}/sites/s1/situacao`]: sit('em_operacao', { base_aprovada_em: '2026-11-10 12:00:00' }), [`GET ${B}/sites/s1/sensores`]: { sensores: [{ id: 'z1', nome: 'S', saude: 'em_dia', ultimo_envio: new Date().toISOString(), credenciais: [] }] } });
        await ir({ site: 's1', modo: 'operacao', sub: 'saude' });
        await vi.waitFor(() => expect(el('c').textContent).toContain('Saúde da coleta'));
        await vi.waitFor(() => expect(el('ot-cartoes-coleta')).not.toBeNull());
        expect(el('c').textContent).not.toContain('Achados da sonda para revisar');
        expect(el('c').textContent).not.toContain('desvio');
        expect(chamadas.some((x) => x.k === `GET ${B}/sensores/pontos` || (x.k === `GET ${B}/desvios` && x.url.search.includes('contagem')))).toBe(false);
    });

    it('sub-aba de outro modo cai na primeira do modo; site desconhecido mostra o aviso', async () => {
        servirOt(ROTAS);
        await ir({ site: 's1', modo: 'operacao', sub: 'base' });
        expect(S.otSub).toBe('saude');
        await ir({ site: 'sX', modo: 'projeto' });
        expect(el('c').textContent).toContain('Site não encontrado');
    });

    it('resolverDesvio: acha o site do desvio sem filtro de situação; desvio ausente dá null', async () => {
        servirOt(ROTAS);
        expect(await resolverDesvio(S.activeProject, 'd1')).toEqual({ site_id: 's2' });
        expect(chamadas[0].url.search).toBe('');
        expect(await resolverDesvio(S.activeProject, 'zz')).toBeNull();
    });

    it('deep link: a linha do desvio fica marcada, em todas as situações', async () => {
        servirOt(ROTAS);
        await ir({ site: 's2', modo: 'operacao', sub: 'desvios', desvio: 'd2' });
        expect(S.otDesvioFiltro.situacao).toBe('');
        const linhas = el('c').querySelectorAll('tbody tr');
        expect(linhas).toHaveLength(2);
        expect(linhas[1].getAttribute('aria-current')).toBe('true');
        expect(linhas[0].hasAttribute('aria-current')).toBe(false);
    });

    it('próximo passo: o cartão tem o único primário em todas as sub-abas, com régua e etapa atual', async () => {
        servirOt(ROTAS);
        for (const [modo, subs] of Object.entries(SUBS)) {
            for (const sub of subs) {
                await ir({ site: 's1', modo, sub });
                expect(primarios(), `${modo}/${sub}`).toBe(1);
            }
        }
        await ir({ site: 's1', modo: 'projeto', sub: 'levantamento' });
        expect(el('c').querySelector('[aria-current="step"]').textContent).toContain('Levantar');
        expect(el('c').textContent).toContain('Comece o levantamento');
        expect(el('c').querySelector('.card .btn-primary').getAttribute('data-action')).toBe('otNovoLevantamentoDoSite');
    });

    it('modo inicial pela fase: em_operacao abre em Modo operação; sem modo e sem operação, em Modo projeto', async () => {
        servirOt({ ...ROTAS, [`GET ${B}/sites/s1/situacao`]: sit('em_operacao', { fase: 'em_operacao', base_aprovada_em: '2026-11-10 12:00:00' }) });
        await ir({ site: 's1', modo: null });
        expect(S.otModo).toBe('operacao');
        expect(el('c').textContent).toContain('Em operação desde 10/11/2026');
        expect(el('c').textContent).not.toContain('ainda não tem base aprovada');
        await ir({ site: 's2', modo: null });
        expect(S.otModo).toBe('projeto');
    });

    it('modo operação num site sem base aprovada avisa que desvios não são calculados', async () => {
        servirOt(ROTAS);
        await ir({ site: 's1', modo: 'operacao', sub: 'inventario' });
        expect(el('c').textContent).toContain('Este site ainda não tem base aprovada: desvios não são calculados.');
    });

    it('situação que falha: o cartão avisa e a tela segue', async () => {
        servirOt(ROTAS, { [`GET ${B}/sites/s1/situacao`]: [500, { error: 'x' }] });
        await ir({ site: 's1', modo: 'projeto', sub: 'levantamento' });
        expect(el('c').textContent).toContain('Não foi possível carregar a situação do site.');
        expect(el('c').textContent).toContain('l1-texto-unico');
    });

    it('inventário: ativo sem verificação ganha o selo 4.3.1; verificado não', async () => {
        const v = { ultima_verificacao_em: '2026-11-01 10:00:00', verificado_por: 'u1' };
        servirOt({ ...ROTAS, [`GET ${B}/ativos`]: { ativos: [{ ...ativo('a1', 'RTU-01', null), site_id: 's1' }, { ...ativo('a2', 'IHM-02', null), site_id: 's1', ...v }] } });
        await ir({ site: 's1', modo: 'operacao', sub: 'inventario' });
        const linhas = [...el('c').querySelectorAll('tbody tr')].filter((tr) => /RTU-01|IHM-02/.test(tr.textContent));
        expect(linhas.find((tr) => tr.textContent.includes('RTU-01')).textContent).toContain('não verificado (4.3.1)');
        expect(linhas.find((tr) => tr.textContent.includes('IHM-02')).textContent).not.toContain('não verificado');
        expect(el('c').querySelector('[title="Entrou sem lote de aprovação"]')).not.toBeNull();
    });

    it('lote aberto (Gestor): o cartão perde o primário e o único é "Aprovar lote"', async () => {
        const lote = { id: 'k1', site_id: 's1', fonte: 'planilha', status: 'em_revisao', criado_por: 'u-tec', created_at: '2026-10-30 10:00:00' };
        const item = { id: 'i1', linha: 2, decisao: 'pendente', motivo: null, erros: [], possivel_duplicata: false, dados: { nome: 'Item 2', tipo_dispositivo: 'RTU', no_arciber: false, firmware_nao_aplicavel: false, protocolos_portas: [], ip: '10.0.0.5', mac: null, mascarado: false } };
        servirOt({ ...ROTAS, [`GET ${B}/sites/s1/situacao`]: sit('aguardar_base'), [`GET ${B}/lotes/k1`]: { lote, itens: [item] } });
        S.otLote = 'k1';
        await ir({ site: 's1', modo: 'projeto', sub: 'aprovacao' });
        expect(primarios()).toBe(1);
        expect(el('a').querySelector('.btn-primary').getAttribute('data-action')).toBe('otAprovarLote');
        expect(el('c').querySelector('.card').textContent).toContain('Aprovar a base');
        S.otLote = null;
    });

    it('levantamento aberto: o cartão perde o primário e o único é o envio do levantamento', async () => {
        const lev = { id: 'l1', site_id: 's1', tipo: 'entrevista', realizado_em: '2026-11-01', funcao: 'Operador', turno: 'B', notas: '', roteiro: {}, situacao: 'aberto', achados: 1 };
        const ach = { id: 'a1', levantamento_id: 'l1', entidade: 'ativo', origem: 'consultor', situacao: 'rascunho', lote_id: null, evidencia: 'e', erros: [], dados: { nome: 'N', mascarado: true } };
        servirOt({ ...ROTAS, [`GET ${B}/levantamentos/l1`]: { levantamento: lev, achados: [ach] }, [`GET ${B}/roteiro`]: { perguntas: [] } });
        S.otLevantamento = 'l1';
        await ir({ site: 's1', modo: 'projeto', sub: 'levantamento' });
        expect(primarios()).toBe(1);
        expect(el('a').querySelector('.btn-primary').getAttribute('data-action')).toBe('otEnviarAchados');
        expect(el('c').querySelector('.card .btn')).not.toBeNull();
    });
});
