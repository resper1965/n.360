// Incidente em Word (fatia 7): registro, risco, comunicação, análises, ações, post mortem e histórico. Dados fictícios.
import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import JSZip from 'jszip';
import app from '../src/index';
import { applySchema, sessionFor, workerEnv, habilitarPrivacy } from './helpers/d1';

const P = 'iw-proj';
const OUTRO = 'iw-outro';
const B = `/api/v1/projects/${P}`;
let ana: Record<string, string>;
const chamar = (h: Record<string, string>, caminho: string) => app.fetch(new Request(`http://localhost${caminho}`, { headers: h }), workerEnv());
async function texto(r: Response) {
  if (r.status !== 200) throw new Error(`${r.status}: ${await r.text()}`);
  const zip = await JSZip.loadAsync(new Uint8Array(await r.arrayBuffer()));
  const xml = (await Promise.all(Object.keys(zip.files).filter((f) => f.endsWith('.xml')).map((f) => zip.file(f)!.async('string')))).join('');
  return { xml, txt: xml.replace(/<[^>]+>/g, '') };
}

beforeAll(async () => {
  await applySchema();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?, 'Cliente', 'LGPD', 'Controller', 'Active', 'org_ness'), (?, 'Outro', 'LGPD', 'Controller', 'Active', 'org_ness')`).bind(P, OUTRO),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id) VALUES ('iw-a', 'ana-iw@ness.lat', 'x', 'Ana Exemplo', 'consultor', NULL, 'org_ness')`),
    env.DB.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES ('g-iw', ?, 'Ana', 'ana-iw@ness.lat', 'consultor', 'Consultora')`).bind(P),
    env.DB.prepare(`INSERT INTO incidentes (id, project_id, protocolo, titulo, descricao, ciencia_em, status, severidade, tipo, comprometimento, anpd_canal, anpd_protocolo, comunicacao_anpd_em)
      VALUES ('iw-enc', ?1, 'IN-2026-0030', 'Vazamento <b>exemplo</b> & cia', 'Planilha enviada por engano', '2026-10-01T10:00:00Z', 'aberto', 'alta', 'vazamento', '["confidencialidade"]', 'sei', 'ANPD-123', '2026-10-02T09:00:00Z'),
             ('iw-in', ?1, 'IN-2026-0031', 'Ainda aberto', NULL, '2026-10-05', 'aberto', NULL, NULL, NULL, NULL, NULL, NULL),
             ('iw-21', ?1, 'IN-2026-0033', 'Ciência às 21h', NULL, '2026-11-13T00:00:00.000Z', 'aberto', NULL, NULL, NULL, NULL, NULL, NULL),
             ('iw-o', ?2, 'IN-2026-0001', 'Alheio', NULL, '2026-10-01', 'aberto', NULL, NULL, NULL, NULL, NULL, NULL)`).bind(P, OUTRO),
    // Baixo em 05/10, relevante em 06/10 e sem risco em 20/10, depois do prazo da ANPD (08/10, contado da ciência sem hora): vale o último rebaixamento.
    env.DB.prepare(`INSERT INTO incidentes (id, project_id, protocolo, titulo, ciencia_em, prazo_anpd_em, risco_titular, avaliacao_texto, status)
      VALUES ('iw-rb', ?, 'IN-2026-0032', 'Rebaixado', '2026-10-05', '2026-10-08T00:00:00.000Z', 'sem_risco', 'Dados cifrados', 'avaliado')`).bind(P),
    env.DB.prepare(`INSERT INTO audit_logs (id, action, actor, details, project_id, entity_type, entity_id, created_at) VALUES
      ('iw-t0', 'incidente.risco', 'ana-iw@ness.lat', 'Incidente IN-2026-0032: risco ao titular baixo', ?1, 'incidente', 'iw-rb', '2026-10-05 12:00:00'),
      ('iw-t1', 'incidente.risco', 'ana-iw@ness.lat', 'Incidente IN-2026-0032: risco ao titular relevante', ?1, 'incidente', 'iw-rb', '2026-10-06 12:00:00'),
      ('iw-t2', 'incidente.risco', 'ana-iw@ness.lat', 'Incidente IN-2026-0032: risco ao titular sem_risco', ?1, 'incidente', 'iw-rb', '2026-10-20 12:00:00')`).bind(P),
    env.DB.prepare(`INSERT INTO incidente_analises (id, project_id, incidente_id, autor, texto, created_at) VALUES ('iw-an', ?, 'iw-enc', 'ana-iw@ness.lat', 'Origem: envio manual sem revisão', '2026-10-01 10:00:00')`).bind(P),
    env.DB.prepare(`INSERT INTO corrective_actions (id, project_id, incidente_id, title, tratamento, status) VALUES ('iw-ac', ?, 'iw-enc', 'Bloquear anexos externos', 'contencao', 'Closed')`).bind(P),
    env.DB.prepare(`UPDATE incidentes SET status = 'encerrado', risco_titular = 'baixo' WHERE id = 'iw-enc'`),
    env.DB.prepare(`INSERT INTO incidente_postmortem (incidente_id, project_id, pergunta, resposta) VALUES ('iw-enc', ?, 'melhorar', 'Treinar a revisão de anexos')`).bind(P),
  ]);
  await habilitarPrivacy(P, OUTRO);
  ana = await sessionFor({ id: 'iw-a', email: 'ana-iw@ness.lat', role: 'consultor' });
});

describe('incidente em Word', () => {
  it('encerrado: registro, risco, comunicação, análise, ação, post mortem e histórico; sem RASCUNHO; texto escapado', async () => {
    const r = await chamar(ana, `${B}/incidentes/iw-enc/docx`);
    expect(r.headers.get('content-disposition')).toContain('Incidente-IN-2026-0030.docx');
    const { xml, txt } = await texto(r);
    for (const t of ['Incidente IN-2026-0030', 'Encerrado', 'Alta', 'Vazamento ou exposição', 'Confidencialidade', 'Baixo', 'Peticionamento eletrônico (SEI)',
      'ANPD-123', 'IN-2026-0030-COM01', 'Origem: envio manual sem revisão', 'IN-2026-0030-PA01', 'Bloquear anexos externos', 'Contenção', 'Concluído',
      'Treinar a revisão de anexos', 'Durante a gestão do incidente', 'Histórico']) expect(txt, t).toContain(t);
    // Instantes em UTC saem na hora de Brasília (UTC-3): a análise de 10:00 UTC e a ciência de 10:00Z aparecem às 07:00.
    expect(txt).toContain('Ana Exemplo · 01/10/2026 07:00');
    expect(txt).toContain('01/10/2026 07:00');
    expect(txt).not.toContain('01/10/2026 10:00');
    expect(txt).not.toContain('RASCUNHO');
    // risco baixo: a comunicação ainda não feita (titulares) não é exigida, não "Pendente"
    expect(txt).toContain('Não exigida (risco baixo)');
    expect(txt).not.toContain('Pendente');
    expect(xml).not.toContain('<b>exemplo</b>');
    expect(xml).toContain('&lt;b&gt;exemplo&lt;/b&gt; &amp; cia');
  });

  it('risco rebaixado depois do prazo vencido: "Não exigida (reavaliado após o prazo de DD/MM)"', async () => {
    const { txt } = await texto(await chamar(ana, `${B}/incidentes/iw-rb/docx`));
    expect(txt).toContain('Não exigida (reavaliado após o prazo de 08/10)');
    expect(txt).toContain('Não exigida (risco sem risco)'); // titulares: sem prazo, nada a dizer do atraso
  });

  it('ciência às 21h00 de Brasília (meia-noite UTC): a ciência e o prazo saem na hora de Brasília, como na tela', async () => {
    await env.DB.prepare(`UPDATE incidentes SET prazo_anpd_em = '2026-11-14T00:00:00.000Z' WHERE id = 'iw-21'`).run();
    const { txt } = await texto(await chamar(ana, `${B}/incidentes/iw-21/docx`));
    expect(txt).toContain('12/11/2026 21:00');
    expect(txt).toContain('Pendente, prazo 13/11/2026 21:00');
    expect(txt).not.toContain('14/11/2026');
  });

  it('aberto sai como rascunho e o post mortem diz que abre depois; outro projeto é 404; trilha sem conteúdo', async () => {
    const { txt } = await texto(await chamar(ana, `${B}/incidentes/iw-in/docx`));
    expect(txt).toContain('RASCUNHO');
    expect(txt).toContain('Abre depois do encerramento do incidente.');
    expect(txt).toContain('Pendente, prazo não calculado'); // risco ainda não avaliado: a comunicação conta
    expect(txt).not.toContain('Não exigida');
    expect((await chamar(ana, `${B}/incidentes/iw-o/docx`)).status).toBe(404);
    const t = await env.DB.prepare(`SELECT details FROM audit_logs WHERE action = 'exportacao.docx' AND project_id = ? ORDER BY rowid DESC LIMIT 1`).bind(P).first<any>();
    expect(t.details).toBe('Incidente iw-in baixado em Word');
  });
});
