# Assessment da RO-CB.BR.01 no n.ot

## O que é

A tela **Assessment RO-CB.BR.01** (menu do n.ot, seção Organização) reúne a situação de cada item da norma no projeto. Há dois tipos de item:

| Tipo | De onde vem | Quem mexe |
|---|---|---|
| **Técnico** | Calculado do inventário, por site; a organização fica com o pior caso dos sites em operação, em obra ou com base em aprovação | Ninguém edita: corrija o inventário do site (botão **Abrir site**) |
| **Política** | Autoavaliação do cliente | A equipe avalia; o **Gestor ARCiber** confirma |

O item 5.1.1 (tratamento de exceções) fica fora deste ciclo e aparece como "Não avaliado".

## Avaliar um item de política

1. Em **Assessment**, clique em **Abrir** no item.
2. Escolha a **Situação**: Atende, Parcial, Não atende ou Não se aplica.
3. Escreva a **Justificativa**. Ela é obrigatória, salvo em "Atende". Não cite IP, MAC nem nome de ativo: o texto vai para o relatório.
4. Se quiser, escolha o **Responsável** e a **Próxima revisão**.
5. Clique em **Gravar**. O item passa a mostrar **A confirmar**.

Editar um item já confirmado tira a confirmação: o Gestor precisa confirmar de novo.

Abaixo do formulário, **Subsídio do levantamento** mostra as respostas do roteiro dos levantamentos ligadas ao item, com o link **Ver levantamento**.

## Ligar evidências

No mesmo item, em **Evidências**, escolha o arquivo e clique em **Anexar arquivo**. O arquivo entra nas evidências do projeto e fica ligado ao item. **Remover** só desliga o arquivo do item; ele continua no projeto.

Uma evidência com validade vencida, ou uma próxima revisão que já passou, marca o item como **Revisar**.

## Confirmar (Gestor ARCiber)

1. Marque **Só o que espera por mim**: aparecem os itens avaliados e ainda não confirmados. O Início também os lista.
2. Abra o item, leia a avaliação e as evidências e clique em **Confirmar**.
3. A tela registra quem confirmou e quando. A próxima revisão passa a ser daqui a 12 meses.

Só o Gestor ARCiber do projeto confirma; o servidor confere de novo.

## Gerar o relatório de conformidade

1. Abra **Relatórios** no menu do n.ot.
2. Clique em **Relatório de conformidade**.
3. Clique em **Imprimir / Salvar PDF** e escolha a impressora ou "Salvar como PDF".

O relatório traz os sites e a fase de cada um e, por item, a situação, o prazo ONS, a justificativa ou o resumo do inventário, as evidências, o responsável, quem confirmou e a próxima revisão. Ele **nunca traz IP, MAC nem nome de ativo**: o servidor mascara o texto livre. Cada geração fica registrada na trilha de auditoria.
