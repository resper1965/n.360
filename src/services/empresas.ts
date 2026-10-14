import type { EmpresaCorpo } from '../schemas/corpos';
import { normalizarNome } from './nomes';

/**
 * Cadastro da empresa do projeto (migration 0071): `empresas`, 1:1 com `projects`. As colunas antigas de `projects`
 * (cnpj, employee_count, sector, client_name) continuam e são espelhadas daqui a cada gravação, porque metade do produto
 * (listas, relatórios, MCP, fechar venda) ainda lê de lá.
 */

/** Colunas graváveis: os nomes que entram em SQL saem SÓ desta lista, nunca da requisição. */
export const CAMPOS_EMPRESA = [
  'cnpj', 'documento_alternativo', 'razao_social', 'nome_fantasia', 'natureza_juridica', 'porte', 'data_abertura',
  'situacao_cadastral', 'cnae_codigo', 'cnae_descricao', 'setor', 'funcionarios', 'cep', 'logradouro', 'numero',
  'complemento', 'bairro', 'municipio', 'uf', 'pais', 'telefone', 'email', 'site', 'representante_nome', 'representante_cargo',
] as const;
export type CampoEmpresa = (typeof CAMPOS_EMPRESA)[number];
export type Empresa = { project_id: string } & { [K in CampoEmpresa]: string | number | null };

/**
 * A linha que a migration 0071 gravou para cada projeto, a partir das colunas antigas: o projeto criado depois dela sem
 * cadastro (fechar venda, POST antigo) ganha a mesma semente na primeira gravação. O único `?` é o projeto.
 */
const SEMENTE = `SELECT id AS project_id,
       CASE WHEN length(d) = 14 AND d NOT GLOB '*[^0-9]*' THEN d END AS cnpj,
       CASE WHEN d <> '' AND NOT (length(d) = 14 AND d NOT GLOB '*[^0-9]*') THEN trim(cnpj) END AS documento_alternativo,
       NULLIF(trim(client_name), '') AS razao_social, NULLIF(trim(sector), '') AS setor,
       CASE WHEN typeof(employee_count) = 'integer' AND employee_count >= 0 THEN employee_count END AS funcionarios
  FROM (SELECT id, cnpj, client_name, sector, employee_count,
               replace(replace(replace(replace(trim(COALESCE(cnpj, '')), '.', ''), '/', ''), '-', ''), ' ', '') AS d
          FROM projects WHERE id = ?)`;

const semear = (db: D1Database, projectId: string) =>
  db.prepare(`INSERT OR IGNORE INTO empresas (project_id, cnpj, documento_alternativo, razao_social, setor, funcionarios)
              SELECT project_id, cnpj, documento_alternativo, razao_social, setor, funcionarios FROM (${SEMENTE})`).bind(projectId);

/** O cadastro do projeto; sem linha, a semente das colunas antigas (o resto nulo). null se o projeto não existe. */
export async function lerEmpresa(db: D1Database, projectId: string): Promise<Empresa | null> {
  const linha = await db.prepare('SELECT * FROM empresas WHERE project_id = ?').bind(projectId).first<Empresa>();
  if (linha) return linha;
  const s = await db.prepare(SEMENTE).bind(projectId).first<Partial<Empresa>>();
  if (!s) return null;
  const vazio = Object.fromEntries(CAMPOS_EMPRESA.map((k) => [k, null])) as { [K in CampoEmpresa]: null };
  return { ...vazio, pais: 'BR', ...s, project_id: projectId } as Empresa;
}

/** Outro projeto da MESMA organização com este CNPJ (no cadastro novo ou na coluna antiga), ou null. */
export async function projetoComCnpj(db: D1Database, orgId: string, cnpj: string, exceto: string): Promise<{ id: string; nome: string } | null> {
  return db.prepare(
    `SELECT p.id, COALESCE(NULLIF(p.client_name, ''), p.project_name, p.id) AS nome
       FROM projects p LEFT JOIN empresas e ON e.project_id = p.id
      WHERE p.org_id = ? AND p.id <> ?
        AND (e.cnpj = ? OR replace(replace(replace(replace(trim(COALESCE(p.cnpj, '')), '.', ''), '/', ''), '-', ''), ' ', '') = ?)
      ORDER BY p.created_at LIMIT 1`
  ).bind(orgId, exceto, cnpj, cnpj).first<{ id: string; nome: string }>();
}

/** Os campos presentes no corpo (ausente = não mexe; null = limpa). */
export const camposPresentes = (dados: EmpresaCorpo): CampoEmpresa[] => CAMPOS_EMPRESA.filter((k) => dados[k] !== undefined);

/**
 * As escritas de uma gravação do cadastro, para entrar num `db.batch` (transação): a semente (se não há linha), o merge
 * dos campos presentes e o espelho nas colunas antigas de `projects`. `client_name` vira o nome fantasia, senão a razão
 * social; vazio não apaga o nome atual.
 */
export function gravacaoDaEmpresa(db: D1Database, projectId: string, dados: EmpresaCorpo): D1PreparedStatement[] {
  const campos = camposPresentes(dados);
  // `pais` é NOT NULL: limpar volta ao padrão.
  const valor = (k: CampoEmpresa) => (k === 'pais' ? dados.pais ?? 'BR' : dados[k] ?? null);
  const merge = campos.length
    ? db.prepare(`UPDATE empresas SET ${campos.map((k) => `${k} = ?`).join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE project_id = ?`)
      .bind(...campos.map(valor), projectId)
    : null;
  const espelho = db.prepare(
    `UPDATE projects SET
       cnpj = (SELECT e.cnpj FROM empresas e WHERE e.project_id = projects.id),
       employee_count = (SELECT e.funcionarios FROM empresas e WHERE e.project_id = projects.id),
       sector = (SELECT e.setor FROM empresas e WHERE e.project_id = projects.id),
       client_name = COALESCE((SELECT COALESCE(e.nome_fantasia, e.razao_social) FROM empresas e WHERE e.project_id = projects.id), client_name)
     WHERE id = ?`
  ).bind(projectId);
  return [semear(db, projectId), ...(merge ? [merge] : []), espelho];
}

/**
 * O perfil antigo (`PUT /projects/:id/company-profile`) grava em `projects`; isto leva os mesmos campos ao cadastro novo.
 * CNPJ que não fecha 14 dígitos não entra (o CHECK da 0071 recusaria): fica o que estava.
 */
export function espelhoDoPerfilAntigo(db: D1Database, projectId: string, p: { cnpj?: string | null; employee_count?: number | null; sector?: string | null }): D1PreparedStatement[] {
  const d = p.cnpj ? p.cnpj.replace(/\D/g, '') : '';
  const sets = ['funcionarios = ?', 'setor = ?'];
  const binds: unknown[] = [p.employee_count ?? null, p.sector?.trim() || null];
  if (!p.cnpj || d.length === 14) { sets.push('cnpj = ?'); binds.push(d || null); }
  return [semear(db, projectId), db.prepare(`UPDATE empresas SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE project_id = ?`).bind(...binds, projectId)];
}

export type PessoasChave = { representante?: { nome: string; cargo?: string | null }; dpo?: { nome: string; email?: string | null } };

/**
 * Representante legal e DPO viram PESSOAS em `partes` do projeto (sem CPF): o representante com o vínculo `responsavel`
 * no projeto, o DPO com `encarregado` (o mesmo vínculo que a 0062 e `importarPartes` dão ao DPO). Mesmo nome = a mesma
 * pessoa, com os dois vínculos. Devolve as escritas para o `db.batch` da criação.
 */
export function gravacaoDasPessoas(db: D1Database, projectId: string, pessoas: PessoasChave | undefined): D1PreparedStatement[] {
  const stmts: D1PreparedStatement[] = [];
  const ids = new Map<string, string>();
  const parte = (nome: string, email: string | null) => {
    const n = normalizarNome(nome);
    const chave = n.toLowerCase();
    let id = ids.get(chave);
    if (!id) {
      id = crypto.randomUUID();
      ids.set(chave, id);
      stmts.push(db.prepare(`INSERT INTO partes (id, project_id, tipo, nome, email) VALUES (?, ?, 'pessoa', ?, ?)`)
        .bind(id, projectId, n, email ? email.trim().toLowerCase() : null));
    } else if (email) {
      stmts.push(db.prepare('UPDATE partes SET email = COALESCE(email, ?) WHERE id = ?').bind(email.trim().toLowerCase(), id));
    }
    return id;
  };
  const vincular = (parteId: string, papel: 'responsavel' | 'encarregado') => stmts.push(
    db.prepare(`INSERT OR IGNORE INTO parte_vinculos (id, project_id, parte_id, papel, alvo_tipo, alvo_id) VALUES (?, ?, ?, ?, 'projeto', ?)`)
      .bind(crypto.randomUUID(), projectId, parteId, papel, projectId));
  if (pessoas?.representante) vincular(parte(pessoas.representante.nome, null), 'responsavel');
  if (pessoas?.dpo) vincular(parte(pessoas.dpo.nome, pessoas.dpo.email || null), 'encarregado');
  return stmts;
}
