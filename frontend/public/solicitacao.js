// Formulário de solicitação do titular (solicitacao.html). Sem sessão: a credencial é o token do link, que chega no FRAGMENTO
// (#token): o navegador não o manda ao servidor nem o põe no Referer. Ele sai da barra na hora (history.replaceState), fica na
// sessão da aba (para o F5) e vai só no CORPO de /api/v1/public/titular-pedidos/abrir.
//
// Script clássico servido como está (public/): nada de import, nenhum handler inline (CSP script-src 'self').
(function () {
    const GUARDA = 'solicitacao-token';
    const INVALIDO = { titulo: 'Link inválido ou indisponível', texto: 'Este link não está mais disponível. Peça um novo à organização.' };
    const TIPOS = [
        ['confirmacao', 'Confirmação de que meus dados são tratados'],
        ['acesso', 'Acesso aos meus dados'],
        ['correcao', 'Correção de dados incompletos ou desatualizados'],
        ['anonimizacao_bloqueio_eliminacao', 'Anonimização, bloqueio ou eliminação de dados'],
        ['portabilidade', 'Portabilidade dos dados'],
        ['informacao_compartilhamento', 'Informação sobre com quem meus dados são compartilhados'],
        ['revogacao_consentimento', 'Revogação do consentimento'],
        ['oposicao', 'Oposição ao tratamento'],
        ['outro', 'Outro'],
    ];
    const SITUACAO = { recebido: 'Recebida', em_andamento: 'Em andamento', respondido: 'Respondida', negado: 'Negada', arquivado: 'Arquivada' };
    const ROTULO_TIPO = Object.fromEntries(TIPOS);
    const data = (s) => (s && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10).split('-').reverse().join('/') : 'Não definido');
    let token = '';

    const $ = (id) => document.getElementById(id);
    const guardar = (t) => { try { sessionStorage.setItem(GUARDA, t); } catch { /* sem storage: F5 pede o link de novo */ } };
    const guardado = () => { try { return sessionStorage.getItem(GUARDA) || ''; } catch { return ''; } };

    function estado(titulo, texto) {
        $('sl-form').hidden = true;
        $('sl-consulta').hidden = true;
        $('sl-ok').hidden = true;
        const e = $('sl-estado');
        e.hidden = false;
        $('sl-estado-titulo').textContent = titulo;
        $('sl-estado-texto').textContent = texto || '';
        $('sl-estado-titulo').focus();
    }

    function mostrarFormulario() {
        $('sl-estado').hidden = true;
        $('sl-ok').hidden = true;
        $('sl-consulta').hidden = true;
        $('sl-form').hidden = false;
        const sel = $('sl-tipo');
        sel.innerHTML = '';
        for (const [v, rot] of TIPOS) {
            const o = document.createElement('option');
            o.value = v;
            o.textContent = rot;
            sel.appendChild(o);
        }
    }

    async function enviar(ev) {
        ev.preventDefault();
        const botao = $('sl-enviar');
        const erro = $('sl-erro');
        erro.textContent = '';
        const corpo = {
            token,
            tipo: $('sl-tipo').value,
            titular_nome: $('sl-nome').value.trim(),
            titular_contato: $('sl-contato').value.trim(),
            descricao: $('sl-descricao').value.trim(),
        };
        if (!corpo.titular_nome || !corpo.titular_contato || !corpo.descricao) {
            erro.textContent = 'Preencha seu nome, seu e-mail e a descrição do pedido.';
            return;
        }
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(corpo.titular_contato)) {
            erro.textContent = 'Informe um e-mail válido para a resposta.';
            return;
        }
        botao.disabled = true;
        let res;
        try {
            res = await fetch('/api/v1/public/titular-pedidos/abrir', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(corpo),
                credentials: 'omit',
                cache: 'no-store',
            });
        } catch {
            botao.disabled = false;
            erro.textContent = 'Não foi possível enviar agora. Verifique sua conexão e tente de novo.';
            return;
        }
        if (res.status === 404) return estado(INVALIDO.titulo, INVALIDO.texto);
        let dados = {};
        try { dados = await res.json(); } catch { /* corpo não-JSON */ }
        if (!res.ok) {
            botao.disabled = false;
            erro.textContent = (dados && dados.error) || 'Não foi possível registrar a solicitação. Tente de novo.';
            return;
        }
        $('sl-form').hidden = true;
        $('sl-estado').hidden = true;
        $('sl-protocolo').textContent = dados.protocolo || '';
        $('sl-codigo').textContent = dados.codigo || '';
        $('sl-email-aviso').textContent = dados.email_enviado
            ? 'Também enviamos o protocolo e o código ao seu e-mail. Com os dois você acompanha a situação nesta página.'
            : 'Não conseguimos enviar o e-mail agora. Anote o protocolo e o código: o código não pode ser recuperado depois.';
        $('sl-ok').hidden = false;
        $('sl-ok').querySelector('.pub-estado-titulo').focus();
    }

    function mostrarConsulta(protocolo, codigo) {
        for (const id of ['sl-form', 'sl-estado', 'sl-ok']) $(id).hidden = true;
        $('sl-consulta').hidden = false;
        if (protocolo) $('sl-c-protocolo').value = protocolo;
        if (codigo) $('sl-c-codigo').value = codigo;
        $('sl-c-titulo').focus();
    }

    function linha(dl, rotulo, valor) {
        const dt = document.createElement('dt');
        dt.textContent = rotulo;
        const dd = document.createElement('dd');
        dd.textContent = valor;
        dl.append(dt, dd);
    }

    async function consultar(ev) {
        if (ev) ev.preventDefault();
        const erro = $('sl-c-erro');
        const res = $('sl-c-resultado');
        const botao = $('sl-c-enviar');
        erro.textContent = '';
        res.hidden = true;
        const corpo = { protocolo: $('sl-c-protocolo').value.trim().toUpperCase(), codigo: $('sl-c-codigo').value.trim() };
        if (!corpo.protocolo || !corpo.codigo) { erro.textContent = 'Informe o protocolo e o código de acompanhamento.'; return; }
        botao.disabled = true;
        let r;
        try {
            r = await fetch('/api/v1/public/titular-pedidos/consultar', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo), credentials: 'omit', cache: 'no-store',
            });
        } catch {
            botao.disabled = false;
            erro.textContent = 'Não foi possível consultar agora. Verifique sua conexão e tente de novo.';
            return;
        }
        botao.disabled = false;
        let d = {};
        try { d = await r.json(); } catch { /* corpo não-JSON */ }
        if (!r.ok) { erro.textContent = (d && d.error) || 'Não foi possível consultar. Tente de novo.'; return; }
        res.innerHTML = '';
        linha(res, 'Protocolo', d.protocolo);
        linha(res, 'Situação', SITUACAO[d.status] || d.status);
        linha(res, 'Tipo', ROTULO_TIPO[d.tipo] || d.tipo);
        linha(res, 'Aberta em', data(d.recebido_em));
        linha(res, 'Prazo', data(d.prazo_em));
        if (d.respondido_em) linha(res, 'Concluída em', data(d.respondido_em));
        res.hidden = false;
    }

    function iniciar() {
        if (!$('sl-main')) return; // importado pelo teste antes de a página existir
        $('sl-consulta').addEventListener('submit', consultar);
        $('sl-ir-consulta').addEventListener('click', () => mostrarConsulta());
        $('sl-ir-consulta-estado').addEventListener('click', () => mostrarConsulta());
        const doHash = (location.hash || '').replace(/^#/, '').trim();
        if (doHash.startsWith('acompanhar=')) {
            // link do e-mail: <protocolo>.<código>; nunca vira o token do portal
            const [protocolo, codigo] = decodeURIComponent(doHash.slice('acompanhar='.length)).split('.');
            try { history.replaceState(null, '', location.pathname); } catch { /* ok */ }
            mostrarConsulta(protocolo, codigo);
            if (protocolo && codigo) consultar();
            return;
        }
        if (doHash) {
            token = doHash;
            guardar(token);
            try { history.replaceState(null, '', location.pathname); } catch { /* ok */ }
        } else {
            token = guardado();
        }
        if (!token) return estado(INVALIDO.titulo, 'Abra o link que a organização forneceu para enviar sua solicitação, ou acompanhe uma solicitação já aberta.');
        mostrarFormulario();
        $('sl-form').addEventListener('submit', enviar);
    }

    window.solicitacaoPublica = { iniciar };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
    else iniciar();
})();
