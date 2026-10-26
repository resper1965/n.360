import { escopoRopa } from './escopo-itens';
/**
 * Contexto do cliente para a IA redigir uma seção de política temática (spec 2026-10-23). Só cadastro da organização:
 * nunca e-mail, nem dado de titular. Tudo filtrado por project_id.
 */
export async function contextoDaPolitica(db: D1Database, projectId: string, requisitos: string[], documentoId: string): Promise<string> {
  const reqs = JSON.stringify(requisitos);
  const [p, e, controles, gov, ativos, riscos, irmas, psi] = await Promise.all([
    db.prepare(`SELECT client_name, sector, scope, standards FROM projects WHERE id = ?`).bind(projectId)
      .first<{ client_name: string | null; sector: string | null; scope: string | null; standards: string | null }>(),
    db.prepare(`SELECT setor, porte, funcionarios, cnae_descricao FROM empresas WHERE project_id = ?`).bind(projectId)
      .first<{ setor: string | null; porte: string | null; funcionarios: number | string | null; cnae_descricao: string | null }>(),
    db.prepare(`SELECT id, title, status, description FROM compliance_controls WHERE project_id = ? AND requisito_id IN (SELECT value FROM json_each(?)) ORDER BY title`)
      .bind(projectId, reqs).all<{ id: string; title: string; status: string | null; description: string | null }>(),
    db.prepare(`SELECT name, role_category, job_title FROM project_governance WHERE project_id = ? AND role_category != 'consultor' ORDER BY role_category, name LIMIT 30`)
      .bind(projectId).all<{ name: string; role_category: string; job_title: string | null }>(),
    db.prepare(`SELECT i.nome, s.classificacao FROM itens i LEFT JOIN item_seguranca s ON s.item_id = i.id AND s.project_id = i.project_id
        WHERE i.project_id = ? AND i.status = 'ativo' ORDER BY i.nome LIMIT 50`)
      .bind(projectId).all<{ nome: string; classificacao: string | null }>(),
    db.prepare(`SELECT threat, risk_level FROM risks WHERE project_id = ?${escopoRopa('programa')}
        AND control_id IN (SELECT id FROM compliance_controls WHERE project_id = ? AND requisito_id IN (SELECT value FROM json_each(?))) LIMIT 30`)
      .bind(projectId, projectId, reqs).all<{ threat: string; risk_level: string | null }>(),
    db.prepare(`SELECT titulo FROM documentos WHERE project_id = ? AND tipo = 'politica' ORDER BY titulo LIMIT 30`)
      .bind(projectId).all<{ titulo: string }>(),
    db.prepare(`SELECT substr(v.texto, 1, 4000) AS texto FROM documentos d JOIN documento_versoes v ON v.documento_id = d.id AND v.project_id = d.project_id AND v.estado = 'vigente'
        WHERE d.project_id = ? AND d.tipo = 'politica' AND d.status = 'vigente' AND d.titulo LIKE 'POL-PSI%' AND d.id != ? LIMIT 1`)
      .bind(projectId, documentoId).first<{ texto: string }>().then((r) => r?.texto),
  ]);
  const bloco = (ls: string[], teto: number) => { const t = ls.join('\n'); return t.length > teto ? t.slice(0, teto) + '\n[lista reduzida]' : t; };
  const nota = (d: string | null) => (d ?? '').replace(/\s+/g, ' ').slice(0, 400);
  const linhas = [
    `Cliente: ${p?.client_name ?? ''}`, `Setor: ${e?.setor ?? p?.sector ?? 'não informado'}`, `Porte: ${e?.porte ?? 'não informado'}`, `Atividade: ${e?.cnae_descricao ?? 'não informada'}`, `Funcionários: ${e?.funcionarios ?? 'não informado'}`,
    `Escopo do SGSI: ${p?.scope ?? 'não informado'}`, `Normas: ${p?.standards ?? ''}`,
    '', 'Controles cobertos (código, situação, nota do controle):', bloco(controles.results.map((c) => `- ${c.title} | ${c.status ?? 'sem situação'} | ${nota(c.description)}`), 4000),
    '', 'Papéis da governança:', bloco(gov.results.map((g) => `- ${g.role_category}: ${g.name} (${g.job_title ?? ''})`), 1500),
    '', 'Sistemas e ativos:', bloco(ativos.results.map((a) => `- ${a.nome} (${a.classificacao ?? 'sem classificação'})`), 1500),
    '', 'Riscos ligados:', bloco(riscos.results.map((r) => `- ${r.threat} (${r.risk_level ?? 'sem nível'})`), 1500),
    '', 'Políticas existentes:', bloco(irmas.results.map((d) => `- ${d.titulo}`), 1000),
    ...(psi ? ['', 'Texto vigente da Política de Segurança da Informação:', psi] : []),
  ];
  const texto = linhas.join('\n');
  return texto.length > 12_000 ? texto.slice(0, 12_000) + '\n[lista reduzida]' : texto;
}
