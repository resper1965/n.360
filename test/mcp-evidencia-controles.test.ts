import { describe, it, expect } from 'vitest';
import { executarFerramenta, TOOLS, type Transporte } from '../mcp-server-niso/src/ferramentas';

/**
 * niso_create_evidence com `controlIds`: cria a evidência e liga cada controle pela rota N:N
 * (POST /api/v1/evidence/{id}/controles, via `t.contrato`). A resposta diz o que ligou e o que falhou.
 */
function transporte(falha: Record<string, 'erro' | 'excecao'> = {}) {
  const chamadas: { rota: string; params: Record<string, string>; corpo: any }[] = [];
  const t = {
    get: async () => ({}),
    enviar: async () => ({}),
    uploadTexto: async () => ({ ok: true, id: 'ev-1', sha256: 'a'.repeat(64) }),
    contrato: async (rota: string, params: Record<string, string>, corpo: any) => {
      chamadas.push({ rota, params, corpo });
      if (falha[corpo.control_id] === 'excecao') throw new Error('Controle não encontrado neste projeto');
      if (falha[corpo.control_id] === 'erro') return { error: 'Controle não encontrado neste projeto' };
      return { ok: true, control_id: corpo.control_id, ligado: true };
    },
  } as unknown as Transporte;
  return { t, chamadas };
}
const base = { projectId: 'p1', fileName: 'x.md', content: '# x' };
const corpo = (r: { content: { text: string }[] }) => JSON.parse(r.content[0].text);

describe('niso_create_evidence com controlIds', () => {
  it('liga cada controle pela rota N:N e diz o que ligou e o que falhou', async () => {
    const { t, chamadas } = transporte({ 'A.9.9': 'erro', 'ctl-x': 'excecao' });
    const r = await executarFerramenta('niso_create_evidence', { ...base, controlIds: ['A.5.1', 'A.9.9', 'ctl-x', 'A.5.1'] }, t, { papel: 'consultant' });
    expect(r.isError).toBeFalsy();
    expect(chamadas.map((c) => c.rota)).toEqual(Array(3).fill('POST /api/v1/evidence/{id}/controles'));
    expect(chamadas.every((c) => c.params.id === 'ev-1')).toBe(true);
    const b = corpo(r);
    expect(b.id).toBe('ev-1');
    expect(b.controles_ligados).toEqual(['A.5.1']);
    expect(b.controles_com_falha).toEqual([
      { control_id: 'A.9.9', erro: 'Controle não encontrado neste projeto' },
      { control_id: 'ctl-x', erro: 'Controle não encontrado neste projeto' },
    ]);
  });

  it('sem controlIds não chama a rota N:N; controlId antigo segue no upload', async () => {
    const { t, chamadas } = transporte();
    let campos: Record<string, string> = {};
    (t as any).uploadTexto = async (_p: string, c: Record<string, string>) => { campos = c; return { ok: true, id: 'ev-2' }; };
    const r = await executarFerramenta('niso_create_evidence', { ...base, controlId: 'ctrl-a51' }, t, { papel: 'consultant' });
    expect(corpo(r)).toEqual({ ok: true, id: 'ev-2' });
    expect(campos.control_id).toBe('ctrl-a51');
    expect(chamadas).toHaveLength(0);
  });

  it('no máximo 50 controles', async () => {
    const { t, chamadas } = transporte();
    const r = await executarFerramenta('niso_create_evidence', { ...base, controlIds: Array.from({ length: 51 }, (_, i) => `c${i}`) }, t, { papel: 'consultant' });
    expect(r.isError).toBe(true);
    expect(chamadas).toHaveLength(0);
  });

  it('o esquema publica controlIds e a descrição de niso_evaluate_evidence protege a nota humana', () => {
    const ev = TOOLS.find((x) => x.name === 'niso_create_evidence')!;
    expect((ev.inputSchema as any).properties.controlIds).toMatchObject({ type: 'array', maxItems: 50 });
    const av = TOOLS.find((x) => x.name === 'niso_evaluate_evidence')!.description;
    expect(av).toContain('avaliacao_ia');
    expect(av).toContain('evaluation_score');
    expect(av).toMatch(/NEVER[^.]*evaluation_notes/);
  });
});
