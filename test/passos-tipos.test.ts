import { describe, it, expect } from 'vitest';
import { passoSchema, criterioSchema, campoSchema } from '../src/data/passos/tipos';

const base = {
  id: 'p3_3', fase: 3, ordem: 3, titulo: 'Justificar as exclusões de controles', clausula: 'Cl 6.1.3',
  porQue: 'O auditor confere se cada controle excluído tem justificativa aprovada.',
  campos: [{ id: 'justificativas', rotulo: 'Quais controles ficam de fora e por quê?', tipo: 'texto_longo', obrigatorio: true, exemplo: 'A.7.4: não há acesso físico ao escritório, o time é remoto.' }],
  prova: { descricao: 'Declaração de aplicabilidade com as justificativas.', obrigatoria: true, aceita: 'ambos' },
  ondeVive: [{ tela: 'soa', rotulo: 'Abrir a declaração de aplicabilidade' }],
  concluidoQuando: [
    { tipo: 'campos_preenchidos', rotulo: 'Justificativas escritas' },
    { tipo: 'evidencia_anexada', rotulo: 'Prova anexada' },
  ],
};

describe('passoSchema', () => {
  it('aceita um passo completo', () => { expect(passoSchema.safeParse(base).success).toBe(true); });
  it('recusa campo a mais (estrito)', () => { expect(passoSchema.safeParse({ ...base, extra: 1 }).success).toBe(false); });
  it('recusa id que não bate com a fase', () => { expect(passoSchema.safeParse({ ...base, fase: 4 }).success).toBe(false); });
  it('exige campos_preenchidos como primeiro critério', () => {
    expect(passoSchema.safeParse({ ...base, concluidoQuando: [base.concluidoQuando[1], base.concluidoQuando[0]] }).success).toBe(false);
  });
  it('prova obrigatória exige o critério evidencia_anexada', () => {
    expect(passoSchema.safeParse({ ...base, concluidoQuando: [base.concluidoQuando[0]] }).success).toBe(false);
  });
  it('recusa critério desconhecido e entidade fora da lista', () => {
    expect(criterioSchema.safeParse({ tipo: 'sql_livre', rotulo: 'x' }).success).toBe(false);
    expect(criterioSchema.safeParse({ tipo: 'registro_vinculado', rotulo: 'x', entidade: 'users', minimo: 1 }).success).toBe(false);
  });
  it('escolha exige opcoes e texto não pode ter', () => {
    const c = { id: 'x', rotulo: 'x', tipo: 'escolha', obrigatorio: false, exemplo: '' };
    expect(campoSchema.safeParse(c).success).toBe(false);
    expect(campoSchema.safeParse({ ...c, opcoes: ['Sim', 'Não'] }).success).toBe(true);
    expect(campoSchema.safeParse({ ...c, tipo: 'texto', opcoes: ['Sim', 'Não'] }).success).toBe(false);
  });
  it('campo de pergunta antiga aceita só chave pFASE_qN', () => {
    expect(campoSchema.safeParse({ id: 'a', rotulo: 'a', tipo: 'texto', obrigatorio: false, exemplo: '', pergunta: 'p3_q1' }).success).toBe(true);
    expect(campoSchema.safeParse({ id: 'a', rotulo: 'a', tipo: 'texto', obrigatorio: false, exemplo: '', pergunta: 'q1' }).success).toBe(false);
  });
});
