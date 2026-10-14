// Anti-duplicação por regra, sem IA: compara um nome que a pessoa está digitando com os já cadastrados (pessoas, áreas,
// sistemas) e devolve os parecidos com um motivo curto. Usado no "Cadastrar agora" da entrevista do RoPA.
// Duas medidas diferentes:
//   - IGUAL: o nome normalizado (sem acento, caixa, pontuação e palavras vazias) é o mesmo. A tela recusa criar.
//   - PARECIDO: as palavras se cruzam, por sinônimo do negócio ou por prefixo. A tela oferece o existente; a pessoa decide.

// Palavras que não distinguem nome nenhum, em PT e EN.
const VAZIAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'o', 'a', 'os', 'as', 'em', 'no', 'na', 'para', 'por', 'com',
    'the', 'of', 'and', 'for', 'to', 'in', 'on']);
// Palavras genéricas: saem da comparação, salvo quando o nome é só elas ("Sistema" sozinho continua "sistema").
const GENERICAS = new Set(['sistema', 'sistemas', 'system', 'systems', 'processo', 'process', 'arquivo', 'arquivos', 'file', 'files',
    'planilha', 'spreadsheet', 'area', 'setor', 'departamento', 'department', 'gestao', 'management']);

// Sinônimos do negócio, PT e EN. Cada linha é um grupo; a primeira palavra é a chave canônica.
// Para estender: acrescente uma palavra a um grupo ou uma linha nova, em minúsculas e SEM acento. Expressão de várias
// palavras ("recursos humanos") vale como uma só. Mantenha curto: sinônimo frouxo vira aviso falso em todo cadastro.
const SINONIMOS = [
    ['folha', 'pagamento', 'pagamentos', 'salario', 'salarios', 'payroll', 'remuneracao', 'holerite'],
    ['rh', 'recursos humanos', 'people', 'hr', 'human resources'],
    ['financeiro', 'finance', 'financas', 'contabilidade', 'accounting', 'contabil'],
    ['cliente', 'clientes', 'customer', 'customers', 'crm'],
    ['ti', 'tecnologia', 'it', 'informatica', 'tecnologia da informacao'],
    ['vendas', 'comercial', 'sales'],
    ['compras', 'suprimentos', 'procurement', 'purchasing'],
    ['recrutamento', 'selecao', 'recruiting', 'recruitment', 'hiring', 'ats'],
    ['juridico', 'legal department', 'contencioso'],
    ['email', 'e mail', 'correio eletronico'],
];
const CANONICA = new Map(SINONIMOS.flatMap((g) => g.map((p) => [p, g[0]])));
// Expressões de várias palavras, das mais longas para as curtas, viram um token só antes de separar.
const EXPRESSOES = [...CANONICA.keys()].filter((p) => p.includes(' ')).sort((a, b) => b.length - a.length);

const limpa = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').trim();

function palavras(t) {
    let s = ` ${limpa(t)} `;
    for (const e of EXPRESSOES) s = s.split(` ${e} `).join(` ${e.replace(/ /g, '_')} `);
    const ps = s.split(' ').filter((p) => p && !VAZIAS.has(p)).map((p) => p.replace(/_/g, ' '));
    const sem = ps.filter((p) => !GENERICAS.has(p));
    return sem.length ? sem : ps;
}

/** Nome normalizado para a comparação de IGUAL: "Sistema de Folha" e "folha" são o mesmo nome. */
export const normalizarNome = (t) => palavras(t).join(' ');

const casa = (a, b) => a === b || (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a)));

/**
 * Os existentes mais parecidos com `nome`, do mais para o menos parecido. `existentes`: [{ nome, ... }].
 * Devolve [{ item, igual, motivo }]; `igual` diz que o nome normalizado é o mesmo (a tela recusa criar).
 * ponytail: comparação O(n·m) por palavra, suficiente para cadastros de centenas; índice só se passar de milhares.
 */
export function parecidos(nome, existentes, { limite = 3 } = {}) {
    const alvo = palavras(nome);
    if (!alvo.length) return [];
    const n = alvo.join(' ');
    const canA = alvo.map((p) => CANONICA.get(p) || p);
    const achados = [];
    for (const item of Array.isArray(existentes) ? existentes : []) {
        const ps = palavras(item && item.nome);
        if (!ps.length) continue;
        if (ps.join(' ') === n) { achados.push({ item, igual: true, motivo: 'mesmo nome', nota: 2 }); continue; }
        const canB = ps.map((p) => CANONICA.get(p) || p);
        const emA = canA.filter((a) => canB.some((b) => casa(a, b))).length;
        const emB = canB.filter((b) => canA.some((a) => casa(a, b))).length;
        const nota = (emA + emB) / (canA.length + canB.length);
        if (nota < 0.5) continue;
        const porSinonimo = alvo.some((a, i) => ps.some((b, j) => a !== b && CANONICA.has(a) && canA[i] === canB[j]));
        const porPrefixo = !porSinonimo && canA.some((a) => canB.some((b) => a !== b && casa(a, b)));
        achados.push({ item, igual: false, motivo: porSinonimo ? 'sinônimo' : porPrefixo ? 'começa igual' : 'palavras em comum', nota });
    }
    return achados.sort((x, y) => y.nota - x.nota).slice(0, limite).map(({ item, igual, motivo }) => ({ item, igual, motivo }));
}

/** O existente com o mesmo e-mail (caixa e espaços ignorados), ou null. */
export function mesmoEmail(email, existentes) {
    const e = String(email ?? '').trim().toLowerCase();
    if (!e) return null;
    return (Array.isArray(existentes) ? existentes : []).find((x) => x && String(x.email ?? '').trim().toLowerCase() === e) || null;
}
