// Gera src/data/passos/etapa-N.ts a partir dos assistentes (wizards.js), do checklist (constants.ts), do roteiro por fase
// (PHASE_PLAYBOOKS, globals.js) e de PHASE_META. Roda UMA vez (pacote 0); depois os arquivos são editados à mão pelos redatores.
// Uso: node scripts/passos-esqueleto.mjs
import { readFileSync, writeFileSync } from 'node:fs';

globalThis.window = {};
const { DOC_WIZARDS } = await import('../frontend/src/data/wizards.js');
const constantes = readFileSync('src/constants.ts', 'utf8');
const meta = readFileSync('src/phase-questions.ts', 'utf8');
const globais = readFileSync('frontend/src/globals.js', 'utf8');

const itens = [...constantes.matchAll(/\{ id: '(p(\d+)_(\d+))', text: '([^']*)', category: '(\w+)' \}/g)]
  .map((m) => ({ id: m[1], fase: Number(m[2]), texto: m[4], categoria: m[5] }));
// ordem = posição na fase (a fase 34 tem o item p34_0: o sufixo do id não serve)
for (const i of itens) i.ordem = itens.filter((o) => o.fase === i.fase).indexOf(i) + 1;
const titulos = [...constantes.slice(constantes.indexOf('PHASE_TITLES'), constantes.indexOf('PHASE_CHECKLISTS'))
  .matchAll(/^\s+'([^']*)', \/\/ (\d+)$/gm)].reduce((o, m) => ({ ...o, [m[2]]: m[1] }), {});
const clausulas = [...meta.matchAll(/^\s+(\d+): \{ titulo: '[^']*', clausula: '([^']*)' \}/gm)].reduce((o, m) => ({ ...o, [m[1]]: m[2] }), {});
const roteiro = [...globais.matchAll(/^\s+(\d+): \{ obj: "[^"]*", guideline: "(.*)" \},?\s*$/gm)].reduce((o, m) => ({ ...o, [m[1]]: m[2] }), {});

const ETAPAS = [[1, 0, 6], [2, 7, 13], [3, 14, 20], [4, 21, 28], [5, 29, 33], [6, 34, 40]];
const TIPO = { text: 'texto', textarea: 'texto_longo', select: 'escolha', date: 'data' };

function passoDe(item) {
  const w = DOC_WIZARDS[item.id];
  if (!w) throw new Error(`sem assistente para ${item.id}`);
  const campos = w.fields.map((f) => {
    const c = {
      id: f.id, rotulo: f.label, tipo: TIPO[f.type], obrigatorio: f.required === true,
      exemplo: f.type === 'text' || f.type === 'textarea' ? (f.placeholder ?? '').replace(/^Ex:?\s*/i, '').trim() : '',
    };
    if (f.type === 'select') c.opcoes = f.options;
    return c;
  });
  const obrigatoria = item.categoria !== 'task';
  const criterios = [{ tipo: 'campos_preenchidos', rotulo: 'Campos obrigatórios preenchidos' }];
  if (obrigatoria) criterios.push({ tipo: 'evidencia_anexada', rotulo: 'Prova anexada' });
  const passo = {
    id: item.id, fase: item.fase, ordem: item.ordem, titulo: w.title, clausula: w.isoRef, porQue: w.auditorTip, campos,
    prova: { descricao: w.evidence, obrigatoria, aceita: 'ambos' }, ondeVive: [], concluidoQuando: criterios,
  };
  if (!w.evidenceOnly) passo.gera = 'documento';
  return passo;
}

for (const [id, ini, fim] of ETAPAS) {
  const fases = [], passos = [];
  for (let n = ini; n <= fim; n++) {
    fases.push({ numero: n, etapa: id, titulo: titulos[n], clausula: clausulas[n] ?? '', objetivo: roteiro[n] });
    for (const item of itens.filter((i) => i.fase === n)) passos.push(passoDe(item));
  }
  const ts = `// Etapa ${id} da trilha (fases ${ini} a ${fim}). Gerado por scripts/passos-esqueleto.mjs e editado à mão: o conteúdo daqui é o do produto.\n`
    + `import type { FaseDoCatalogo, Passo } from './tipos';\n\n`
    + `export const FASES_ETAPA_${id}: FaseDoCatalogo[] = ${JSON.stringify(fases, null, 2)};\n\n`
    + `export const PASSOS_ETAPA_${id}: Passo[] = ${JSON.stringify(passos, null, 2)};\n`;
  writeFileSync(`src/data/passos/etapa-${id}.ts`, ts);
}
console.log(`${itens.length} itens, ${Object.keys(DOC_WIZARDS).length} assistentes`);
