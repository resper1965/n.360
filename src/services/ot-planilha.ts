// Leitura da planilha da coleta do n.ot (modelo de ameaças P0-3, P1-5; T13, T14). O arquivo é lido AQUI, em memória, e nunca
// vai ao R2 nem à IA: nada de `env.AI.toMarkdown` (que mandaria o XLSX bruto, com IP/MAC em claro, para fora do Worker).
// CSV pelo `lerCsv` do n.privacy. XLSX por um leitor de ZIP mínimo (DecompressionStream) e XML por expressão regular: sem DTD nem
// entidade declarada (recusadas), com teto de bytes descomprimidos por entrada.
import { lerCsv } from './tratamentos-importar';

export const LIMITES_PLANILHA = { bytes: 5 * 1024 * 1024, descomprimido: 20 * 1024 * 1024, linhas: 5000, colunas: 60, celula: 2048 };

type Leitura = { linhas: string[][] } | { erro: string };

export async function lerPlanilha(nome: string, arquivo: ArrayBuffer): Promise<Leitura> {
  const ext = nome.toLowerCase().split('.').pop();
  if (ext !== 'csv' && ext !== 'xlsx') return { erro: 'Tipo de arquivo não aceito: envie csv ou xlsx' };
  if (arquivo.byteLength > LIMITES_PLANILHA.bytes) return { erro: `Arquivo acima de ${LIMITES_PLANILHA.bytes / 1024 / 1024} MB` };
  let linhas: string[][];
  try {
    linhas = ext === 'csv' ? lerCsv(new TextDecoder().decode(arquivo)) : await lerXlsx(new Uint8Array(arquivo));
  } catch (e) {
    return { erro: e instanceof ErroPlanilha ? e.message : 'Arquivo XLSX ilegível' };
  }
  // A primeira linha é o cabeçalho.
  if (linhas.length - 1 > LIMITES_PLANILHA.linhas) return { erro: `Planilha acima de ${LIMITES_PLANILHA.linhas} linhas` };
  if (linhas.some((l) => l.length > LIMITES_PLANILHA.colunas)) return { erro: `Planilha acima de ${LIMITES_PLANILHA.colunas} colunas` };
  if (linhas.some((l) => l.some((c) => c.length > LIMITES_PLANILHA.celula))) return { erro: `Há célula acima de ${LIMITES_PLANILHA.celula} caracteres` };
  return { linhas };
}

class ErroPlanilha extends Error {}

// ─── ZIP ────────────────────────────────────────────────────────────────────
interface Entrada { metodo: number; comprimido: number; offsetLocal: number }

function diretorio(b: Uint8Array): Map<string, Entrada> {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let fim = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 0xffff); i--) if (v.getUint32(i, true) === 0x06054b50) { fim = i; break; }
  if (fim < 0) throw new ErroPlanilha('Arquivo XLSX ilegível (não é um ZIP)');
  const total = v.getUint16(fim + 10, true);
  let p = v.getUint32(fim + 16, true);
  const mapa = new Map<string, Entrada>();
  for (let n = 0; n < total; n++) {
    if (p + 46 > b.length || v.getUint32(p, true) !== 0x02014b50) throw new ErroPlanilha('Arquivo XLSX ilegível (diretório do ZIP)');
    const tamNome = v.getUint16(p + 28, true);
    const nome = new TextDecoder().decode(b.subarray(p + 46, p + 46 + tamNome));
    mapa.set(nome, { metodo: v.getUint16(p + 10, true), comprimido: v.getUint32(p + 20, true), offsetLocal: v.getUint32(p + 42, true) });
    p += 46 + tamNome + v.getUint16(p + 30, true) + v.getUint16(p + 32, true);
  }
  return mapa;
}

async function extrair(b: Uint8Array, e: Entrada): Promise<string> {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const o = e.offsetLocal;
  if (o + 30 > b.length || v.getUint32(o, true) !== 0x04034b50) throw new ErroPlanilha('Arquivo XLSX ilegível (entrada do ZIP)');
  const ini = o + 30 + v.getUint16(o + 26, true) + v.getUint16(o + 28, true);
  const dado = b.subarray(ini, ini + e.comprimido);
  if (e.metodo === 0) {
    if (dado.length > LIMITES_PLANILHA.descomprimido) throw new ErroPlanilha('XLSX acima do teto descomprimido');
    return new TextDecoder().decode(dado);
  }
  if (e.metodo !== 8) throw new ErroPlanilha('Arquivo XLSX com compressão não suportada');
  // O tamanho declarado no ZIP é do atacante: o teto vale sobre o que sai do descompressor, e o stream para no primeiro byte além.
  const leitor = new Blob([dado]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
  const partes: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    total += value.byteLength;
    if (total > LIMITES_PLANILHA.descomprimido) { await leitor.cancel().catch(() => {}); throw new ErroPlanilha('XLSX acima do teto descomprimido'); }
    partes.push(value);
  }
  return new TextDecoder().decode(await new Blob(partes).arrayBuffer());
}

// ─── XML do SpreadsheetML ───────────────────────────────────────────────────
const ENTIDADES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const texto = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, k: string) =>
  k[0] === '#' ? String.fromCodePoint(k[1].toLowerCase() === 'x' ? parseInt(k.slice(2), 16) : Number(k.slice(1))) : ENTIDADES[k.toLowerCase()]);
/** Texto de todos os `<t>` (uma string compartilhada pode vir em vários runs). */
const textos = (s: string) => [...s.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => texto(m[1])).join('');

const semDtd = (xml: string) => {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new ErroPlanilha('XLSX com DTD ou entidade declarada não é aceito');
  return xml;
};

const coluna = (ref: string) => [...ref.replace(/\d+$/, '').toUpperCase()].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

async function lerXlsx(b: Uint8Array): Promise<string[][]> {
  const dir = diretorio(b);
  // shortcut: a primeira planilha é a de menor número em xl/worksheets/ (Excel e openpyxl nomeiam sheet1..N na ordem); ler o
  // workbook.xml e os rels só se aparecer planilha com a ordem trocada.
  const folhas = [...dir.keys()].filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort((x, y) => x.localeCompare(y, undefined, { numeric: true }));
  if (!folhas.length) throw new ErroPlanilha('O XLSX não tem planilha');
  const compartilhadas = dir.has('xl/sharedStrings.xml')
    ? [...semDtd(await extrair(b, dir.get('xl/sharedStrings.xml')!)).matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textos(m[1]))
    : [];
  const xml = semDtd(await extrair(b, dir.get(folhas[0])!));
  const linhas: string[][] = [];
  for (const [, corpo] of xml.matchAll(/<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const linha: string[] = [];
    let prox = 0;
    for (const m of (corpo ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = m[1];
      const ref = attrs.match(/\br="([A-Z]+\d*)"/i)?.[1];
      const col = ref ? coluna(ref) : prox;
      if (col >= LIMITES_PLANILHA.colunas * 4) throw new ErroPlanilha(`Planilha acima de ${LIMITES_PLANILHA.colunas} colunas`);
      prox = col + 1;
      const tipo = attrs.match(/\bt="(\w+)"/)?.[1];
      const v = m[2]?.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      const valor = tipo === 'inlineStr' ? textos(m[2] ?? '') : tipo === 's' ? compartilhadas[Number(v)] ?? '' : v === undefined ? '' : texto(v);
      while (linha.length < col) linha.push('');
      linha[col] = valor;
    }
    if (linha.some((c) => c.trim() !== '')) linhas.push(linha);
    if (linhas.length > LIMITES_PLANILHA.linhas + 1) throw new ErroPlanilha(`Planilha acima de ${LIMITES_PLANILHA.linhas} linhas`);
  }
  const largura = Math.max(0, ...linhas.map((l) => l.length));
  return linhas.map((l) => [...l, ...Array(largura - l.length).fill('')]);
}
