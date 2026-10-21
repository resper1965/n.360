import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import { SQL_MARCO_DO_PROGRAMA } from '../src/services/painel';
import { applySchema } from './helpers/d1';

const marco = async (p: string) => (await env.DB.prepare(SQL_MARCO_DO_PROGRAMA).bind(p).first<{ d: string | null }>())?.d ?? null;

beforeAll(async () => {
  await applySchema();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES ('mp-1', 'C', 'LGPD', 'Controller', 'Active', 'org_ness'), ('mp-2', 'C', 'LGPD', 'Controller', 'Active', 'org_ness'), ('mp-3', 'C', 'LGPD', 'Controller', 'Active', 'org_ness'), ('mp-4', 'C', 'LGPD', 'Controller', 'Active', 'org_ness')`),
    // mp-1: só aprovação por pedido (o caminho do n.privacy); a prova é inserida já decidida (o gatilho só barra UPDATE)
    env.DB.prepare(`INSERT INTO ropa_records (id, project_id, processing_purpose) VALUES ('mp-r1', 'mp-1', 'Folha')`),
    env.DB.prepare(`INSERT INTO pedidos (id, project_id, org_id, tipo, ref_id, titulo, conteudo_json, hash, papel_exigido, status, criado_por)
      VALUES ('mp-pe1', 'mp-1', 'org_ness', 'tratamento', 'mp-r1', 'Folha', '{}', 'h', 'ciso', 'aprovado', 'x@y.com')`),
    env.DB.prepare(`INSERT INTO pedido_destinatarios (id, pedido_id, email, status, decidido_em) VALUES ('mp-pd1', 'mp-pe1', 'a@b.com', 'aprovado', '2026-03-17T10:00:00Z')`),
    // mp-2: só RIPD aprovado
    env.DB.prepare(`INSERT INTO dpia_assessments (id, project_id, processing_name, status, dpo_approved_at) VALUES ('mp-d1', 'mp-2', 'RIPD', 'Approved', '2026-04-02T10:00:00Z')`),
    // mp-4: RIPD aprovado só pela Direção (rota direta): sem dpo_approved_at, a data é a da trilha
    env.DB.prepare(`INSERT INTO dpia_assessments (id, project_id, processing_name, status, ceo_signature) VALUES ('mp-d2', 'mp-4', 'RIPD', 'Approved', 'Diretora')`),
    env.DB.prepare(`INSERT INTO audit_logs (id, action, actor, details, project_id, created_at) VALUES ('mp-a1', 'dpia.approved', 'x@y.com', 'DPIA mp-d2', 'mp-4', '2026-05-05 10:00:00'),
      ('mp-a2', 'dpia.updated', 'x@y.com', 'outra ação', 'mp-3', '2026-01-01 10:00:00')`),
  ]);
});

describe('marco do programa', () => {
  it('aprovação por pedido conta', async () => expect((await marco('mp-1'))?.slice(0, 7)).toBe('2026-03'));
  it('RIPD aprovado conta', async () => expect((await marco('mp-2'))?.slice(0, 7)).toBe('2026-04'));
  it('RIPD aprovado só pela Direção conta pela trilha', async () => expect((await marco('mp-4'))?.slice(0, 7)).toBe('2026-05'));
  it('sem aprovação, sem marco', async () => expect(await marco('mp-3')).toBeNull());
});
