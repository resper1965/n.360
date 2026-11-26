-- 0121 — o aceite do risco residual é independente do status do tratamento (ISO/IEC 27001, 6.1.3 e). Só DADOS; o schema não muda.
--
-- Até aqui o aceite com senha (0120) gravava status = 'Accepted' e guardava em risco_aceites.status_anterior o status de antes.
-- Agora aceitar não muda o status: esta migration devolve a cada risco `Accepted` com aceite VIGENTE o status que ele tinha antes
-- (status_anterior) e grava uma linha de trilha por risco alterado em audit_logs. Risco `Accepted` sem aceite vigente (o aceite
-- antigo, sem senha) não muda. NÃO altera risco_aceites: a prova do aceite (estado congelado, hash, aceitante) fica como está.
--
-- ANTES de aplicar em produção: `npm run db:backup` e anote
--   SELECT COUNT(*) FROM risks r WHERE r.status = 'Accepted' AND EXISTS (SELECT 1 FROM risco_aceites a WHERE a.risk_id = r.id
--     AND a.situacao = 'vigente' AND a.status_anterior IS NOT NULL AND a.status_anterior <> 'Accepted'); -- esperado em produção (25/11/2026): 25
--   SELECT COUNT(*) FROM audit_logs WHERE action = 'risk.status_corrigido_aceite';         -- esperado: 0
-- DEPOIS:
--   a primeira contagem                                                                    -- esperado: 0 (nenhum Accepted com aceite vigente)
--   SELECT COUNT(*) FROM audit_logs WHERE action = 'risk.status_corrigido_aceite';         -- esperado: 25 (uma linha por risco alterado)
--   SELECT COUNT(*) FROM risco_aceites WHERE situacao = 'vigente';                         -- igual ao de antes (25)
-- Repetível: rodar de novo não acha risco a corrigir e não grava trilha.
-- Aceite cujo status_anterior já era 'Accepted' (legado aceito de novo com senha) fica de fora: não há status de antes a devolver.

-- 1) A trilha primeiro: depois do UPDATE o risco já não é `Accepted` e não seria achado.
INSERT INTO audit_logs (id, action, actor, details, justification, ip_address, project_id, entity_type, entity_id, field, old_value, new_value)
SELECT lower(hex(randomblob(16))), 'risk.status_corrigido_aceite', 'sistema:migration-0121',
       'Risco ' || r.id || ': status Accepted -> ' || a.status_anterior || '; o aceite do residual não muda o status (migration 0121)',
       '', '', r.project_id, 'risk', r.id, 'status', 'Accepted', a.status_anterior
  FROM risks r JOIN risco_aceites a ON a.risk_id = r.id AND a.situacao = 'vigente'
 WHERE r.status = 'Accepted' AND a.status_anterior IS NOT NULL AND a.status_anterior <> 'Accepted';

-- 2) O status volta ao de antes do aceite. O carimbo accepted_by/accepted_at fica (é o do aceite vigente).
UPDATE risks
   SET status = (SELECT a.status_anterior FROM risco_aceites a WHERE a.risk_id = risks.id AND a.situacao = 'vigente')
 WHERE status = 'Accepted'
   AND EXISTS (SELECT 1 FROM risco_aceites a WHERE a.risk_id = risks.id AND a.situacao = 'vigente' AND a.status_anterior IS NOT NULL
                 AND a.status_anterior <> 'Accepted');
