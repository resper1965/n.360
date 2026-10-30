import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { mascararParaIa, garantirSemEndereco, restaurarSaida, perguntarIa, RecusaIa } from '../src/services/ot-ia';

// Modelo de ameaças do n.ot, P0-7 (T16/T13): máscara própria para a IA. Nenhum identificador de rede em claro vai ao modelo;
// a resposta só ganha o valor de volta nos campos ip/mac/hostname; token em outro campo, ou desconhecido, recusa.

const IDENTIFICADORES = [
  '10.1.1.10', '192.168.0.0/24', '10.0.0.1-10.0.0.50', '172.16.5.1-20',
  '2001:db8::1', 'fe80::1ff:fe23:4567:890a', '2001:0db8:85a3:0000:0000:8a2e:0370:7334', '2001:db8::/32', '::ffff:10.9.9.9',
  'AA:BB:CC:11:22:33', 'aa-bb-cc-11-22-44', 'aabb.cc11.2255', 'aabbcc112266',
  'rtu01.se-norte.empresa.com.br', 'scada.local',
];
const TEXTO = `RTU da SE Norte, IP ${IDENTIFICADORES[0]}, rede ${IDENTIFICADORES[1]}, faixa ${IDENTIFICADORES[2]} e ${IDENTIFICADORES[3]}; ` +
  `IPv6 ${IDENTIFICADORES.slice(4, 9).join(', ')}; MACs ${IDENTIFICADORES.slice(9, 13).join(' / ')}; ` +
  `responde em ${IDENTIFICADORES[13]} e ${IDENTIFICADORES[14]}. hostname: SE-NORTE-RTU01, S/N: ZX9384A1. DNP3 porta 20000, firmware R136.`;

describe('P0-7: mascararParaIa', () => {
  it('nenhum IPv4, CIDR, faixa, IPv6, MAC (4 formatos), FQDN, hostname nem número de série sobra no texto', () => {
    const m = mascararParaIa(TEXTO);
    for (const v of [...IDENTIFICADORES, 'SE-NORTE-RTU01', 'ZX9384A1', '10.0.0.50', '-20']) expect(m.texto, v).not.toContain(v);
    expect(() => garantirSemEndereco(m.texto)).not.toThrow();
    expect(m.texto).toContain('DNP3 porta 20000');
    expect(m.texto).toContain('firmware R136');
    const valores = [...m.mapa.values()].map((x) => x.valor);
    expect(valores).toContain('10.1.1.10');
    expect(valores).toContain('AA:BB:CC:11:22:33');
    expect(valores).toContain('SE-NORTE-RTU01');
  });

  it('tokens aleatórios por chamada: a mesma entrada dá tokens diferentes', () => {
    const a = [...mascararParaIa('IP 10.0.0.1').mapa.keys()][0];
    const b = [...mascararParaIa('IP 10.0.0.1').mapa.keys()][0];
    expect(a).toMatch(/^\[\[IP_[0-9a-f]{8}\]\]$/);
    expect(a).not.toBe(b);
  });

  it('o mesmo valor repetido vira o mesmo token na chamada', () => {
    const m = mascararParaIa('10.0.0.1 e de novo 10.0.0.1');
    expect(m.mapa.size).toBe(1);
  });

  it('garantirSemEndereco lança se sobrou IP, MAC ou IPv6', () => {
    for (const t of ['x 10.0.0.1', 'x aa:bb:cc:dd:ee:ff', 'x 2001:db8::1', 'x aabb.ccdd.eeff']) expect(() => garantirSemEndereco(t), t).toThrow();
  });
});

describe('P0-7: restaurarSaida', () => {
  const m = mascararParaIa('IP 10.1.1.10, MAC aa:bb:cc:11:22:33, hostname: RTU01');
  const tok = (tipo: string) => [...m.mapa].find(([, v]) => v.tipo === tipo)![0];

  it('restaura só em ip/mac/hostname', () => {
    const r = restaurarSaida({ ip: tok('ip'), mac: tok('mac'), hostname: tok('hostname'), fabricante: 'SEL' }, m.mapa);
    expect(r).toEqual({ ip: '10.1.1.10', mac: 'aa:bb:cc:11:22:33', hostname: 'RTU01', fabricante: 'SEL' });
  });

  it('token em campo livre (nome, função, texto de apoio, lista) recusa a saída inteira', () => {
    for (const [campo, valor] of [['funcao', `telecontrole em ${tok('ip')}`], ['texto_apoio', tok('mac')], ['nome', tok('hostname').slice(2, -2)]] as const) {
      expect(() => restaurarSaida({ ip: tok('ip'), [campo]: valor }, m.mapa), campo).toThrow(RecusaIa);
    }
    expect(() => restaurarSaida({ protocolos_portas: [{ protocolo: tok('ip') }] }, m.mapa)).toThrow(RecusaIa);
  });

  it('token desconhecido, de tipo errado, ou valor literal em ip/mac recusa', () => {
    expect(() => restaurarSaida({ ip: '[[IP_00000000]]' }, m.mapa)).toThrow(RecusaIa);
    expect(() => restaurarSaida({ ip: tok('mac') }, m.mapa)).toThrow(RecusaIa);
    expect(() => restaurarSaida({ ip: '10.9.9.9' }, m.mapa)).toThrow(RecusaIa);
    expect(() => restaurarSaida({ funcao: 'gateway 10.9.9.9' }, m.mapa)).toThrow(RecusaIa);
  });

  it('ip/mac/hostname nulos passam', () => {
    expect(restaurarSaida({ ip: null, mac: null, hostname: null }, m.mapa)).toEqual({ ip: null, mac: null, hostname: null });
  });
});

describe('P0-7: perguntarIa', () => {
  const esquema = z.object({ ip: z.string().nullable(), funcao: z.string().nullable() }).strict();
  const ai = (resposta: unknown, prompts: string[] = []) => ({
    AI: { run: async (_m: string, p: { messages: { content: string }[] }, o: unknown) => { prompts.push(JSON.stringify(p), JSON.stringify(o)); return { response: resposta }; } },
  });

  it('o prompt chega sem o IP, a resposta volta restaurada; gateway com log desligado', async () => {
    const prompts: string[] = [];
    let token = '';
    const env = { AI: { run: async (_m: string, p: { messages: { content: string }[] }, o: unknown) => {
      prompts.push(JSON.stringify(p), JSON.stringify(o));
      token = /\[\[IP_[0-9a-f]{8}\]\]/.exec(p.messages[1].content)![0];
      return { response: { ip: token, funcao: 'telecontrole' } };
    } } };
    const r = await perguntarIa(env, 'sistema', 'ativo em 10.1.1.10', esquema, {});
    expect(r).toEqual({ ip: '10.1.1.10', funcao: 'telecontrole' });
    expect(prompts.join('')).not.toContain('10.1.1.10');
    expect(prompts[1]).toContain('"collectLog":false');
    expect(token).not.toBe('');
  });

  it('falha da máscara impede a chamada', async () => {
    let chamou = false;
    const env = { AI: { run: async () => { chamou = true; return { response: {} }; } } };
    const vazia = (t: string) => ({ texto: t, mapa: new Map() });
    await expect(perguntarIa(env, 's', 'ativo em 10.1.1.10', esquema, {}, vazia)).rejects.toThrow(RecusaIa);
    const quebra = () => { throw new Error('falhou'); };
    await expect(perguntarIa(env, 's', 'x', esquema, {}, quebra)).rejects.toThrow();
    expect(chamou).toBe(false);
  });

  it('resposta fora do esquema estrito (campo a mais) é recusada', async () => {
    await expect(perguntarIa(ai({ ip: null, funcao: 'x', extra: 1 }), 's', 'x', esquema, {})).rejects.toThrow(RecusaIa);
    await expect(perguntarIa(ai('não é json'), 's', 'x', esquema, {})).rejects.toThrow(RecusaIa);
  });
});
