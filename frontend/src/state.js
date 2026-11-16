function isPlainObject(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
}
// Validadores de forma por chave: garantem que valores persistidos têm os campos
// mínimos consumidos pela UI antes de entrar no estado.
function isUser(v) {
    return isPlainObject(v) && (typeof v.email === 'string' || v.id != null);
}
function hasId(v) {
    return isPlainObject(v) && v.id != null;
}

// Parse seguro + validação de forma do localStorage. Um valor corrompido (JSON
// inválido) OU com forma inesperada (array/primitivo/objeto malformado) não deve
// entrar no estado nem derrubar o boot. Em qualquer falha, limpa a chave e retorna
// null (permite recuperação). `isValid` valida a forma esperada (padrão: objeto plano).
function safeParse(key, isValid = isPlainObject) {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!isValid(parsed)) throw new Error('forma inesperada');
        return parsed;
    } catch {
        try { localStorage.removeItem(key); } catch { /* noop */ }
        return null;
    }
}

export     const S = {
        view: 'dashboard',
        token: localStorage.getItem('niso_token') || null,
        user: safeParse('niso_user', isUser),
        activeProject: safeParse('niso_activeProject', hasId),
        leads: [], assessments: [], projects: [], controls: [],
        currentLead: null, currentAssessment: null, currentProject: safeParse('niso_activeProject', hasId),
        currentBlock: 1, blockAnswers: {},
        editingPhase: null,
        phaseConfig: null,
        generatingProposal: false
    };

// A trilha vive no servidor (Bancada): o navegador não guarda mais marcas de passo nem progresso de entrevista. `n360_vista` era a
// alternância Projeto/Carteira do Início, que saiu (spec 2026-11-14-entrada-n360).
try { for (const k of ['niso_phaseChecks', 'niso_phaseChecksNotes', 'niso_phaseChecksAssigned', 'niso_phaseChecksDueDate', 'niso_interviewProgress', 'n360_vista']) localStorage.removeItem(k); } catch (e) { /* sem storage: nada a limpar */ }

window.S = S;
