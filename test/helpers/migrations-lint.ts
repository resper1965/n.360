/**
 * Regras de consistência entre as migrations e o schema.sql (spec 2026-10-27-paridade-migrations-e-mescla).
 *
 * Aplicar a sequência inteira num banco vazio não é possível (não existe a 0001: 42 das 86 migrations falham), então a
 * conferência é estática, sobre o texto. Funções puras: o teste prova que elas falham no caso ruim.
 */

export type Migracao = { nome: string; sql: string };
export type Objeto = { nome: string; tabela: string; tipo: 'indice' | 'gatilho' };

const semComentario = (s: string) => s.replace(/\r\n?/g, '\n').replace(/--[^\n]*/g, '');

/** Nomes que a migration refaz: `ALTER TABLE x RENAME TO t` onde a mesma migration também faz `DROP TABLE t`. */
export function tabelasRefeitas(sql: string): string[] {
  const limpo = semComentario(sql);
  const dropadas = new Set([...limpo.matchAll(/DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?(\w+)/gi)].map((m) => m[1].toLowerCase()));
  return [...new Set([...limpo.matchAll(/RENAME\s+TO\s+(\w+)/gi)].map((m) => m[1].toLowerCase()).filter((t) => dropadas.has(t)))];
}

/** Índices e gatilhos que o schema.sql define, com a tabela de cada um. */
export function objetosDoSchema(schema: string): Objeto[] {
  const limpo = semComentario(schema);
  const objs: Objeto[] = [];
  for (const m of limpo.matchAll(/CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)\s+ON\s+(\w+)/gi)) objs.push({ nome: m[1], tabela: m[2].toLowerCase(), tipo: 'indice' });
  for (const m of limpo.matchAll(/CREATE\s+TRIGGER\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)\s+(?:BEFORE|AFTER|INSTEAD\s+OF)\s+(?:INSERT|DELETE|UPDATE(?:\s+OF\s+[\w,\s]+?)?)\s+ON\s+(\w+)/gi)) {
    objs.push({ nome: m[1], tabela: m[2].toLowerCase(), tipo: 'gatilho' });
  }
  return objs;
}

const cria = (sql: string, nome: string) =>
  new RegExp(`CREATE\\s+(?:UNIQUE\\s+)?(?:INDEX|TRIGGER)\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?${nome}\\b`, 'i').test(semComentario(sql));

/**
 * R1: para cada tabela refeita por uma migration, cada índice e gatilho que o schema.sql define sobre ela precisa ser recriado por
 * uma migration de nome maior ou igual (o DROP leva os objetos da tabela). Devolve uma frase por perda, vazia se estiver tudo certo.
 */
export function perdasPorReconstrucao(migracoes: Migracao[], schema: string): string[] {
  const ordenadas = [...migracoes].sort((a, b) => a.nome.localeCompare(b.nome));
  const objs = objetosDoSchema(schema);
  const perdas: string[] = [];
  for (const mig of ordenadas) {
    for (const tabela of tabelasRefeitas(mig.sql)) {
      for (const o of objs.filter((x) => x.tabela === tabela)) {
        if (!ordenadas.some((m) => m.nome >= mig.nome && cria(m.sql, o.nome))) {
          perdas.push(`${mig.nome} refez a tabela ${tabela} e nenhuma migration a partir dela recria o ${o.tipo} ${o.nome} (definido no schema.sql). `
            + `Recrie-o na própria migration ou numa seguinte: o DROP TABLE apaga os gatilhos e índices da tabela.`);
        }
      }
    }
  }
  return perdas;
}

/** `ALTER TABLE t ADD COLUMN c` de cada migration (R2). */
export function colunasAdicionadas(migracoes: Migracao[]): { migracao: string; tabela: string; coluna: string }[] {
  const out: { migracao: string; tabela: string; coluna: string }[] = [];
  for (const mig of [...migracoes].sort((a, b) => a.nome.localeCompare(b.nome))) {
    for (const m of semComentario(mig.sql).matchAll(/ALTER\s+TABLE\s+(\w+)\s+ADD\s+COLUMN\s+(\w+)/gi)) {
      out.push({ migracao: mig.nome, tabela: m[1].toLowerCase(), coluna: m[2].toLowerCase() });
    }
  }
  return out;
}

/**
 * Tabelas que migrations antigas alteram mas que o schema.sql já não tem, com o motivo. Exceção nova exige motivo escrito.
 */
export const EXCECOES_R2: Readonly<Record<string, string>> = {
  assets: 'virou itens (e item_seguranca) na migration 0048; as colunas CID e tipo nasceram na 0009 e na 0013, antes da troca',
};
