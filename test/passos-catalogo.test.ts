import { describe, it, expect } from 'vitest';
import { obterCatalogo } from '../src/data/passos/catalogo';
import { chaveDoCampo } from '../src/data/passos/catalogo';
import { PHASE_CHECKLISTS, PHASE_TITLES } from '../src/constants';
import { PHASE_QUESTIONS } from '../src/phase-questions';
import { CONSULTAS_ENTIDADE } from '../src/services/passos/contexto';
import { ENTIDADES } from '../src/data/passos/tipos';

const cat = obterCatalogo();
const itens = Object.entries(PHASE_CHECKLISTS).flatMap(([fase, lista]) => lista.map((i) => ({ ...i, fase: Number(fase) })));

describe('catálogo: estrutura', () => {
  it('as 6 etapas cobrem as 41 fases uma vez cada', () => {
    const fases = cat.etapas.flatMap((e) => e.fases).sort((a, b) => a - b);
    expect(fases).toEqual(PHASE_TITLES.map((_, i) => i));
    expect(cat.fases.map((f) => f.numero)).toEqual(PHASE_TITLES.map((_, i) => i));
  });
  it('fase aponta para a etapa que a contém', () => {
    for (const f of cat.fases) expect(cat.etapas.find((e) => e.id === f.etapa)?.fases).toContain(f.numero);
  });
  it('toda entidade da lista fechada tem consulta, com project_id', () => {
    for (const e of ENTIDADES) expect(CONSULTAS_ENTIDADE[e]).toMatch(/WHERE project_id = \?/);
  });
});

describe('catálogo: cobertura do checklist', () => {
  it('exatamente um passo por item de PHASE_CHECKLISTS, na mesma ordem', () => {
    expect(cat.passos.map((p) => p.id)).toEqual(itens.map((i) => i.id));
    expect(itens).toHaveLength(132);
  });
  it('ordem e fase do passo batem com o item', () => {
    for (const p of cat.passos) {
      const lista = PHASE_CHECKLISTS[p.fase];
      expect(lista.findIndex((i) => i.id === p.id) + 1, p.id).toBe(p.ordem);
    }
  });
});

describe('catálogo: editorial (o trabalho do pacote B; vermelho até acabar)', () => {
  const TERMOS_PROIBIDOS = /gap assessment|\bdod\b|definition of done|readiness|stage ?[12]\b|kick-?off|sponsor|quick wins?|deliverables?|checklist/i;
  // Exceção por id, com a razão. Nome próprio de norma ou prática que não tem tradução usual entra aqui, nunca por regex.
  const EXCECOES: Record<string, string> = {};

  it('todo texto visível é claro para o cliente (sem os termos em inglês da lista)', () => {
    const achados: string[] = [];
    for (const p of cat.passos) {
      const textos = [p.titulo, p.porQue, p.prova.descricao, ...p.campos.flatMap((c) => [c.rotulo, c.exemplo, c.ajuda ?? '']), ...p.concluidoQuando.map((c) => c.rotulo)];
      if (!EXCECOES[p.id] && textos.some((t) => TERMOS_PROIBIDOS.test(t))) achados.push(p.id);
    }
    for (const f of cat.fases) if (TERMOS_PROIBIDOS.test(f.titulo) || TERMOS_PROIBIDOS.test(f.objetivo)) achados.push(`fase ${f.numero}`);
    expect(achados).toEqual([]);
  });
  it('campo de texto tem exemplo', () => {
    const sem = cat.passos.flatMap((p) => p.campos.filter((c) => (c.tipo === 'texto' || c.tipo === 'texto_longo') && !c.exemplo).map((c) => `${p.id}.${c.id}`));
    expect(sem).toEqual([]);
  });
  it('todo passo tem ao menos um campo obrigatório e o título é um verbo no infinitivo', () => {
    expect(cat.passos.filter((p) => !p.campos.some((c) => c.obrigatorio)).map((p) => p.id)).toEqual([]);
    expect(cat.passos.filter((p) => !/^[A-ZÀ-Ú][a-zà-ú]+(ar|er|ir|or|ôr)\b/.test(p.titulo)).map((p) => p.id)).toEqual([]);
  });
  it('cada pergunta do questionário antigo é campo de exatamente um passo da mesma fase', () => {
    const donos = new Map<string, string[]>();
    for (const p of cat.passos) for (const c of p.campos) if (c.pergunta) donos.set(c.pergunta, [...(donos.get(c.pergunta) ?? []), p.id]);
    const esperadas = Object.values(PHASE_QUESTIONS).flat().map((q) => q.key);
    expect(esperadas.filter((k) => (donos.get(k) ?? []).length !== 1)).toEqual([]);
    for (const [k, ids] of donos) expect(ids[0].startsWith(`p${k.match(/^p(\d+)_/)![1]}_`), k).toBe(true);
  });
  it('campo que substitui pergunta tem o mesmo tipo e as mesmas opções dela', () => {
    const qs = new Map(Object.values(PHASE_QUESTIONS).flat().map((q) => [q.key, q]));
    const ruins: string[] = [];
    for (const p of cat.passos) for (const c of p.campos) {
      if (!c.pergunta) continue;
      const q = qs.get(c.pergunta)!;
      const tipoEsperado = { text: 'texto_longo', select: 'escolha', multi: 'multipla' }[q.type];
      if (c.tipo !== tipoEsperado && !(q.type === 'text' && c.tipo === 'texto')) ruins.push(`${p.id}.${c.id}: tipo`);
      if (q.options && JSON.stringify(c.opcoes) !== JSON.stringify(q.options)) ruins.push(`${p.id}.${c.id}: opções`);
    }
    expect(ruins).toEqual([]);
  });
  it('chave de resposta única no projeto inteiro', () => {
    const chaves = cat.passos.flatMap((p) => p.campos.map((c) => chaveDoCampo(p, c)));
    expect(new Set(chaves).size).toBe(chaves.length);
  });
  it('passo cujo item é de documento ou evidência pede prova; só tarefa pode dispensá-la', () => {
    const categoria = new Map(itens.map((i) => [i.id, i.category]));
    expect(cat.passos.filter((p) => categoria.get(p.id) !== 'task' && !p.prova.obrigatoria).map((p) => p.id)).toEqual([]);
  });
  // Os pares que, na crítica de design (2026-10-15), abriam o assistente de outro tema: o passo tem de tratar do item certo.
  it.each([
    ['p0_5', /comunica/i], ['p3_3', /exclus/i], ['p4_2', /lacuna/i], ['p11_1', /tratamento de riscos/i], ['p14_2', /codifica/i],
    ['p14_3', /vers/i], ['p18_4', /vulnerabilidade/i], ['p18_5', /criptografia/i], ['p21_2', /RoPA/], ['p21_4', /RIPD/],
  ])('%s trata do próprio tema', (id, tema) => {
    expect(cat.passos.find((p) => p.id === id)!.titulo).toMatch(tema);
  });
});
