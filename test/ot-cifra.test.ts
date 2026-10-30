import { describe, it, expect } from 'vitest';
import { aadOt, chavesOt, cifrarOt, decifrarOt, hmacOt, normalizarIp, normalizarMac, mascararMac } from '../src/services/ot-cifra';

const ENV = { OT_INVENTARIO_KEY: 'chave-de-teste-ot', OT_INVENTARIO_HMAC_KEY: 'hmac-de-teste-ot' };
const K = chavesOt(ENV)!;
const AAD = aadOt('proj-a', 'ot_ativos', 'a1', 'ip');

describe('P0-8: cifra própria do n.ot', () => {
  it('sem qualquer uma das duas chaves não há cifra (a rota responde 503)', () => {
    expect(chavesOt({})).toBeNull();
    expect(chavesOt({ OT_INVENTARIO_KEY: 'x' })).toBeNull();
    expect(chavesOt({ OT_INVENTARIO_HMAC_KEY: 'x' })).toBeNull();
    expect(K).not.toBeNull();
  });

  it('ida e volta, com prefixo versionado ot1:<kid>: e IV aleatório', async () => {
    const c1 = await cifrarOt('10.0.0.1', K, AAD);
    const c2 = await cifrarOt('10.0.0.1', K, AAD);
    expect(c1).toMatch(/^ot1:k1:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/);
    expect(c1).not.toBe(c2);
    expect(c1).not.toContain('10.0.0.1');
    expect(await decifrarOt(c1, K, AAD)).toBe('10.0.0.1');
  });

  it('AAD errada não decifra: cifra copiada para outra linha, outro campo ou outro projeto', async () => {
    const c = await cifrarOt('10.0.0.1', K, AAD);
    for (const aad of [aadOt('proj-b', 'ot_ativos', 'a1', 'ip'), aadOt('proj-a', 'ot_ativos', 'a2', 'ip'), aadOt('proj-a', 'ot_ativos', 'a1', 'mac')]) {
      await expect(decifrarOt(c, K, aad), aad).rejects.toThrow();
    }
  });

  it('valor sem o prefixo ot1 é recusado (não é "legado em claro"); kid desconhecido é recusado; chave errada não decifra', async () => {
    await expect(decifrarOt('10.0.0.1', K, AAD)).rejects.toThrow(/ot1/);
    const c = await cifrarOt('10.0.0.1', K, AAD);
    await expect(decifrarOt(c.replace('ot1:k1:', 'v1:'), K, AAD)).rejects.toThrow(/ot1/);
    await expect(decifrarOt(c.replace('ot1:k1:', 'ot1:k9:'), K, AAD)).rejects.toThrow(/k9/);
    await expect(decifrarOt(c, chavesOt({ ...ENV, OT_INVENTARIO_KEY: 'outra' })!, AAD)).rejects.toThrow();
  });

  it('HMAC por projeto: o mesmo IP em dois projetos dá hashes diferentes; no mesmo projeto, estável', async () => {
    const a = await hmacOt(K, 'proj-a', '10.0.0.1');
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(await hmacOt(K, 'proj-a', '10.0.0.1')).toBe(a);
    expect(await hmacOt(K, 'proj-b', '10.0.0.1')).not.toBe(a);
    expect(await hmacOt(chavesOt({ ...ENV, OT_INVENTARIO_HMAC_KEY: 'outra' })!, 'proj-a', '10.0.0.1')).not.toBe(a);
  });
});

describe('normalização de IP e MAC (o hash precisa casar o mesmo endereço escrito de outro jeito)', () => {
  it('IPv4 sem zeros à esquerda; IPv6 canônico; inválido é null', () => {
    // zero à esquerda é ambíguo (octal em várias ferramentas: 010 = 8): recusado, não normalizado, para o dedupe não mesclar ativos diferentes
    for (const ambiguo of ['010.0.0.1', '010.000.000.001', '10.0.0.01', '192.168.001.1']) expect(normalizarIp(ambiguo), ambiguo).toBeNull();
    expect(normalizarIp('10.0.0.0')).toBe('10.0.0.0');
    expect(normalizarIp(' 192.168.1.20 ')).toBe('192.168.1.20');
    expect(normalizarIp('2001:0DB8:0000:0000:0000:0000:0000:0001')).toBe('2001:db8::1');
    for (const ruim of ['256.1.1.1', '1.2.3', 'abc', '10.0.0.1/24', '', '1.2.3.4.5']) expect(normalizarIp(ruim), ruim).toBeNull();
  });

  it('MAC nos 4 formatos vira aa:bb:cc:dd:ee:ff; inválido é null; máscara mostra só o OUI', () => {
    for (const m of ['AA:BB:CC:DD:EE:FF', 'aa-bb-cc-dd-ee-ff', 'aabb.ccdd.eeff', 'AABBCCDDEEFF']) expect(normalizarMac(m), m).toBe('aa:bb:cc:dd:ee:ff');
    for (const ruim of ['aa:bb:cc:dd:ee', 'zz:bb:cc:dd:ee:ff', '']) expect(normalizarMac(ruim), ruim).toBeNull();
    expect(mascararMac('aa:bb:cc:dd:ee:ff')).toBe('aa:bb:cc:••:••:••');
  });
});
