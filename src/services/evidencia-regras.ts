// Regras de evidência do Painel, da Prontidão e do encarregado. Arquivo próprio para o encarregado não importar o painel (que o importa).
/** Evidência com validade anterior a hoje (?2, o dia de São Paulo). Comparação pelo dia: `valido_ate` pode vir com hora. */
export const SQL_EVIDENCIA_VENCIDA = `(valido_ate IS NOT NULL AND substr(valido_ate, 1, 10) < ?2)`;
/** Evidência vencida ou não conforme (?2 = hoje). A mesma regra no Painel e na Prontidão (`prontidao.ts`). */
export const SQL_EVIDENCIA_RUIM = `(${SQL_EVIDENCIA_VENCIDA} OR evaluation_status = 'non_conforming')`;
