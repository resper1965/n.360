// frontend/test/ot-navegacao.test.js
import { describe, it, expect, vi } from 'vitest';
import { lerEndereco, escreverEndereco, TELAS_OT } from '../src/ot-navegacao.js';

const loc = (pathname, search = '') => ({ pathname, search, hash: '' });

describe('ot-navegacao', () => {
    it('sem parâmetro, é o Início', () => {
        expect(lerEndereco(loc('/ot'))).toEqual({ tela: 'inicio', site: null, aba: null, desvio: null });
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
    it('tela desconhecida cai no Início; site sem site cai em Sites', () => {
        expect(lerEndereco(loc('/ot', '?ot=xyz')).tela).toBe('inicio');
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
        escreverEndereco({ tela: 'inicio' }, loc('/ot', '?ot=site&site=s1&aba=base'));
        expect(spy).toHaveBeenLastCalledWith(history.state, '', '/ot');
    });
    it('a lista de subtelas é fechada', () => { expect(TELAS_OT).toEqual(['inicio', 'painel', 'sites', 'site', 'assessment', 'relatorios', 'fornecedores', 'acessos']); });
    it('?ot=painel abre o Painel do n.ot', () => {
        expect(lerEndereco({ pathname: '/ot', search: '?ot=painel' })).toMatchObject({ tela: 'painel', site: null });
    });
});
