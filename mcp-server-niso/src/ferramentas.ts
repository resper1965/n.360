import { z } from "zod";
import type { Rota, Obrigatorios } from "./contrato-gerado.js";

// Ferramentas MCP do nISO: definições, filtro por papel e despacho.
// Módulo SEM efeito colateral (sem env, sem SDK do MCP, sem fetch próprio): o
// transporte é injetado, então o mesmo código serve o servidor stdio local e o
// MCP remoto do Worker.

/** Como a ferramenta fala com a API do nISO. Cada servidor injeta o seu. */
export interface Transporte {
  get(path: string): Promise<unknown>;
  enviar(path: string, corpo?: unknown, method?: "POST" | "PUT" | "PATCH"): Promise<unknown>;
  contrato<R extends Rota>(
    rota: R,
    params: Record<string, string>,
    corpo: Record<Obrigatorios<R>, unknown> & Record<string, unknown>
  ): Promise<unknown>;
  uploadTexto(path: string, campos: Record<string, string>, conteudo: string, nomeArquivo: string): Promise<unknown>;
}

export type Papel = "consultant" | "auditor" | "readonly" | "";

export interface Ferramenta {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface Resultado {
  content: { type: "text"; text: string }[];
  isError?: boolean;
}

const WRITE_GUARDRAIL =
  "ESCRITA em projeto de cliente: requer contrato ativo e aprovação humana prévia (ver constituição do Aegis-Consultor).";

// n.privacy: o agente propõe, uma pessoa aprova. Toda escrita nomeada grava rascunho e nunca aprova.
const RASCUNHO_PRIVACY =
  'Grava RASCUNHO; o agente propõe e uma pessoa aprova pela interface. PEÇA APROVAÇÃO HUMANA: mostre ao usuário o que será gravado e espere o "sim" antes de chamar. Exige o módulo n.privacy no projeto e na sua conta (senão 403).';

const P_PROJETO = { projectId: { type: "string", description: "The project ID (o desta conexão)" } };
const P_ROPA = { ...P_PROJETO, ropaId: { type: "string", description: "Id do tratamento (registro do RoPA)" } };
const texto = (description: string) => ({ type: ["string", "null"], description });
const simNao = (description: string) => ({ type: "boolean", description });

/** Campos do tratamento, na ordem dos blocos da entrevista de RoPA (A a H). Sem `status`: aprovar é humano. */
const CAMPOS_TRATAMENTO = {
  processing_purpose: { type: "string", description: "Bloco A: a atividade e para que serve, específica (ex.: 'Folha de pagamento: pagar salários e recolher encargos')" },
  owner: texto("Bloco A: nome de quem responde pela atividade"),
  owner_parte_id: texto("Bloco A: id da pessoa responsável no cadastro de partes do projeto (/partes)"),
  data_subjects: texto("Bloco B: titulares, separados por vírgula (ex.: Colaboradores, Dependentes)"),
  criancas_adolescentes: simNao("Bloco B: há menores de 18 anos entre os titulares (LGPD art. 14)"),
  data_categories: texto("Bloco C: categorias de dado, separadas por vírgula (ex.: Identificação, Contato, Financeiro)"),
  dados_sensiveis: simNao("Bloco C: há dado sensível (LGPD art. 11); a base legal deve ser do art. 11"),
  legal_basis: texto("Bloco D: texto da hipótese legal, como a tela grava (ex.: 'Cumprimento de obrigação legal ou regulatória'); sensível leva o sufixo ' (art. 11)'"),
  base_legal_id: texto("Bloco D: id da base no catálogo de requisitos (ex.: lgpd:art7:ii); liste com /api/v1/requisitos?fonte=lgpd. null desliga"),
  consent_details: texto("Blocos B e D: como o consentimento é pedido e guardado (e o do responsável legal, se há menores)"),
  data_subject_rights_details: texto("Como o titular exerce os direitos neste tratamento"),
  recipients: texto("Bloco F: com quem compartilha, em texto (ex.: contabilidade terceirizada, Receita Federal)"),
  retention_period: texto("Bloco G: por quanto tempo guarda e o critério"),
  international_transfers: simNao("Bloco H: algum dado vai para fora do Brasil ou fica em servidor no exterior"),
  transfer_safeguards: texto("Bloco H: mecanismo da transferência (ex.: cláusulas-padrão contratuais)"),
  dpia_required: simNao("Bloco H: precisa de relatório de impacto (RIPD/DPIA)"),
};

// ── Classes de ferramenta por papel ──────────────────────────────────────────
export const READ_TOOLS = new Set([
  "niso_list_projects",
  "niso_get_project",
  "niso_list_controls",
  "niso_list_risks",
  "niso_gap_analysis",
  "niso_traceability",
  "niso_list_evidence",
  "niso_audit_pack",
  "niso_coherence_check",
  // n.privacy: leitura nomeada (o auditor também lê o n.privacy)
  "niso_privacy_ropa",
  "niso_privacy_ropa_detalhe",
  "niso_privacy_requisitos_lacunas",
  "niso_privacy_titular_pedidos",
  "niso_privacy_incidentes",
  "niso_privacy_terceiros",
  "niso_privacy_encarregado",
  "niso_privacy_ponto_de_partida",
]);
// Escrita exclusiva do auditor (achados e notas de auditoria).
export const AUDITOR_WRITE_TOOLS = new Set([
  "niso_create_audit_finding",
  "niso_create_auditor_note",
]);
// Qualquer escrita que não seja do auditor é do consultor (implementação).
function isConsultantWrite(name: string): boolean {
  return !READ_TOOLS.has(name) && !AUDITOR_WRITE_TOOLS.has(name);
}

// Uma ferramenta é permitida conforme o papel configurado.

// Uma ferramenta é permitida conforme o papel.
export function ferramentaPermitida(nome: string, papel: Papel): boolean {
  if (papel === "readonly") return READ_TOOLS.has(nome);
  if (papel === "auditor")
    return READ_TOOLS.has(nome) || AUDITOR_WRITE_TOOLS.has(nome);
  if (papel === "consultant")
    return READ_TOOLS.has(nome) || isConsultantWrite(nome);
  return true; // sem papel definido → todas as ferramentas
}

// Tipos que `niso_create_evidence` aceita. Subconjunto FECHADO de
// ALLOWED_UPLOAD_TYPES (src/helpers.ts): só o que é texto puro e que o agente
// consegue de fato produzir dentro do chat. PDF, DOCX, ZIP e imagem ficam de
// fora de propósito — o worker aceita esses tipos no upload da UI, mas por MCP
// eles só chegariam como blob codificado, e aí a ferramenta viraria um caminho
// de subir binário arbitrário atrás de uma chave de API. `text/html` e
// `image/svg+xml` não estão na allow-list do worker (XSS armazenado) e também
// não entram aqui.
const EVIDENCE_TEXT_TYPES = [
  "text/markdown",
  "text/plain",
  "text/csv",
  "application/json",
] as const;

export const TOOLS: Ferramenta[] = [
  {
    name: "niso_list_projects",
    description: "List all active GRC projects in the n.iso portfolio",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "niso_get_project",
    description: "Get detailed information about a specific project, including phases and progress",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "The unique ID of the project" },
      },
      required: ["projectId"],
    },
  },
  {
    name: "niso_create_risk",
    description: `Create a new risk entry in a project's risk matrix. ${WRITE_GUARDRAIL}`,
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "The project ID" },
        asset: { type: "string", description: "The asset at risk (e.g., Customer Data)" },
        threat: { type: "string", description: "The threat (e.g., Data Breach)" },
        vulnerability: { type: "string", description: "The vulnerability (e.g., Unencrypted Storage)" },
        impact: { type: "number", minimum: 1, maximum: 5, description: "Impact score (1-5)" },
        probability: { type: "number", minimum: 1, maximum: 5, description: "Probability score (1-5)" },
      },
      required: ["projectId", "asset", "threat", "impact", "probability"],
    },
  },
  {
    name: "niso_update_risk",
    description: `Update an existing risk (partial: only the fields you pass change; the rest is kept). Use niso_list_risks to get the riskId. Risk acceptance (accepted_by/accepted_at) is a management decision and cannot be set here. ${WRITE_GUARDRAIL}`,
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "The project ID the risk belongs to" },
        riskId: { type: "string", description: "The risk ID" },
        asset: { type: "string" },
        threat: { type: "string" },
        vulnerability: { type: "string" },
        impact: { type: "number", minimum: 1, maximum: 5 },
        probability: { type: "number", minimum: 1, maximum: 5 },
        treatment: { type: "string", description: "Mitigate, Accept, Transfer or Avoid" },
        treatment_plan: { type: "string" },
        control_id: { type: "string", description: "Linked control ID" },
        owner: { type: "string" },
        status: { type: "string", description: "e.g. Open, Mitigated, Closed" },
      },
      required: ["projectId", "riskId"],
    },
  },
  {
    name: "niso_list_controls",
    description: "List all compliance controls for a specific project",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "The project ID" },
      },
      required: ["projectId"],
    },
  },
  {
    name: "niso_list_risks",
    description: "List all risks in a project's risk register",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "The project ID" },
      },
      required: ["projectId"],
    },
  },
  {
    name: "niso_gap_analysis",
    description:
      "Run the project's gap analysis: control coverage %, breakdown by status, and the list of open gaps",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "The project ID" },
      },
      required: ["projectId"],
    },
  },
  {
    name: "niso_traceability",
    description:
      "Get the project's traceability matrix linking risks -> controls -> evidence",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "The project ID" },
      },
      required: ["projectId"],
    },
  },
  {
    name: "niso_list_evidence",
    description: "List all evidence records for a project",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "The project ID" },
      },
      required: ["projectId"],
    },
  },
  {
    name: "niso_audit_pack",
    description:
      "Download the audit readiness pack (consolidated JSON: project, phases, controls, evidence, audit trail)",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "The project ID" },
      },
      required: ["projectId"],
    },
  },
  {
    name: "niso_coherence_check",
    description:
      "Cross-reference check between the project's ISMS/PIMS phases: risks in mitigation without a linked control, and Approved/Implemented controls missing evidence or a written policy. Returns ok:false if any error-severity issue is found.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "The project ID" },
      },
      required: ["projectId"],
    },
  },
  {
    name: "niso_generate_policy",
    description: `Generate a policy document for a control via the n.iso PolicyAgent (AI draft). The server saves it as a DRAFT of the control's policy document: nothing in the current policy changes until a human publishes it on the policy screen. ${WRITE_GUARDRAIL}`,
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "The project ID" },
        controlId: {
          type: "string",
          description: "The ISO 27001:2022 Annex A control ID (e.g., A.5.1). Defaults to A.5.1",
        },
      },
      required: ["projectId"],
    },
  },
  {
    name: "niso_evaluate_evidence",
    description: `AI pre-qualification of an evidence record (CONFORME/PARCIAL/NAO CONFORME draft — not an audit verdict). Requires the extracted text of the evidence document. ${WRITE_GUARDRAIL}`,
    inputSchema: {
      type: "object",
      properties: {
        evidenceId: { type: "string", description: "The evidence record ID" },
        text: { type: "string", description: "Extracted text content of the evidence document" },
      },
      required: ["evidenceId", "text"],
    },
  },
  {
    name: "niso_create_evidence",
    description: `Register a TEXTUAL evidence document (policy, procedure, meeting minutes, log excerpt, configuration dump) in a project's evidence repository, from text supplied in this call. The text is stored verbatim and its SHA-256 is recorded. TEXT ONLY: this tool cannot upload PDFs, images, spreadsheets, or any binary or pre-existing file — those go through the n.iso web UI. Do not transcribe or re-type a binary document to work around this; a transcription is not the document. ${WRITE_GUARDRAIL}`,
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "The project ID" },
        fileName: {
          type: "string",
          description: "File name to record, with extension (e.g. politica-acesso.md). No directory separators.",
        },
        content: { type: "string", description: "Full textual content of the evidence document" },
        contentType: {
          type: "string",
          enum: [...EVIDENCE_TEXT_TYPES],
          description: "MIME type of the content. Defaults to text/markdown",
        },
        controlId: {
          type: "string",
          description: "Optional Annex A control ID to link the evidence to (e.g. ctrl-a51)",
        },
      },
      required: ["projectId", "fileName", "content"],
    },
  },
  {
    name: "niso_generate_policies_bulk",
    description: `Generate multiple policy documents sequentially via AI. NEVER run autonomously — bulk generation ALWAYS requires explicit human approval in the active contract. ${WRITE_GUARDRAIL}`,
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "The project ID" },
        controlIds: {
          type: "array",
          items: { type: "string" },
          description:
            "Annex A control IDs to generate policies for (e.g., ['A.5.1','A.5.9']). Defaults to the core organizational set",
        },
      },
      required: ["projectId"],
    },
  },
  {
    name: "niso_migrate_27701",
    description: `Migrate the project's SoA from ISO 27001:2013 to 2022 mapping and identify ISO 27701 gaps, creating new controls. ${WRITE_GUARDRAIL}`,
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "The project ID" },
      },
      required: ["projectId"],
    },
  },
  {
    name: "niso_import_training",
    description: `Import employee training records in bulk from an external source. ${WRITE_GUARDRAIL}`,
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "The project ID" },
        records: {
          type: "array",
          items: {
            type: "object",
            properties: {
              employee_name: { type: "string" },
              training_name: { type: "string" },
              completion_date: { type: "string", description: "Format: YYYY-MM-DD" },
              score: { type: "number" },
              status: { type: "string", description: "Completed or Pending" },
            },
            required: ["employee_name", "training_name"],
          },
          description: "List of training records to import",
        },
      },
      required: ["projectId", "records"],
    },
  },
  {
    name: "niso_create_asset",
    description: `Create a new asset entry in the project's asset inventory. ${WRITE_GUARDRAIL}`,
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "The project ID" },
        name: { type: "string", description: "Name of the asset (e.g. AWS RDS Database)" },
        type: { type: "string", description: "Type of asset (e.g. software, hardware, data, people)" },
        criticality: { type: "string", description: "Asset criticality (Low, Medium, High, Critical)" },
        owner: { type: "string", description: "Asset owner name" },
        location: { type: "string", description: "Asset location or system URL" },
      },
      required: ["projectId", "name", "type", "criticality"],
    },
  },
  {
    name: "niso_update_policy",
    description: `Propose the text of a control's policy (NOT AI generation — the exact text provided). The server saves it as a DRAFT of the control's policy document: the current policy, its CISO/CEO approvals and its open approval requests stay untouched until a human publishes the draft on the policy screen. Tell the user a draft is waiting for review; never say the policy was changed. ${WRITE_GUARDRAIL}`,
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "The project ID" },
        controlId: { type: "string", description: "The control ID (e.g. A.5.1 or ctrl-a51)" },
        text: { type: "string", description: "Full policy text (markdown) to save as the new current version" },
      },
      required: ["projectId", "controlId", "text"],
    },
  },
  {
    name: "niso_update_control",
    description: `Update fields of an existing SoA control (status, title and/or description). At least one of the three must be provided. Changing the description resets any prior CISO/CEO approval. The agent may change the description only to record the justification of a Not Applicable control; to propose policy text use niso_update_policy (it saves a draft for human review). ${WRITE_GUARDRAIL}`,
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "The project ID" },
        controlId: { type: "string", description: "The control ID (e.g. ctrl-a51)" },
        status: { type: "string", description: "New control status" },
        title: { type: "string", description: "New control title" },
        description: { type: "string", description: "New control description/policy text" },
      },
      required: ["projectId", "controlId"],
    },
  },
  {
    name: "niso_create_audit_finding",
    description: `Create a new audit finding. If non-conforming, it automatically creates a linked Corrective Action (CAPA). ${WRITE_GUARDRAIL}`,
    inputSchema: {
      type: "object",
      properties: {
        auditId: { type: "string", description: "The audit schedule ID" },
        projectId: { type: "string", description: "The project ID" },
        controlId: { type: "string", description: "The control ID (e.g. ctrl-a51). Optional: a LGPD finding may have no control" },
        findingType: { type: "string", description: "Type: conforming, minor_nc, major_nc, observation" },
        description: { type: "string", description: "Detailed description of the finding" },
        evidenceReviewed: { type: "string", description: "Description of evidence reviewed" },
        auditorNotes: { type: "string", description: "Additional auditor internal notes" },
      },
      required: ["auditId", "projectId", "findingType", "description"],
    },
  },
  {
    name: "niso_create_auditor_note",
    description: `Submit a question or clarification request for a control using an auditor token. ${WRITE_GUARDRAIL}`,
    inputSchema: {
      type: "object",
      properties: {
        token: { type: "string", description: "The auditor token" },
        controlId: { type: "string", description: "The control ID (e.g. ctrl-a51)" },
        noteType: { type: "string", description: "Type: question, observation, request" },
        content: { type: "string", description: "Content of the request or question" },
      },
      required: ["token", "controlId", "content"],
    },
  },
  {
    name: "niso_respond_auditor_note",
    description: `Provide a response to an auditor note or request. ${WRITE_GUARDRAIL}`,
    inputSchema: {
      type: "object",
      properties: {
        noteId: { type: "string", description: "The ID of the auditor note" },
        response: { type: "string", description: "Response text to address the auditor question" },
      },
      required: ["noteId", "response"],
    },
  },

  // ── n.privacy: leitura ─────────────────────────────────────────────────────
  {
    name: "niso_privacy_ropa",
    description:
      "n.privacy: lista os tratamentos do RoPA com status, base legal, riscos (sensível, menores, transferência), nao_informado (campo que a importação não trouxe) e as ligações resumidas de cada um (itens, departamentos, partes, transferências, DPIAs, LIA, terceiros com avaliação vencida). Só leitura.",
    inputSchema: { type: "object", properties: P_PROJETO, required: ["projectId"], additionalProperties: false },
  },
  {
    name: "niso_privacy_ropa_detalhe",
    description:
      "n.privacy: um tratamento do RoPA por inteiro: o registro, as ligações (base legal do catálogo, itens, departamentos, partes, transferências, DPIAs, dpia_pendente, aprovação) e a LIA. Só leitura.",
    inputSchema: { type: "object", properties: P_ROPA, required: ["projectId", "ropaId"], additionalProperties: false },
  },
  {
    name: "niso_privacy_requisitos_lacunas",
    description:
      "n.privacy: cobertura dos requisitos da LGPD e da ANPD no projeto (resumo e cada requisito: coberto, parcial ou lacuna, com o documento, controle ou evidência que cobre). Sem fonte traz as duas. Só leitura.",
    inputSchema: {
      type: "object",
      properties: { ...P_PROJETO, fonte: { type: "string", enum: ["lgpd", "anpd"], description: "Uma fonte só (opcional)" } },
      required: ["projectId"],
      additionalProperties: false,
    },
  },
  {
    name: "niso_privacy_titular_pedidos",
    description:
      "n.privacy: pedidos do titular (protocolo, tipo, status, prazo_em e situacao_prazo). O prazo sai de parametros_legais; sem o parâmetro cadastrado o prazo é 'não calculado', não invente um. Só leitura.",
    inputSchema: { type: "object", properties: P_PROJETO, required: ["projectId"], additionalProperties: false },
  },
  {
    name: "niso_privacy_incidentes",
    description:
      "n.privacy: incidentes (protocolo, risco ao titular, status) com os prazos de comunicação em situacao_anpd e situacao_titular. Só leitura.",
    inputSchema: { type: "object", properties: P_PROJETO, required: ["projectId"], additionalProperties: false },
  },
  {
    name: "niso_privacy_terceiros",
    description:
      "n.privacy: terceiros (partes do tipo organização) com o tipo (grande_provedor, medio, pequeno, critico), o método que o tipo exige (trust_center, questionario, auditoria), a situação da avaliação mais recente (pendente, vigente, vencida, reprovada) e quantos tratamentos e documentos os ligam. Só leitura.",
    inputSchema: { type: "object", properties: P_PROJETO, required: ["projectId"], additionalProperties: false },
  },
  {
    name: "niso_privacy_encarregado",
    description:
      "n.privacy: o painel do encarregado: pedidos do titular, incidentes, tratamentos sem base, DPIA ou LIA, terceiros, documentos, evidências, cobertura LGPD, prazos legais não cadastrados e o 'o que fazer' em prioridades (alta, media). Comece por aqui. Só leitura.",
    inputSchema: { type: "object", properties: P_PROJETO, required: ["projectId"], additionalProperties: false },
  },
  {
    name: "niso_privacy_ponto_de_partida",
    description:
      "Ponto de partida do projeto: o que já existe no cadastro compartilhado (tratamentos, DPIAs, documentos vigentes, evidências válidas, itens, terceiros, encarregado, incidentes, treinamentos), a cobertura LGPD e ANPD e os requisitos ISO que a privacidade já adianta (só mapeamento validado pelo jurídico). Só leitura.",
    inputSchema: { type: "object", properties: P_PROJETO, required: ["projectId"], additionalProperties: false },
  },

  // ── n.privacy: escrita do consultor (rascunho; aprovar é humano) ───────────
  {
    name: "niso_privacy_propor_tratamento",
    description: `n.privacy: cria um tratamento no RoPA com as respostas da entrevista (blocos A a H). Nasce SEMPRE em Draft; o agente não define status nem aprova. Recusa finalidade já cadastrada (devolve o id: use niso_privacy_atualizar_tratamento). Itens, departamentos e base legal depois: niso_privacy_ligar_tratamento. ${RASCUNHO_PRIVACY}`,
    inputSchema: { type: "object", properties: { ...P_PROJETO, ...CAMPOS_TRATAMENTO }, required: ["projectId", "processing_purpose"], additionalProperties: false },
  },
  {
    name: "niso_privacy_atualizar_tratamento",
    description: `n.privacy: altera campos de um tratamento do RoPA (só os enviados; o resto fica). Não muda status nem aprovação. Tratamento aprovado: a edição substitui o pedido de aprovação aberto; avise o usuário antes. ${RASCUNHO_PRIVACY}`,
    inputSchema: { type: "object", properties: { ...P_ROPA, ...CAMPOS_TRATAMENTO }, required: ["projectId", "ropaId"], additionalProperties: false },
  },
  {
    name: "niso_privacy_ligar_tratamento",
    description: `n.privacy: liga ao tratamento itens (sistemas, bases, processos de /assets; bloco E), departamentos (/departamentos; bloco A) e a base legal do catálogo (bloco D). Itens e departamentos SOMAM aos já ligados (desligar é pela interface). ${RASCUNHO_PRIVACY}`,
    inputSchema: {
      type: "object",
      properties: {
        ...P_ROPA,
        itens: { type: "array", items: { type: "string" }, description: "Ids de itens do projeto a ligar" },
        departamentos: { type: "array", items: { type: "string" }, description: "Ids de departamentos do projeto a ligar" },
        base_legal_id: texto("Id da base legal no catálogo (ex.: lgpd:art7:ii); null desliga"),
        legal_basis: texto("Texto da hipótese legal que acompanha a base do catálogo"),
      },
      required: ["projectId", "ropaId"],
      additionalProperties: false,
    },
  },
  {
    name: "niso_privacy_criar_dpia_do_tratamento",
    description: `n.privacy: cria a DPIA (RIPD) do tratamento em Draft, pré-preenchida com o registro e as ligações. Se já existe, devolve o id dela. A análise, o parecer do encarregado e a aprovação são de pessoas, pela interface. ${RASCUNHO_PRIVACY}`,
    inputSchema: { type: "object", properties: P_ROPA, required: ["projectId", "ropaId"], additionalProperties: false },
  },
  {
    name: "niso_privacy_rascunhar_lia",
    description: `n.privacy: grava o RASCUNHO da LIA (teste de legítimo interesse) do tratamento: só os campos enviados mudam. Nunca conclui nem reabre: concluir é de uma pessoa, pela interface. LIA concluída é recusada. ${RASCUNHO_PRIVACY}`,
    inputSchema: {
      type: "object",
      properties: {
        ...P_ROPA,
        finalidade_legitima: { type: "string", description: "Qual é o interesse da empresa" },
        necessidade: { type: "string", description: "Dá para atingir o objetivo sem esses dados" },
        balanceamento: { type: "string", description: "O que o titular espera e que impacto sofre" },
        salvaguardas: { type: "string", description: "Medidas que reduzem o impacto" },
        conclusao: { type: ["string", "null"], enum: ["prevalece", "nao_prevalece", null], description: "Conclusão PROPOSTA; a pessoa confirma ao concluir" },
      },
      required: ["projectId", "ropaId"],
      additionalProperties: false,
    },
  },
  {
    name: "niso_privacy_registrar_pedido_titular",
    description: `n.privacy: registra um pedido do titular recebido. O sistema gera o protocolo e congela o prazo a partir de parametros_legais; o agente não define nem edita prazo, não responde e não encerra (a resposta é registrada por uma pessoa). ${RASCUNHO_PRIVACY}`,
    inputSchema: {
      type: "object",
      properties: {
        ...P_PROJETO,
        tipo: { type: "string", enum: ["confirmacao", "acesso", "correcao", "anonimizacao_bloqueio_eliminacao", "portabilidade", "informacao_compartilhamento", "revogacao_consentimento", "oposicao", "outro"] },
        canal: { type: "string", enum: ["email", "telefone", "formulario", "presencial", "outro"] },
        titular_nome: texto("Nome do titular (só o necessário para atender)"),
        titular_contato: texto("Contato informado pelo titular"),
        descricao: texto("O que o titular pediu"),
        recebido_em: { type: "string", description: "AAAA-MM-DD (padrão: hoje)" },
        responsavel_parte_id: texto("Id da parte responsável pelo atendimento"),
      },
      required: ["projectId", "tipo"],
      additionalProperties: false,
    },
  },
  {
    name: "niso_privacy_registrar_incidente",
    description: `n.privacy: registra um incidente e, se informado, a avaliação de risco ao titular. O sistema gera o protocolo e os prazos de comunicação. O agente não encerra o incidente, não registra a comunicação enviada e não edita prazo: são atos de pessoas, pela interface. ${RASCUNHO_PRIVACY}`,
    inputSchema: {
      type: "object",
      properties: {
        ...P_PROJETO,
        titulo: { type: "string" },
        descricao: texto("O que aconteceu, sem dado pessoal de titular"),
        ocorrido_em: texto("AAAA-MM-DD ou data e hora ISO"),
        ciencia_em: { type: "string", description: "Quando a empresa soube: AAAA-MM-DD ou data e hora ISO" },
        responsavel_parte_id: texto("Id da parte responsável"),
        risco_titular: { type: "string", enum: ["sem_risco", "baixo", "relevante"], description: "Avaliação PROPOSTA do risco ao titular (opcional)" },
        avaliacao_texto: texto("Fundamento da avaliação de risco"),
      },
      required: ["projectId", "titulo", "ciencia_em"],
      additionalProperties: false,
    },
  },
  {
    name: "niso_privacy_ligar_documento_requisito",
    description: `n.privacy: liga um documento do projeto a requisitos do catálogo (LGPD, ANPD), para contar na cobertura. SOMA aos já ligados (desligar é pela interface). Só documento VIGENTE cobre o requisito; rascunho não conta. ${RASCUNHO_PRIVACY}`,
    inputSchema: {
      type: "object",
      properties: {
        ...P_PROJETO,
        documentoId: { type: "string", description: "Id do documento (/documentos)" },
        requisitos: { type: "array", items: { type: "string" }, minItems: 1, description: "Ids de requisitos do catálogo (ex.: lgpd:art37)" },
      },
      required: ["projectId", "documentoId", "requisitos"],
      additionalProperties: false,
    },
  },
];

const projectIdSchema = z.object({ projectId: z.string() });

/**
 * Todo id que entra num caminho passa por aqui. Sem isso, `evidenceId =
 * "../projects/X/%67enerate-policies-bulk#"` virava outra rota: `new Request`
 * resolve `..` e descarta `#`, e o Hono decodifica `%67` antes de rotear.
 * Codificado, o id é um segmento só; o transporte recusa o que sobrar.
 */
const enc = encodeURIComponent;

// ── n.privacy: esquemas estritos (campo desconhecido, inclusive `status`, é recusado) ──
const zId = z.string().trim().min(1).max(200);
const zTexto = z.string().trim().max(5000).nullable().optional();
const zTratamento = {
  processing_purpose: z.string().trim().min(1).max(500),
  owner: zTexto,
  owner_parte_id: zId.nullable().optional(),
  data_subjects: zTexto,
  criancas_adolescentes: z.boolean().optional(),
  data_categories: zTexto,
  dados_sensiveis: z.boolean().optional(),
  legal_basis: zTexto,
  base_legal_id: zId.nullable().optional(),
  consent_details: zTexto,
  data_subject_rights_details: zTexto,
  recipients: zTexto,
  retention_period: zTexto,
  international_transfers: z.boolean().optional(),
  transfer_safeguards: zTexto,
  dpia_required: z.boolean().optional(),
};
const comProjeto = <T extends z.ZodRawShape>(shape: T) => z.object({ projectId: zId, ...shape }).strict();
const comRopa = <T extends z.ZodRawShape>(shape: T) => comProjeto({ ropaId: zId, ...shape });
const algumCampo = (v: Record<string, unknown>) => Object.values(v).some((x) => x !== undefined);

type Registro = Record<string, unknown> & { id?: unknown; processing_purpose?: unknown; status?: unknown };
type LigacoesLidas = {
  base_legal: { referencia: string } | null; itens: { id: string }[]; departamentos: { id: string }[]; partes: unknown[];
  transferencias: unknown[]; dpias: unknown[]; dpia_pendente: boolean; lia: unknown; terceiros_com_avaliacao_vencida: unknown[];
};
/** Teto de ligações lidas por chamada de niso_privacy_ropa: uma requisição por tratamento. */
// ponytail: N+1 sobre GET .../ligacoes; acima de 50 tratamentos o resto pede niso_privacy_ropa_detalhe. Rota agregada se o RoPA crescer.
const LIMITE_LIGACOES = 50;
const normaliza = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

export async function executarFerramenta(
  nome: string,
  args: unknown,
  t: Transporte,
  opts: { projetoFixo?: string; papel: Papel }
): Promise<Resultado> {
  // O papel é imposto aqui também: o MCP remoto não passa pelo guard do stdio.
  if (!ferramentaPermitida(nome, opts.papel)) {
    return {
      isError: true,
      content: [{ type: "text", text: `Error: Ferramenta ${nome} indisponível para o papel configurado` }],
    };
  }
  // Recusa chamada a projeto diferente do fixado na sessão.
  const fora = (projectId: string) => {
    if (opts.projetoFixo && projectId !== opts.projetoFixo) {
      throw new Error("projeto fora do escopo desta sessão");
    }
  };

  // `return await`, e não `return t.x(...)`: quando o transporte recusa ANTES
  // de qualquer await (caminho suspeito no MCP remoto), a promessa já nasce
  // rejeitada; sem o await o tratador só entra microtasks depois, e o workerd
  // conta isso como rejeição não tratada (derrubou o CI do #213).
  const projeto = (projectId: string) => `/api/v1/projects/${enc(projectId)}`;
  // Leitura que COMPÕE outra chamada: o transporte local devolve o corpo de erro como dado ({ error }); aqui vira exceção.
  const ler = async (path: string): Promise<unknown> => {
    const d = await t.get(path);
    if (d && typeof d === "object" && !Array.isArray(d) && typeof (d as { error?: unknown }).error === "string") {
      throw new Error((d as { error: string }).error);
    }
    return d;
  };
  /** O tratamento DESTE projeto (a lista é escopada pela rota); serve de prova de que o id é do projeto antes de gravar. */
  const tratamento = async (projectId: string, ropaId: string): Promise<Registro> => {
    const { records = [] } = (await ler(`${projeto(projectId)}/ropa`)) as { records?: Registro[] };
    const r = records.find((x) => x.id === ropaId);
    if (!r) throw new Error(`Tratamento ${ropaId} não encontrado no projeto ${projectId}`);
    return r;
  };

  async function despachar(): Promise<unknown> {
    switch (nome) {

      case "niso_list_projects": {
        return await t.get(`/api/v1/portfolio`);
      }

      case "niso_get_project": {
        const { projectId } = projectIdSchema.parse(args);
        fora(projectId);
        return await t.get(`/api/v1/projects/${enc(projectId)}`);
      }

      case "niso_create_risk": {
        const schema = z.object({
          projectId: z.string(),
          asset: z.string(),
          threat: z.string(),
          vulnerability: z.string().optional(),
          impact: z.number(),
          probability: z.number(),
        });
        const validated = schema.parse(args);
        fora(validated.projectId);
        return await t.contrato("POST /api/v1/projects/{projectId}/risks", { projectId: validated.projectId }, validated);
      }

      case "niso_update_risk": {
        const nota = z.number().int().min(1).max(5);
        const { projectId, riskId, ...mudancas } = z.object({
          projectId: z.string(),
          riskId: z.string(),
          asset: z.string().min(1).optional(),
          threat: z.string().min(1).optional(),
          vulnerability: z.string().optional(),
          impact: nota.optional(),
          probability: nota.optional(),
          treatment: z.string().optional(),
          treatment_plan: z.string().optional(),
          control_id: z.string().optional(),
          owner: z.string().optional(),
          status: z.string().optional(),
        }).strip().parse(args); // strip: accepted_by/accepted_at do agente são descartados
        fora(projectId);
        // O PUT da API substitui o registro inteiro (campo ausente vira default).
        // Lê o atual DESTE projeto e reenvia tudo, trocando só o pedido.
        const { risks: lista } = (await t.get(`/api/v1/projects/${enc(projectId)}/risks`)) as { risks?: any[] };
        const atual = lista?.find((r) => r?.id === riskId);
        if (!atual) throw new Error(`Risco ${riskId} não encontrado no projeto ${projectId}`);
        const campos = ["asset_id", "asset", "threat", "vulnerability", "impact", "probability", "treatment", "treatment_plan", "control_id", "owner", "status", "accepted_by", "accepted_at"] as const;
        const corpo: Record<string, unknown> = {};
        for (const k of campos) corpo[k] = atual[k] ?? null;
        Object.assign(corpo, mudancas);
        return await t.contrato("PUT /api/v1/risks/{id}", { id: riskId }, corpo as { asset: unknown; threat: unknown });
      }

      case "niso_list_controls": {
        const { projectId } = projectIdSchema.parse(args);
        fora(projectId);
        return await t.get(`/api/v1/projects/${enc(projectId)}/controls`);
      }

      case "niso_list_risks": {
        const { projectId } = projectIdSchema.parse(args);
        fora(projectId);
        return await t.get(`/api/v1/projects/${enc(projectId)}/risks`);
      }

      case "niso_gap_analysis": {
        const { projectId } = projectIdSchema.parse(args);
        fora(projectId);
        return await t.get(`/api/v1/projects/${enc(projectId)}/gap-analysis`);
      }

      case "niso_traceability": {
        const { projectId } = projectIdSchema.parse(args);
        fora(projectId);
        return await t.get(`/api/v1/projects/${enc(projectId)}/traceability`);
      }

      case "niso_list_evidence": {
        const { projectId } = projectIdSchema.parse(args);
        fora(projectId);
        return await t.get(`/api/v1/projects/${enc(projectId)}/evidence`);
      }

      case "niso_coherence_check": {
        const { projectId } = projectIdSchema.parse(args);
        fora(projectId);
        return await t.get(`/api/v1/projects/${enc(projectId)}/coherence`);
      }

      case "niso_audit_pack": {
        const { projectId } = projectIdSchema.parse(args);
        fora(projectId);
        return await t.get(`/api/v1/projects/${enc(projectId)}/audit-pack`);
      }

      case "niso_generate_policy": {
        const { projectId, controlId } = z
          .object({ projectId: z.string(), controlId: z.string().optional() })
          .parse(args);
        fora(projectId);
        return await t.enviar(`/api/v1/projects/${enc(projectId)}/generate-policy`, {
          control_id: controlId,
        });
      }

      case "niso_evaluate_evidence": {
        const { evidenceId, text } = z
          .object({ evidenceId: z.string(), text: z.string() })
          .parse(args);
        return await t.contrato("POST /api/v1/evidence/{id}/evaluate", { id: evidenceId }, { text });
      }

      case "niso_create_evidence": {
        const schema = z.object({
          projectId: z.string(),
          // Nome vai direto para a chave do R2 (`evidence/<projeto>/<id>-<nome>`).
          // Separador de caminho e caractere de controle são recusados aqui para
          // que a chave não vire outra coisa que não um nome de arquivo.
          fileName: z
            .string()
            .min(1)
            .max(120)
            .refine((v) => !/[/\\]/.test(v), "fileName não pode conter barra")
            .refine(
              (v) => ![...v].some((ch) => ch < " " || ch === "\u007f"),
              "fileName não pode conter caractere de controle"
            )
            .refine((v) => v.trim() !== "" && !/^\.+$/.test(v), "fileName inválido"),
          content: z.string().min(1, "content não pode ser vazio"),
          contentType: z.enum(EVIDENCE_TEXT_TYPES).optional(),
          controlId: z.string().optional(),
        });
        const validated = schema.parse(args);
        fora(validated.projectId);
        return await t.uploadTexto(
          `/api/v1/projects/${enc(validated.projectId)}/evidence/upload`,
          {
            contentType: validated.contentType || "text/markdown",
            ...(validated.controlId ? { control_id: validated.controlId } : {}),
          },
          validated.content,
          validated.fileName
        );
      }

      case "niso_generate_policies_bulk": {
        const { projectId, controlIds } = z
          .object({ projectId: z.string(), controlIds: z.array(z.string()).optional() })
          .parse(args);
        fora(projectId);
        return await t.contrato(
          "POST /api/v1/projects/{projectId}/generate-policies-bulk",
          { projectId },
          { control_ids: controlIds }
        );
      }

      case "niso_migrate_27701": {
        const { projectId } = projectIdSchema.parse(args);
        fora(projectId);
        return await t.enviar(`/api/v1/projects/${enc(projectId)}/migrate-27701`);
      }

      case "niso_import_training": {
        const schema = z.object({
          projectId: z.string(),
          records: z.array(
            z.object({
              employee_name: z.string(),
              training_name: z.string(),
              completion_date: z.string().optional(),
              score: z.number().optional(),
              status: z.string().optional(),
            })
          ),
        });
        const validated = schema.parse(args);
        fora(validated.projectId);
        return await t.contrato(
          "POST /api/v1/projects/{projectId}/training/import-external",
          { projectId: validated.projectId },
          { records: validated.records }
        );
      }

      case "niso_create_asset": {
        const schema = z.object({
          projectId: z.string(),
          name: z.string(),
          type: z.string(),
          criticality: z.string(),
          owner: z.string().optional(),
          location: z.string().optional(),
        });
        const validated = schema.parse(args);
        fora(validated.projectId);
        return await t.enviar(`/api/v1/projects/${enc(validated.projectId)}/assets`, validated);
      }

      case "niso_update_policy": {
        const schema = z.object({
          projectId: z.string(),
          controlId: z.string(),
          text: z.string(),
        });
        const validated = schema.parse(args);
        fora(validated.projectId);
        return await t.enviar(
          `/api/v1/projects/${enc(validated.projectId)}/controls/${enc(validated.controlId)}/policy`,
          { text: validated.text }
        );
      }

      case "niso_update_control": {
        const schema = z
          .object({
            projectId: z.string(),
            controlId: z.string(),
            status: z.string().optional(),
            title: z.string().optional(),
            description: z.string().optional(),
          })
          .refine((v) => v.status !== undefined || v.title !== undefined || v.description !== undefined, {
            message: "Informe ao menos um de status, title ou description",
          });
        const validated = schema.parse(args);
        fora(validated.projectId);
        return await t.contrato(
          "PUT /api/v1/controls/{id}",
          { id: validated.controlId },
          {
            status: validated.status,
            title: validated.title,
            description: validated.description,
          }
        );
      }

      case "niso_create_audit_finding": {
        const schema = z.object({
          auditId: z.string(),
          projectId: z.string(),
          controlId: z.string().optional(),
          findingType: z.string(),
          description: z.string(),
          evidenceReviewed: z.string().optional(),
          auditorNotes: z.string().optional(),
        });
        const validated = schema.parse(args);
        fora(validated.projectId);
        return await t.contrato(
          "POST /api/v1/audits/{auditId}/findings",
          { auditId: validated.auditId },
          {
            project_id: validated.projectId,
            control_id: validated.controlId,
            finding_type: validated.findingType,
            description: validated.description,
            evidence_reviewed: validated.evidenceReviewed,
            auditor_notes: validated.auditorNotes,
          }
        );
      }

      case "niso_create_auditor_note": {
        const schema = z.object({
          token: z.string(),
          controlId: z.string(),
          noteType: z.string().optional(),
          content: z.string(),
        });
        const validated = schema.parse(args);
        return await t.contrato(
          "POST /api/v1/public/auditor/notas/criar",
          {},
          {
            token: validated.token,
            control_id: validated.controlId,
            note_type: validated.noteType || "question",
            content: validated.content,
          }
        );
      }

      case "niso_respond_auditor_note": {
        const schema = z.object({
          noteId: z.string(),
          response: z.string(),
        });
        const validated = schema.parse(args);
        // Era `t.enviar(...)` — POST, porque o método é o default do helper. A
        // rota é PUT (`routes/auditor.ts`), então a ferramenta respondia 404 e
        // nenhum teste via isso: o MCP não tinha contrato para conferir contra.
        // O tipo agora não deixa: não existe chave "POST .../respond" em ROTAS.
        return await t.contrato(
          "PUT /api/v1/auditor-notes/{id}/respond",
          { id: validated.noteId },
          { response: validated.response }
        );
      }

      // ── n.privacy: leitura ───────────────────────────────────────────────
      case "niso_privacy_ropa": {
        const { projectId } = comProjeto({}).parse(args);
        fora(projectId);
        const { records = [] } = (await ler(`${projeto(projectId)}/ropa`)) as { records?: Registro[] };
        let aviso: string | undefined;
        const registros: Registro[] = [];
        for (const [i, r] of records.entries()) {
          let ligacoes: Record<string, unknown> | null = null;
          if (aviso === undefined && i < LIMITE_LIGACOES) {
            try {
              const l = (await ler(`${projeto(projectId)}/ropa/${enc(String(r.id))}/ligacoes`)) as LigacoesLidas;
              ligacoes = {
                base_legal: l.base_legal?.referencia ?? null, itens: l.itens.length, departamentos: l.departamentos.length,
                partes: l.partes.length, transferencias: l.transferencias.length, dpias: l.dpias.length, dpia_pendente: l.dpia_pendente,
                lia: l.lia, terceiros_com_avaliacao_vencida: l.terceiros_com_avaliacao_vencida.length,
              };
            } catch (e) {
              // Sem o n.privacy (no projeto ou na conta) as ligações dão 403: a lista do RoPA, que é do núcleo, segue.
              aviso = `ligações não lidas: ${e instanceof Error ? e.message : "falha"}`;
            }
          }
          registros.push({ ...r, ligacoes });
        }
        if (aviso === undefined && records.length > LIMITE_LIGACOES) {
          aviso = `ligações resumidas só nos ${LIMITE_LIGACOES} primeiros; para os demais use niso_privacy_ropa_detalhe`;
        }
        return { total: records.length, registros, ...(aviso ? { aviso } : {}) };
      }

      case "niso_privacy_ropa_detalhe": {
        const { projectId, ropaId } = comRopa({}).parse(args);
        fora(projectId);
        const registro = await tratamento(projectId, ropaId);
        const ligacoes = await ler(`${projeto(projectId)}/ropa/${enc(ropaId)}/ligacoes`);
        const { lia } = (await ler(`${projeto(projectId)}/ropa/${enc(ropaId)}/lia`)) as { lia: unknown };
        return { registro, ligacoes, lia };
      }

      case "niso_privacy_requisitos_lacunas": {
        const { projectId, fonte } = comProjeto({ fonte: z.enum(["lgpd", "anpd"]).optional() }).parse(args);
        fora(projectId);
        const lacunas = (f: string) => ler(`${projeto(projectId)}/requisitos/lacunas?fonte=${f}`);
        return fonte ? await lacunas(fonte) : { lgpd: await lacunas("lgpd"), anpd: await lacunas("anpd") };
      }

      case "niso_privacy_titular_pedidos":
      case "niso_privacy_incidentes":
      case "niso_privacy_terceiros":
      case "niso_privacy_encarregado":
      case "niso_privacy_ponto_de_partida": {
        const { projectId } = comProjeto({}).parse(args);
        fora(projectId);
        const area = {
          niso_privacy_titular_pedidos: "titular-pedidos", niso_privacy_incidentes: "incidentes", niso_privacy_terceiros: "terceiros",
          niso_privacy_encarregado: "encarregado", niso_privacy_ponto_de_partida: "ponto-de-partida",
        }[nome];
        return await ler(`${projeto(projectId)}/${area}`);
      }

      // ── n.privacy: escrita do consultor (sempre rascunho) ─────────────────
      case "niso_privacy_propor_tratamento": {
        const { projectId, ...campos } = comProjeto(zTratamento).parse(args);
        fora(projectId);
        const { records = [] } = (await ler(`${projeto(projectId)}/ropa`)) as { records?: Registro[] };
        const igual = records.find((r) => normaliza(r.processing_purpose) === normaliza(campos.processing_purpose));
        if (igual) throw new Error(`Já existe tratamento com esta finalidade (id ${String(igual.id)}): use niso_privacy_atualizar_tratamento`);
        // O POST grava sempre Draft e ignora status: a aprovação é humana (pedido de aprovação ou assinatura).
        const criado = (await t.contrato("POST /api/v1/projects/{projectId}/ropa", { projectId }, campos)) as { id?: unknown };
        if (typeof criado?.id !== "string") return criado; // erro da API (transporte local devolve o corpo)
        return { ...criado, status: "Draft", proximo_passo: "rascunho gravado; a aprovação é de uma pessoa, pela interface" };
      }

      case "niso_privacy_atualizar_tratamento": {
        const { projectId, ropaId, ...mudancas } = comRopa(z.object(zTratamento).partial().shape).parse(args);
        fora(projectId);
        if (!algumCampo(mudancas)) throw new Error("Informe ao menos um campo do tratamento para alterar");
        const atual = await tratamento(projectId, ropaId);
        // O schema da rota exige a finalidade mesmo no PUT parcial: reenvia a gravada quando não muda.
        const r = await t.contrato("PUT /api/v1/ropa/{id}", { id: ropaId }, { processing_purpose: atual.processing_purpose, ...mudancas });
        return atual.status === "Approved"
          ? { ...(r as object), aviso: "o tratamento estava aprovado: a edição substituiu o pedido de aprovação aberto; peça nova aprovação pela interface" }
          : r;
      }

      case "niso_privacy_ligar_tratamento": {
        const { projectId, ropaId, itens, departamentos, base_legal_id, legal_basis } = comRopa({
          itens: z.array(zId).max(200).optional(),
          departamentos: z.array(zId).max(200).optional(),
          base_legal_id: zId.nullable().optional(),
          legal_basis: zTexto,
        }).parse(args);
        fora(projectId);
        if (!itens?.length && !departamentos?.length && base_legal_id === undefined && legal_basis === undefined) {
          throw new Error("Informe itens, departamentos ou a base legal");
        }
        const atual = await tratamento(projectId, ropaId);
        const base = `${projeto(projectId)}/ropa/${enc(ropaId)}`;
        const lig = (await ler(`${base}/ligacoes`)) as LigacoesLidas;
        const somar = (ja: { id: string }[], novos: string[]) => [...new Set([...ja.map((x) => x.id), ...novos])];
        const feito: Record<string, unknown> = {};
        if (itens?.length) {
          feito.itens = await t.contrato("PUT /api/v1/projects/{projectId}/ropa/{recordId}/itens", { projectId, recordId: ropaId }, { itens: somar(lig.itens, itens) });
        }
        if (departamentos?.length) {
          feito.departamentos = await t.contrato("PUT /api/v1/projects/{projectId}/ropa/{recordId}/departamentos", { projectId, recordId: ropaId },
            { departamentos: somar(lig.departamentos, departamentos) });
        }
        if (base_legal_id !== undefined || legal_basis !== undefined) {
          feito.base_legal = await t.contrato("PUT /api/v1/ropa/{id}", { id: ropaId }, {
            processing_purpose: atual.processing_purpose,
            ...(base_legal_id !== undefined ? { base_legal_id } : {}),
            ...(legal_basis !== undefined ? { legal_basis } : {}),
          });
        }
        return feito;
      }

      case "niso_privacy_criar_dpia_do_tratamento": {
        const { projectId, ropaId } = comRopa({}).parse(args);
        fora(projectId);
        // Rota sem corpo (não está no contrato): a DPIA nasce Draft, pré-preenchida pelo servidor.
        return await t.enviar(`/api/v1/projects/${enc(projectId)}/ropa/${enc(ropaId)}/dpia`);
      }

      case "niso_privacy_rascunhar_lia": {
        // Sem `status`: o agente nunca conclui nem reabre (o .strict() recusa o campo).
        const { projectId, ropaId, ...campos } = comRopa({
          finalidade_legitima: z.string().trim().max(5000).optional(),
          necessidade: z.string().trim().max(5000).optional(),
          balanceamento: z.string().trim().max(5000).optional(),
          salvaguardas: z.string().trim().max(5000).optional(),
          conclusao: z.enum(["prevalece", "nao_prevalece"]).nullable().optional(),
        }).parse(args);
        fora(projectId);
        if (!algumCampo(campos)) throw new Error("Informe ao menos um campo da LIA");
        return await t.contrato("PUT /api/v1/projects/{projectId}/ropa/{recordId}/lia", { projectId, recordId: ropaId }, campos);
      }

      case "niso_privacy_registrar_pedido_titular": {
        const { projectId, ...pedido } = comProjeto({
          tipo: z.enum(["confirmacao", "acesso", "correcao", "anonimizacao_bloqueio_eliminacao", "portabilidade", "informacao_compartilhamento", "revogacao_consentimento", "oposicao", "outro"]),
          canal: z.enum(["email", "telefone", "formulario", "presencial", "outro"]).optional(),
          titular_nome: zTexto,
          titular_contato: zTexto,
          descricao: zTexto,
          recebido_em: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use AAAA-MM-DD").optional(),
          responsavel_parte_id: zId.nullable().optional(),
        }).parse(args);
        fora(projectId);
        return await t.contrato("POST /api/v1/projects/{projectId}/titular-pedidos", { projectId }, pedido);
      }

      case "niso_privacy_registrar_incidente": {
        const { projectId, risco_titular, avaliacao_texto, ...incidente } = comProjeto({
          titulo: z.string().trim().min(1).max(500),
          descricao: zTexto,
          ocorrido_em: z.string().nullable().optional(),
          ciencia_em: z.string().min(1),
          responsavel_parte_id: zId.nullable().optional(),
          risco_titular: z.enum(["sem_risco", "baixo", "relevante"]).optional(),
          avaliacao_texto: zTexto,
        }).parse(args);
        fora(projectId);
        const criado = (await t.contrato("POST /api/v1/projects/{projectId}/incidentes", { projectId }, incidente)) as { id?: string; error?: string };
        if (!risco_titular || typeof criado?.id !== "string") return criado;
        const avaliacao = await t.contrato("PUT /api/v1/projects/{projectId}/incidentes/{id}/risco", { projectId, id: criado.id },
          { risco_titular, ...(avaliacao_texto !== undefined ? { avaliacao_texto } : {}) });
        return { ...criado, avaliacao };
      }

      case "niso_privacy_ligar_documento_requisito": {
        const { projectId, documentoId, requisitos } = comProjeto({ documentoId: zId, requisitos: z.array(zId).min(1).max(100) }).parse(args);
        fora(projectId);
        const caminho = `${projeto(projectId)}/documentos/${enc(documentoId)}/requisitos`;
        const ja = (await ler(caminho)) as { id: string }[];
        const todos = [...new Set([...ja.map((r) => r.id), ...requisitos])];
        return await t.contrato("PUT /api/v1/projects/{projectId}/documentos/{id}/requisitos", { projectId, id: documentoId }, { requisitos: todos });
      }

      default:
        throw new Error(`Unknown tool: ${nome}`);
    }
  }

  try {
    const dados = await despachar();
    return { content: [{ type: "text", text: JSON.stringify(dados, null, 2) }] };
  } catch (error: any) {
    return {
      isError: true,
      content: [{ type: "text", text: `Error: ${error.message}` }],
    };
  }
}
