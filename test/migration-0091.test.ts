import { describe, it, expect, beforeAll, vi } from 'vitest';
import { env } from 'cloudflare:test';
import { execSql, applySchema, seedTwoProjects } from './helpers/d1';
import migration0091 from '../migrations/0091_ot_inventario.sql?raw';

// Reconstrói o esquema (DROP + applySchema): numa máquina lenta/carregada passa fácil de 5 s.
vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

const C = 'ot1:k1:aXY=:Y3Q='; // forma de cifra (o conteúdo não importa ao banco)
const ARCIBER = { categoria_arciber: 'centro_operacao', tipo_dispositivo: 'RTU', fabricante: 'F', funcao: 'telecontrole', ip_cifrado: C, protocolos_portas: '[{"protocolo":"DNP3","porta":20000}]', firmware_so_versao: '1.0' };

const inserirAtivo = (id: string, campos: Record<string, unknown>, projeto = 'proj-a', site = 's-a', zona: string | null = null) => {
  const todos = { id, project_id: projeto, site_id: site, zona_id: zona, nome: 'Ativo', ...campos };
  const cols = Object.keys(todos);
  return env.DB.prepare(`INSERT INTO ot_ativos (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).bind(...Object.values(todos)).run();
};

describe('migration 0091: inventário do n.ot', () => {
  beforeAll(async () => {
    await applySchema();
    for (const t of ['ot_referencias', 'ot_fornecedores', 'ot_site_acessos', 'ot_fluxos', 'ot_ativos', 'ot_zonas', 'ot_sites']) await execSql(`DROP TABLE IF EXISTS ${t};`);
    await execSql(migration0091);
    await execSql(migration0091); // repetível
    await seedTwoProjects();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO ot_sites (id, project_id, nome) VALUES ('s-a', 'proj-a', 'SE A'), ('s-a2', 'proj-a', 'SE A2'), ('s-b', 'proj-b', 'SE B')`),
      env.DB.prepare(`INSERT INTO ot_zonas (id, project_id, site_id, nome, nivel_purdue) VALUES ('z-a', 'proj-a', 's-a', 'Supervisão', 2), ('z-a2', 'proj-a', 's-a2', 'Supervisão', 2)`),
    ]);
  });

  it('4.3.1: ativo do ARCiber sem um dos campos mínimos é recusado pelo banco; fora do ARCiber pode ser incompleto', async () => {
    await inserirAtivo('a-ok', { no_arciber: 1, ...ARCIBER });
    await inserirAtivo('a-mac', { no_arciber: 1, ...ARCIBER, ip_cifrado: null, mac_cifrado: C });
    await inserirAtivo('a-na', { no_arciber: 1, ...ARCIBER, firmware_so_versao: null, firmware_nao_aplicavel: 1 });
    await inserirAtivo('a-fora', { no_arciber: 0 });
    const faltas: Record<string, unknown>[] = [
      { categoria_arciber: null }, { tipo_dispositivo: null }, { fabricante: '  ' }, { funcao: null },
      { ip_cifrado: null }, { protocolos_portas: '[]' }, { firmware_so_versao: null },
    ];
    for (const [i, f] of faltas.entries()) {
      await expect(inserirAtivo(`a-x${i}`, { no_arciber: 1, ...ARCIBER, ...f }), JSON.stringify(f)).rejects.toThrow(/CHECK/);
    }
  });

  it('IP/MAC só na forma cifrada; zona tem de ser do mesmo site e do mesmo projeto', async () => {
    await expect(inserirAtivo('a-claro', { ip_cifrado: '10.0.0.1' })).rejects.toThrow(/CHECK/);
    await expect(inserirAtivo('a-zona-outro-site', {}, 'proj-a', 's-a', 'z-a2')).rejects.toThrow(/FOREIGN KEY/);
    await expect(inserirAtivo('a-site-outro-proj', {}, 'proj-a', 's-b')).rejects.toThrow(/FOREIGN KEY/);
    await expect(inserirAtivo('a-zona-proj-b', {}, 'proj-b', 's-b', 'z-a')).rejects.toThrow(/FOREIGN KEY/);
  });

  it('fluxo: ponta ativo OU zona; interno com as duas pontas, externo pode ter uma; ponta de outro projeto não entra', async () => {
    const fluxo = (id: string, c: Record<string, unknown>) => {
      const t = { id, project_id: 'proj-a', site_id: 's-a', ...c };
      return env.DB.prepare(`INSERT INTO ot_fluxos (${Object.keys(t).join(', ')}) VALUES (${Object.keys(t).map(() => '?').join(', ')})`).bind(...Object.values(t)).run();
    };
    await fluxo('f-ok', { origem_ativo_id: 'a-ok', destino_zona_id: 'z-a' });
    await fluxo('f-ext', { origem_ativo_id: 'a-ok', externo: 1, via_vpn: 0 });
    await expect(fluxo('f-meia', { origem_ativo_id: 'a-ok' })).rejects.toThrow(/CHECK/);
    await expect(fluxo('f-dupla', { origem_ativo_id: 'a-ok', origem_zona_id: 'z-a', destino_zona_id: 'z-a' })).rejects.toThrow(/CHECK/);
    await env.DB.prepare(`INSERT INTO ot_zonas (id, project_id, site_id, nome, nivel_purdue) VALUES ('z-b', 'proj-b', 's-b', 'Z', 3)`).run();
    await expect(fluxo('f-alheio', { origem_ativo_id: 'a-ok', destino_zona_id: 'z-b' })).rejects.toThrow(/FOREIGN KEY/);
  });

  it('acesso por site: site de outro projeto não entra; apagar o projeto leva o inventário', async () => {
    await env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id) VALUES ('u-t', 't@cliente.teste', 'x', 'T', 'org_user', 'proj-a')`).run();
    await env.DB.prepare(`INSERT INTO ot_site_acessos (user_id, site_id, project_id, concedido_por) VALUES ('u-t', 's-a', 'proj-a', 'x')`).run();
    await expect(env.DB.prepare(`INSERT INTO ot_site_acessos (user_id, site_id, project_id, concedido_por) VALUES ('u-t', 's-b', 'proj-a', 'x')`).run()).rejects.toThrow(/FOREIGN KEY/);
    await env.DB.prepare(`DELETE FROM projects WHERE id = 'proj-a'`).run();
    for (const t of ['ot_sites', 'ot_zonas', 'ot_ativos', 'ot_fluxos', 'ot_site_acessos']) {
      expect((await env.DB.prepare(`SELECT count(*) AS n FROM ${t} WHERE project_id = 'proj-a'`).first<{ n: number }>())?.n, t).toBe(0);
    }
  });
});
