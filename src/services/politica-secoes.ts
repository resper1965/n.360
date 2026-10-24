/**
 * Seções de uma política temática (spec 2026-10-23): a seção mora no próprio texto do rascunho, delimitada por
 * "## N. Título" no início da linha. Funções puras, sem banco.
 */
export const MARCA_A_GERAR = '> Seção a gerar.';
export const AVISO_INCOMPLETA = '> Seção incompleta: gere de novo ou complete à mão.';
export type Secao = { n: number; titulo: string; corpo: string; situacao: 'a_gerar' | 'incompleta' | 'pronta' };

const TITULO = /^## (\d+)\. (.+)$/gm;

export function montarEsqueleto(titulo: string, secoes: string[]): string {
  return `# ${titulo}\n\n` + secoes.map((s, i) => `## ${i + 1}. ${s}\n\n${MARCA_A_GERAR}\n`).join('\n');
}

export function lerSecoes(texto: string): Secao[] {
  const achados = [...texto.matchAll(TITULO)];
  return achados.map((m, i) => {
    const inicio = m.index! + m[0].length;
    const fim = i + 1 < achados.length ? achados[i + 1].index! : texto.length;
    const corpo = texto.slice(inicio, fim).trim();
    const situacao = !corpo || corpo === MARCA_A_GERAR ? 'a_gerar' : corpo.includes(AVISO_INCOMPLETA) ? 'incompleta' : 'pronta';
    return { n: Number(m[1]), titulo: m[2].trim(), corpo, situacao };
  });
}

export function trocarSecao(texto: string, n: number, corpo: string): string | null {
  const achados = [...texto.matchAll(TITULO)];
  const i = achados.findIndex((m) => Number(m[1]) === n);
  if (i < 0) return null;
  const inicio = achados[i].index! + achados[i][0].length;
  const fim = i + 1 < achados.length ? achados[i + 1].index! : texto.length;
  return `${texto.slice(0, inicio)}\n\n${corpo.trim()}\n${i + 1 < achados.length ? '\n' : ''}${texto.slice(fim)}`;
}

export function conferirSecao(corpo: string): string | null {
  const t = corpo.trim();
  if (!t) return 'seção vazia';
  if (/\[Organization Name\]|\{\{[^}]*\}\}/i.test(t)) return 'texto com marcador de modelo';
  if (/^## \d+\./m.test(t)) return 'a resposta trouxe título de outra seção';
  return null;
}
