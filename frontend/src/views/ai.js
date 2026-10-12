import { S } from '../state.js';
import { api } from '../api.js';
import { escapeHTML } from '../ui.js';
import { produtoAtual } from '../produto.js';

    // Convite e exemplo do campo por produto: no n.privacy nada de ISO.
    const COPIA = {
        privacy: ['Pergunte sobre LGPD, bases legais, prazos do titular ou comunicação de incidente.', 'Ex.: qual base legal cabe para o envio de newsletter?'],
        iso: ['Faça uma pergunta sobre ISO 27001, controles, preparação para auditoria ou conformidade.', 'Ex.: que evidência atende o controle A.5.15?'],
        n360: ['Faça uma pergunta sobre o projeto: conformidade, controles ou privacidade.', 'Pergunte sobre o projeto...'],
    };

    async function renderAIChat(c, h, a) {
        h.textContent = 'Assistente';
        const proj = S.activeProject || S.projects[0];
        if (!proj) { c.innerHTML = '<div class="empty-state fade-in"><h3>Sem projeto ativo</h3><p>Selecione um projeto para continuar.</p><button class="btn btn-primary" data-action="openActiveProjectModal" style="margin-top:1rem">Selecionar Projeto</button></div>'; return; }
        // ponytail: a conversa vive só nesta tela. O servidor não guarda histórico (nada grava
        // ai_chat_history; GET/DELETE /chat/history nunca existiram). Guardar conversa é decisão
        // de produto, com retenção LGPD, não correção. O aviso abaixo do campo diz isso ao usuário.
        a.innerHTML = '';
        const [convite, exemplo] = COPIA[produtoAtual()] || COPIA.n360;
        c.innerHTML = `<div class="fade-in" style="display:flex;flex-direction:column;height:calc(100vh - 180px)">
            <div id="chat-messages" style="flex:1;overflow-y:auto;padding:1rem 0;display:flex;flex-direction:column;gap:0.75rem">
                <div style="text-align:center;color:var(--text-dim);padding:3rem 0;font-size:0.85rem">${convite}</div>
            </div>
            <div style="display:flex;gap:0.5rem;padding-top:1rem;border-top:1px solid var(--border)">
                <input class="form-input" id="chat-input" aria-label="Pergunta ao assistente" placeholder="${exemplo}" style="flex:1" data-action-keydown="sendChatMessage" data-args='["${proj.id}"]' data-key="Enter">
                <button class="btn btn-primary" data-action="sendChatMessage" data-args='["${proj.id}"]'>Enviar</button>
            </div>
            <p style="margin:0.5rem 0 0;font-size:12px;color:var(--text-dim)">A resposta é sugestão, não parecer jurídico. A conversa não fica salva.</p>
        </div>`;
        const msgs = document.getElementById('chat-messages');
        if (msgs) msgs.scrollTop = msgs.scrollHeight;
    }

    async function sendChatMessage(projectId) {
        const input = document.getElementById('chat-input');
        const message = input.value.trim();
        if (!message) return;
        input.value = '';
        // Add user message to UI immediately
        const msgs = document.getElementById('chat-messages');
        msgs.innerHTML += `<div style="align-self:flex-end;max-width:80%;padding:0.75rem 1rem;border-radius:0;background:rgba(0,173,232,0.15);border:1px solid rgba(0,173,232,0.2);font-size:0.8rem;line-height:1.6">${escapeHTML(message)}</div>`;
        msgs.innerHTML += `<div id="chat-loading" style="align-self:flex-start;max-width:80%;padding:0.75rem 1rem;border-radius:0;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);font-size:0.8rem;color:var(--muted)">Pensando...</div>`;
        msgs.scrollTop = msgs.scrollHeight;
        try {
            const produto = produtoAtual(); // n.360: sem módulo, o servidor escolhe o que o projeto e a pessoa têm
            const res = await api('POST', `/api/v1/projects/${projectId}/chat`, { message, ...(produto === 'n360' ? {} : { modulo: produto }) });
            const loading = document.getElementById('chat-loading');
            if (loading) { loading.id = ''; loading.style.color = 'var(--text)'; loading.textContent = res.reply || 'Sem resposta.'; }
            msgs.scrollTop = msgs.scrollHeight;
        } catch(e) {
            const loading = document.getElementById('chat-loading');
            if (loading) { loading.textContent = 'Erro: ' + e.message; loading.style.color = 'var(--danger)'; }
        }
    }

export { renderAIChat };
window.renderAIChat = renderAIChat;
window.sendChatMessage = sendChatMessage;
