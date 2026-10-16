import { describe, it, expect } from 'vitest';
import { catalogoSchema } from '../src/data/passos/tipos';
import catalogoRaw from '../contracts/bancada/catalogo.json?raw';
import bancadaRaw from '../contracts/bancada/bancada.json?raw';

const ler = (raw: string) => JSON.parse(raw);

describe('contratos da Bancada (contracts/bancada)', () => {
  it('catalogo.json é um catálogo válido', () => {
    const { ok, ...cat } = ler(catalogoRaw);
    expect(ok).toBe(true);
    expect(() => catalogoSchema.parse(cat)).not.toThrow();
  });
  it('catalogo.json e bancada.json falam da mesma versão', () => {
    expect(ler(catalogoRaw).versao).toBe(ler(bancadaRaw).catalogo_versao);
  });
});
