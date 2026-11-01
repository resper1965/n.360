import { describe, it, expect } from 'vitest';
import { lerPlanilha, LIMITES_PLANILHA } from '../src/services/ot-planilha';
import xlsxReal from './fixtures/ot-planilha-openpyxl.xlsx.b64?raw';

// Leitor de planilha da coleta do n.ot (P0-3, P1-5): CSV e XLSX lidos no Worker, sem IA e sem R2. O XLSX real foi gerado pelo
// openpyxl 3.1.5 (strings inline, número, entidade numérica); os montados aqui cobrem sharedStrings, DTD e bomba de descompressão.

const bytes = (b64: string) => Uint8Array.from(atob(b64.trim()), (c) => c.charCodeAt(0));
const utf8 = (s: string) => new TextEncoder().encode(s);

async function deflate(dados: Uint8Array) {
  return new Uint8Array(await new Response(new Blob([dados]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
}

/** ZIP mínimo (sem CRC: o leitor não o confere) com as entradas dadas; `deflate` comprime, senão "stored". */
async function zip(entradas: Record<string, string | Uint8Array>, comprimir = true) {
  const locais: Uint8Array[] = [];
  const centrais: Uint8Array[] = [];
  let off = 0;
  for (const [nome, conteudo] of Object.entries(entradas)) {
    const cru = typeof conteudo === 'string' ? utf8(conteudo) : conteudo;
    const dado = comprimir ? await deflate(cru) : cru;
    const n = utf8(nome);
    const l = new DataView(new ArrayBuffer(30));
    l.setUint32(0, 0x04034b50, true); l.setUint16(8, comprimir ? 8 : 0, true);
    l.setUint32(18, dado.length, true); l.setUint32(22, cru.length, true); l.setUint16(26, n.length, true);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(10, comprimir ? 8 : 0, true);
    c.setUint32(20, dado.length, true); c.setUint32(24, cru.length, true); c.setUint16(28, n.length, true); c.setUint32(42, off, true);
    for (const p of [new Uint8Array(l.buffer), n, dado]) { locais.push(p); off += p.length; }
    centrais.push(new Uint8Array(c.buffer), n);
  }
  const tamCentral = centrais.reduce((a, p) => a + p.length, 0);
  const fim = new DataView(new ArrayBuffer(22));
  fim.setUint32(0, 0x06054b50, true); fim.setUint16(8, Object.keys(entradas).length, true); fim.setUint16(10, Object.keys(entradas).length, true);
  fim.setUint32(12, tamCentral, true); fim.setUint32(16, off, true);
  return new Blob([...locais, ...centrais, new Uint8Array(fim.buffer)]).arrayBuffer();
}

const SHARED = '<?xml version="1.0"?><sst><si><t>nome</t></si><si><t>ip</t></si><si><r><t>RTU </t></r><r><t xml:space="preserve">Norte</t></r></si></sst>';
const PLANILHA = '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>'
  + '<row r="2"><c r="A2" t="s"><v>2</v></c><c r="C2"><v>7</v></c><c r="B2" t="b"><v>1</v></c></row><row r="3"><c r="B3" t="str"><f>A1</f><v>x &amp; y</v></c></row></sheetData></worksheet>';

describe('lerPlanilha: CSV', () => {
  it('lê CSV com ; ou , e aspas (o lerCsv do n.privacy)', async () => {
    const r = await lerPlanilha('a.csv', utf8('nome;ip\n"RTU; 1";10.0.0.1\n').buffer as ArrayBuffer);
    expect(r).toEqual({ linhas: [['nome', 'ip'], ['RTU; 1', '10.0.0.1']] });
  });

  it('recusa extensão fora de csv/xlsx', async () => {
    expect(await lerPlanilha('a.xls', new ArrayBuffer(4))).toMatchObject({ erro: expect.stringContaining('csv ou xlsx') });
  });
});

describe('lerPlanilha: XLSX sem IA', () => {
  it('lê o XLSX real do openpyxl (strings inline, número, entidade numérica e de XML)', async () => {
    const r = await lerPlanilha('p.xlsx', bytes(xlsxReal).buffer as ArrayBuffer);
    expect('linhas' in r && r.linhas).toEqual([
      ['Nome', 'IP', 'MAC', 'Fabricante', 'Modelo', 'Tipo', 'Função', 'Protocolos', 'Firmware', 'ARCiber', 'Categoria'],
      ['RTU Bay 1', '10.1.1.10', 'AA-BB-CC-11-22-33', 'Fab', 'M1', 'RTU', 'telecontrole', 'DNP3:20000|IEC104:2404', '2.4.1.7', 'sim', 'centro_operacao'],
      ['IED <Sul> & "x"', '10.2.2.20', '', 'Fab', 'M2', 'IED', 'protecao', '', '', 'não', ''],
      ['12345', '', '', '', '', '', '', '', '', '', ''],
    ]);
  });

  it('lê sharedStrings (com runs), célula fora de ordem, booleano e resultado de fórmula, comprimido ou não', async () => {
    for (const comprimir of [true, false]) {
      const r = await lerPlanilha('x.xlsx', await zip({ 'xl/sharedStrings.xml': SHARED, 'xl/worksheets/sheet1.xml': PLANILHA }, comprimir));
      expect(r, String(comprimir)).toEqual({ linhas: [['nome', 'ip', ''], ['RTU Norte', '1', '7'], ['', 'x & y', '']] });
    }
  });

  it('recusa DTD/entidade (XXE, bilhão de risadas) sem expandir', async () => {
    const dtd = '<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "aaaa">]><worksheet><sheetData><row><c t="inlineStr"><is><t>&a;</t></is></c></row></sheetData></worksheet>';
    expect(await lerPlanilha('x.xlsx', await zip({ 'xl/worksheets/sheet1.xml': dtd }))).toMatchObject({ erro: expect.stringContaining('DTD') });
  });

  it('bomba de descompressão para no teto, sem ler tudo', async () => {
    const zeros = new Uint8Array(LIMITES_PLANILHA.descomprimido + 1024);
    const arq = await zip({ 'xl/worksheets/sheet1.xml': zeros });
    expect(arq.byteLength).toBeLessThan(LIMITES_PLANILHA.bytes);
    expect(await lerPlanilha('x.xlsx', arq)).toMatchObject({ erro: expect.stringContaining('descomprimid') });
  });

  it('arquivo que não é ZIP, ou ZIP sem planilha, é erro legível', async () => {
    expect(await lerPlanilha('x.xlsx', utf8('nome;ip').buffer as ArrayBuffer)).toMatchObject({ erro: expect.stringContaining('XLSX') });
    expect(await lerPlanilha('x.xlsx', await zip({ 'outro.xml': '<a/>' }))).toMatchObject({ erro: expect.stringContaining('planilha') });
  });
});

describe('lerPlanilha: tetos (P1-5)', () => {
  it('recusa arquivo, linhas, colunas e célula acima do teto', async () => {
    const { bytes: maxB, linhas, colunas, celula } = LIMITES_PLANILHA;
    expect(await lerPlanilha('a.csv', new ArrayBuffer(maxB + 1))).toMatchObject({ erro: expect.stringContaining('MB') });
    expect(await lerPlanilha('a.csv', utf8('nome\n' + 'x\n'.repeat(linhas + 1)).buffer as ArrayBuffer)).toMatchObject({ erro: expect.stringContaining('linhas') });
    expect(await lerPlanilha('a.csv', utf8(Array(colunas + 1).fill('c').join(';')).buffer as ArrayBuffer)).toMatchObject({ erro: expect.stringContaining('colunas') });
    expect(await lerPlanilha('a.csv', utf8('nome\n' + 'x'.repeat(celula + 1)).buffer as ArrayBuffer)).toMatchObject({ erro: expect.stringContaining('célula') });
    expect(await lerPlanilha('a.csv', utf8('nome\n' + 'x\n'.repeat(linhas)).buffer as ArrayBuffer)).toHaveProperty('linhas');
  });
});

// Entrada maliciosa curta (revisão de 2026-10-30): a varredura do XML é linear e os tetos valem DURANTE o parse.
describe('lerPlanilha: CPU e memória com entrada maliciosa (P1-5)', () => {
  const rapido = async (arq: ArrayBuffer, ms: number) => {
    const t0 = performance.now();
    const r = await lerPlanilha('x.xlsx', arq);
    expect(performance.now() - t0, 'varredura não linear').toBeLessThan(ms);
    return r;
  };

  it('<row>, <c>, <si> e <t> sem fechamento: recusa em tempo linear', async () => {
    const n = 60_000;
    const folha = (corpo: string) => `<worksheet><sheetData>${corpo}</sheetData></worksheet>`;
    expect(await rapido(await zip({ 'xl/worksheets/sheet1.xml': folha('<row>'.repeat(n)) }), 1000)).toHaveProperty('erro');
    expect(await rapido(await zip({ 'xl/worksheets/sheet1.xml': folha(`<row>${'<c>'.repeat(n)}</row>`) }), 1000)).toHaveProperty('erro');
    expect(await rapido(await zip({ 'xl/worksheets/sheet1.xml': folha(`<row><c t="inlineStr"><is>${'<t>'.repeat(n)}</is></c></row>`) }), 1000)).toHaveProperty('erro');
    expect(await rapido(await zip({ 'xl/sharedStrings.xml': `<sst>${'<si>'.repeat(n)}</sst>`, 'xl/worksheets/sheet1.xml': folha('') }), 1000)).toHaveProperty('erro');
  });

  it('sharedStrings com mais strings do que a planilha comporta é recusado durante a leitura', async () => {
    const { linhas, colunas } = LIMITES_PLANILHA;
    const sst = `<sst>${'<si><t>a</t></si>'.repeat(linhas * colunas + 1)}</sst>`;
    expect(await rapido(await zip({ 'xl/sharedStrings.xml': sst, 'xl/worksheets/sheet1.xml': '<worksheet/>' }), 3000)).toMatchObject({ erro: expect.stringContaining('strings') });
  });

  it('CSV de 5 MB com "a\\n" repetido para no teto de linhas sem montar a tabela inteira', async () => {
    const t0 = performance.now();
    const r = await lerPlanilha('a.csv', utf8('a\n'.repeat(LIMITES_PLANILHA.bytes / 2 - 8)).buffer as ArrayBuffer);
    expect(r).toMatchObject({ erro: expect.stringContaining('linhas') });
    expect(performance.now() - t0).toBeLessThan(300);
  });
});
