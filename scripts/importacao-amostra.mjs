// Gera arquivos FICTÍCIOS para testar "Importar programa" contra um ambiente com a IA real.
// Fora do CI e do vitest (fica em scripts/, sem sufixo .test). Não faz chamada de rede.
// Uso: node scripts/importacao-amostra.mjs
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'importacao-amostra-'));

writeFileSync(join(dir, 'inventario-ficticio.csv'), [
  'Processo,Finalidade,Base legal,Dados tratados,Titulares,Retenção,Sistema,Área,Responsável',
  'Folha,Pagar salários da Empresa Exemplo,Execução de contrato,nome; CPF; conta bancária,Colaboradores,5 anos,Sistema Folha Exemplo,Pessoas,Maria Exemplo',
  'Recrutamento,Selecionar candidatos,Consentimento,nome; e-mail; currículo,Candidatos,6 meses,Portal Vagas Exemplo,Pessoas,João Exemplo',
  'Atendimento,Responder dúvidas de clientes,Legítimo interesse,nome; e-mail; telefone,Clientes,2 anos,CRM Exemplo,Atendimento,Ana Exemplo',
].join('\n') + '\n');

writeFileSync(join(dir, 'mapeamento-ficticio.html'), `<!doctype html><html><body>
<h1>Mapeamento de dados - Empresa Exemplo (fictício)</h1>
<table>
<tr><th>Atividade</th><th>Finalidade</th><th>Base legal</th><th>Dados</th><th>Titulares</th><th>Retenção</th><th>Sistema</th></tr>
<tr><td>Controle de acesso</td><td>Registrar entrada de visitantes</td><td>Legítimo interesse</td><td>nome; documento; foto</td><td>Visitantes</td><td>90 dias</td><td>Portaria Exemplo</td></tr>
<tr><td>Marketing</td><td>Enviar newsletter</td><td>Consentimento</td><td>nome; e-mail</td><td>Assinantes</td><td>até revogação</td><td>Mailer Exemplo</td></tr>
</table></body></html>
`);

console.log(`Arquivos fictícios gravados em: ${dir}
  inventario-ficticio.csv   (esperado: classificado como inventário, 3 tratamentos)
  mapeamento-ficticio.html  (esperado: classificado como inventário, 2 tratamentos)

Como usar (ambiente com Workers AI real, projeto com o n.privacy habilitado, usuário da equipe da consultoria):
  1. n.privacy > Importar programa > Novo lote.
  2. Envie os dois arquivos e processe cada um.
  3. Confira os itens propostos, aceite e confirme; os tratamentos aparecem no ROPA.
  4. Cancele o lote ou apague os registros de teste ao final.
Nada aqui roda no CI: o teste automático usa IA simulada.

Migração do sistema anterior sem IA: os modelos de CSV fictícios estão em docs/modelos-importacao/ (ver docs/runbook-migracao-legado.md).`);
