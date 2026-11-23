// frontend/test/ot-navegacao.test.js
import { describe, it, expect, vi } from 'vitest';
import { lerEndereco, escreverEndereco, TELAS_OT } from '../src/ot-navegacao.js';

const loc = (pathname, search = '') => ({ pathname, search, hash: '' });

describe('ot-navegacao', () => {
    it('sem parâmetro, é o Início', () => {
        expect(lerEndereco(loc('/ot'))).toEqual({ tela: 'inicio', site: null, modo: 'projeto', desvio: null });
    });
    it('lê subtela, site e modo', () => {
        expect(lerEndereco(loc('/ot', '?ot=site&site=s1&modo=operacao'))).toEqual({ tela: 'site', site: 's1', modo: 'operacao', desvio: null });
    });
    it('tela ou modo desconhecido cai no padrão; site sem site cai em Sites', () => {
        expect(lerEndereco(loc('/ot', '?ot=xyz&modo=abc')).tela).toBe('inicio');
        expect(lerEndereco(loc('/ot', '?ot=site')).tela).toBe('sites');
        expect(lerEndereco(loc('/ot', '?ot=site&site=s1&modo=abc')).modo).toBe('projeto');
    });
    it('o link do webhook /ot/desvios/<id> pede o desvio', () => {
        expect(lerEndereco(loc('/ot/desvios/d-123')).desvio).toBe('d-123');
        expect(lerEndereco(loc('/ot/desvios/<x>')).desvio).toBeNull(); // id fora do formato não passa
    });
    it('escreve no endereço sem empilhar histórico e volta o caminho a /ot', () => {
        const spy = vi.spyOn(history, 'replaceState');
        escreverEndereco({ tela: 'site', site: 's1', modo: 'operacao' }, loc('/ot/desvios/d-1', '?x=1'));
        expect(spy).toHaveBeenCalledWith(history.state, '', '/ot?x=1&ot=site&site=s1&modo=operacao');
        escreverEndereco({ tela: 'inicio' }, loc('/ot', '?ot=site&site=s1&modo=projeto'));
        expect(spy).toHaveBeenLastCalledWith(history.state, '', '/ot');
    });
    it('a lista de subtelas é fechada', () => { expect(TELAS_OT).toEqual(['inicio', 'painel', 'sites', 'site', 'assessment', 'relatorios', 'fornecedores', 'acessos']); });
    it('?ot=painel abre o Painel do n.ot', () => {
        expect(lerEndereco({ pathname: '/ot', search: '?ot=painel' })).toMatchObject({ tela: 'painel', site: null });
    });
});
