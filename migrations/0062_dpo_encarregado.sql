-- 0062: o DPO cadastrado na governança do n.iso vira o encarregado do n.privacy (vínculo 'encarregado').
-- ponytail: LIKE '%dpo%' casa 'dpo' dentro de outra palavra; não há cargo assim hoje.
INSERT INTO partes (id, project_id, tipo, nome, email)
SELECT lower(hex(randomblob(16))), g.project_id, 'pessoa', trim(g.name), lower(trim(g.email))
  FROM project_governance g
 WHERE g.project_id IS NOT NULL
   AND (g.role_category = 'dpo' OR lower(g.job_title) LIKE '%dpo%' OR lower(g.job_title) LIKE '%encarregad%')
   AND NOT EXISTS (SELECT 1 FROM partes p WHERE p.project_id = g.project_id AND p.tipo = 'pessoa'
                     AND ((g.email IS NOT NULL AND lower(trim(p.email)) = lower(trim(g.email))) OR lower(trim(p.nome)) = lower(trim(g.name))));

INSERT OR IGNORE INTO parte_vinculos (id, project_id, parte_id, papel, alvo_tipo, alvo_id)
SELECT lower(hex(randomblob(16))), g.project_id, p.id, 'encarregado', 'projeto', g.project_id
  FROM project_governance g
  JOIN partes p ON p.project_id = g.project_id AND p.tipo = 'pessoa'
   AND ((g.email IS NOT NULL AND lower(trim(p.email)) = lower(trim(g.email))) OR lower(trim(p.nome)) = lower(trim(g.name)))
 WHERE g.role_category = 'dpo' OR lower(g.job_title) LIKE '%dpo%' OR lower(g.job_title) LIKE '%encarregad%';
