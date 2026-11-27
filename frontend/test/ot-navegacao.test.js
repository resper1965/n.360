// frontend/test/ot-navegacao.test.js
import { describe, it, expect, vi } from 'vitest';
import { lerEndereco, escreverEndereco, TELAS_OT } from '../src/ot-navegacao.js';

const loc = (pathname, search = '') => ({ pathname, search, hash: '' });

describe('ot-navegacao', () => {
    it('sem parâmetro, a tela é nula: quem desenha usa a tela_inicial do servidor', () => {
        expect(lerEndereco(loc('/ot'))).toEqual({ tela: null, site: null, aba: null, desvio: null });
    });
    it('lê e escreve a aba do site; aba desconhecida fica nula (a tela escolhe a primeira da área)', () => {
        expect(lerEndereco(loc('/ot', '?ot=site&site=s1&aba=desvios'))).toEqual({ tela: 'site', site: 's1', aba: 'desvios', desvio: null });
        expect(lerEndereco(loc('/ot', '?ot=site&site=s1&aba=<x>')).aba).toBeNull();
        expect(lerEndereco(loc('/ot', '?ot=sites&aba=desvios')).aba).toBeNull(); // aba só vale no site
        const spy = vi.spyOn(history, 'replaceState');
        escreverEndereco({ tela: 'site', site: 's1', aba: 'revisar' }, loc('/ot'));
        expect(spy.mock.calls.at(-1)[2]).toBe('/ot?ot=site&site=s1&aba=revisar');
    });
    it('o endereço antigo com modo= ainda abre o site (modo é ignorado)', () => {
        expect(lerEndereco(loc('/ot', '?ot=site&site=s1&modo=operacao'))).toMatchObject({ tela: 'site', site: 's1', aba: null });
    });
    it('tela desconhecida é nula (tela inicial); site sem site cai em Sites', () => {
        expect(lerEndereco(loc('/ot', '?ot=xyz')).tela).toBeNull();
        expect(lerEndereco(loc('/ot', '?ot=inicio')).tela).toBe('painel');
        expect(lerEndereco(loc('/ot', '?ot=site')).tela).toBe('sites');
    });
    it('o link do webhook /ot/desvios/<id> pede o desvio', () => {
        expect(lerEndereco(loc('/ot/desvios/d-123')).desvio).toBe('d-123');
        expect(lerEndereco(loc('/ot/desvios/<x>')).desvio).toBeNull(); // id fora do formato não passa
    });
    it('escreve no endereço sem empilhar histórico e volta o caminho a /ot', () => {
        const spy = vi.spyOn(history, 'replaceState');
        escreverEndereco({ tela: 'site', site: 's1', aba: 'desvios' }, loc('/ot/desvios/d-1', '?x=1&modo=operacao'));
        expect(spy).toHaveBeenCalledWith(history.state, '', '/ot?x=1&ot=site&site=s1&aba=desvios');
        escreverEndereco({ tela: 'painel' }, loc('/ot', '?ot=site&site=s1&aba=base'));
        expect(spy).toHaveBeenLastCalledWith(history.state, '', '/ot?ot=painel');
    });
    it('a tela inicial vem do servidor (tela_inicial): /ot é nula, ?ot=inicio lê painel, e o Painel escreve ?ot=painel', () => {
        expect(lerEndereco(loc('/ot')).tela).toBeNull();
        expect(lerEndereco(loc('/ot', '?ot=inicio')).tela).toBe('painel');
        const spy = vi.spyOn(history, 'replaceState');
        escreverEndereco({ tela: 'painel' }, loc('/ot'));
        expect(spy).toHaveBeenLastCalledWith(history.state, '', '/ot?ot=painel'); // /ot limpo abriria Implantação para quem edita
    });
    it('a lista de subtelas é fechada', () => { expect(TELAS_OT).toEqual(['painel', 'sites', 'site', 'desvios', 'assessment', 'relatorios', 'implantacao', 'acessos', 'sondas', 'agente', 'integracao', 'fornecedores']); });
    it('?ot=painel abre o Painel do n.ot', () => {
        expect(lerEndereco({ pathname: '/ot', search: '?ot=painel' })).toMatchObject({ tela: 'painel', site: null });
    });
});
