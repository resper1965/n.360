import { escapeHTML } from '../ui.js';

// Gráficos do painel de entrada (estudo de 14/10/2026, direção A), sem biblioteca: HTML e SVG. Regras da skill dataviz:
// cor ordinal de um matiz só (tokens --ord-*), estado sempre com rótulo escrito, nenhum valor só na dica, e "Ver como tabela"
// em todo gráfico. Posição e largura vão em atributos do SVG (x, width), nunca em `style=`; a cor vem das classes em style.css.
// Todo texto que veio do servidor passa por escapeHTML.

const e = (v) => escapeHTML(String(v ?? ''));
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

/** A tabela equivalente, num <details> fechado. A primeira coluna é texto; as outras, números à direita. */
export function tabelaEquivalente(cabecalho, linhas) {
    return `<details class="pn-equiv"><summary>Ver como tabela</summary><table class="pn-tabela"><thead><tr>${cabecalho.map((c, i) => `<th${i ? ' class="n"' : ''} scope="col">${e(c)}</th>`).join('')}</tr></thead>
        <tbody>${linhas.map((l) => `<tr>${l.map((c, i) => `<td${i ? ' class="n"' : ''}>${e(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></details>`;
}

/**
 * Cobertura por tema: uma barra 100% por tema, na mesma escala, com o absoluto escrito ao lado ("29 de 38"). `partes` troca os três
 * rótulos (Concluído, Em andamento, Falta) quando a contagem é outra (ex.: desvios regularizados, tratados, abertos).
 */
export function graficoCobertura(temas, partes = null) {
    const lista = Array.isArray(temas) ? temas : [];
    const [rf, ra, rx] = partes || ['Concluído', 'Em andamento', 'Falta'];
    const leg = `<div class="pn-cob-leg" aria-hidden="true"><span><i class="pn-sw pn-f"></i>${e(rf)}</span><span><i class="pn-sw pn-a"></i>${e(ra)}</span><span><i class="pn-sw pn-x"></i>${e(rx)}</span></div>`;
    const linhas = lista.map((t) => {
        const f = Number(t.feito) || 0, a = Number(t.andamento) || 0, x = Number(t.falta) || 0, tot = f + a + x;
        const resumo = !tot ? `${t.tema}: nenhum registro`
            : partes ? `${t.tema}: ${rf} ${f}, ${ra} ${a}, ${rx} ${x}, de ${tot}` : `${t.tema}: ${f} concluídos, ${a} em andamento, ${x} faltam, de ${tot}`;
        // Vão de 0,6 unidade entre as partes (cerca de 2px a 300px de largura).
        let pos = 0;
        const fatias = [[f, 'pn-f'], [a, 'pn-a'], [x, 'pn-x']].filter(([v]) => v > 0);
        const vao = 0.6;
        const util = 100 - vao * (fatias.length - 1);
        const rects = fatias.map(([v, cls]) => {
            const w = (v / tot) * util;
            const r = `<rect class="${cls}" x="${pos.toFixed(2)}" y="0" width="${w.toFixed(2)}" height="10"></rect>`;
            pos += w + vao;
            return r;
        }).join('');
        return `<div class="pn-cob-t">${e(t.tema)}</div>
            <svg class="pn-cob-b" viewBox="0 0 100 10" preserveAspectRatio="none" role="img" tabindex="0" aria-label="${e(resumo)}" data-dica="${e(resumo)}">
                <rect class="pn-trilho" x="0" y="0" width="100" height="10"></rect>${rects}</svg>
            <div class="pn-cob-v">${tot ? `${f} de ${tot}` : 'nenhum'}</div>`;
    }).join('');
    return `${leg}<div class="pn-cob">${linhas}</div>${tabelaEquivalente(['Tema', rf, ra, rx, 'Como se conta'], lista.map((t) => [t.tema, t.feito, t.andamento, t.falta, t.conta]))}`;
}

const NIVEIS = [['critico', 'Crítico'], ['alto', 'Alto'], ['medio', 'Médio'], ['baixo', 'Baixo']];
/** A mesma faixa de `riskLevel` do servidor (src/services/riscos-atividade.ts). */
export const nivelDoRisco = (p, i) => { const s = p * i; return s <= 5 ? 'baixo' : s <= 12 ? 'medio' : s <= 20 ? 'alto' : 'critico'; };

/** Mapa de risco 5x5, probabilidade (linhas) por impacto (colunas). A contagem está na célula e o nível no nome dela e na legenda. */
export function graficoMapa(celulas) {
    const m = new Map();
    for (const c of Array.isArray(celulas) ? celulas : []) {
        const p = Number(c.p), i = Number(c.i);
        if (p >= 1 && p <= 5 && i >= 1 && i <= 5) m.set(`${p}-${i}`, (m.get(`${p}-${i}`) || 0) + (Number(c.n) || 0));
    }
    const por = { critico: 0, alto: 0, medio: 0, baixo: 0 };
    const nome = Object.fromEntries(NIVEIS);
    let grade = '';
    for (let p = 5; p >= 1; p--) {
        grade += `<div class="pn-mapa-ax" aria-hidden="true">${p}</div>`;
        for (let i = 1; i <= 5; i++) {
            const n = m.get(`${p}-${i}`) || 0;
            const nv = nivelDoRisco(p, i);
            por[nv] += n;
            const rot = `Probabilidade ${p}, impacto ${i}, nível ${nome[nv]}: ${plural(n, 'risco', 'riscos')}`;
            grade += `<div class="pn-mapa-c pn-n-${nv}" role="img" aria-label="${rot}"${n ? ` tabindex="0" data-dica="${rot}"` : ''}>${n || ''}</div>`;
        }
    }
    grade += `<div aria-hidden="true"></div>${[1, 2, 3, 4, 5].map((i) => `<div class="pn-mapa-ax" aria-hidden="true">${i}</div>`).join('')}`;
    const resumo = NIVEIS.map(([k, r]) => `${por[k]} ${r.toLowerCase()}`).join(', ');
    return `<div class="pn-mapa-eixos" aria-hidden="true"><span>Probabilidade (linhas)</span><span>Impacto (colunas)</span></div>
        <div class="pn-mapa" role="group" aria-label="Mapa de risco: ${resumo}">${grade}</div>
        <div class="pn-mapa-leg">${NIVEIS.map(([k, r]) => `<span><i class="pn-sw pn-n-${k}"></i>${r} ${por[k]}</span>`).join('')}</div>
        ${tabelaEquivalente(['Nível', 'Riscos'], NIVEIS.map(([k, r]) => [r, por[k]]))}`;
}

const diasEm = (d) => (d === 0 ? 'hoje' : `em ${plural(d, 'dia', 'dias')}`);

/** Próximos vencimentos, 90 dias: uma linha por tipo, um ponto por item. O vencido não cabe no eixo e vira número escrito. */
export function graficoVencimentos(linhas) {
    const lista = Array.isArray(linhas) ? linhas : [];
    const corpo = lista.map((l) => {
        const itens = (Array.isArray(l.itens) ? l.itens : []).filter((x) => x.dias >= 0 && x.dias <= 90);
        const semana = itens.filter((x) => x.dias <= 7).length;
        const venc = Number(l.vencidos) || 0;
        const resumo = `${l.tipo}: ${plural(itens.length, 'item', 'itens')} nos próximos 90 dias, ${semana} nos próximos 7${venc ? `; ${venc} já vencidos` : ''}`;
        const pontos = itens.map((x) => `<svg x="${((x.dias / 90) * 100).toFixed(2)}%" y="0" overflow="visible"><rect class="pn-lt-p${x.dias <= 7 ? ' pn-lt-w' : ''}" x="-4.5" y="6.5" width="9" height="9"></rect></svg>`).join('');
        return `<div class="pn-lt-r">${e(l.tipo)}</div>
            <div class="pn-lt-v">${venc ? `<b>${venc}</b> <span>venc.</span>` : '<span>nenhum</span>'}</div>
            <svg class="pn-lt-trk" width="100%" height="22" role="img" tabindex="0" aria-label="${e(resumo)}" data-dica="${e(resumo)}">
                <rect class="pn-lt-sem" x="0" y="0" width="${((7 / 90) * 100).toFixed(2)}%" height="22"></rect>${pontos}</svg>`;
    }).join('');
    const escala = `<svg class="pn-lt-esc" width="100%" height="16" aria-hidden="true"><text x="0" y="12">hoje</text><text x="33.3%" y="12" text-anchor="middle">30</text>
        <text x="66.7%" y="12" text-anchor="middle">60</text><text x="100%" y="12" text-anchor="end">90 dias</text></svg>`;
    const todos = lista.flatMap((l) => (Array.isArray(l.itens) ? l.itens : []).map((x) => [l.tipo, x.rotulo, diasEm(x.dias)]));
    const vencidos = lista.filter((l) => Number(l.vencidos) > 0).map((l) => [l.tipo, 'Já vencidos', `${l.vencidos}`]);
    return `<p class="pn-meta pn-lt-nota">A faixa clara marca os próximos 7 dias. O que já venceu não cabe no eixo e aparece como número.</p>
        <div class="pn-lt"><div class="pn-lt-h">Tipo</div><div class="pn-lt-h">Vencidos</div>${escala}${corpo}</div>
        ${tabelaEquivalente(['Tipo', 'Item', 'Prazo'], [...vencidos, ...todos])}`;
}

const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const rotuloMes = (aaaamm, i, n) => (i === n - 1 ? 'Este mês' : /^\d{4}-\d{2}$/.test(aaaamm || '') ? `${MES[Number(aaaamm.slice(5)) - 1]}/${aaaamm.slice(2, 4)}` : `Há ${n - 1 - i} meses`);

/** Uma série por mês, 12 meses, com a média (pedidos do titular no n.privacy; desvios detectados no n.ot). */
export function graficoPedidos(valores, meses = [], serie = 'Pedidos recebidos', coluna = 'Pedidos') {
    const v = (Array.isArray(valores) ? valores : []).map((n) => Math.max(0, Number(n) || 0));
    if (v.length < 2) return '';
    const w = 168, h = 40, max = Math.max(1, ...v);
    const x = (i) => 4 + (i * (w - 8)) / (v.length - 1);
    const y = (n) => h - 4 - (n / max) * (h - 10);
    const media = v.reduce((a, b) => a + b, 0) / v.length;
    const ult = v[v.length - 1];
    const mediaTxt = media.toFixed(1).replace('.', ',');
    const resumo = `${serie} por mês nos últimos 12 meses: de ${Math.min(...v)} a ${Math.max(...v)}; ${ult} neste mês; média de ${mediaTxt}`;
    return `<div class="pn-spark"><svg width="${w}" height="${h}" role="img" tabindex="0" aria-label="${e(resumo)}" data-dica="${e(resumo)}">
            <line class="pn-spark-media" x1="0" x2="${w}" y1="${y(media).toFixed(1)}" y2="${y(media).toFixed(1)}"></line>
            <polyline class="pn-spark-linha" points="${v.map((n, i) => `${x(i).toFixed(1)},${y(n).toFixed(1)}`).join(' ')}"></polyline>
            <rect class="pn-spark-ult" x="${(x(v.length - 1) - 4).toFixed(1)}" y="${(y(ult) - 4).toFixed(1)}" width="8" height="8"></rect></svg>
        <div><div class="pn-spark-n">${ult} <span class="pn-meta">neste mês</span></div><div class="pn-meta">média de ${mediaTxt} por mês em 12 meses</div></div></div>
        ${tabelaEquivalente(['Mês', coluna], v.map((n, i) => [rotuloMes(meses[i], i, v.length), n]))}`;
}

/**
 * Dica dos gráficos: aparece ao passar o ponteiro E ao focar pelo teclado, montada por textContent (o texto nunca vira HTML).
 * Um elemento só por documento; os ouvintes ficam no contêiner do painel e somem com ele.
 */
export function ligarDicas(raiz, doc = document) {
    if (!raiz || raiz.dataset.dicas === '1') return;
    raiz.dataset.dicas = '1';
    let dica = doc.getElementById('pn-dica');
    if (!dica) {
        dica = doc.createElement('div');
        dica.id = 'pn-dica';
        dica.className = 'pn-dica';
        dica.setAttribute('role', 'tooltip');
        dica.hidden = true;
        doc.body.appendChild(dica);
    }
    const mostrar = (alvo, x, y) => {
        dica.textContent = alvo.getAttribute('data-dica') || '';
        dica.hidden = false;
        dica.style.left = `${Math.max(8, Math.min(x + 12, (doc.defaultView?.innerWidth || 1024) - 260))}px`;
        dica.style.top = `${y + 12}px`;
    };
    const esconder = () => { dica.hidden = true; };
    raiz.addEventListener('pointerover', (ev) => { const a = ev.target.closest && ev.target.closest('[data-dica]'); if (a) mostrar(a, ev.clientX, ev.clientY); });
    raiz.addEventListener('pointerout', (ev) => { if (ev.target.closest && ev.target.closest('[data-dica]')) esconder(); });
    raiz.addEventListener('focusin', (ev) => { const a = ev.target.closest && ev.target.closest('[data-dica]'); if (a) { const b = a.getBoundingClientRect(); mostrar(a, b.left, b.bottom); } });
    raiz.addEventListener('focusout', esconder);
}
