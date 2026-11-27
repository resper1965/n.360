// Onde a pessoa está no n.ot (spec 2026-11-11 fluidez §2): subtela, site e aba do site vivem no endereço (?ot=&site=&aba=), que o
// pedidoDoHub não toca (só tira tela e aba). O link do webhook ot.desvio já é /ot/desvios/<id> (src/services/ot-desvio.ts).
export const TELAS_OT = ['painel', 'sites', 'site', 'assessment', 'relatorios', 'fornecedores', 'acessos'];
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const ABA = /^[a-z]{1,20}$/;

// Aqui só o formato da aba: a tela do site, que conhece a área, decide se ela existe (ot-site.js). `modo=` antigo é ignorado.
export function lerEndereco(loc = window.location) {
    const q = new URLSearchParams(loc.search || '');
    const m = /^\/ot\/desvios\/([^/]+)\/?$/.exec(loc.pathname || '');
    const desvio = m && ID.test(m[1]) ? m[1] : null;
    const site = ID.test(q.get('site') || '') ? q.get('site') : null;
    const pedida = q.get('ot') === 'inicio' ? 'painel' : q.get('ot'); // o Início saiu (PR4): o link antigo cai no Painel
    let tela = TELAS_OT.includes(pedida) ? pedida : 'painel';
    if (tela === 'site' && !site) tela = 'sites';
    const aba = tela === 'site' && ABA.test(q.get('aba') || '') ? q.get('aba') : null;
    return { tela, site: tela === 'site' ? site : null, aba, desvio };
}

export function escreverEndereco({ tela, site = null, aba = null }, loc = window.location) {
    const q = new URLSearchParams(loc.search || '');
    ['ot', 'site', 'modo', 'aba'].forEach((k) => q.delete(k));
    if (tela && tela !== 'painel') q.set('ot', tela);
    if (tela === 'site' && site) { q.set('site', site); if (aba) q.set('aba', aba); }
    const resto = q.toString();
    history.replaceState(history.state, '', `/ot${resto ? `?${resto}` : ''}`);
}
