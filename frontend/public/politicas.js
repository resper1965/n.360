// Portal público de políticas (politicas.html). Script externo (CSP script-src 'self'): nenhum handler
// nem estilo inline; tudo é ligado por addEventListener no DOMContentLoaded abaixo e estilizado por classe
// (publico.css + politicas.css).
//
// Este portal é anônimo por sessão de código, mas o conteúdo que ele exibe (título, tipo e texto do
// documento) vem de `documentos`, versão vigente, editável por papéis com escrita no app autenticado. Sem
// escapar aqui, um campo com `<img onerror=...>` executaria para todo mundo que entra para ler as políticas.
// Todo dado do servidor entra por escapeHTML ou por textContent.
function escapeHTML(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[&<>"']/g, (m) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[m]));
}

let state = {
  projectId: '',
  email: '',
  name: '',
  token: '',
  documents: [],
  legacy: [],
  selectedId: null
};

// A ciência é da VERSÃO: `atual` quando o número lido é o da vigente; senão é de uma versão anterior.
const TIPOS = { politica: 'Política', norma: 'Norma', procedimento: 'Procedimento' };

const el = (id) => document.getElementById(id);
const mostrar = (id, sim) => el(id).classList.toggle('hidden', !sim);

/** Instante do SQLite ('AAAA-MM-DD HH:MM:SS', UTC) ou ISO -> data e hora em Brasília. */
const quando = (s) => {
  if (!s) return '';
  const t = String(s);
  const d = new Date(/^\d{4}-\d{2}-\d{2} \d/.test(t) ? t.replace(' ', 'T') + (t.includes('Z') ? '' : 'Z') : t);
  return isNaN(d) ? '' : d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });
};

/** Aviso dentro da página (nunca alert): tipo '' (neutro), 'erro', 'ok' ou 'atencao'. */
function aviso(id, texto, tipo = '') {
  const box = el(id);
  box.className = 'pub-aviso' + (tipo ? ' pub-aviso-' + tipo : '');
  box.textContent = texto;
}

window.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);
  state.projectId = params.get('project') || params.get('projectId') || '';
  el('form-request-otp').addEventListener('submit', handleRequestOtp);
  el('form-verify-otp').addEventListener('submit', handleVerifyOtp);
  el('btn-back-email').addEventListener('click', () => showStep(1));
  el('btn-logout').addEventListener('click', logout);
  el('btn-sign-ack').addEventListener('click', handleSignAck);
  el('btn-proximo').addEventListener('click', proximoPendente);
  el('chk-accept').addEventListener('change', (e) => toggleSignButton(e.target.checked));
  // A lista de documentos é montada dinamicamente: delegação no container.
  el('policy-list-container').addEventListener('click', (e) => {
    const item = e.target.closest('.policy-item');
    if (item && item.dataset.idx !== undefined) selectPolicy(Number(item.dataset.idx));
  });
  // Link pessoal de ciência (pedido da consultoria): o token vem no FRAGMENTO, que o navegador
  // não manda ao servidor nem põe no Referer; daqui ele segue só no corpo do POST.
  const token = window.location.hash.slice(1);
  if (/^[0-9a-f]{64}$/.test(token)) {
    // Tira o token da barra de endereço (histórico, captura de tela, link copiado); segue em memória.
    // Recarregar a página perde o link: abra de novo pelo e-mail.
    history.replaceState(null, '', window.location.pathname + window.location.search);
    iniciarLink(token);
  }
});

// ─── Ciência por link pessoal ─────────────────────────────────────────────────────────────────
async function postLink(acao, corpo) {
  const res = await fetch(`/api/v1/public/pedidos/${acao}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error(data.error || 'Não foi possível concluir. Tente de novo.');
    e.status = res.status;
    throw e;
  }
  return data;
}

/** Aviso do link pessoal: no topo (link inválido) ou junto da confirmação, onde a pessoa está ao pedir o código. */
function avisoLink(texto, erro, onde = 'msg-link') {
  aviso(onde, texto, erro ? 'erro' : '');
}

/** Fim do link pessoal: diz que terminou, quando, o que fica registrado e o que acontece depois. */
function concluidoLink(decididoEm, hash) {
  mostrar('link-leitura', false);
  el('link-sub').textContent = '';
  const fim = el('link-concluido');
  fim.innerHTML = `<p class="pol-feito-titulo">Leitura confirmada</p>
    <p class="pub-texto">Registramos a sua ciência${decididoEm ? ` em ${escapeHTML(quando(decididoEm))}` : ''}. Não há mais nada a fazer: pode fechar esta página.
      Se o documento mudar, a sua empresa envia um novo pedido por e-mail.</p>
    <p class="pol-integridade"><span class="pol-integridade-rotulo">Código de integridade da versão lida</span>
      <code class="pub-hash">${escapeHTML(hash || '')}</code></p>`;
  mostrar('link-concluido', true);
}

function conteudoLink(tipo, conteudo) {
  if (tipo === 'documento') {
    return `<header class="pol-doc-cabeca"><h2 class="pol-doc-titulo">${escapeHTML(conteudo.titulo)}</h2>
      <p class="pol-doc-meta">Versão ${escapeHTML(conteudo.numero)}</p></header>
      <div class="pol-doc-texto">${escapeHTML(conteudo.texto) || 'Documento sem texto.'}</div>`;
  }
  if (tipo === 'politica') {
    return `<header class="pol-doc-cabeca"><h2 class="pol-doc-titulo">${escapeHTML(conteudo.title)}</h2></header>
      <div class="pol-doc-texto">${escapeHTML(conteudo.description) || 'Documento sem texto.'}</div>`;
  }
  return Object.entries(conteudo || {}).filter(([, v]) => v !== null && v !== '')
    .map(([k, v]) => `<div class="pol-campo"><p class="pol-campo-rotulo">${escapeHTML(k)}</p>
      <div class="pol-doc-texto">${escapeHTML(String(v))}</div></div>`).join('');
}

async function iniciarLink(token) {
  mostrar('step-request-otp', false);
  mostrar('step-link', true);
  let d;
  try {
    d = await postLink('ver', { token });
  } catch (err) {
    el('link-sub').textContent = '';
    avisoLink(err.status === 404 ? 'Este link é inválido ou expirou. Peça um novo a quem enviou.' : err.message, true);
    return;
  }
  el('link-titulo').textContent = d.titulo || 'Ciência de documento';
  document.title = `${d.titulo || 'Ciência de documento'} | n.360 · ness.`;
  if (d.estado !== 'pendente') {
    concluidoLink(d.decidido_em, d.hash_lido);
    return;
  }
  el('link-sub').textContent = `Você recebeu este link por e-mail para ler o documento abaixo e confirmar a leitura. Leia até o fim; para confirmar, enviamos um código de 6 dígitos para ${d.email}.`;
  el('link-documento').innerHTML = conteudoLink(d.tipo, d.conteudo);
  el('link-hash').textContent = d.hash;
  if (d.nome) el('link-nome').value = d.nome;
  mostrar('link-leitura', true);

  el('btn-link-codigo').addEventListener('click', async () => {
    try {
      const r = await postLink('codigo', { token });
      avisoLink(`Código enviado para ${r.enviado_para}. Ele vale por 15 minutos.`, false, 'link-msg');
      mostrar('form-link-ciencia', true);
      el('btn-link-codigo').textContent = 'Reenviar o código';
      el('link-codigo').focus();
    } catch (err) {
      avisoLink(err.message, true, 'link-msg');
    }
  });
  el('link-aceite').addEventListener('change', (e) => {
    el('btn-link-confirmar').disabled = !e.target.checked;
  });
  el('form-link-ciencia').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nome = el('link-nome').value.trim();
    const codigo = el('link-codigo').value.trim();
    if (nome.length < 2) { avisoLink('Informe o seu nome completo.', true, 'link-msg'); el('link-nome').focus(); return; }
    if (!/^\d{6}$/.test(codigo)) { avisoLink('Informe o código de 6 dígitos.', true, 'link-msg'); el('link-codigo').focus(); return; }
    try {
      const r = await postLink('ciencia', { token, codigo, nome });
      mostrar('msg-link', false);
      concluidoLink(r.decidido_em, r.hash_lido);
    } catch (err) {
      avisoLink(err.status === 404 ? 'Este link deixou de valer (o documento pode ter mudado). Peça um novo a quem enviou.' : err.message, true, 'link-msg');
    }
  });
}

// ─── Entrada pelo endereço da empresa: nome, e-mail e código ─────────────────────────────────
function showStep(stepNum) {
  mostrar('step-request-otp', stepNum === 1);
  mostrar('step-verify-otp', stepNum === 2);
  mostrar('step-reader', stepNum === 3);
}

async function handleRequestOtp(e) {
  e.preventDefault();
  const name = el('req-name').value.trim();
  const email = el('req-email').value.trim();
  mostrar('msg-request', false);

  try {
    const res = await fetch('/api/v1/public/policies/request-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: state.projectId, name, email })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Não foi possível enviar o código. Tente de novo.');

    state.name = name;
    state.email = email;

    el('sent-email-display').textContent = email;
    aviso('msg-request', data.message || 'Código enviado.', 'ok');

    if (data.demo_otp) {
      el('otp-code').value = data.demo_otp;
    }

    setTimeout(() => { showStep(2); el('otp-code').focus(); }, 1200);
  } catch (err) {
    aviso('msg-request', err.message, 'erro');
  }
}

async function handleVerifyOtp(e) {
  e.preventDefault();
  const otp = el('otp-code').value.trim();
  mostrar('msg-verify', false);

  try {
    const res = await fetch('/api/v1/public/policies/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: state.projectId, email: state.email, otp })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Código inválido.');

    state.token = data.token;
    state.name = data.name;

    await loadPolicyList();
    showStep(3);
  } catch (err) {
    aviso('msg-verify', err.message, 'erro');
  }
}

async function loadPolicyList(manterId) {
  try {
    const res = await fetch(`/api/v1/public/policies/list?token=${state.token}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Não foi possível carregar os documentos.');

    state.documents = data.documents || [];
    state.legacy = data.legacy || [];

    // O nome da empresa fica no título da página; o topo segue dizendo o que é a página.
    const cliente = data.project?.client_name || '';
    el('reader-project-name').textContent = cliente || 'Políticas da empresa';
    if (cliente) document.title = `Políticas de ${cliente} | n.360 · ness.`;
    el('reader-user-info').textContent = `${state.name} (${state.email})`;

    renderPolicyList(manterId);
  } catch (err) {
    aviso('reader-aviso', err.message, 'erro');
  }
}

/** Selo de cada item: confirmado na vigente; nova versão se a pessoa só leu uma passada; a confirmar se nunca leu. */
function seloDaCiencia(doc) {
  if (!doc.ciencia) return '<span class="pub-selo pub-selo-neutro">A confirmar</span>';
  return doc.ciencia.atual
    ? '<span class="pub-selo pub-selo-ok">Confirmado</span>'
    : '<span class="pub-selo pub-selo-atencao">Nova versão para ler</span>';
}

const pendentes = () => state.documents.filter((d) => !(d.ciencia && d.ciencia.atual));

/** Quantos faltam, ou que terminou e o que acontece depois. */
function mostrarProgresso() {
  const total = state.documents.length;
  const falta = pendentes().length;
  if (!total) { mostrar('reader-progresso', false); return; }
  mostrar('reader-progresso', true);
  if (falta) {
    aviso('reader-progresso', `${falta === 1 ? 'Falta 1' : `Faltam ${falta}`} de ${total} ${total === 1 ? 'documento' : 'documentos'} para confirmar.`, 'atencao');
  } else {
    aviso('reader-progresso', `Você confirmou a leitura de ${total === 1 ? 'o documento' : `todos os ${total} documentos`}. Não há mais nada a fazer: pode fechar esta página. Se algum documento mudar, a sua empresa pede uma nova confirmação.`, 'ok');
  }
}

function renderPolicyList(manterId) {
  const container = el('policy-list-container');
  const antigas = (state.legacy || []).length
    ? `<p class="pol-antigas">Registros anteriores, sem prova de versão: ${state.legacy.map((a) => escapeHTML(a.policy_type)).join(', ')}.</p>`
    : '';
  mostrarProgresso();
  if (!state.documents || state.documents.length === 0) {
    container.innerHTML = '<p class="pol-doc-vazio">Nenhum documento vigente para ler agora.</p>' + antigas;
    return;
  }

  container.innerHTML = state.documents.map((doc, idx) => `<button type="button" class="policy-item" data-idx="${idx}" id="pol-item-${idx}">
        <span class="pol-item-titulo">${escapeHTML(doc.titulo)}</span>
        ${seloDaCiencia(doc)}
      </button>`).join('') + antigas;

  const idx = manterId ? state.documents.findIndex((d) => d.id === manterId) : -1;
  selectPolicy(idx >= 0 ? idx : 0);
}

function selectPolicy(idx) {
  document.querySelectorAll('.policy-item').forEach((item) => { item.classList.remove('active'); item.removeAttribute('aria-current'); });
  const activeEl = el(`pol-item-${idx}`);
  if (activeEl) { activeEl.classList.add('active'); activeEl.setAttribute('aria-current', 'true'); }

  const doc = state.documents[idx];
  if (!doc) return;
  state.selectedId = doc.id;
  mostrar('reader-aviso', false);

  el('document-paper-body').innerHTML = `<header class="pol-doc-cabeca">
      <h2 class="pol-doc-titulo">${escapeHTML(doc.titulo)}</h2>
      <p class="pol-doc-meta">${escapeHTML(TIPOS[doc.tipo] || 'Documento')} · versão ${escapeHTML(doc.numero)}</p>
    </header><div class="pol-doc-texto">${escapeHTML(doc.texto) || 'Conteúdo do documento vigente.'}</div>`;

  mostrar('ack-controls', true);
  const nota = el('ack-prev-note');

  if (doc.ciencia && doc.ciencia.atual) {
    mostrar('ack-pending-box', false);
    mostrar('ack-completed-box', true);
    el('ack-details-hash').textContent = `Versão ${doc.ciencia.numero} · ${quando(doc.ciencia.em)}`;
    mostrar('btn-proximo', pendentes().length > 0);
  } else {
    mostrar('ack-completed-box', false);
    mostrar('ack-pending-box', true);
    el('chk-accept').checked = false;
    toggleSignButton(false);
    // Já leu uma versão anterior: a ciência dela fica gravada, mas esta é outra e pede confirmação nova.
    nota.textContent = doc.ciencia ? `Você deu ciência da versão ${doc.ciencia.numero}. Esta é a versão ${doc.numero}: leia e confirme de novo.` : '';
    mostrar('ack-prev-note', !!doc.ciencia);
  }
}

function proximoPendente() {
  const prox = pendentes()[0];
  if (!prox) return;
  selectPolicy(state.documents.indexOf(prox));
  el('document-paper-body').scrollIntoView?.({ block: 'start' });
}

function toggleSignButton(enabled) {
  el('btn-sign-ack').disabled = !enabled;
}

async function handleSignAck() {
  const doc = state.documents.find((d) => d.id === state.selectedId);
  if (!doc) return;
  try {
    // O id e a versão lida: nome e e-mail são os da sessão (código por e-mail), o servidor não aceita outros.
    const res = await fetch(`/api/v1/public/policies/ack?token=${state.token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documento_id: doc.id, numero: doc.numero })
    });
    const data = await res.json();
    if (res.status === 409) {
      // Saiu versão nova entre a leitura e a confirmação: nada foi registrado. Recarrega para ler a nova.
      await loadPolicyList(doc.id);
      aviso('reader-aviso', data.error || 'O documento foi atualizado enquanto você lia: leia o texto novo e confirme de novo.', 'atencao');
      return;
    }
    if (!res.ok) throw new Error(data.error || 'Não foi possível registrar a ciência.');
    doc.ciencia = { numero: data.numero, em: data.acknowledged_at, atual: true };
    renderPolicyList(doc.id);
  } catch (err) {
    aviso('reader-aviso', 'Não foi possível confirmar: ' + err.message, 'erro');
  }
}

function logout() {
  state.token = '';
  showStep(1);
}
