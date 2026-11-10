-- 0109 — apaga quatro tabelas que nenhum código usa (2026-11-10).
-- project_documents e project_scope_changes: nada lê nem grava (vazias em produção em 10/11/2026).
-- ai_chat_history: só a retenção da manutenção a tocava; o chat nunca gravou nela (2 linhas de maio e julho).
-- project_knowledge: órfã desde a saída da busca vetorial em 06/10/2026 (2 linhas de julho).
-- Nenhuma outra tabela as referencia. O backup antes da migration guarda as 4 linhas.
-- DROP TABLE apaga também os índices delas (idx_projdocs_project, idx_chat_project, idx_project_knowledge_project).
DROP TABLE IF EXISTS project_documents;
DROP TABLE IF EXISTS project_scope_changes;
DROP TABLE IF EXISTS ai_chat_history;
DROP TABLE IF EXISTS project_knowledge;
