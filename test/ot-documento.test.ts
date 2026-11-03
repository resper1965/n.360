import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { lerDocumento, dividirEmTrechos } from '../src/services/ot-documento';

const enc = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer;
const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
async function docx(corpo: string | null) {
  const z = new JSZip();
  if (corpo !== null) z.file('word/document.xml', `<w:document ${W}><w:body>${corpo}</w:body></w:document>`);
  else z.file('x.txt', 'x');
  return z.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' });
}

describe('lerDocumento', () => {
  it('TXT: três parágrafos, espaços colapsados', async () => {
    expect(await lerDocumento('a.txt', enc('um  dois\n\n\ntrês\r\nquatro   cinco'))).toEqual({ paragrafos: ['um dois', 'três', 'quatro cinco'] });
  });
  it('DOCX: runs, tabela e <w:pPr> ignorado', async () => {
    const b = await docx('<w:p><w:pPr><w:jc w:val="left"/></w:pPr><w:r><w:t>RTU 1 da SE</w:t></w:r><w:r><w:t xml:space="preserve"> Norte</w:t></w:r></w:p>'
      + '<w:tbl><w:tr><w:tc><w:p w:rsidR="1"><w:r><w:t>célula A</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>célula B</w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:p/>');
    expect(await lerDocumento('a.docx', b)).toEqual({ paragrafos: ['RTU 1 da SE Norte', 'célula A', 'célula B'] });
  });
  it('DOCX: <w:tab/>, <w:br/> e <w:cr/> viram espaço, <w:noBreakHyphen/> vira hífen', async () => {
    const b = await docx('<w:p><w:pPr><w:tabs><w:tab w:val="left" w:pos="720"/></w:tabs></w:pPr><w:r><w:t>Porta 502</w:t><w:tab/><w:t>10.0.0.5</w:t>'
      + '<w:br w:type="textWrapping"/><w:t>AA</w:t><w:cr/><w:t>SE</w:t><w:noBreakHyphen/><w:t>NORTE</w:t></w:r></w:p>');
    expect(await lerDocumento('a.docx', b)).toEqual({ paragrafos: ['Porta 502 10.0.0.5 AA SE-NORTE'] });
  });
  it('DOCX com DOCTYPE -> 400', async () => {
    const r = await lerDocumento('a.docx', await docx('<!DOCTYPE x><w:p><w:r><w:t>a</w:t></w:r></w:p>'));
    expect(r).toMatchObject({ status: 400 });
  });
  it('tipo, tamanho e DOCX sem document.xml', async () => {
    expect(await lerDocumento('a.pdf', enc('x'))).toMatchObject({ status: 400 });
    expect(await lerDocumento('a.txt', new ArrayBuffer(6 * 1024 * 1024))).toMatchObject({ status: 413 });
    expect(await lerDocumento('a.docx', await docx(null))).toMatchObject({ status: 400 });
  });
  it('acima de 60 mil caracteres -> 413', async () => {
    expect(await lerDocumento('a.txt', enc('a'.repeat(61_000)))).toEqual({ erro: 'Documento acima de 60 mil caracteres: divida em partes', status: 413 });
  });
});

describe('dividirEmTrechos', () => {
  it('junta até o máximo e corta parágrafo grande', () => {
    expect(dividirEmTrechos(['a'.repeat(2000), 'b'.repeat(2000)], 3000)).toHaveLength(2);
    const t = dividirEmTrechos(['a'.repeat(7000)]);
    expect(t).toHaveLength(3);
    expect(t.every((x) => x.length <= 3000)).toBe(true);
  });
  it('corta no último espaço', () => {
    expect(dividirEmTrechos(['aaaa bbbb cccc'], 10)).toEqual(['aaaa bbbb', 'cccc']);
  });
});
