# Registro de atividade: o modo guiado, na ordem das abas

O registro de uma atividade de tratamento (RoPA) tem nove abas: Escopo, Tratamento de Dados, Agentes de Tratamento,
Medidas de Segurança, Base Jurídica, Controle de GAPs, Teste de Impacto, Riscos e Logs. A pessoa pode preencher as abas
livremente (modo direto), ou seguir o modo guiado, que faz uma pergunta por vez na mesma ordem das abas e grava no
mesmo campo da aba. Não há um segundo cadastro: as duas portas escrevem no mesmo dado.

A próxima pergunta vem do servidor, de forma determinística, e é a primeira lacuna nesta ordem:

1. Escopo: finalidade da atividade, responsável e áreas envolvidas.
2. Tratamento de Dados, Coleta: titulares, dados de cada titular, consentimento e crianças ou adolescentes,
   descrição da coleta e ativos usados.
3. Tratamento de Dados, etapas seguintes (Uso ou Processamento, Compartilhamento Interno, Compartilhamento Externo,
   Armazenamento, Eliminação): descrição, ativos, áreas ou parceiros, titulares e dados de cada etapa, local de
   armazenamento, prazo e descarte, conforme a situação de cada etapa. Cada etapa pode ser marcada como não aplicável.
4. Agentes de Tratamento: papel da organização (controlador ou operador) e transferência internacional.
5. Base Jurídica: base legal (art. 7 da LGPD, ou art. 11 para dado sensível, ou a base do GDPR quando for o caso).
6. Medidas de Segurança: pelo menos uma medida. Pode ser ligada a um controle do n.iso, quando o projeto tem o módulo.
7. Teste de Impacto: as perguntas objetivas do teste, e a marcação de finalizado.

Riscos, gaps e logs não entram no guiado: são sugeridos por fora, quando faltam. Quando não há mais lacuna, o guiado
informa que está tudo respondido.

Regras para quem orienta o cliente:
- Nenhuma pergunta é feita duas vezes: o que já foi informado em outra aba é aproveitado.
- Nomes de pessoas, dados sensíveis e transferências internacionais são de preenchimento humano; a IA só propõe.
- Catálogos (titulares, dados pessoais, ativos, áreas, parceiros, medidas e motivos de risco) começam vazios em todo
  projeto. Cada item é criado pela própria equipe, na hora em que aparece.
- Uma atividade aprovada muda o conteúdo congelado só quando alguém edita a Coleta; a aprovação anterior vale até lá.
