import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { applySchema, habilitarPrivacy } from './helpers/d1';
import { hashPassword } from '../src/helpers';
import { tokenDoAgente, chamarFerramenta } from './helpers/mcp-agente';
import { semearCatalogo, lacunasDaFonte } from '../src/services/requisitos';

/**
 * niso_excluir_requisito pelo MCP com os ids reais do catálogo, que têm ":" (lgpd:art23, anpd:res2-2022).
 * Antes, a ferramenta codificava ":" em "%3A" e o próprio filtro de caminho do MCP recusava o "%": nenhum requisito passava.
 */
const P = 'p-mx';
const JUST = 'Dispositivo aplicável apenas a pessoa jurídica de direito público.';
let token: string;
const decidir = (acao: 'excluir' | 'reincluir', requisitoId: string) =>
  chamarFerramenta(token, 'niso_excluir_requisito', {
    acao, requisitoId, confirmado_pelo_usuario: true, motivo: 'o consultor confirmou',
    ...(acao === 'excluir' ? { dados: { justificativa: JUST } } : {}),
  });
const situacao = async (fonte: string, id: string) => (await lacunasDaFonte(env.DB, P, fonte)).find((l) => l.requisito_id === id)!;

beforeAll(async () => {
  await applySchema();
  await semearCatalogo(env.DB);
  const senha = await hashPassword('senha-forte-123');
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?,'Cliente','LGPD','controller','Active','org_ness')`).bind(P),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, org_id) VALUES ('u-mx','cons@mx.lat',?,'Cons','consultor','org_ness')`).bind(senha),
    env.DB.prepare(`INSERT INTO project_governance (project_id, name, email, role_category, job_title) VALUES (?,'Cons','cons@mx.lat','consultor','Consultor')`).bind(P),
  ]);
  await habilitarPrivacy(P);
  await env.DB.prepare(`INSERT OR IGNORE INTO usuario_modulos (user_id, modulo) VALUES ('u-mx','privacy')`).run();
  token = await tokenDoAgente('cons@mx.lat', P);
}, 60_000);

describe('niso_excluir_requisito com id do catálogo (com ":")', () => {
  it('exclui e reinclui lgpd:art23; a lacuna mostra nao_aplicavel com a justificativa; a trilha registra', async () => {
    const r = await decidir('excluir', 'lgpd:art23');
    expect(r.isError, r.content[0].text).toBeFalsy();
    expect(r.content[0].text).toContain('HTTP 200');
    const l = await situacao('lgpd', 'lgpd:art23');
    expect(l.situacao).toBe('nao_aplicavel');
    expect(l.exclusao?.justificativa).toBe(JUST);
    const trilha = await env.DB.prepare(`SELECT COUNT(*) AS n FROM audit_logs WHERE action = 'requisito.excluido' AND project_id = ?`).bind(P).first<number>('n');
    expect(trilha).toBe(1);

    const volta = await decidir('reincluir', 'lgpd:art23');
    expect(volta.isError, volta.content[0].text).toBeFalsy();
    expect((await situacao('lgpd', 'lgpd:art23')).situacao).not.toBe('nao_aplicavel');
    expect(await env.DB.prepare(`SELECT COUNT(*) AS n FROM audit_logs WHERE action = 'requisito.reincluido' AND project_id = ?`).bind(P).first<number>('n')).toBe(1);
  });

  it('excluir o pai anpd:res2-2022 leva os filhos', async () => {
    const r = await decidir('excluir', 'anpd:res2-2022');
    expect(r.isError, r.content[0].text).toBeFalsy();
    const itens = await lacunasDaFonte(env.DB, P, 'anpd');
    const filhos = itens.filter((l) => l.requisito_id.startsWith('anpd:res2-2022:'));
    expect(filhos.length).toBeGreaterThan(0);
    for (const f of filhos) {
      expect(f.situacao, f.requisito_id).toBe('nao_aplicavel');
      expect(f.exclusao?.herdada_de, f.requisito_id).toBe('Res. CD/ANPD 2/2022');
    }
  });

  it('o caso do relato: anpd:res18-2024:art5', async () => {
    const r = await decidir('excluir', 'anpd:res18-2024:art5');
    expect(r.isError, r.content[0].text).toBeFalsy();
    expect((await situacao('anpd', 'anpd:res18-2024:art5')).situacao).toBe('nao_aplicavel');
  });

  it('o filtro de caminho continua recusando % e ..', async () => {
    for (const requisitoId of ['..', 'a%2Fb', 'a/b']) {
      const r = await decidir('excluir', requisitoId);
      expect(r.isError, requisitoId).toBe(true);
    }
  });
});
