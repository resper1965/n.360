// Bases legais do RoPA (LGPD, art. 7 e art. 11), compartilhadas pelo formulário (privacy.js), pelas ligações e pela entrevista.
// Grava-se o TEXTO da hipótese em `legal_basis` (o PDF, os pedidos de aprovação e a regra da LIA, que procura "legitimo
// interesse", leem o texto) e o id do catálogo em `base_legal_id`. O catálogo manda: o texto é derivado do id por esta tabela,
// que segue a ordem dos incisos em src/data/lgpd.ts (art. 7, I a X; art. 11, I e II, a a g).
// As do art. 11 levam o sufixo "(art. 11)" porque os rótulos repetem os do art. 7 ("Tutela da saúde").

export const BASES_ART7 = ['Consentimento', 'Cumprimento de obrigação legal ou regulatória', 'Execução de políticas públicas', 'Estudos por órgão de pesquisa',
    'Execução de contrato ou procedimentos preliminares', 'Exercício regular de direitos', 'Proteção da vida ou incolumidade física', 'Tutela da saúde',
    'Legítimo interesse', 'Proteção do crédito'];
export const BASES_ART11 = ['Consentimento específico e destacado', 'Obrigação legal ou regulatória', 'Políticas públicas', 'Estudos por órgão de pesquisa',
    'Exercício regular de direitos', 'Proteção da vida', 'Tutela da saúde', 'Prevenção à fraude e segurança do titular'];
export const ART11 = (b) => `${b} (art. 11)`;

const INCISOS_ART7 = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x'];
const INCISOS_ART11 = ['i', 'ii-a', 'ii-b', 'ii-c', 'ii-d', 'ii-e', 'ii-f', 'ii-g'];
/** Texto gravado em `legal_basis` → id do catálogo. */
const ID_DO_TEXTO = new Map([
    ...BASES_ART7.map((b, i) => [b, `lgpd:art7:${INCISOS_ART7[i]}`]),
    ...BASES_ART11.map((b, i) => [ART11(b), `lgpd:art11:${INCISOS_ART11[i]}`]),
]);
const TEXTO_DO_ID = new Map([...ID_DO_TEXTO].map(([t, id]) => [id, t]));

export const normaliza = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
// Valores que o formulário antigo gravava (sem acento, 6 hipóteses): exibidos e pré-selecionados com o rótulo atual.
export const BASES_LEGADO = {
    'consentimento': 'Consentimento',
    'execucao contratual': 'Execução de contrato ou procedimentos preliminares',
    'obrigacao legal': 'Cumprimento de obrigação legal ou regulatória',
    'interesse legitimo': 'Legítimo interesse',
    'protecao da vida': 'Proteção da vida ou incolumidade física',
    'tutela da saude': 'Tutela da saúde',
};
export const rotuloBase = (v) => BASES_LEGADO[normaliza(v)] || v || '';
export const ehLegitimoInteresse = (v) => { const t = normaliza(v); return t.includes('legitimo interesse') || t.includes('interesse legitimo'); };
export const ehConsentimento = (v) => normaliza(rotuloBase(v)).startsWith('consentimento');
export const ehArt11 = (v) => String(v || '').endsWith(' (art. 11)');

/** Id do catálogo para o texto (aceita o legado); null quando o texto não é uma das hipóteses. */
export const idDaBase = (texto) => ID_DO_TEXTO.get(rotuloBase(texto)) || null;
/** Texto da hipótese para o id do catálogo; null para id fora da tabela. */
export const textoDaBase = (id) => TEXTO_DO_ID.get(id) || null;

/**
 * Os dois campos coerentes a partir do texto escolhido, para o corpo do POST/PUT. `catalogo` é o conjunto de ids carregados
 * (sem catálogo o id daria 400 por FK): texto vazio desliga os dois; hipótese conhecida leva o id quando o catálogo o tem;
 * texto livre (importado) fica sem mexer no id.
 */
export function camposDaBase(texto, catalogo) {
    if (!texto) return { legal_basis: null, base_legal_id: null };
    const id = idDaBase(texto);
    return id && catalogo && catalogo.has(id) ? { legal_basis: texto, base_legal_id: id } : { legal_basis: texto };
}

/** Ids das bases do catálogo carregado (`GET /api/v1/requisitos?fonte=lgpd`); vazio se o catálogo não foi carregado. */
export async function idsDoCatalogo(api) {
    try {
        const r = await api('GET', '/api/v1/requisitos?fonte=lgpd');
        return new Set((Array.isArray(r) ? r : []).filter((x) => x.pai_id === 'lgpd:art7' || x.pai_id === 'lgpd:art11').map((x) => x.id));
    } catch (e) { return new Set(); }
}
