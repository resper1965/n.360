import { describe, it, expect, beforeAll } from 'vitest';
import { env } from 'cloudflare:test';
import JSZip from 'jszip'; // vem como dependência do docx; só para ler o zip aqui
import app from '../src/index';
import { applySchema, sessionFor, workerEnv, habilitarPrivacy } from './helpers/d1';
import { nomeArquivo } from '../src/services/documento-word';

/**
 * F4: RIPD e LIA em Word, lidos ao vivo da origem única (empresa, encarregado, atividade, bases, ciclo, teste de impacto, riscos).
 * O teste abre o ZIP e lê o XML: texto, marcação de rascunho, escape do texto do usuário e nada de outro projeto.
 */
const P = 'dw-proj';
const OUTRO = 'dw-outro';
const chamar = (h: Record<string, string>, caminho: string) =>
  app.fetch(new Request('http://localhost' + caminho, { method: 'GET', headers: h }), workerEnv());

async function abrir(r: Response) {
  if (r.status !== 200) throw new Error(`${r.status}: ${await r.text()}`);
  const zip = await JSZip.loadAsync(new Uint8Array(await r.arrayBuffer()));
  const header = Object.keys(zip.files).filter((f) => /^word\/header\d*\.xml$/.test(f));
  return {
    doc: await zip.file('word/document.xml')!.async('string'),
    cab: (await Promise.all(header.map((f) => zip.file(f)!.async('string')))).join(''),
    tudo: (await Promise.all(Object.keys(zip.files).filter((f) => f.endsWith('.xml')).map((f) => zip.file(f)!.async('string')))).join(''),
  };
}

let consultor: Record<string, string>;

beforeAll(async () => {
  await applySchema();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO projects (id, client_name, standards, org_role, status, org_id) VALUES (?1, 'Cliente', 'LGPD', 'Controller', 'Active', 'org_ness'), (?2, 'Outro', 'LGPD', 'Controller', 'Active', 'org_ness')`).bind(P, OUTRO),
    env.DB.prepare(`INSERT INTO users (id, email, password_hash, name, role, client_project_id, org_id) VALUES ('u-dw', 'dw@ness.lat', 'x', 'Cons', 'consultor', NULL, 'org_ness')`),
    env.DB.prepare(`INSERT INTO project_governance (id, project_id, name, email, role_category, job_title) VALUES ('g-dw1', ?1, 'Cons', 'dw@ness.lat', 'consultor', 'Consultor'), ('g-dw2', ?2, 'Cons', 'dw@ness.lat', 'consultor', 'Consultor')`).bind(P, OUTRO),
    env.DB.prepare(`INSERT INTO empresas (project_id, cnpj, razao_social, logradouro, numero, municipio, uf, representante_nome, representante_cargo) VALUES
      (?1, '11222333000181', 'Empresa Exemplo Ltda.', 'Rua Fictícia', '100', 'Cidade Exemplo', 'SP', 'Pessoa Representante', 'Diretora'),
      (?2, '99888777000166', 'Outra Empresa Alheia S.A.', 'Rua Alheia', '1', 'Outra', 'RJ', 'Representante Alheio', 'Diretor')`).bind(P, OUTRO),
    env.DB.prepare(`INSERT INTO partes (id, project_id, tipo, nome, email) VALUES ('dw-enc', ?1, 'pessoa', 'Encarregada Exemplo', 'dpo@exemplo.invalid'), ('dw-enc2', ?2, 'pessoa', 'Encarregado Alheio', NULL)`).bind(P, OUTRO),
    env.DB.prepare(`INSERT INTO parte_vinculos (id, project_id, parte_id, papel, alvo_tipo, alvo_id) VALUES ('dw-v1', ?1, 'dw-enc', 'encarregado', 'projeto', ?1), ('dw-v2', ?2, 'dw-enc2', 'encarregado', 'projeto', ?2)`).bind(P, OUTRO),
    env.DB.prepare(`INSERT OR IGNORE INTO requisito_fontes (id, nome) VALUES ('lgpd', 'LGPD')`),
    env.DB.prepare(`INSERT OR IGNORE INTO requisitos (id, fonte_id, referencia, titulo) VALUES ('lgpd:art7:ix', 'lgpd', 'Art. 7, IX', 'Legítimo interesse'), ('lgpd:art7:v', 'lgpd', 'Art. 7, V', 'Execução de contrato')`),
    env.DB.prepare(`INSERT INTO ropa_records (id, project_id, processing_purpose, data_subjects, data_categories, base_legal_id, retention_period, recipients, base_gdpr) VALUES
      ('dw-r1', ?1, 'Prevenção a fraude <script>&', 'Clientes', 'Nome, CPF', 'lgpd:art7:ix', '5 anos', 'Bureau de crédito fictício', 'Art. 6(1)(f)'),
      ('dw-alheio', ?2, 'Atividade alheia', 'Outros', 'Outros', NULL, NULL, NULL, NULL)`).bind(P, OUTRO),
    env.DB.prepare(`INSERT INTO tratamento_bases (ropa_id, requisito_id, project_id, observacao) VALUES ('dw-r1', 'lgpd:art7:v', ?, 'contratos')`).bind(P),
    env.DB.prepare(`INSERT INTO tratamento_ciclo (ropa_id, project_id, etapa, situacao, descricao) VALUES ('dw-r1', ?, 'eliminacao', 'registrada', 'Expurgo anual')`).bind(P),
    env.DB.prepare(`INSERT INTO tratamento_impacto (ropa_id, project_id, pergunta, resposta) SELECT 'dw-r1', ?, 'larga_escala', 'sim'`).bind(P),
    env.DB.prepare(`INSERT INTO risks (id, project_id, ropa_id, asset, threat, impact, probability, risk_level, status) VALUES ('dw-k1', ?, 'dw-r1', 'A', 'Vazamento de base', 5, 4, 'High', 'Open')`).bind(P),
    env.DB.prepare(`INSERT INTO dpia_assessments (id, project_id, ropa_id, processing_name, necessity_proportionality, status) VALUES
      ('dw-d1', ?1, 'dw-r1', 'Antifraude', 'Necessário & proporcional', 'Draft'),
      ('dw-d2', ?1, NULL, 'Feito à mão', NULL, 'Approved'),
      ('dw-dx', ?2, 'dw-alheio', 'RIPD alheio', NULL, 'Draft')`).bind(P, OUTRO),
    env.DB.prepare(`UPDATE dpia_assessments SET dpo_approved_by = 'aprovador@exemplo.invalid', dpo_approved_at = '2026-10-01T10:00:00Z' WHERE id = 'dw-d2'`),
    env.DB.prepare(`INSERT INTO lia_assessments (id, project_id, ropa_id, finalidade_legitima, necessidade, balanceamento, conclusao, status, concluida_em, concluida_por) VALUES
      ('dw-l1', ?1, 'dw-r1', 'Proteger clientes', 'Sem alternativa menos invasiva', 'Expectativa razoável', 'prevalece', 'concluida', '2026-10-02T12:00:00Z', 'cons@exemplo.invalid'),
      ('dw-lx', ?2, 'dw-alheio', 'LIA alheia', NULL, NULL, NULL, 'rascunho', NULL, NULL)`).bind(P, OUTRO),
  ]);
  await habilitarPrivacy(P, OUTRO);
  consultor = await sessionFor({ id: 'u-dw', email: 'dw@ness.lat', role: 'consultor' });
});

describe('RIPD em Word', () => {
  it('lê empresa, encarregado, atividade, bases, ciclo, teste de impacto e riscos; rascunho marcado; texto escapado', async () => {
    const r = await chamar(consultor, `/api/v1/projects/${P}/dpia/dw-d1/docx`);
    expect(r.headers.get('Content-Type')).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    expect(r.headers.get('Content-Disposition')).toBe('attachment; filename="RIPD-Antifraude.docx"');
    const { doc, cab, tudo } = await abrir(r);
    for (const t of ['Empresa Exemplo Ltda.', '11.222.333/0001-81', 'Rua Fictícia, 100', 'Pessoa Representante, Diretora', 'Encarregada Exemplo',
      'Art. 7, IX - Legítimo interesse', 'Art. 7, V - Execução de contrato (contratos)', 'GDPR: Art. 6(1)(f)', 'Eliminação: Expurgo anual',
      'Vazamento de base', 'Alto', 'larga escala', '5 anos', 'Bureau de crédito fictício']) expect(doc, t).toContain(t);
    expect(doc).toContain('Prevenção a fraude &lt;script&gt;&amp;');
    expect(doc).toContain('Necessário &amp; proporcional');
    expect(doc).not.toContain('<script>');
    expect(cab).toContain('RASCUNHO');
    expect(cab).toContain('ness.');
    for (const t of ['Outra Empresa Alheia', 'Encarregado Alheio', 'Atividade alheia', 'RIPD alheio']) expect(tudo, t).not.toContain(t);
    expect(tudo).not.toMatch(/Claude|Anthropic|gerado por IA|intelig[eê]ncia artificial/i);
  });

  it('aprovado sai sem RASCUNHO e com quem aprovou; RIPD feito à mão sai sem a seção da atividade', async () => {
    const { doc, cab } = await abrir(await chamar(consultor, `/api/v1/projects/${P}/dpia/dw-d2/docx`));
    expect(cab).not.toContain('RASCUNHO');
    expect(doc).not.toContain('RASCUNHO');
    expect(doc).toContain('aprovador@exemplo.invalid em 01/10/2026');
    expect(doc).not.toContain('Atividade de tratamento');
  });

  it('RIPD de outro projeto é 404', async () => {
    expect((await chamar(consultor, `/api/v1/projects/${P}/dpia/dw-dx/docx`)).status).toBe(404);
  });

  it('trilha sem conteúdo', async () => {
    const t = await env.DB.prepare(`SELECT details FROM audit_logs WHERE action = 'exportacao.docx' AND project_id = ? ORDER BY rowid DESC LIMIT 1`).bind(P).first<{ details: string }>();
    expect(t!.details).toMatch(/^RIPD dw-d\d baixado em Word$/);
  });
});

describe('LIA em Word', () => {
  it('concluída: conclusão, quem concluiu, dados da empresa; sem RASCUNHO', async () => {
    const r = await chamar(consultor, `/api/v1/projects/${P}/ropa/dw-r1/lia/docx`);
    expect(r.headers.get('Content-Disposition')).toBe('attachment; filename="LIA-Prevencao-a-fraude-script.docx"');
    const { doc, cab, tudo } = await abrir(r);
    for (const t of ['Teste de Legítimo Interesse (LIA)', 'Proteger clientes', 'O legítimo interesse prevalece', 'cons@exemplo.invalid em 02/10/2026',
      'Empresa Exemplo Ltda.', 'Encarregada Exemplo']) expect(doc, t).toContain(t);
    expect(cab).not.toContain('RASCUNHO');
    expect(tudo).not.toContain('LIA alheia');
  });

  it('rascunho marcado; LIA de outro projeto e atividade sem LIA são 404', async () => {
    const { cab } = await abrir(await chamar(consultor, `/api/v1/projects/${OUTRO}/ropa/dw-alheio/lia/docx`));
    expect(cab).toContain('RASCUNHO');
    expect((await chamar(consultor, `/api/v1/projects/${P}/ropa/dw-alheio/lia/docx`)).status).toBe(404);
    await env.DB.prepare(`INSERT INTO ropa_records (id, project_id, processing_purpose) VALUES ('dw-r2', ?, 'Sem LIA')`).bind(P).run();
    expect((await chamar(consultor, `/api/v1/projects/${P}/ropa/dw-r2/lia/docx`)).status).toBe(404);
  });
});

describe('nome do arquivo', () => {
  it('sem acento, sem aspas nem barra, com teto', () => {
    expect(nomeArquivo('RIPD', 'Ação "x"/../y')).toBe('RIPD-Acao-x-y.docx');
    expect(nomeArquivo('LIA', null)).toBe('LIA.docx');
    expect(nomeArquivo('RIPD', 'a'.repeat(200))).toBe(`RIPD-${'a'.repeat(60)}.docx`);
  });
});

describe('logo da consultoria no cabeçalho', () => {
  const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));
  const midias = async (r: Response) => Object.keys((await JSZip.loadAsync(new Uint8Array(await r.arrayBuffer()))).files).filter((f) => f.startsWith('word/media/') && !f.endsWith('/'));

  it('com logo da organização: a imagem vai no cabeçalho do RIPD e da LIA; sem logo, o nome', async () => {
    await env.STORAGE.put('logos/org_ness/dw-logo.png', PNG);
    await env.DB.prepare(`UPDATE organizations SET logo_chave = 'logos/org_ness/dw-logo.png' WHERE id = 'org_ness'`).run();
    try {
      expect(await midias(await chamar(consultor, `/api/v1/projects/${P}/dpia/dw-d1/docx`))).toHaveLength(1);
      expect(await midias(await chamar(consultor, `/api/v1/projects/${P}/ropa/dw-r1/lia/docx`))).toHaveLength(1);
      // Chave fora da pasta da organização ou bytes que não são imagem: sai sem logo, o download não falha.
      await env.DB.prepare(`UPDATE organizations SET logo_chave = 'logos/org_b/dw-logo.png' WHERE id = 'org_ness'`).run();
      const r = await chamar(consultor, `/api/v1/projects/${P}/dpia/dw-d1/docx`);
      expect(r.status).toBe(200);
      expect(await midias(r)).toHaveLength(0);
    } finally {
      await env.DB.prepare(`UPDATE organizations SET logo_chave = NULL WHERE id = 'org_ness'`).run();
    }
    const { cab } = await abrir(await chamar(consultor, `/api/v1/projects/${P}/dpia/dw-d1/docx`));
    expect(cab).toContain('ness.');
  });
});
