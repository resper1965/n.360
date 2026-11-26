// Ajudante dos testes das telas do n.ot: monta uma tela reaproveitada direto (sem o recorte por site da tela do site), pelo nome da antiga aba.
import { S } from '../src/state.js';
import { montarInventario, montarFluxos, montarAcessos } from '../src/views/ot.js';
import { montarColeta } from '../src/views/ot-coleta.js';
import { montarLevantamento } from '../src/views/ot-levantamento.js';
import { montarDesvios } from '../src/views/ot-desvios.js';
import { montarSaidas } from '../src/views/ot-saidas.js';

const TELAS = { inventario: montarInventario, fluxos: montarFluxos, coleta: montarColeta, levantamento: montarLevantamento, desvios: montarDesvios, saidas: montarSaidas, acessos: montarAcessos };
let atual = 'inventario';
const el = (id) => document.getElementById(id);

/** Desenha a tela `aba` em #c/#a, no projeto ativo; lembra qual para chamadas sem argumento. */
export const desenhar = (aba = atual) => { atual = aba; el('a').innerHTML = ''; return TELAS[aba](el('c'), el('a'), S.activeProject); };

/** A resposta de GET /ot/permissoes (src/services/ot-permissoes.ts) por papel, para os testes que escolhem o papel por `S.user.role`.
 *  consultoria_admin entra como designado (aprova lote, não é Gestor); o Gestor é o org_admin do projeto. */
export function permissoesDoPapel(role) {
    const editar = ['org_admin', 'consultor', 'consultant', 'consultoria_admin', 'platform_admin'].includes(role);
    const completo = ['org_admin', 'consultor', 'consultant', 'consultoria_admin'].includes(role);
    return { editar, criar_lote: editar || role === 'org_user', aprovar_lote: completo, ver_sondas: completo, gestor: role === 'org_admin',
        leitor: role === 'client', tecnico: role === 'org_user', acao_corretiva: editar, tela_inicial: 'painel' };
}

/** No arquivo de teste: `S.otPermissoes` segue `S.user.role` (como o servidor responderia) até o teste gravar um valor; gravar null volta a seguir. */
export function permissoesPeloPapel() {
    let proprio;
    Object.defineProperty(S, 'otPermissoes', { configurable: true,
        get: () => (proprio !== undefined ? proprio : { projeto: S.activeProject?.id, usuario: S.user?.id ?? null, ...permissoesDoPapel(S.user?.role) }),
        set: (v) => { proprio = v ?? undefined; } });
}
