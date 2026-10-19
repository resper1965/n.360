import './style.css';
import { S } from './state.js';
import { api } from './api.js';
import './ui.js';
import { navigate } from './router.js';
import { initDelegation } from './delegation.js';
import { aplicarCasca } from './produto.js';
import './data/assessment.js';

import './views/commercial.js';
import './views/project.js';
import './views/bancada.js';
import './views/empresa.js';
import './views/grc.js';
import './views/partes.js';
import './views/padronizar-nomes.js';
import './views/documentos.js';
import './views/requisitos.js';
import './views/terceiros.js';
import './views/catalogos.js';
import './views/mapa-de-risco.js';
import './views/titular.js';
import './views/encarregado.js';
import './views/importacao.js';
import './views/ponto-de-partida.js';
import './views/painel.js';
import './views/tratamento-ligacoes.js';
import './views/compliance.js';
import './views/monitor.js';
import './views/prontidao.js';

// View Modules
import './views/dashboard.js';
import './views/admin.js';
import './views/conectar-agente.js';
import './views/seguranca-projeto.js';
import './views/catalogo.js';
import './views/config-comercial.js';
import './views/organizacoes.js';
import './views/propostas.js';
import './views/trocar-senha.js';
import './views/meus-pedidos.js';
import './views/aprovacao-lote.js';
import './views/ai.js';
import './views/privacy.js';
import './views/security.js';

// The rest of the app code will be migrated in subsequent phases
// For now, import remaining inline code below
console.log('[nISO] Modules loaded:', { S, api, navigate });
import './globals.js';

// S2: delegação de eventos (substitui onclick inline, view a view). Um listener
// no document cobre todo conteúdo renderizado.
initDelegation();

// n.360, n.iso ou n.privacy, pelo caminho: marca, título e menu antes do primeiro desenho.
aplicarCasca();
