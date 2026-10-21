import { novoAutosave, campo, faixaSalvo } from './estado.js';

// Aba Escopo: finalidade, volume mensal e processamento automatizado. Sem botão Salvar: cada digitação grava sozinha (um PUT por rajada).

const PROCESSAMENTO = [
    ['', 'Selecione uma opção'],
    ['nao', 'Não, não são submetidos.'],
    ['apoio', 'Sim, como apoio à decisão humana.'],
    ['decisao', 'Sim, com decisão automatizada.'],
];

export function montar(painel, ctx) {
    const { projectId: pid, ropaId: rid, registro = {}, editavel } = ctx;
    const travado = !editavel;
    painel.innerHTML = `<div class="at-aba-corpo">
        ${faixaSalvo()}
        ${campo({ id: 'at-finalidade', rotulo: 'Finalidade', obrigatorio: true, valor: registro.processing_purpose || '', travado,
            ajuda: 'Para que a empresa usa os dados pessoais nesta atividade. Escreva em uma frase.' })}
        ${campo({ id: 'at-volume', rotulo: 'Volume mensal', valor: registro.volume_mensal || '', travado, max: 200,
            ajuda: 'Quantas pessoas, ou quantos registros, passam por esta atividade em um mês. Uma estimativa serve.' })}
        ${campo({ id: 'at-processamento', rotulo: 'Os Dados Pessoais são submetidos a processamento automatizado?', tipo: 'select', opcoes: PROCESSAMENTO,
            valor: registro.processamento_automatizado || '', travado,
            ajuda: 'Responda "Sim" se algum sistema decide sobre a pessoa sem que alguém analise caso a caso.' })}
    </div>`;
    if (!editavel) return;

    const salvo = novoAutosave({ pid, rid, status: painel.querySelector('#at-salvo') });
    const finalidade = painel.querySelector('#at-finalidade');
    const erro = painel.querySelector('#at-finalidade-erro');
    finalidade.addEventListener('input', () => {
        const v = finalidade.value.trim();
        finalidade.setAttribute('aria-invalid', v ? 'false' : 'true');
        erro.textContent = v ? '' : 'A finalidade é obrigatória';
        if (v) salvo.agendar('finalidade', v);
        else salvo.descartar('finalidade');
    });
    const volume = painel.querySelector('#at-volume');
    volume.addEventListener('input', () => salvo.agendar('volume_mensal', volume.value));
    const proc = painel.querySelector('#at-processamento');
    proc.addEventListener('change', () => salvo.agendar('processamento_automatizado', proc.value || null));
    painel.addEventListener('focusout', () => salvo.esvaziar());
    return { focar: (c) => (c === 'volume_mensal' ? (volume.focus(), true) : false) };
}
