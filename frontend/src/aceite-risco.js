import { escapeHTML, formatarData } from './ui.js';

// Aceite de risco num modelo só (spec 2026-10-20, B2): aceito é status Accepted; quem e quando o servidor carimba na transição.
// O tratamento "Aceitar" é só a estratégia: o botão "Aceitar risco" aparece enquanto o risco não foi aceito nem encerrado.
export const podeAceitar = (r) => r.treatment === 'Accept' && !['Accepted', 'Closed', 'Mitigated'].includes(r.status);

/** "Aceito por X em dd/mm/aaaa"; o aceite legado digitado no n.iso (migration 0082) diz que foi registrado à mão. HTML escapado. */
export function linhaDeAceite(r) {
    if (r.status !== 'Accepted' || !r.accepted_by) return '';
    const quem = escapeHTML(r.accepted_by);
    const quando = escapeHTML(formatarData(r.accepted_at, { vazio: 'data desconhecida' }));
    return r.aceite_manual ? `Aceite registrado à mão: ${quem} em ${quando}` : `Aceito por ${quem} em ${quando}`;
}

/** Confirma e manda só `status: 'Accepted'` para `caminho` (PUT); devolve true se aceitou. */
export async function aceitarRisco(api, caminho) {
    if (!(await window.confirmar('O risco fica aceito em seu nome, com a data de hoje.', { titulo: 'Aceitar risco', rotulo: 'Aceitar' }))) return false;
    await api('PUT', caminho, { status: 'Accepted' });
    return true;
}
