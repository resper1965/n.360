// Questionário de homologação do fornecedor (homologacao.html). Sem sessão: a credencial é o token do link, que chega no
// FRAGMENTO (#token): o navegador não o manda ao servidor nem o põe no Referer. Ele sai da barra na hora
// (history.replaceState), fica nesta variável (e na sessão da aba, para o F5) e vai só no CORPO das rotas de
// src/routes/public-homologacao.ts. Nunca em URL nem no console.
//
// Script clássico servido como está (public/): nada de import, nenhum handler inline (CSP script-src 'self'). Todo dado do
// servidor entra por textContent ou por esc().
(function () {
    const INVALIDO = 'Link inválido ou expirado';
    const GUARDA = 'homologacao-token';
    const OPCOES = [['sim', 'Sim'], ['nao', 'Não'], ['parcial', 'Parcial'], ['na', 'Não se aplica']];
    let token = '';
    let cliente = '';
    const guardar = (t) => { try { sessionStorage.setItem(GUARDA, t); } catch { /* sem storage: F5 pede o link de novo */ } };
    const guardado = () => { try { return sessionStorage.getItem(GUARDA) || ''; } catch { return ''; } };
    const esquecer = () => { try { sessionStorage.removeItem(GUARDA); } catch { /* nada a fazer */ } };

    const $ = (id) => document.getElementById(id);
    const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ESC[ch]);

    /** Instante do SQLite ('AAAA-MM-DD HH:MM:SS', UTC) -> DD/MM/AAAA em Brasília. */
    function data(s) {
        if (!s) return '';
        const t = String(s);
        const d = new Date(/^\d{4}-\d{2}-\d{2} \d/.test(t) ? t.replace(' ', 'T') + 'Z' : t);
        return isNaN(d) ? '' : new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
    }

    /**
     * POST com o token no corpo. Falha de rede vira null. Quem chama passa o caminho literal
     * (/api/v1/public/homologacao/...): é o que test/contrato-tela-api.test.ts confere contra as rotas.
     */
    async function chamar(caminho, extra) {
        try {
            return await fetch(caminho, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, ...extra }),
                credentials: 'omit',
                cache: 'no-store',
            });
        } catch {
            return null;
        }
    }
    async function lerJson(r) { try { return (await r.json()) || {}; } catch { return {}; } }

    function estado(titulo, texto) {
        $('hq-conteudo').hidden = true;
        $('hq-estado').hidden = false;
        $('hq-estado-titulo').textContent = titulo;
        $('hq-estado-texto').textContent = texto || '';
    }
    function falhou(r) {
        if (!r) return estado('Sem conexão', 'Não foi possível falar com o servidor. Confira a conexão e tente de novo.');
        if (r.status === 404) return estado(INVALIDO, 'O link venceu, já foi usado para enviar as respostas ou foi cancelado. Peça um novo link a quem o enviou.');
        if (r.status === 429) return estado('Muitas tentativas', 'Tente novamente em alguns minutos.');
        return estado('Não foi possível abrir', 'Tente de novo em instantes.');
    }

    function pergunta(p, i, r) {
        const atual = (r && r.resposta) || '';
        const nome = `hq-r-${i}`;
        return `<fieldset class="hq-pergunta" id="hq-p-${i}" data-pergunta="${esc(p.id)}">
            <legend class="hq-texto"><span class="hq-num">${i + 1}.</span> ${esc(p.texto)}</legend>
            <div class="hq-opcoes">${OPCOES.map(([v, rot]) => `<label class="hq-opcao"><input type="radio" name="${nome}" value="${v}"${atual === v ? ' checked' : ''}> ${rot}</label>`).join('')}</div>
            <label class="hq-just-rotulo" for="${nome}-j">Justificativa (opcional)</label>
            <textarea class="hq-just" id="${nome}-j" rows="2" maxlength="1000">${esc((r && r.justificativa) || '')}</textarea>
        </fieldset>`;
    }

    function mostrarPercentual(d) {
        $('hq-percentual').textContent = `${d.percentual ?? 0}% (${d.respondidas ?? 0} de ${d.total ?? 0} perguntas)`;
        $('hq-progresso').textContent = d.total ? `${d.respondidas ?? 0} de ${d.total} respondidas` : '';
    }

    /** O que está marcado na tela agora (o servidor só conta o que foi salvo). */
    function progressoNaTela() {
        const campos = [...document.querySelectorAll('fieldset[data-pergunta]')];
        const respondidas = campos.filter((f) => f.querySelector('input[type="radio"]:checked')).length;
        return { total: campos.length, respondidas, percentual: campos.length ? Math.round((100 * respondidas) / campos.length) : 0, campos };
    }

    function mostrar(d) {
        cliente = d.cliente || '';
        $('hq-org').textContent = cliente || 'Questionário de homologação';
        if (cliente) document.title = `Questionário de homologação · ${cliente} | n.360 · ness.`;
        $('hq-meta').textContent = d.expira_em ? `Link válido até ${data(d.expira_em)}` : '';
        $('hq-cliente').textContent = d.cliente || '';
        $('hq-fornecedor').textContent = d.fornecedor || '';
        mostrarPercentual(d);
        const respostas = d.respostas || {};
        const porTema = new Map();
        (d.perguntas || []).forEach((p, i) => porTema.set(p.tema, [...(porTema.get(p.tema) || []), [p, i]]));
        $('hq-perguntas').innerHTML = [...porTema.entries()].map(([tema, lista]) => `<section class="hq-tema">
            <h2 class="hq-tema-titulo">${esc(tema)}</h2>
            ${lista.map(([p, i]) => pergunta(p, i, respostas[p.id])).join('')}
        </section>`).join('') || '<p class="hq-vazio">Nenhuma pergunta neste questionário.</p>';
        $('hq-estado').hidden = true;
        $('hq-conteudo').hidden = false;
    }

    /** Só as perguntas com opção marcada: as em branco ficam como estavam no servidor. */
    function respostas() {
        const out = {};
        for (const f of document.querySelectorAll('fieldset[data-pergunta]')) {
            const marcada = f.querySelector('input[type="radio"]:checked');
            if (!marcada) continue;
            const just = f.querySelector('textarea').value.trim();
            out[f.dataset.pergunta] = just ? { resposta: marcada.value, justificativa: just } : { resposta: marcada.value };
        }
        return out;
    }

    async function carregar() {
        const r = await chamar('/api/v1/public/homologacao/ver');
        if (!r || r.status !== 200) return falhou(r);
        mostrar(await lerJson(r));
    }

    async function salvar(botao) {
        $('hq-aviso').textContent = '';
        $('hq-msg').textContent = '';
        botao.disabled = true;
        try {
            const r = await chamar('/api/v1/public/homologacao/salvar', { respostas: respostas() });
            if (!r || r.status !== 200) {
                if (r && r.status === 404) return falhou(r);
                $('hq-aviso').textContent = 'Não foi possível salvar. Confira as respostas e tente de novo.';
                return;
            }
            mostrarPercentual(await lerJson(r));
            $('hq-msg').textContent = 'Rascunho salvo.';
        } finally {
            botao.disabled = false;
        }
    }

    /**
     * Antes de enviar, a confirmação fica na própria página: o que ficou sem resposta, com um botão para cada pergunta
     * (botão, não âncora: com #hq-p-3 no endereço, o F5 leria "hq-p-3" como token), e "Enviar mesmo assim".
     */
    function pedirConfirmacao() {
        $('hq-aviso').textContent = '';
        $('hq-msg').textContent = '';
        const { campos } = progressoNaTela();
        const faltam = campos.map((f, i) => [f, i]).filter(([f]) => !f.querySelector('input[type="radio"]:checked'));
        $('hq-confirma-titulo').textContent = faltam.length
            ? `${faltam.length === 1 ? 'Falta 1 pergunta' : `Faltam ${faltam.length} perguntas`} sem resposta`
            : 'Enviar as respostas?';
        $('hq-confirma-texto').textContent = faltam.length
            ? 'Você pode voltar a elas agora ou enviar assim. Depois do envio as respostas não podem mais ser alteradas.'
            : `Todas as ${campos.length} perguntas têm resposta. Depois do envio elas não podem mais ser alteradas.`;
        $('hq-faltam').innerHTML = faltam.map(([, i]) => `<li><button type="button" class="pub-link" data-ir="${i}">Pergunta ${i + 1}</button></li>`).join('');
        $('hq-confirma-enviar').textContent = faltam.length ? 'Enviar mesmo assim' : 'Enviar agora';
        $('hq-confirma').hidden = false;
        $('hq-acoes').hidden = true;
        $('hq-confirma-titulo').focus();
    }

    function fecharConfirmacao() {
        $('hq-confirma').hidden = true;
        $('hq-acoes').hidden = false;
    }

    function irPara(i) {
        fecharConfirmacao();
        const f = $('hq-p-' + i);
        if (!f) return;
        f.scrollIntoView?.({ block: 'center' });
        f.querySelector('input')?.focus({ preventScroll: true });
    }

    async function enviar(botao) {
        botao.disabled = true;
        try {
            const r = await chamar('/api/v1/public/homologacao/enviar', { respostas: respostas() });
            if (!r || r.status !== 200) {
                if (r && r.status === 404) return falhou(r);
                fecharConfirmacao();
                $('hq-aviso').textContent = 'Não foi possível enviar. Confira as respostas e tente de novo.';
                return;
            }
            const d = await lerJson(r);
            esquecer();
            $('hq-meta').textContent = '';
            const hoje = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date());
            const para = cliente ? `para ${cliente}` : 'para quem pediu';
            estado('Respostas enviadas', `Suas respostas foram enviadas ${para} em ${hoje}, com ${d.respondidas ?? 0} de ${d.total ?? 0} perguntas respondidas. `
                + 'A consultoria que conduz a homologação vai revisar e, se precisar de algum esclarecimento, responde por e-mail. Este link deixa de valer agora; pode fechar a página.');
            $('hq-estado-titulo').focus();
        } finally {
            botao.disabled = false;
        }
    }

    function iniciar() {
        if (!$('hq-main')) return;
        token = location.hash.slice(1);
        if (token) guardar(token); else token = guardado();
        // some da barra, do histórico e de qualquer cópia do endereço
        if (location.hash) history.replaceState(null, '', location.pathname + location.search);
        $('hq-salvar').addEventListener('click', () => salvar($('hq-salvar')));
        $('hq-enviar').addEventListener('click', pedirConfirmacao);
        $('hq-confirma-voltar').addEventListener('click', fecharConfirmacao);
        $('hq-confirma-enviar').addEventListener('click', () => enviar($('hq-confirma-enviar')));
        $('hq-faltam').addEventListener('click', (e) => {
            const b = e.target.closest('button[data-ir]');
            if (b) irPara(Number(b.dataset.ir));
        });
        // o % acompanha a marcação, antes de salvar
        $('hq-perguntas').addEventListener('change', () => mostrarPercentual(progressoNaTela()));
        if (!token) return estado(INVALIDO, 'Abra o endereço completo que recebeu, incluindo a parte depois do #.');
        carregar();
    }

    window.homologacaoPublica = { iniciar };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
    else iniciar();
})();
