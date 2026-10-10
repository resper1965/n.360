-- 0062: o DPO cadastrado na governança do n.iso vira o encarregado do n.privacy (vínculo 'encarregado').
-- ponytail: LIKE '%dpo%' casa 'dpo' dentro de outra palavra; não há cargo assim hoje.
-- Fonte deduplicada: de dois membros DPO do mesmo projeto com o mesmo e-mail ou o mesmo nome, vale o mais antigo (rowid).
-- Governança de projeto que não existe mais fica fora (a FK de partes abortaria a migration).
INSERT INTO partes (id, project_id, tipo, nome, email)
SELECT lower(hex(randomblob(16))), g.project_id, 'pessoa', trim(g.name), lower(trim(g.email))
  FROM project_governance g
 WHERE EXISTS (SELECT 1 FROM projects pr WHERE pr.id = g.project_id)
   AND (g.role_category = 'dpo' OR lower(g.job_title) LIKE '%dpo%' OR lower(g.job_title) LIKE '%encarregad%')
   AND NOT EXISTS (SELECT 1 FROM project_governance g2
                    WHERE g2.project_id = g.project_id AND g2.rowid < g.rowid
                      AND (g2.role_category = 'dpo' OR lower(g2.job_title) LIKE '%dpo%' OR lower(g2.job_title) LIKE '%encarregad%')
                      AND ((nullif(trim(g.email), '') IS NOT NULL AND lower(trim(g2.email)) = lower(trim(g.email))) OR lower(trim(g2.name)) = lower(trim(g.name))))
   AND NOT EXISTS (SELECT 1 FROM partes p WHERE p.project_id = g.project_id AND p.tipo = 'pessoa'
                     AND ((nullif(trim(g.email), '') IS NOT NULL AND lower(trim(p.email)) = lower(trim(g.email))) OR lower(trim(p.nome)) = lower(trim(g.name))));

-- Uma parte por membro: a do e-mail; o nome só quando o membro não tem e-mail ou nenhuma parte tem aquele e-mail.
INSERT OR IGNORE INTO parte_vinculos (id, project_id, parte_id, papel, alvo_tipo, alvo_id)
SELECT lower(hex(randomblob(16))), g.project_id, g.parte_id, 'encarregado', 'projeto', g.project_id
  FROM (SELECT x.project_id,
               coalesce(
                 (SELECT p.id FROM partes p WHERE p.project_id = x.project_id AND p.tipo = 'pessoa'
                     AND nullif(trim(x.email), '') IS NOT NULL AND lower(trim(p.email)) = lower(trim(x.email)) ORDER BY p.rowid LIMIT 1),
                 (SELECT p.id FROM partes p WHERE p.project_id = x.project_id AND p.tipo = 'pessoa'
                     AND lower(trim(p.nome)) = lower(trim(x.name)) ORDER BY p.rowid LIMIT 1)) AS parte_id
          FROM project_governance x
         WHERE EXISTS (SELECT 1 FROM projects pr WHERE pr.id = x.project_id)
           AND (x.role_category = 'dpo' OR lower(x.job_title) LIKE '%dpo%' OR lower(x.job_title) LIKE '%encarregad%')) g
 WHERE g.parte_id IS NOT NULL;
