import { LIMITES_PLANILHA, ErroPlanilha, diretorio, extrair, elementos, decodificarXml, semDtd } from './ot-planilha';

export const LIMITES_TEXTO = { caracteres: 60_000, trecho: 3_000, trechos: 20 } as const;
export const normalizarEspacos = (s: string) => s.replace(/\s+/g, ' ').trim();

type Leitura = { paragrafos: string[] } | { erro: string; status: 400 | 413 };

export async function lerDocumento(nome: string, arquivo: ArrayBuffer): Promise<Leitura> {
  const ext = nome.toLowerCase().split('.').pop();
  if (ext !== 'txt' && ext !== 'docx') return { erro: 'Tipo de arquivo não aceito: envie txt ou docx', status: 400 };
  if (arquivo.byteLength > LIMITES_PLANILHA.bytes) return { erro: `Arquivo acima de ${LIMITES_PLANILHA.bytes / 1024 / 1024} MB`, status: 413 };
  let brutos: string[];
  try {
    if (ext === 'txt') brutos = new TextDecoder().decode(arquivo).split(/\r?\n/);
    else {
      const b = new Uint8Array(arquivo);
      const entrada = diretorio(b).get('word/document.xml');
      if (!entrada) return { erro: 'DOCX sem word/document.xml', status: 400 };
      // Tabulação e quebra de linha viram espaço (e o hífen inseparável, hífen): sem isso "502⇥10.0.0.5" colaria em "50210.0.0.5",
      // que nem a máscara nem a conferência de resíduo reconhecem como endereço (P0-7).
      const xml = semDtd(await extrair(b, entrada)).replace(/<w:(?:tab|br|cr)\b[^>]*\/>/g, '<w:t> </w:t>').replace(/<w:noBreakHyphen\b[^>]*\/>/g, '<w:t>-</w:t>');
      // Tabelas: cada célula contém seus <w:p>, então a varredura plana já gera um parágrafo por célula.
      brutos = [...elementos(xml, 'w:p')].map(([, p]) => [...elementos(p, 'w:t')].map(([, t]) => decodificarXml(t)).join(''));
    }
  } catch (e) {
    return { erro: e instanceof ErroPlanilha ? e.message : 'Arquivo ilegível', status: 400 };
  }
  const paragrafos = brutos.map(normalizarEspacos).filter(Boolean);
  if (paragrafos.reduce((n, p) => n + p.length, 0) > LIMITES_TEXTO.caracteres)
    return { erro: 'Documento acima de 60 mil caracteres: divida em partes', status: 413 };
  return { paragrafos };
}

export function dividirEmTrechos(paragrafos: string[], max: number = LIMITES_TEXTO.trecho): string[] {
  const trechos: string[] = [];
  let atual = '';
  const fecha = () => { if (atual) trechos.push(atual); atual = ''; };
  for (let p of paragrafos) {
    while (p.length > max) {
      fecha();
      const sp = p.lastIndexOf(' ', max);
      const corte = sp > 0 ? sp : max;
      trechos.push(p.slice(0, corte));
      p = p.slice(corte).trimStart();
    }
    if (atual && atual.length + 1 + p.length > max) fecha();
    atual = atual ? `${atual}\n${p}` : p;
  }
  fecha();
  return trechos;
}
