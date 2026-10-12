-- 0065: a ness. passa a contratar o n.privacy além do n.iso (aprovado pelo dono da plataforma em 2026-10-11).
-- Só dados, sem DDL. Só mexe se o valor ainda for o padrão ["iso"]: outro valor (ajustado à mão) fica como está,
-- e aplicar de novo não muda nada.
UPDATE organizations SET modulos_contratados = '["iso","privacy"]' WHERE id = 'org_ness' AND modulos_contratados = '["iso"]';
