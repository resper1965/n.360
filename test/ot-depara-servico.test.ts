import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { aplicarMapeamento, assinaturaDoCabecalho, mapeamentoPorCabecalho, proporMapeamento } from '../src/services/ot-depara';

// De-para de planilha do n.ot (L4): assinatura do cabeçalho, mapeamento por cabeçalho, aplicação e proposta da IA mascarada (P0-7).

describe('de-para: serviço', () => {
  it('assinatura ignora caixa, acento e espaços', async () => {
    expect(await assinaturaDoCabecalho(['Nome', 'IP'])).toBe(await assinaturaDoCabecalho([' nome ', 'ip']));
    expect(await assinaturaDoCabecalho(['Nome', 'IP'])).toHaveLength(64);
  });

  it('mapeamento por cabeçalho usa o mapa da coleta', () => {
    expect(mapeamentoPorCabecalho(['Ativo', 'Endereço IP', 'x'])).toEqual({ '0': 'nome', '1': 'ip' });
  });

  it('aplicar converte como a coleta e pula linha vazia', () => {
    expect(aplicarMapeamento([['RTU', '10.0.0.1', 'sim'], ['', ' ', '']], { '0': 'nome', '1': 'ip', '2': 'no_arciber' }))
      .toEqual([{ nome: 'RTU', ip: '10.0.0.1', no_arciber: true }]);
  });

  it('proposta da IA: entrada mascarada, saída validada', async () => {
    let entrada = '';
    const run = async (_m: string, p: { messages: { content: string }[] }) => {
      entrada = p.messages.map((m) => m.content).join('\n');
      return { response: { colunas: [{ indice: 0, campo: 'nome' }, { indice: 1, campo: 'ip' }, { indice: 2, campo: 'nome' }] } };
    };
    const r = await proporMapeamento({ ...env, AI: { run } }, ['Equipamento', 'Endereço', 'Contato'],
      [['RTU 1', '10.0.0.1', 'ana@x.com']]);
    expect(r).toEqual({ mapeamento: { '0': 'nome', '1': 'ip' }, origem: 'ia' });
    expect(entrada).toContain('RTU 1');
    expect(entrada).not.toContain('10.0.0.1');
    expect(entrada).not.toContain('ana@x.com');
  });

  it('IA fora do ar ou índice fora do cabeçalho: cai no cabeçalho com aviso', async () => {
    const sem = await proporMapeamento({ ...env, AI: undefined }, ['Nome', 'IP'], []);
    expect(sem).toMatchObject({ mapeamento: { '0': 'nome', '1': 'ip' }, origem: 'cabecalho' });
    expect(sem.aviso).toBeTruthy();
    const fora = await proporMapeamento({ ...env, AI: { run: async () => ({ response: { colunas: [{ indice: 9, campo: 'nome' }] } }) } }, ['Nome'], []);
    expect(fora.origem).toBe('cabecalho');
  });
});
