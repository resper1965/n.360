// test/decisoes-agente.test.ts
import { describe, it, expect } from 'vitest';
import { DECISOES, decisaoDaRota, FERRAMENTAS_DE_DECISAO, parametrosDe } from '../src/middleware/decisoes-agente';

describe('catálogo de decisões do agente', () => {
  it('casa a rota da tela com a ferramenta certa', () => {
    expect(decisaoDaRota('POST', '/api/v1/projects/p1/documentos/d1/versoes/2/publicar')?.ferramenta).toBe('niso_publicar_documento');
    expect(decisaoDaRota('POST', '/api/v1/projects/p1/passos/p1-1/concluir')?.ferramenta).toBe('niso_decidir_passo');
    expect(decisaoDaRota('PUT', '/api/v1/projects/p1/terceiros/pt1/tipo')?.ferramenta).toBe('niso_avaliar_fornecedor');
    expect(decisaoDaRota('POST', '/api/v1/projects/p1/incidentes/i1/encerrar')?.ferramenta).toBe('niso_encerrar_incidente');
    expect(decisaoDaRota('GET', '/api/v1/projects/p1/importacoes')?.ferramenta).toBe('niso_importar_programa');
    expect(decisaoDaRota('GET', '/api/v1/projects/p1/padronizar-nomes')?.ferramenta).toBe('niso_padronizar_nomes');
  });

  it('não casa rota comum nem ato do cliente', () => {
    for (const [m, c] of [
      ['PUT', '/api/v1/projects/p1/documentos/d1'],
      ['POST', '/api/v1/evidence/e1/approve'],
      ['POST', '/api/v1/pedidos/lote'],
      ['PUT', '/api/v1/projects/p1/titular-pedidos/t1'],
      ['POST', '/api/v1/projects/p1/data-subject/erase'],
      ['POST', '/api/v1/projects/p1/policy-acknowledgments'],
      ['POST', '/api/v1/projects/p1/ropa/r1/revoke-approval'],
      ['POST', '/api/v1/controls/c1/revoke-approval'],
      ['POST', '/api/v1/projects/p1/revoke-approvals'],
    ] as const) expect(decisaoDaRota(m, c), `${m} ${c}`).toBeNull();
  });

  it('cada ferramenta tem ao menos uma ação, cada ação é única por ferramenta e o modelo é /api/v1/...', () => {
    for (const f of FERRAMENTAS_DE_DECISAO) expect(DECISOES.some((d) => d.ferramenta === f)).toBe(true);
    const chaves = DECISOES.map((d) => `${d.ferramenta}:${d.acao}`);
    expect(new Set(chaves).size).toBe(chaves.length);
    for (const d of DECISOES) expect(d.caminho.startsWith('/api/v1/')).toBe(true);
    expect(parametrosDe('/api/v1/projects/{projectId}/passos/{itemId}/concluir')).toEqual(['projectId', 'itemId']);
  });
});
