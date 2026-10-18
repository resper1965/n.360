import { api } from '../api.js';
import { escapeHTML } from '../ui.js';

// Catálogos do projeto e o "+" de criar na hora (spec 2026-10-16, seção 6). Nasce vazio: nada é semeado, a lista vem do servidor.
// O nome é padronizado e a duplicata é recusada no servidor (409 com `existente`); aqui também se confere antes, pelo nome que já
// está na tela, para não pedir a criação de algo que a pessoa já vê.

export const TIPOS = {
    titular: { singular: 'tipo de titular', caminho: 'catalogos/titulares' },
    dado: { singular: 'dado pessoal', caminho: 'catalogos/dados', sensivel: true },
    ativo: { singular: 'ativo', caminho: 'assets' },
    area: { singular: 'área', caminho: 'departamentos' },
    parceiro: { singular: 'parceiro', caminho: 'partes' },
};

// Cada texto diz o que a coisa é; a criação está no botão "+ Criar" do próprio modal (o catálogo do projeto começa vazio).
export const TEXTO_VAZIO = {
    titular: { titulo: 'Nenhum tipo de titular cadastrado', texto: 'Tipo de titular é a categoria de pessoa cujos dados são tratados, como Colaborador ou Cliente.' },
    dado: { titulo: 'Nenhum dado pessoal cadastrado', texto: 'Dado pessoal é uma informação sobre o titular, como nome ou CPF.' },
    ativo: { titulo: 'Nenhum ativo cadastrado', texto: 'Ativo é um sistema, arquivo ou base que guarda ou usa dados.' },
    area: { titulo: 'Nenhuma área cadastrada', texto: 'Área é um setor da empresa, como Recursos Humanos.' },
    parceiro: { titulo: 'Nenhum parceiro cadastrado', texto: 'Parceiro é uma empresa externa que recebe os dados desta atividade.' },
};

// Origem dos dados (Coleta): mesma lista de src/data/ropa-abas/origens.ts (test/atividade-catalogo.test.js confere a igualdade).
export const ORIGENS = [
    ['outra_area', 'Outra área de negócio da organização'],
    ['titular', 'Direto do Titular'],
    ['sistema', 'Aplicação ou Sistema'],
    ['terceiro', 'Outra empresa ou parceiro'],
    ['fonte_publica', 'Fonte pública'],
    ['orgao_publico', 'Órgão público ou autoridade'],
];

const CATEGORIAS_ATIVO = [['Software', 'Sistema (software, aplicativo, API)'], ['Informacao', 'Arquivo ou base de dados'], ['Hardware', 'Equipamento']];

export const chave = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');

const caminho = (pid, tipo) => `/api/v1/projects/${pid}/${TIPOS[tipo].caminho}`;
const extrair = (r) => (Array.isArray(r) ? r : (r && Array.isArray(r.assets) ? r.assets : []));

/** Lista do catálogo, já na forma comum `{ id, nome, sensivel }`. Parceiro é só organização; área inativa some. */
export async function listarItens(pid, tipo) {
    const sufixo = tipo === 'parceiro' ? '?tipo=organizacao&status=ativa' : '';
    const itens = extrair(await api('GET', caminho(pid, tipo) + sufixo));
    return itens
        .filter((x) => tipo !== 'area' || (x.status !== 'inativa' && x.status !== 'inativo'))
        .map((x) => ({ id: x.id, nome: x.nome || x.name || '', sensivel: !!x.sensivel }));
}

/** Cria um item. Devolve `{ item }`, ou `{ duplicata }` (nunca cria duas vezes). Lança o erro da API para o resto. */
export async function criarItem(pid, tipo, { nome, sensivel = false, categoria = 'Software' }, existentes = []) {
    const k = chave(nome);
    const igual = existentes.find((x) => chave(x.nome) === k);
    if (igual) return { duplicata: { id: igual.id, nome: igual.nome } };
    const corpo = tipo === 'titular' ? { nome }
        : tipo === 'dado' ? { nome, sensivel }
            : tipo === 'ativo' ? { name: nome, category: categoria }
                : tipo === 'area' ? { nome }
                    : { tipo: 'organizacao', nome };
    let r;
    try { r = await api('POST', caminho(pid, tipo), corpo); } catch (e) {
        if (e && e.status === 409) return { duplicata: (e.body && e.body.existente) || { id: null, nome } };
        throw e;
    }
    return { item: { id: r.id, nome: r.nome || r.name || nome.trim(), sensivel: tipo === 'dado' ? !!(r.sensivel ?? sensivel) : false } };
}

/**
 * Formulário "Criar <tipo>" dentro do próprio modal (sem trocar de tela). `aoCriado(item)` recebe o item novo; `aoUsar(existente)`
 * recebe a duplicata quando ela tem id. O botão "Criar" fica desabilitado até haver nome. Não usa botão primário: o primário é do modal.
 */
export function formularioDeCriacao(raiz, { pid, tipo, existentes = [], aoCriado, aoUsar, comSensivel = !!TIPOS[tipo].sensivel, rotulo = `Criar ${TIPOS[tipo].singular}` }) {
    const id = `cc-${tipo}-${Math.random().toString(36).slice(2, 8)}`;
    raiz.innerHTML = `<div class="et-criar" role="group" aria-labelledby="${id}-t">
        <h4 class="et-criar-titulo" id="${id}-t">${escapeHTML(rotulo)}</h4>
        <div class="form-group"><label class="form-label" for="${id}-nome">Nome (obrigatório)</label>
            <input class="form-input es-criar-nome" id="${id}-nome" maxlength="200" autocomplete="off"></div>
        ${tipo === 'ativo' ? `<div class="form-group"><label class="form-label" for="${id}-cat">Categoria (obrigatório)</label>
            <select class="form-input es-criar-categoria" id="${id}-cat">${CATEGORIAS_ATIVO.map(([v, r]) => `<option value="${v}">${escapeHTML(r)}</option>`).join('')}</select></div>` : ''}
        ${comSensivel ? `<label class="es-check"><input type="checkbox" class="es-criar-sensivel" id="${id}-sens"><span>Dado sensível</span></label>
            <p class="at-ajuda">Marque se o dado revela origem racial ou étnica, convicção religiosa, opinião política, filiação sindical, saúde, vida sexual, dado genético ou biométrico.</p>` : ''}
        <p class="at-erro es-criar-erro" role="alert"></p>
        <div class="et-acoes"><button type="button" class="btn btn-sm" data-es-cancelar-criar>Cancelar</button>
            <button type="button" class="btn btn-sm" data-es-confirmar disabled>Criar</button></div>
    </div>`;
    const nome = raiz.querySelector('.es-criar-nome');
    const cat = raiz.querySelector('.es-criar-categoria');
    const sens = raiz.querySelector('.es-criar-sensivel');
    const erro = raiz.querySelector('.es-criar-erro');
    const criar = raiz.querySelector('[data-es-confirmar]');
    const limparDuplicata = () => { erro.textContent = ''; raiz.querySelector('[data-es-usar]')?.parentElement.remove(); };
    const pronto = () => nome.value.trim().length > 0;
    nome.addEventListener('input', () => { criar.disabled = !pronto(); limparDuplicata(); });
    nome.focus();
    criar.addEventListener('click', async () => {
        criar.disabled = true;
        let r;
        try {
            r = await criarItem(pid, tipo, { nome: nome.value, sensivel: sens ? sens.checked : false, categoria: cat ? cat.value : undefined }, existentes);
        } catch (e) {
            erro.textContent = (e && e.message) || 'Não foi possível criar. Tente de novo.';
            criar.disabled = !pronto();
            return;
        }
        if (r.duplicata) {
            erro.textContent = `Já existe: ${r.duplicata.nome}. Usar este?`;
            if (r.duplicata.id) {
                erro.insertAdjacentHTML('afterend', '<div class="et-acoes"><button type="button" class="btn btn-sm" data-es-usar>Usar este</button></div>');
                raiz.querySelector('[data-es-usar]').addEventListener('click', () => aoUsar(r.duplicata));
            }
            criar.disabled = !pronto();
            return;
        }
        aoCriado(r.item);
    });
    raiz.querySelector('[data-es-cancelar-criar]').addEventListener('click', () => { raiz.innerHTML = ''; });
}
