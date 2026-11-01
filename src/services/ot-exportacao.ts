// Exportação do inventário ARCiber do n.ot (spec §8; modelo de ameaças P0-6, P1-6, T15, T23). Toda linha sai do serializador único
// (`serializarAtivo`): IP/MAC completos só para quem `podeVerCompleto`; cifra e hash nunca saem. Por site (§12.1, pergunta 5).
// CSV e XLSX pela mesma neutralização de fórmula; o XLSX só tem célula de texto (inlineStr), nunca fórmula nem número.
import { montarCsv, neutralizarFormula, TETO_LINHAS } from './exportacao';
import { serializarAtivo, type LinhaAtivo } from './ot-inventario';
import { SQL_COMPLETO_4_3_1 } from './ot-indicadores';
import type { ChavesOt } from './ot-cifra';

/** Os 6 campos do 4.3.1 da RO-CB.BR.01 (IP e MAC são um campo na norma, "IP ou MAC Address"; aqui em duas colunas). */
export const CAMPOS_4_3_1 = ['Tipo de dispositivo', 'Fabricante', 'Função', 'Endereço IP', 'MAC Address', 'Protocolo/porta', 'Firmware/SO'];
export const CABECALHO = ['Site', 'Zona', 'Nível Purdue', 'Ativo', 'No ARCiber', 'Categoria ARCiber', 'Modelo', ...CAMPOS_4_3_1, '4.3.1 completo', 'Última verificação'];

const CATEGORIA: Record<string, string> = { centro_operacao: 'Centro de operação', infra_dados_voz: 'Infraestrutura de dados e voz', ambiente_ons: 'Ambiente ONS' };
const simNao = (v: unknown) => (v ? 'Sim' : 'Não');

export async function linhasDoSite(db: D1Database, chaves: ChavesOt, projectId: string, siteId: string, completo: boolean) {
  const { results } = await db.prepare(`SELECT a.id, a.project_id, a.nome, a.no_arciber, a.categoria_arciber, a.tipo_dispositivo, a.fabricante, a.modelo,
      a.funcao, a.ip_cifrado, a.mac_cifrado, a.ip_hash, a.mac_hash, a.protocolos_portas, a.firmware_so_versao, a.firmware_nao_aplicavel,
      a.ultima_verificacao_em, s.nome AS site_nome, z.nome AS zona_nome, z.nivel_purdue, ${SQL_COMPLETO_4_3_1} AS completo_4_3_1
    FROM ot_ativos a JOIN ot_sites s ON s.id = a.site_id AND s.project_id = a.project_id
    LEFT JOIN ot_zonas z ON z.id = a.zona_id AND z.project_id = a.project_id AND z.status = 'ativo'
    WHERE a.project_id = ? AND a.site_id = ? AND a.status = 'ativo' ORDER BY a.nome, a.id LIMIT ?`).bind(projectId, siteId, TETO_LINHAS + 1).all<LinhaAtivo>();
  const truncado = results.length > TETO_LINHAS;
  const ativos = await Promise.all(results.slice(0, TETO_LINHAS).map((l) => serializarAtivo(l, completo, chaves)));
  const linhas = (ativos as Record<string, unknown>[]).map((a) => [
    a.site_nome, a.zona_nome, a.nivel_purdue, a.nome, simNao(a.no_arciber), CATEGORIA[String(a.categoria_arciber)] ?? '', a.modelo,
    a.tipo_dispositivo, a.fabricante, a.funcao, a.ip, a.mac,
    (a.protocolos_portas as { protocolo: string; porta?: number }[]).map((p) => (p.porta === undefined ? p.protocolo : `${p.protocolo}/${p.porta}`)).join(', '),
    a.firmware_nao_aplicavel ? 'Não aplicável' : a.firmware_so_versao, simNao(a.completo_4_3_1), a.ultima_verificacao_em,
  ]);
  return { linhas, truncado, sensiveis: completo ? results.filter((l) => l.ip_cifrado || l.mac_cifrado).length : 0 };
}

export const csvDoInventario = (linhas: unknown[][]) => montarCsv(CABECALHO, linhas);

// ─── XLSX mínimo: um zip sem compressão com a planilha em inlineStr ──────────
export const TIPO_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// Caractere de controle que o XML 1.0 não aceita sai; o resto é escapado.
const xml = (v: unknown) => String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const celula = (v: unknown) => `<c t="inlineStr"><is><t xml:space="preserve">${xml(neutralizarFormula(String(v ?? '')))}</t></is></c>`;

const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (b: Uint8Array) => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

/** Zip "stored" (método 0): o bastante para o XLSX, sem dependência nova. */
function zip(arquivos: [string, string][]): Uint8Array {
  const enc = new TextEncoder();
  const partes: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const [nome, conteudo] of arquivos) {
    const n = enc.encode(nome);
    const dados = enc.encode(conteudo);
    const crc = crc32(dados);
    const local = new DataView(new ArrayBuffer(30));
    [[0, 0x04034b50, 4], [4, 20, 2], [6, 0x0800, 2], [14, crc, 4], [18, dados.length, 4], [22, dados.length, 4], [26, n.length, 2]]
      .forEach(([o, v, t]) => (t === 4 ? local.setUint32(o, v, true) : local.setUint16(o, v, true)));
    const cd = new DataView(new ArrayBuffer(46));
    [[0, 0x02014b50, 4], [4, 20, 2], [6, 20, 2], [8, 0x0800, 2], [16, crc, 4], [20, dados.length, 4], [24, dados.length, 4], [28, n.length, 2], [42, offset, 4]]
      .forEach(([o, v, t]) => (t === 4 ? cd.setUint32(o, v, true) : cd.setUint16(o, v, true)));
    partes.push(new Uint8Array(local.buffer), n, dados);
    central.push(new Uint8Array(cd.buffer), n);
    offset += 30 + n.length + dados.length;
  }
  const tamanhoCd = central.reduce((s, p) => s + p.length, 0);
  const fim = new DataView(new ArrayBuffer(22));
  [[0, 0x06054b50, 4], [8, arquivos.length, 2], [10, arquivos.length, 2], [12, tamanhoCd, 4], [16, offset, 4]]
    .forEach(([o, v, t]) => (t === 4 ? fim.setUint32(o, v, true) : fim.setUint16(o, v, true)));
  const tudo = [...partes, ...central, new Uint8Array(fim.buffer)];
  const out = new Uint8Array(tudo.reduce((s, p) => s + p.length, 0));
  tudo.reduce((o, p) => { out.set(p, o); return o + p.length; }, 0);
  return out;
}

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
export function xlsxDoInventario(linhas: unknown[][]): Uint8Array {
  const folha = `${XML}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${
    [CABECALHO, ...linhas].map((l) => `<row>${l.map(celula).join('')}</row>`).join('')}</sheetData></worksheet>`;
  return zip([
    ['[Content_Types].xml', `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`],
    ['_rels/.rels', `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml', `${XML}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Inventário ARCiber" sheetId="1" r:id="rId1"/></sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`],
    ['xl/worksheets/sheet1.xml', folha],
  ]);
}
