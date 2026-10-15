// Gráficos dos protótipos, em HTML/CSS e SVG simples, sem biblioteca. Cada um traz texto alternativo e tabela equivalente.
// Regras (skill dataviz): cor ordinal de um matiz só, validada; status só com rótulo; nenhum valor só na dica.
(function () {
  const { esc, nivel } = window.U;
  const css = `
  .cob-leg { display: flex; gap: 14px; font-size: 12px; color: var(--text-2); margin-bottom: 10px; }
  .cob-leg span { display: inline-flex; align-items: center; gap: 6px; }
  .cob-leg i { width: 10px; height: 10px; display: inline-block; }
  .cob { display: grid; grid-template-columns: minmax(120px, 190px) 1fr 70px; gap: 9px 12px; align-items: center; }
  .cob .t { font-size: 13px; color: var(--text-2); }
  .cob .b { display: flex; gap: 2px; height: 10px; }
  .cob .b > div { min-width: 2px; }
  .cob .b > div:hover, .cob .b > div:focus-visible { filter: brightness(1.15); outline-offset: 1px; }
  .cob .v { font-size: 12.5px; color: var(--text); text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .mapa { display: grid; grid-template-columns: 22px repeat(5, 1fr); grid-template-rows: repeat(5, 1fr) 20px; gap: 2px; aspect-ratio: 1.7; max-width: 460px; }
  .mapa .c { display: grid; place-items: center; font: 600 14px var(--font-body); color: var(--text); border: 1px solid var(--border); }
  .mapa .c[data-n="0"] { color: transparent; }
  .mapa .c.Médio { background: rgba(245, 158, 11, 0.14); } .mapa .c.Alto { background: rgba(239, 68, 68, 0.20); } .mapa .c.Crítico { background: rgba(239, 68, 68, 0.42); }
  .mapa .ax { font-size: 11px; color: var(--text-dim); display: grid; place-items: center; }
  .mapa-leg { display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: 11.5px; color: var(--text-2); margin-top: 8px; }
  .mapa-leg i { width: 10px; height: 10px; display: inline-block; margin-right: 5px; border: 1px solid var(--border); vertical-align: -1px; }
  .lt { display: grid; grid-template-columns: minmax(110px, 160px) 64px 1fr; gap: 0 10px; font-size: 12.5px; }
  .lt .h { color: var(--text-dim); font-size: 11px; padding-bottom: 6px; }
  .lt .r { color: var(--text-2); padding: 7px 0; border-top: 1px solid var(--border); }
  .lt .venc { padding: 7px 0; border-top: 1px solid var(--border); font-variant-numeric: tabular-nums; }
  .lt .venc b { color: #fca5a5; font-weight: 600; }
  .lt .trk { position: relative; border-top: 1px solid var(--border); }
  .lt .trk .sem { position: absolute; left: 0; top: 0; bottom: 0; width: calc(7 / 90 * 100%); background: rgba(245, 158, 11, 0.08); }
  .lt .trk .p { position: absolute; top: 50%; width: 9px; height: 9px; margin: -4.5px 0 0 -4.5px; background: var(--text-2); box-shadow: 0 0 0 2px var(--surface); cursor: default; }
  .lt .trk .p.w { background: var(--warning); }
  .lt .trk .p::after { content: ''; position: absolute; inset: -8px; }
  .lt .esc { position: relative; height: 18px; color: var(--text-dim); font-size: 11px; }
  .lt .esc span { position: absolute; transform: translateX(-50%); white-space: nowrap; }
  .lt .esc span:first-child { transform: none; }
  .lt .fase { font-size: 10.5px; color: var(--text-dim); border: 1px solid var(--border); padding: 0 4px; margin-left: 6px; }
  .spark { display: flex; align-items: center; gap: 14px; }
  .spark svg { flex: none; }
  `;
  document.head.append(Object.assign(document.createElement('style'), { textContent: css }));

  const tabela = (cab, linhas) => `<details class="equiv"><summary>Ver como tabela</summary><table class="tabela"><thead><tr>${cab.map((c, i) => `<th${i ? ' style="text-align:right"' : ''}>${esc(c)}</th>`).join('')}</tr></thead><tbody>${linhas.map((l) => `<tr>${l.map((c, i) => `<td${i ? ' class="n"' : ''}>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></details>`;

  /** Cobertura por tema: barras 100% empilhadas, mesma escala para todos os temas. */
  function cobertura(temas) {
    const leg = `<div class="cob-leg" aria-hidden="true"><span><i style="background:var(--ord-feito)"></i>Concluído</span><span><i style="background:var(--ord-andamento)"></i>Em andamento</span><span><i style="background:var(--ord-falta)"></i>Falta</span></div>`;
    const linhas = temas.map((t) => {
      const tot = t.f + t.a + t.x || 1;
      const seg = (v, cor, rot) => v ? `<div tabindex="0" style="flex:${v};background:${cor}" data-tip="${v} de ${tot}|${esc(t.tema)}: ${rot}"></div>` : '';
      return `<div class="t">${esc(t.tema)}</div><div class="b" role="img" aria-label="${esc(t.tema)}: ${t.f} concluídos, ${t.a} em andamento, ${t.x} faltam, de ${tot}">${seg(t.f, 'var(--ord-feito)', 'concluído')}${seg(t.a, 'var(--ord-andamento)', 'em andamento')}${seg(t.x, 'var(--ord-falta)', 'falta')}</div><div class="v">${t.f} de ${tot}</div>`;
    }).join('');
    return `${leg}<div class="cob">${linhas}</div>${tabela(['Tema', 'Concluído', 'Em andamento', 'Falta', 'Como se conta'], temas.map((t) => [t.tema, t.f, t.a, t.x, t.conta]))}`;
  }

  /** Mapa de risco 5x5, probabilidade (linhas) por impacto (colunas). Nível escrito na legenda e no nome de cada célula. */
  function mapaDeRisco(riscos) {
    const m = {}; riscos.forEach(([p, i]) => { m[p + '-' + i] = (m[p + '-' + i] || 0) + 1; });
    let cel = '';
    for (let p = 5; p >= 1; p--) {
      cel += `<div class="ax" aria-hidden="true">${p}</div>`;
      for (let i = 1; i <= 5; i++) {
        const n = m[p + '-' + i] || 0, nv = nivel(p * i);
        cel += `<div class="c ${nv}" data-n="${n}" ${n ? `tabindex="0" data-tip="${n} ${n === 1 ? 'risco' : 'riscos'}|Probabilidade ${p}, impacto ${i}: ${nv.toLowerCase()}"` : ''} aria-label="Probabilidade ${p}, impacto ${i}, nível ${nv}: ${n} ${n === 1 ? 'risco' : 'riscos'}">${n || ''}</div>`;
      }
    }
    cel += '<div></div>' + [1, 2, 3, 4, 5].map((i) => `<div class="ax" aria-hidden="true">${i}</div>`).join('');
    const por = { Crítico: 0, Alto: 0, Médio: 0, Baixo: 0 }; riscos.forEach(([p, i]) => por[nivel(p * i)]++);
    return `<div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-dim);margin-bottom:4px"><span>Probabilidade (linhas)</span><span>Impacto (colunas)</span></div>
      <div class="mapa" role="group" aria-label="Mapa de risco: ${por['Crítico']} crítico, ${por.Alto} altos, ${por['Médio']} médios, ${por.Baixo} baixos">${cel}</div>
      <div class="mapa-leg"><span><i style="background:rgba(239,68,68,.42)"></i>Crítico ${por['Crítico']}</span><span><i style="background:rgba(239,68,68,.20)"></i>Alto ${por.Alto}</span><span><i style="background:rgba(245,158,11,.14)"></i>Médio ${por['Médio']}</span><span><i></i>Baixo ${por.Baixo}</span></div>
      ${tabela(['Nível', 'Riscos'], Object.entries(por).map(([k, v]) => [k, v]))}`;
  }

  /** Linha do tempo de 90 dias por tipo; o vencido não cabe no eixo e vira número com rótulo. */
  function vencimentos(linhas) {
    const corpo = linhas.map((l) => {
      const venc = l.itens.filter(([d]) => d < 0).length;
      const pts = l.itens.filter(([d]) => d >= 0 && d <= 90).map(([d, r]) => `<span class="p${d <= 7 ? ' w' : ''}" tabindex="0" style="left:${(d / 90) * 100}%" data-tip="${d === 0 ? 'Hoje' : 'Em ' + d + (d === 1 ? ' dia' : ' dias')}|${esc(r)}" aria-label="${esc(r)}, vence em ${d} dias"></span>`).join('');
      return `<div class="r">${esc(l.tipo)}${l.fase ? `<span class="fase" title="Depende da fase ${l.fase} do plano do legado">${l.fase}</span>` : ''}</div><div class="venc">${venc ? `<b>${venc}</b> <span class="meta">venc.</span>` : '<span class="meta">nenhum</span>'}</div><div class="trk"><div class="sem"></div>${pts}</div>`;
    }).join('');
    const esc90 = `<div class="esc"><span style="left:0">hoje</span><span style="left:33.3%">30</span><span style="left:66.6%">60</span><span style="left:100%;transform:translateX(-100%)">90 dias</span></div>`;
    const todos = linhas.flatMap((l) => l.itens.map(([d, r]) => [l.tipo, r, d < 0 ? `vencido há ${-d} dias` : `em ${d} dias`]));
    return `<p class="meta" style="margin:-6px 0 10px">A faixa clara marca os próximos 7 dias. O que já venceu não cabe no eixo e aparece como número.</p><div class="lt"><div class="h">Tipo</div><div class="h">Vencidos</div>${esc90}${corpo}</div>${tabela(['Tipo', 'Item', 'Prazo'], todos)}`;
  }

  /** Uma série curta: pedidos recebidos por semana. Sem legenda (o título nomeia a série). */
  function sparkline(v) {
    const w = 168, h = 40, max = Math.max(...v), x = (i) => 4 + (i * (w - 8)) / (v.length - 1), y = (n) => h - 4 - (n / max) * (h - 10);
    const pts = v.map((n, i) => `${x(i).toFixed(1)},${y(n).toFixed(1)}`).join(' ');
    const media = (v.reduce((a, b) => a + b, 0) / v.length).toFixed(1).replace('.', ',');
    const ult = v[v.length - 1];
    return `<div class="spark"><svg width="${w}" height="${h}" role="img" aria-label="Pedidos recebidos por semana nas últimas 12 semanas: de ${Math.min(...v)} a ${max}; ${ult} nesta semana">
      <line x1="0" x2="${w}" y1="${y(+media.replace(',', '.'))}" y2="${y(+media.replace(',', '.'))}" stroke="rgba(255,255,255,.12)" stroke-width="1"/>
      <polyline points="${pts}" fill="none" stroke="var(--text-dim)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      <rect x="${x(v.length - 1) - 4}" y="${y(ult) - 4}" width="8" height="8" fill="var(--text)" stroke="var(--surface)" stroke-width="2"/></svg>
      <div><div style="font-size:20px;font-weight:600">${ult} <span class="meta" style="font-size:12.5px;font-weight:400">nesta semana</span></div><div class="meta">média de ${media} por semana em 12 semanas</div></div></div>
      ${tabela(['Semana', 'Pedidos'], v.map((n, i) => [`${i - v.length + 1 === 0 ? 'atual' : i - v.length + 1}`, n]))}`;
  }

  window.G = { cobertura, mapaDeRisco, vencimentos, sparkline };
})();
