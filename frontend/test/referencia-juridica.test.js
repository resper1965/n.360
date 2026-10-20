// Referência jurídica (n.privacy): abas LGPD/ANPD/GDPR, busca, selo de validação e o botão só do platform_admin.
// api() REAL; só o fetch é dublado, com o corpo de cada handler (src/routes/requisitos.ts).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { servir } from './servir-api.js';

vi.mock('../src/router.js', () => ({ navigate: vi.fn(), render: vi.fn() }));

import { S } from '../src/state.js';
import '../src/ui.js';
import { filtrarLinhas } from '../src/views/referencia-juridica.js';

const LGPD = [
    { id: 'lgpd:art7', fonte_id: 'lgpd', referencia: 'art. 7', titulo: 'Fundamentar em <b>base legal</b>', pai_id: null, validado_por: null, validado_em: null },
    { id: 'lgpd:art7:i', fonte_id: 'lgpd', referencia: 'art. 7, I', titulo: 'Consentimento do titular', pai_id: 'lgpd:art7', validado_por: 'adm@ness.lat', validado_em: '2026-10-20' },
    { id: 'lgpd:art11', fonte_id: 'lgpd', referencia: 'art. 11', titulo: 'Dados sensíveis', pai_id: null, validado_por: null, validado_em: null },
    { id: 'lgpd:art46', fonte_id: 'lgpd', referencia: 'art. 46', titulo: 'Segurança', pai_id: null, validado_por: null, validado_em: null },
];
const ANPD = [{ id: 'anpd:r2:art3', fonte_id: 'anpd', referencia: 'Res. 2/2022, art. 3', titulo: 'Pequeno porte', pai_id: null, validado_por: null, validado_em: null }];
const BASES = ['consentimento', 'contrato', 'interesses_legitimos', 'interesses_vitais', 'obrigacao_legal', 'tarefa_publica'].map((id) => ({ id, rotulo: `Base ${id}`, texto: `Texto de ${id}` }));
// A query string não entra na chave do dublê: LGPD e ANPD respondem a mesma rota, então o dublê serve a lista de cada teste.
const rotas = (extra = {}) => ({ 'GET /api/v1/requisitos': LGPD, 'GET /api/v1/requisitos/gdpr-bases': BASES, ...extra });
const el = (id) => document.getElementById(id);

async function abrir() {
    document.body.innerHTML = '<h1 id="h"></h1><div id="a"></div><div id="c"></div>';
    await window.renderReferenciaJuridica(el('c'), el('h'), el('a'));
}
const digitar = (v) => { el('rj-busca').value = v; window.buscarReferenciaJuridica(v); };
const refs = () => [...el('rj-painel').querySelectorAll('th[scope="row"]')].map((t) => t.textContent);

beforeEach(() => {
    S.token = 'tok'; S.user = { role: 'consultor' }; S.refJuridicaAba = undefined; S.refJuridicaBusca = '';
    window.render = vi.fn();
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('referência jurídica', () => {
    it('LGPD: art. 7 e 11 juntos em "Bases legais", selo só no validado, texto escapado', async () => {
        servir(rotas());
        await abrir();
        const bases = document.querySelector('.rj-bases-legais');
        expect(bases.textContent).toContain('art. 7, I');
        expect(bases.textContent).toContain('art. 11');
        expect(bases.textContent).not.toContain('art. 46');
        expect(bases.textContent).toContain('Validado por adm@ness.lat em 20/10/2026');
        expect(el('rj-painel').textContent.match(/Validado juridicamente/g)).toHaveLength(1);
        expect(document.querySelector('#rj-painel b')).toBeNull();
        expect(el('rj-painel').textContent).toContain('Fundamentar em <b>base legal</b>');
    });

    it('busca "consentimento" acha o inciso e mantém o artigo pai; sem acento nem caixa', async () => {
        servir(rotas());
        await abrir();
        digitar('CONSENTIMENTO');
        expect(refs()).toEqual(['art. 7', 'art. 7, I']);
        digitar('seguranca');
        expect(refs()).toEqual(['art. 46']);
        digitar('zzz');
        expect(el('rj-painel').textContent).toContain('Nenhum resultado');
        expect(filtrarLinhas(LGPD, '')).toHaveLength(4);
    });

    it('abas ANPD e GDPR (as seis bases) e a busca vale na aba', async () => {
        servir(rotas());
        await abrir();
        window.abaReferenciaJuridica('gdpr');
        expect(el('rj-aba-gdpr').getAttribute('aria-selected')).toBe('true');
        expect(el('rj-painel').querySelectorAll('.rj-base')).toHaveLength(6);
        digitar('contrato');
        expect(el('rj-painel').querySelectorAll('.rj-base')).toHaveLength(1);
        digitar('');
        window.abaReferenciaJuridica('anpd');
        expect(el('rj-aba-anpd').getAttribute('aria-selected')).toBe('true');
        expect(el('rj-aba-lgpd').getAttribute('aria-selected')).toBe('false');
    });

    it('o botão de validar só existe para o platform_admin', async () => {
        servir(rotas());
        await abrir();
        expect(document.querySelector('[data-action="pedirValidacaoJuridica"]')).toBeNull();
        S.user = { role: 'platform_admin' };
        await abrir();
        expect(document.querySelector('[data-action="pedirValidacaoJuridica"]')).not.toBeNull();
    });

    it('validar: mostra a contagem, pede confirmação, e o POST não leva nome de quem valida', async () => {
        S.user = { role: 'platform_admin', email: 'adm@ness.lat' };
        const f = servir(rotas({
            'GET /api/v1/requisitos/mapeamentos/resumo': { propostos: 7, validados: 3 },
            'POST /api/v1/requisitos/mapeamentos/validar': { ok: true, validados: 7, propostos_restantes: 0, validados_total: 10 },
        }));
        await abrir();
        await window.pedirValidacaoJuridica();
        expect(el('rj-validacao').textContent).toContain('7 mapeamentos propostos e 3 já validados');
        expect(f.mock.calls.some(([, o]) => o?.method === 'POST')).toBe(false);
        await window.confirmarValidacaoJuridica();
        const post = f.mock.calls.find(([, o]) => o?.method === 'POST');
        expect(post[0]).toContain('/api/v1/requisitos/mapeamentos/validar');
        expect(JSON.parse(post[1].body)).toEqual({});
        expect(window.render).toHaveBeenCalled();
    });
});
