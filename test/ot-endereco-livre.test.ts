import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { otAtivoCriarSchema, campoFluxo, otSiteCriarSchema, otLevantamentoAtualizarSchema, RECUSA_ENDERECO } from '../src/schemas/ot';

// P0-6: IP/MAC em campo livre sairia em claro para quem vê mascarado. `_`, letra colada e MAC sem separador ou com espaço
// também são endereço; versão de firmware fica fora (campo próprio) e texto comum de OT passa.

const fluxo = z.object(campoFluxo);
const ativo = (extra: Record<string, unknown>) => otAtivoCriarSchema.safeParse({ site_id: 's1', nome: 'RTU', ...extra }).success;

describe('P0-6: filtro de endereço em campo livre', () => {
  it('recusa endereço colado a _ ou letra, MAC sem separador e MAC com espaço', () => {
    for (const nome of ['RTU_10.1.1.10', 'IED10.1.1.10', 'SW_192.168.0.1', 'gw 10.0.0.1.', 'aabbccddeeff', 'MAC_001a2b3c4d5e',
      'AA BB CC DD EE FF', 'aa:bb:cc:dd:ee:ff', 'x_aabb.ccdd.eeff', 'v6_fe80:1:2:3:4:5', 'host 2001:db8::1']) {
      expect(ativo({ nome }), nome).toBe(false);
    }
  });

  it('protocolo do ativo e do fluxo também passam pelo filtro', () => {
    expect(ativo({ protocolos_portas: [{ protocolo: 'DNP3 10.1.1.10' }] })).toBe(false);
    expect(fluxo.safeParse({ protocolo: 'IEC104_10.1.1.10' }).success).toBe(false);
    expect(fluxo.safeParse({ protocolo: 'IEC 60870-5-104' }).success).toBe(true);
  });

  it('texto comum de OT e versão de firmware passam', () => {
    for (const nome of ['RTU Bay 1', 'SEL-751A', 'IED v2.4', 'Relé 87T', 'SE Norte 138kV', 'Modbus/TCP', 'IEC 61850 GOOSE']) expect(ativo({ nome }), nome).toBe(true);
    expect(ativo({ firmware_so_versao: '2.4.1.7', modelo: 'R1.2.3', protocolos_portas: [{ protocolo: 'DNP3', porta: 20000 }] })).toBe(true);
    expect(otSiteCriarSchema.safeParse({ nome: 'SE Sul', localizacao: 'Rodovia BR-101 km 12.5' }).success).toBe(true);
  });
  it('decisão do dono: item da norma com pontos é recusado, mas a mensagem explica o motivo e a saída (hífen passa)', () => {
    const r = otLevantamentoAtualizarSchema.safeParse({ notas: 'Atende o item 4.5.1.1 da norma' });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toBe(RECUSA_ENDERECO);
    expect(RECUSA_ENDERECO).toMatch(/dado sensível/);
    expect(RECUSA_ENDERECO).not.toMatch(/4\.5\.1\.1/);
    expect(otLevantamentoAtualizarSchema.safeParse({ notas: 'Atende o item 4.5.1-1 da norma' }).success).toBe(true);
  });
});
