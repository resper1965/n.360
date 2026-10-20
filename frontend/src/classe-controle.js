// Espelho de src/services/classe-controle.ts: frontend/test/classe-controle.test.js reprova se as duas listas divergirem.
const FEITO = ['APPROVED', 'IMPLEMENTED', 'COMPLETED', 'CONFORME', 'COMPLIANT'];
const FALTA = ['MISSING', 'NOT STARTED', 'NOT_STARTED'];

export function classeDoControle(status) {
    if (status === 'Not Applicable') return 'na';
    const s = String(status ?? '').trim().toUpperCase();
    if (FEITO.includes(s)) return 'feito';
    if (!s || FALTA.includes(s)) return 'falta';
    return 'andamento';
}
