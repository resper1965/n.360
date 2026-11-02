import { describe, it, expect } from 'vitest';
import { prepararFluxo, indiceFluxos, confrontarFluxo, type FluxoExistente } from '../src/services/ot-fluxo-achado';

const pontas = { ativos: new Set(['a1', 'a2']), zonas: new Set(['z1']) };
const f = (o: Partial<FluxoExistente>): FluxoExistente => ({ id: 'f1', origem_ativo_id: null, origem_zona_id: null, destino_ativo_id: null,
  destino_zona_id: null, direcao: 'unidirecional', externo: 0, via_vpn: 0, ...o });

describe('prepararFluxo', () => {
  it('aceita campos válidos e converte booleanos para 0/1', () => {
    const r = prepararFluxo({ origem_ativo_id: 'a1', destino_zona_id: 'z1', protocolo: 'Modbus', porta: 502, externo: true, via_vpn: false }, pontas);
    expect(r.erros).toEqual([]);
    expect(r.dados).toEqual({ origem_ativo_id: 'a1', destino_zona_id: 'z1', protocolo: 'Modbus', porta: 502, externo: 1, via_vpn: 0 });
  });
  it('ponta fora do site vira erro e não entra em dados; campo desconhecido também', () => {
    const r = prepararFluxo({ origem_ativo_id: 'outro', destino_ativo_id: 'a2', nome: 'x' }, pontas);
    expect(r.dados).toEqual({ destino_ativo_id: 'a2' });
    expect(r.erros.map((e) => e.campo).sort()).toEqual(['nome', 'origem_ativo_id', 'pontas']); // só uma ponta válida: também falta ponta
  });
  it('ativo e zona na mesma ponta: erro na ponta', () => {
    const r = prepararFluxo({ origem_ativo_id: 'a1', origem_zona_id: 'z1', destino_ativo_id: 'a2' }, pontas);
    expect(r.erros.some((e) => e.campo === 'origem')).toBe(true);
  });
  it('pontas insuficientes (interno sem as duas; externo sem nenhuma) viram aviso "pontas"', () => {
    expect(prepararFluxo({ origem_ativo_id: 'a1' }, pontas).erros.map((e) => e.campo)).toContain('pontas');
    expect(prepararFluxo({ externo: true }, pontas).erros.map((e) => e.campo)).toContain('pontas');
    expect(prepararFluxo({ externo: true, origem_ativo_id: 'a1' }, pontas).erros).toEqual([]);
  });
  it('chave herdada do Object.prototype (constructor, __proto__) vira "campo não aceito", sem lançar', () => {
    const r = prepararFluxo({ constructor: 1, origem_ativo_id: 'a1', destino_ativo_id: 'a2' }, pontas);
    expect(r.erros).toContainEqual({ campo: 'constructor', motivo: 'campo não aceito' });
    expect(r.dados).toEqual({ origem_ativo_id: 'a1', destino_ativo_id: 'a2' });
    expect(() => prepararFluxo(JSON.parse('{"__proto__": 1, "toString": 2}'), pontas)).not.toThrow();
  });
  it('finalidade com IP ou e-mail: erro, não gravada', () => {
    expect(prepararFluxo({ origem_ativo_id: 'a1', destino_ativo_id: 'a2', finalidade: 'para 10.0.0.1' }, pontas).dados.finalidade).toBeUndefined();
    const r = prepararFluxo({ origem_ativo_id: 'a1', destino_ativo_id: 'a2', finalidade: 'avisar ana@x.com' }, pontas);
    expect(r.dados.finalidade).toBeUndefined();
    expect(r.erros[0]).toEqual({ campo: 'finalidade', motivo: 'Não informe CPF, e-mail nem telefone' });
  });
});

describe('confrontarFluxo', () => {
  const idx = indiceFluxos([f({ id: 'f1', origem_ativo_id: 'a1', destino_ativo_id: 'a2', externo: 0, via_vpn: 0 }),
    f({ id: 'f2', origem_zona_id: 'z1', destino_ativo_id: 'a1', direcao: 'bidirecional', externo: 1, via_vpn: 1 })]);
  it('sem ponta ou sem fluxo com a chave: novo', () => {
    expect(confrontarFluxo({ externo: 1 }, idx)).toEqual({ confronto: 'novo', alvo_id: null });
    expect(confrontarFluxo({ origem_ativo_id: 'a2', destino_ativo_id: 'a1' }, idx)).toEqual({ confronto: 'novo', alvo_id: null });
  });
  it('mesma chave e mesmos externo/via_vpn: confirma; campo ausente não compara', () => {
    expect(confrontarFluxo({ origem_ativo_id: 'a1', destino_ativo_id: 'a2', externo: 0 }, idx)).toEqual({ confronto: 'confirma', alvo_id: 'f1' });
    expect(confrontarFluxo({ origem_ativo_id: 'a1', destino_ativo_id: 'a2' }, idx)).toEqual({ confronto: 'confirma', alvo_id: 'f1' });
  });
  it('bidirecional casa com a chave invertida; via_vpn diferente: contradiz', () => {
    expect(confrontarFluxo({ origem_ativo_id: 'a1', destino_zona_id: 'z1', externo: 1, via_vpn: 1 }, idx)).toEqual({ confronto: 'confirma', alvo_id: 'f2' });
    expect(confrontarFluxo({ origem_zona_id: 'z1', destino_ativo_id: 'a1', externo: 1, via_vpn: 0 }, idx)).toEqual({ confronto: 'contradiz', alvo_id: 'f2' });
  });
});
