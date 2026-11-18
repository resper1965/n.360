// Onde a pessoa está no n.ot (spec 2026-11-11 fluidez §2): subtela, site e modo vivem no endereço (?ot=&site=&modo=), que o
// pedidoDoHub não toca (só tira tela e aba). O link do webhook ot.desvio já é /ot/desvios/<id> (src/services/ot-desvio.ts).
export const TELAS_OT = ['inicio', 'sites', 'site', 'assessment', 'relatorios', 'fornecedores', 'acessos'];
export const MODOS_SITE = ['projeto', 'operacao'];
const ID = /^[A-Za-z0-9_-]{1,64}$/;

export function lerEndereco(loc = window.location) {
    const q = new URLSearchParams(loc.search || '');
    const m = /^\/ot\/desvios\/([^/]+)\/?$/.exec(loc.pathname || '');
    const desvio = m && ID.test(m[1]) ? m[1] : null;
    const site = ID.test(q.get('site') || '') ? q.get('site') : null;
    let tela = TELAS_OT.includes(q.get('ot')) ? q.get('ot') : 'inicio';
    if (tela === 'site' && !site) tela = 'sites';
    const modo = MODOS_SITE.includes(q.get('modo')) ? q.get('modo') : 'projeto';
    return { tela, site: tela === 'site' ? site : null, modo, desvio };
}

export function escreverEndereco({ tela, site = null, modo = 'projeto' }, loc = window.location) {
    const q = new URLSearchParams(loc.search || '');
    ['ot', 'site', 'modo'].forEach((k) => q.delete(k));
    if (tela && tela !== 'inicio') q.set('ot', tela);
    if (tela === 'site' && site) { q.set('site', site); q.set('modo', modo); }
    const resto = q.toString();
    history.replaceState(history.state, '', `/ot${resto ? `?${resto}` : ''}`);
}
