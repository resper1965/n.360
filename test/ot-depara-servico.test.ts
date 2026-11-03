import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { achadosDoTexto, aplicarMapeamento, assinaturaDoCabecalho, mapeamentoPorCabecalho, proporMapeamento } from '../src/services/ot-depara';
import { RecusaIa } from '../src/services/ot-ia';

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

  // Texto: o falso lê o que recebeu (já mascarado) e devolve itens com evidência copiada dele.
  const iaTexto = (itens: (t: string) => Record<string, unknown>[], visto: string[] = [], tokens: number[] = []) => ({ ...env, AI: { run: async (_m: string, p: { messages: { content: string }[]; max_tokens: number }) => {
    visto.push(p.messages[1].content);
    tokens.push(p.max_tokens);
    return { response: { itens: itens(p.messages[1].content) } };
  } } });

  it('texto: IP mascarado à IA, restaurado no achado; evidência gravada sem endereço', async () => {
    const visto: string[] = [];
    const r = await achadosDoTexto(iaTexto((t) => {
      const ip = t.match(/\[\[IP_[0-9a-f]{8}\]\]/)![0];
      return [{ nome: 'RTU SEL-3530', ip, hostname: null, evidencia: `RTU SEL-3530 em ${ip}` }];
    }, visto), ['A RTU SEL-3530 em 10.1.1.10 faz o telecontrole.']);
    expect(visto[0]).toContain('[[IP_');
    expect(visto[0]).not.toContain('10.1.1.10');
    expect(r).toEqual({ itens: [{ dados: { nome: 'RTU SEL-3530', ip: '10.1.1.10' }, evidencia: 'RTU SEL-3530 em [IP]' }], descartados: 0, trechos_pulados: 0 });
  });

  it('texto: evidência que não está no trecho é descartada', async () => {
    const r = await achadosDoTexto(iaTexto(() => [{ nome: 'Switch', evidencia: 'switch no rack 4' }]), ['O switch do rack 3 liga a rede.']);
    expect(r).toEqual({ itens: [], descartados: 1, trechos_pulados: 0 });
  });

  it('texto: e-mail vira [e-mail] antes da IA; hostname só vira nome quando falta nome', async () => {
    const visto: string[] = [];
    const r = await achadosDoTexto(iaTexto((t) => {
      const h = t.match(/\[\[HOST_[0-9a-f]{8}\]\]/)![0];
      return [{ nome: '', hostname: h, evidencia: 'contato [e-mail]' }];
    }, visto), ['Falar com ana@x.com, contato [e-mail] do hostname: rtu-01']);
    expect(visto[0]).toContain('[e-mail]');
    expect(visto[0]).not.toContain('ana@x.com');
    expect(r.itens).toEqual([{ dados: { nome: 'rtu-01' }, evidencia: 'contato [e-mail]' }]);
  });

  it('texto: max_tokens 6000; item sem nenhum campo é descartado; mais de 25 itens recusa', async () => {
    const tokens: number[] = [];
    const r = await achadosDoTexto(iaTexto(() => [{ nome: null, fabricante: ' ', evidencia: 'O switch' }], [], tokens), ['O switch do rack 3.']);
    expect(tokens).toEqual([6000]);
    expect(r).toEqual({ itens: [], descartados: 1, trechos_pulados: 0 });
    await expect(achadosDoTexto(iaTexto(() => Array.from({ length: 26 }, () => ({ nome: 'S', evidencia: 'O switch' }))), ['O switch do rack 3.']))
      .rejects.toBeInstanceOf(RecusaIa);
  });

  it('texto: token em nome recusa a resposta inteira', async () => {
    await expect(achadosDoTexto(iaTexto((t) => [{ nome: t.match(/\[\[IP_[0-9a-f]{8}\]\]/)![0], evidencia: 'RTU' }]), ['RTU em 10.1.1.10']))
      .rejects.toBeInstanceOf(RecusaIa);
  });
});
