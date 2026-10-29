# Cancelamento de obras e filtros da carteira

## Regras implementadas

- Cancelar a execução cancela as 12 etapas e os documentos dos dois checklists.
- Os status anteriores são guardados por ID no payload da obra, sem alterar anexos,
  observações, responsáveis ou previsões. As datas de status registram a transição.
- Enquanto a execução estiver cancelada, os outros status ficam bloqueados.
- Reabrir a execução restaura os status anteriores dos demais itens e mantém
  o novo status escolhido para a execução. Novos ciclos criam um novo histórico.
- Uma obra sem nenhum trecho e com execução concluída passa a indicar 100%.
  A presença de trechos mantém o cálculo por extensão existente, mesmo que todos
  tenham extensão zero ou estejam cancelados.
- A Carteira de Atividades oferece filtro A/E, aplicado junto aos demais filtros.
- Os cards filtram suas respectivas etapas, inclusive Estudo e Projeto no card
  combinado. Um segundo clique retira a seleção; outro card troca a seleção.
- Os contadores acompanham todos os filtros ativos, incluindo o card selecionado.
  Por isso os outros cards podem ficar com zero. Limpar filtros também desmarca o card.
- O histórico interno de restauração não aparece nas exportações Excel.

## Atualização necessária no Supabase

Executar **supabase/011_work_cancellation.sql** no SQL Editor do projeto,
com as migrações anteriores já aplicadas (até 010). A migração é transacional e
pode ser reaplicada; não apaga registros e preserva as validações e permissões
existentes. Deve ser aplicada para permitir restaurar documentos CADASTRADO.

O novo gatilho guarda o histórico a partir dos dados persistidos, força o
cancelamento de todos os itens e restaura os status ao reabrir a execução.
Tentativas de mudar só um status durante o cancelamento são normalizadas para
CANCELADO; alterações do histórico enviadas pelo cliente são ignoradas.

A publicação no GitHub Pages atualiza somente o aplicativo: não executa esse SQL.
Sem a migração, a restauração para CADASTRADO pode ser rejeitada pelo banco.
Não foram executadas alterações no banco remoto durante o desenvolvimento.

Obras que já estavam canceladas antes desta implementação não possuem histórico
anterior garantido. O sistema preserva os status disponíveis no primeiro
processamento; não é possível reconstruir estados que já foram sobrescritos.

## Verificação

Os testes cobrem persistência e recarregamento do cancelamento, restauração por ID,
ciclos repetidos, bloqueio de edição, percentual com e sem trechos, combinação de
A/E com os cards, atualização dos contadores e limpeza dos filtros.
Um PostgreSQL local executa as migrações e verifica cascata, proteção do histórico,
restauração de CADASTRADO e manutenção da proibição de editar manualmente para
CADASTRADO fora dessa restauração. Testes não alteram o Supabase de produção.

## Compatibilidade com a versão atual dos relatórios

A main atual inclui uma página de cronograma A4 em paisagem. O teste de PDF foi
atualizado para aceitar as duas orientações. A revisão encontrou transbordamento
de observações extensas na grade de dados da obra: textos maiores que uma página
agora continuam nas páginas seguintes, preservando margens e o formato dos dados
usuais. O teste verifica que todos os 600 marcadores permanecem no documento.
