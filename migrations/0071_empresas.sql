-- 0071: cadastro completo da empresa do projeto, 1:1 com projects. Sem CPF de ninguém: o representante legal e o DPO
-- viram PESSOAS em `partes` (o DPO com o vínculo `encarregado`); aqui fica só o nome e o cargo do representante, como
-- consta no cadastro. As colunas antigas de `projects` (cnpj, employee_count, sector, client_name) ficam e as rotas as
-- mantêm sincronizadas.
-- CNPJ: só dígitos, 14. Empresa estrangeira ou sem CNPJ usa `documento_alternativo` (e `pais`).
CREATE TABLE IF NOT EXISTS empresas (
    project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
    cnpj TEXT CHECK (cnpj IS NULL OR (length(cnpj) = 14 AND cnpj NOT GLOB '*[^0-9]*')),
    documento_alternativo TEXT,
    razao_social TEXT,
    nome_fantasia TEXT,
    natureza_juridica TEXT,
    porte TEXT,
    data_abertura TEXT CHECK (data_abertura IS NULL OR data_abertura GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    situacao_cadastral TEXT,
    cnae_codigo TEXT,
    cnae_descricao TEXT,
    setor TEXT,
    funcionarios INTEGER CHECK (funcionarios IS NULL OR funcionarios >= 0),
    cep TEXT,
    logradouro TEXT,
    numero TEXT,
    complemento TEXT,
    bairro TEXT,
    municipio TEXT,
    uf TEXT CHECK (uf IS NULL OR (length(uf) = 2 AND uf GLOB '[A-Z][A-Z]')),
    pais TEXT NOT NULL DEFAULT 'BR',
    telefone TEXT,
    email TEXT,
    site TEXT,
    representante_nome TEXT,
    representante_cargo TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_empresas_cnpj ON empresas(cnpj);

-- Backfill: uma linha por projeto existente, sem perder dado. CNPJ gravado com máscara vira só dígitos; o que não fecha
-- 14 dígitos vai inteiro para `documento_alternativo`. client_name entra como razão social. Repetível (OR IGNORE).
INSERT OR IGNORE INTO empresas (project_id, cnpj, documento_alternativo, razao_social, setor, funcionarios)
SELECT id,
       CASE WHEN length(d) = 14 AND d NOT GLOB '*[^0-9]*' THEN d END,
       CASE WHEN d <> '' AND NOT (length(d) = 14 AND d NOT GLOB '*[^0-9]*') THEN trim(cnpj) END,
       NULLIF(trim(client_name), ''),
       NULLIF(trim(sector), ''),
       CASE WHEN typeof(employee_count) = 'integer' AND employee_count >= 0 THEN employee_count END
  FROM (SELECT id, cnpj, client_name, sector, employee_count,
               replace(replace(replace(replace(trim(COALESCE(cnpj, '')), '.', ''), '/', ''), '-', ''), ' ', '') AS d
          FROM projects);
