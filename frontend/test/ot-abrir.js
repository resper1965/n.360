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
