// PR3, pacote R2: a ferramenta de detalhe do tratamento devolve também a situação, as etapas e as medidas da ficha em abas; e a
// recusa de titulares e dados (409, a Coleta manda) chega ao agente com a mensagem. Transporte falso: a ferramenta compõe as
// leituras (`ler`) e a escrita (`contrato`) exatamente como no MCP remoto (`transporteInterno` espelha o `HTTP <n>: <erro>`).
import { describe, it, expect } from 'vitest';
import { executarFerramenta, type Transporte } from '../mcp-server-niso/src/ferramentas';

const P = '/api/v1/projects/p1';
const B = `${P}/ropa/r1`;
const SITUACAO = { estado: 'rascunho', proximo: 'enviar para revisão' };
const ETAPAS = { ok: true, materializada: true, etapas: [{ etapa: 'coleta', situacao: 'registrada', titulares: [] }] };
const MEDIDAS = { ok: true, medidas: [{ id: 'm1', medida: 'Criptografia em repouso', status: 'Implementado' }] };
const LEITURAS: Record<string, unknown> = {
  [`${P}/ropa`]: { records: [{ id: 'r1', processing_purpose: 'Folha de pagamento', status: 'Draft' }] },
  [`${B}/ligacoes`]: { itens: [], departamentos: [], partes: [], transferencias: [], base_legal: null },
  [`${B}/lia`]: { lia: null },
  [`${B}/ciclo`]: { etapas: [{ etapa: 'coleta' }] },
  [`${B}/bases`]: { adicionais: [], base_gdpr: null },
  [`${B}/impacto`]: { recomendacao: 'nao_necessario', perguntas: [] },
  [`${B}/ficha`]: { ok: true, situacao: SITUACAO, abas: {} },
  [`${B}/etapas`]: ETAPAS,
  [`${B}/medidas`]: MEDIDAS,
};

function transporte(sobra: Partial<Transporte> = {}): Transporte {
  return {
    get: async (path) => {
      if (!(path in LEITURAS)) throw new Error(`HTTP 404: rota não prevista no teste: ${path}`);
      return LEITURAS[path];
    },
    enviar: async () => ({ ok: true }),
    contrato: async () => ({ ok: true }),
    uploadTexto: async () => ({ ok: true }),
    ...sobra,
  };
}

describe('niso_privacy_ropa_detalhe: a ficha em abas no detalhe', () => {
  it('devolve situação, etapas e medidas, sem perder o que já vinha (ciclo, bases, impacto)', async () => {
    const r = await executarFerramenta('niso_privacy_ropa_detalhe', { projectId: 'p1', ropaId: 'r1' }, transporte(), { papel: 'consultant' });
    expect(r.isError).toBeFalsy();
    const d = JSON.parse(r.content[0].text);
    expect(d.situacao).toEqual(SITUACAO);
    expect(d.etapas).toEqual(ETAPAS.etapas);
    expect(d.medidas).toEqual(MEDIDAS);
    expect(d.ciclo).toEqual([{ etapa: 'coleta' }]);
    expect(d.bases).toEqual({ adicionais: [], base_gdpr: null });
    expect(d.impacto.recomendacao).toBe('nao_necessario');
  });
});

describe('niso_privacy_atualizar_tratamento: a recusa de titulares e dados chega ao agente', () => {
  it('o 409 da API vira erro com a mensagem, e nada além da mudança é enviado', async () => {
    const chamadas: unknown[] = [];
    const t = transporte({
      contrato: async (_rota, _params, corpo) => {
        chamadas.push(corpo);
        throw new Error('HTTP 409: Titulares e dados desta atividade são registrados na etapa Coleta');
      },
    });
    const r = await executarFerramenta('niso_privacy_atualizar_tratamento', { projectId: 'p1', ropaId: 'r1', data_subjects: 'Visitantes' }, t, { papel: 'consultant' });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain('registrados na etapa Coleta');
    expect(chamadas).toEqual([{ processing_purpose: 'Folha de pagamento', data_subjects: 'Visitantes' }]);
  });
});
