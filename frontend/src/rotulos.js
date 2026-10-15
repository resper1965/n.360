/**
 * Camada de exibição dos valores que o banco guarda em inglês (status, severidade, classificação, tipo de auditoria,
 * frequência, papel no tratamento...). A interface é PT-BR; o valor gravado NUNCA muda, só o texto mostrado.
 *
 * `rotuloDe(dominio, valor)`: procura primeiro no domínio (o mesmo valor pode ter rótulos diferentes: "Internal" é
 * "Interna" numa auditoria) e depois no mapa geral. Valor desconhecido volta COMO VEIO: melhor mostrar o termo cru
 * do banco do que apagar a informação. Caixa e espaços das pontas não importam ("  hIgH " = "High").
 *
 * Rótulo em caixa de frase ("Em andamento", não "Em Andamento"): é texto corrido em português.
 */
const GERAL = {
    // estado de trabalho
    'open': 'Aberto', 'closed': 'Fechado', 'pending': 'Pendente', 'planned': 'Planejado', 'scheduled': 'Agendado',
    'in progress': 'Em andamento', 'in_progress': 'Em andamento', 'completed': 'Concluído', 'done': 'Concluído',
    'blocked': 'Bloqueado', 'skipped': 'Dispensado', 'cancelled': 'Cancelado', 'canceled': 'Cancelado',
    'overdue': 'Atrasado', 'expired': 'Vencido', 'valid': 'Válido', 'signed': 'Assinado', 'sent': 'Enviado',
    // aprovação e ciclo de vida
    'draft': 'Rascunho', 'under review': 'Em revisão', 'in review': 'Em revisão', 'approved': 'Aprovado',
    'rejected': 'Rejeitado', 'revoked': 'Revogado', 'active': 'Ativo', 'inactive': 'Inativo', 'archived': 'Arquivado',
    'retired': 'Aposentado', 'published': 'Publicado',
    // conformidade
    'implemented': 'Implementado', 'compliant': 'Conforme', 'conforming': 'Conforme', 'non_conforming': 'Não conforme',
    'non-compliant': 'Não conforme', 'non compliant': 'Não conforme', 'partial': 'Parcial', 'missing': 'Pendente',
    'not applicable': 'Não aplicável', 'na': 'N/A', 'n/a': 'N/A', 'gap': 'Lacuna', 'gap assessment': 'Análise de lacunas',
    // severidade e nível
    'very low': 'Muito baixo', 'low': 'Baixo', 'medium': 'Médio', 'high': 'Alto', 'very high': 'Muito alto',
    'critical': 'Crítico', 'informational': 'Informativo', 'info': 'Informativo', 'major': 'Maior', 'minor': 'Menor',
    'observation': 'Observação', 'opportunity': 'Oportunidade de melhoria',
    // tratamento de risco
    'treated': 'Tratado', 'mitigate': 'Mitigar', 'accept': 'Aceitar', 'accepted': 'Aceito', 'transfer': 'Transferir',
    'avoid': 'Evitar', 'mitigated': 'Mitigado',
    // classificação da informação
    'confidential': 'Confidencial', 'internal': 'Interno', 'public': 'Público', 'restricted': 'Restrito', 'secret': 'Secreto',
    // métricas
    'on track': 'No rumo', 'at risk': 'Em risco', 'off track': 'Fora do rumo',
    'daily': 'Diária', 'weekly': 'Semanal', 'monthly': 'Mensal', 'quarterly': 'Trimestral', 'semiannual': 'Semestral',
    'annual': 'Anual', 'yearly': 'Anual',
    // comercial
    'new': 'Novo', 'assessment': 'Levantamento', 'proposal': 'Proposta', 'negotiation': 'Negociação', 'won': 'Ganho',
    'lost': 'Perdido', 'qualified': 'Qualificado', 'contacted': 'Contatado',
    // auditoria
    'certification': 'Certificação', 'surveillance': 'Supervisão', 'recertification': 'Recertificação',
    'external': 'Externa', 'stage 1': 'Estágio 1', 'stage 2': 'Estágio 2', 'stage1': 'Estágio 1', 'stage2': 'Estágio 2',
    // tratamento de dados pessoais
    'controller': 'Controlador', 'processor': 'Operador', 'joint controller': 'Controlador conjunto',
    'sub-processor': 'Suboperador', 'subprocessor': 'Suboperador',
    // políticas
    'organizational': 'Organizacional', 'technical': 'Técnica', 'people': 'Pessoas', 'physical': 'Física',
    'standard': 'Padrão', 'advanced': 'Avançado', 'basic': 'Básico',
};

const POR_DOMINIO = {
    // audit_schedule.type: a auditoria é feminina.
    auditoria: { 'internal': 'Interna', 'external': 'Externa', 'planned': 'Planejada', 'completed': 'Concluída', 'scheduled': 'Agendada', 'cancelled': 'Cancelada' },
    // project_phases.status: a fase é feminina e "Pending" é "Não iniciada".
    fase: { 'pending': 'Não iniciada', 'in_progress': 'Em andamento', 'completed': 'Concluída', 'blocked': 'Bloqueada', 'skipped': 'Dispensada' },
    // propostas e avaliações
    proposta: { 'draft': 'Rascunho', 'sent': 'Enviada', 'approved': 'Aprovada', 'rejected': 'Rejeitada', 'won': 'Ganha', 'lost': 'Perdida' },
    // training_records.status
    treinamento: { 'pending': 'Pendente', 'completed': 'Concluído', 'expired': 'Vencido' },
};

export function rotuloDe(dominio, valor) {
    if (valor === null || valor === undefined || valor === '') return '';
    const chave = String(valor).toLowerCase().trim();
    return (dominio && POR_DOMINIO[dominio]?.[chave]) || GERAL[chave] || valor;
}

if (typeof window !== 'undefined') window.rotuloDe = rotuloDe;
