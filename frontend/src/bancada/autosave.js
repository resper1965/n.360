// Autosave dos campos do passo: junta digitações (800 ms), repete em falha de rede (3 tentativas, 2 s), não repete conflito (409).
// `salvar(mapa)` devolve `{ salvo_em }` ou lança Error com `.status` e `.body` (`api()`, `frontend/src/api.js`, já anexa os dois ao erro).
export function criarAutosave({ salvar, aoMudar, esperaMs = 800, tentativas = 3, atrasoMs = 2000 }) {
    let pendente = {};
    let timer = null;
    let emVoo = null;

    const temPendente = () => Object.keys(pendente).length > 0;

    async function gravar() {
        timer = null;
        if (!temPendente()) return;
        const lote = pendente;
        pendente = {};
        aoMudar({ situacao: 'salvando' });
        for (let tentativa = 1; tentativa <= tentativas; tentativa++) {
            try {
                const r = await salvar(lote);
                aoMudar({ situacao: 'salvo', salvoEm: r.salvo_em });
                return;
            } catch (e) {
                if (e && e.status === 409) { pendente = { ...lote, ...pendente }; aoMudar({ situacao: 'conflito', conflitos: e.body?.conflitos || [] }); return; }
                if (tentativa === tentativas) {
                    pendente = { ...lote, ...pendente }; // nada se perde: "Tentar agora" reenvia
                    aoMudar({ situacao: 'erro', mensagem: 'Não foi possível salvar. Verifique a conexão e tente de novo.' });
                    return;
                }
                aoMudar({ situacao: 'repetindo', tentativa });
                await new Promise((ok) => setTimeout(ok, atrasoMs));
            }
        }
    }

    const disparar = () => { emVoo = gravar().finally(() => { emVoo = null; }); return emVoo; };

    return {
        agendar(campo, valor) {
            pendente[campo] = valor;
            if (timer) clearTimeout(timer);
            timer = setTimeout(disparar, esperaMs);
        },
        /** Grava agora o que estiver pendente (antes de trocar de passo). */
        async esvaziar() { if (timer) { clearTimeout(timer); timer = null; } if (emVoo) await emVoo; if (temPendente()) await disparar(); },
        tentarAgora() { return this.esvaziar(); },
        /** "Usar o dele": o campo deixa de esperar gravação. */
        descartar(campo) { delete pendente[campo]; },
        temPendente,
    };
}
