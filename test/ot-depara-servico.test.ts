import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { achadosDoTexto, aplicarMapeamento, assinaturaDoCabecalho, ehNozomi, mapeamentoNozomi, mapeamentoPorCabecalho, proporMapeamento } from '../src/services/ot-depara';
import { RecusaIa } from '../src/services/ot-ia';
import { dividirEmTrechos, lerDocumento } from '../src/services/ot-documento';
import JSZip from 'jszip';

// De-para de planilha do n.ot (L4): assinatura do cabeçalho, mapeamento por cabeçalho, aplicação e proposta da IA mascarada (P0-7).

// Cabeçalho real do export de ativos do Nozomi (Guardian/Vantage), na ordem real; as linhas dos testes são inventadas.
const NOZOMI_CAB = ['appliance_sites', 'appliance_hosts', 'capture_device', 'name', 'type', 'os_or_firmware', 'ip', 'vendor', 'product_name', 'serial_number',
  'vlan_id', 'mac_address', 'mac_vendor', 'roles', 'level', 'protocols', 'zones', 'created_at', 'last_activity_time'];

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
      .toEqual([{ dados: { nome: 'RTU', ip: '10.0.0.1', no_arciber: true }, linha: 2 }]);
  });

  it('MAC em 3+ linhas da planilha é do gateway e sai delas; em 2 linhas fica', () => {
    const m = { '0': 'nome', '1': 'mac' } as const;
    const r = aplicarMapeamento([['A', '02:00:00:00:00:01'], ['B', '02-00-00-00-00-01'], ['C', '0200.0000.0001'], ['D', '02:00:00:00:00:02'],
      ['E', '02:00:00:00:00:02'], ['', '02:00:00:00:00:01']], m);
    expect(r.map((x) => x.dados)).toEqual([{ nome: 'A' }, { nome: 'B' }, { nome: 'C' }, { nome: 'D', mac: '02:00:00:00:00:02' }, { nome: 'E', mac: '02:00:00:00:00:02' }]);
  });

  it('export Nozomi: reconhecido por appliance_hosts + capture_device, mapeado pelo nome da coluna em qualquer ordem', () => {
    expect(ehNozomi(NOZOMI_CAB)).toBe(true);
    expect(ehNozomi(['Appliance_Hosts ', 'CAPTURE_DEVICE', 'ip'])).toBe(true);
    expect(ehNozomi(['appliance_hosts', 'ip'])).toBe(false);
    expect(mapeamentoNozomi(NOZOMI_CAB)).toEqual({ '3': 'nome', '4': 'tipo_dispositivo', '5': 'firmware_so_versao', '6': 'ip', '7': 'fabricante',
      '8': 'modelo', '11': 'mac', '15': 'protocolos_portas', '16': 'zona' });
    const invertido = [...NOZOMI_CAB].reverse();
    expect(mapeamentoNozomi(invertido)).toEqual({ '15': 'nome', '14': 'tipo_dispositivo', '13': 'firmware_so_versao', '12': 'ip', '11': 'fabricante',
      '10': 'modelo', '7': 'mac', '3': 'protocolos_portas', '2': 'zona' });
  });

  it('export Nozomi: protocolos tcp/445 viram protocolo + porta, other sai; zona tira Undefined/Layer2/Link-local e fica com a primeira', () => {
    const m = mapeamentoNozomi(NOZOMI_CAB);
    const l = (protocols: string, zones: string, mac = '02:00:00:00:00:10') => ['Site X', 'guardian-x', 'port1', 'RTU-01', 'rtu', 'v2.1', '10.20.0.5', 'Fab', 'Mod', 'SN1', '10',
      mac, 'RouterVendor', 'slave', '1', protocols, zones, '2026-01-01', '2026-01-02'];
    const [a, b, c] = aplicarMapeamento([l('tcp/445, other,iec104 ,udp/161,opc-ua', 'Undefined, Controle,Supervisao'), l('other', 'layer2, link-local ,undefined', '02:00:00:00:00:11'),
      l('', 'Controle', '02:00:00:00:00:12')], m, true);
    expect(a.dados).toEqual({ nome: 'RTU-01', tipo_dispositivo: 'rtu', firmware_so_versao: 'v2.1', ip: '10.20.0.5', fabricante: 'Fab', modelo: 'Mod',
      mac: '02:00:00:00:00:10', protocolos_portas: [{ protocolo: 'tcp', porta: 445 }, { protocolo: 'iec104' }, { protocolo: 'udp', porta: 161 }, { protocolo: 'opc-ua' }],
      zona: 'Controle' });
    expect(b.dados).not.toHaveProperty('protocolos_portas');
    expect(b.dados).not.toHaveProperty('zona');
    expect(c.dados).toMatchObject({ zona: 'Controle', mac: '02:00:00:00:00:12' });
    expect(c.dados).not.toHaveProperty('protocolos_portas');
    // planilha comum: o "tcp/445" segue como texto livre
    expect(aplicarMapeamento([['tcp/445']], { '0': 'protocolos_portas' })[0].dados).toEqual({ protocolos_portas: [{ protocolo: 'tcp/445' }] });
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

  it('proposta: hostname solto na amostra vira [[HOST_]]; o cabeçalho segue legível', async () => {
    let entrada = '';
    const run = async (_m: string, p: { messages: { content: string }[] }) => {
      entrada = p.messages[1].content;
      return { response: { colunas: [{ indice: 0, campo: 'nome' }] } };
    };
    await proporMapeamento({ ...env, AI: { run } }, ['Hostname', 'IP', 'Contato'], [['SE-NORTE-RTU01', '10.0.0.1', 'ana@x.com']]);
    expect(entrada).toContain('Hostname');
    expect(entrada).not.toContain('SE-NORTE-RTU01');
    expect(entrada).toMatch(/"\[\[HOST_[0-9a-f]{8}\]\]","\[\[IP_[0-9a-f]{8}\]\]","\[e-mail\]"/);
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

  it('texto: DOCX com <w:tab/> entre a porta e o IP chega à IA com o IP mascarado', async () => {
    const z = new JSZip();
    z.file('word/document.xml', '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'
      + '<w:p><w:r><w:t>RTU porta 502</w:t><w:tab/><w:t>10.0.0.5</w:t></w:r></w:p></w:body></w:document>');
    const lido = await lerDocumento('a.docx', await z.generateAsync({ type: 'arraybuffer' }));
    expect(lido).toEqual({ paragrafos: ['RTU porta 502 10.0.0.5'] });
    const visto: string[] = [];
    await achadosDoTexto(iaTexto(() => [], visto), dividirEmTrechos((lido as { paragrafos: string[] }).paragrafos));
    expect(visto[0]).toMatch(/^RTU porta 502 \[\[IP_[0-9a-f]{8}\]\]$/);
    expect(visto[0]).not.toContain('10.0.0.5');
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
