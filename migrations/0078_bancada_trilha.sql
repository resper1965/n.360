-- 0078: Bancada da trilha (spec 2026-10-15). Aditiva: nada existente é reescrito, o código anterior ignora as colunas.
--  - checklist_progress: bloqueio do passo (motivo e responsável obrigatórios na regra, não no banco) e conclusão com exceção.
--  - project_phase_answers: quem gravou (o "Salvo às HH:MM por ..." e o aviso de edição concorrente).
--  - project_phases: `legado_status` congela a situação que o select manual mostrava (completed, blocked, skipped) até a Bancada assumir a fase.
-- Backup antes: npm run db:backup. Conferir depois: PRAGMA table_info(checklist_progress) mostra bloqueio_motivo.
ALTER TABLE checklist_progress ADD COLUMN bloqueio_motivo TEXT;
ALTER TABLE checklist_progress ADD COLUMN bloqueio_responsavel TEXT;
ALTER TABLE checklist_progress ADD COLUMN bloqueado_em DATETIME;
ALTER TABLE checklist_progress ADD COLUMN excecao_motivo TEXT;
ALTER TABLE checklist_progress ADD COLUMN excecao_por TEXT;
ALTER TABLE checklist_progress ADD COLUMN excecao_em DATETIME;
ALTER TABLE project_phase_answers ADD COLUMN updated_by TEXT;
ALTER TABLE project_phases ADD COLUMN legado_status TEXT;
UPDATE project_phases SET legado_status = status WHERE status IN ('completed', 'blocked', 'skipped');
