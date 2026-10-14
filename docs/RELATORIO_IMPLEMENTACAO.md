# Relatório de implementação — 14/10/2026

## Base e escopo

Implementação sobre `engenhariaaltotiete-create/gestao_de_obras`, HEAD original `87ec4391ff18ada66a8edfd73f69c9de28396744`, conforme o prompt anexado. Foi fornecido texto, sem ZIP de código separado; a base usada foi o repositório selecionado nesta conversa. Não foi criado um novo sistema nem executado push ou alteração remota de banco.

React, TypeScript, Vite, Leaflet, a fila IndexedDB, os blocos de edição, o modelo de relatórios, o catálogo de orçamento e as integrações existentes foram preservados. Arquivos alterados receberam formatação consistente para facilitar manutenção.

## Resultado por requisito

| Área | Implementação e validação |
| --- | --- |
| Cards Obras/Dashboard | Fundo azul uniforme, títulos pretos em negrito, ícones SVG, seleção discreta que mantém a cor e filtragem funcional. |
| Status geral | Removidos cálculo `workStatus` e rótulo Status geral. Indicadores, situação da execução e filtros de cards usam a etapa Execução de Obra, independentemente das demais etapas. Não foi adicionado filtro Status da Execução. |
| Solicitante | Pesquisa e seleção múltipla nas três telas, opções dos cadastros sem duplicidade de caixa/acentos/espaços, OR entre solicitantes e AND com outras dimensões. Etapa, Status e filtros anteriores preservados. |
| Etapas | 12 etapas na ordem solicitada, com LIG/PNG após Execução e Instalação de Equipamento após Testes. Lista centralizada em `model.ts`. IDs, anexos e valores antigos preservados por correspondência de nomes. |
| Checklists/Carteira | Reconhecimento dos checklists por nome, sem depender dos antigos índices; atividades LIG/PNG e Instalação de Equipamento incluídas. Critérios de pendência preservados. |
| Gantt geral | 11 colunas na ordem solicitada, percentual por extensão em barra de progresso, status direto da execução, barras separadas por etapa (execução azul, demais cinza). |
| Gantt individual | Cinco colunas solicitadas, 12 etapas e documentos expansíveis. Cabeçalho com dados em duas colunas, informações relevantes nas duas colunas e três cards separados. |
| Escala temporal | Meses abreviados, segundas-feiras proporcionais e linha vermelha HOJE, apresentada apenas dentro do intervalo; atualizada a cada minuto. |
| Previsões | Semanas divididas por dia nas fronteiras mensais, sem duplicar totais, subtotais mensais e total geral. Regras de distribuição anteriores preservadas. Orçamento mensal em MM/AAAA. |
| Croqui | Lista compacta, seleção pelo mapa/lista/etiqueta, modal com salvar/cancelar/excluir, confirmação de exclusão. Alterações permanecem no rascunho até Confirmar alterações no bloco. Consulta apenas destaca. |
| Toque | Camada de seleção de 28px sem aumentar o traço visual, escolha entre trechos próximos, vértices arrastáveis na ferramenta de edição. Mapa prioriza rolagem em dispositivos de toque; navegação e desenho habilitam os gestos explicitamente. |
| Etiquetas | Nome acima e extensão abaixo, rotação mantida legível, contorno branco, sem caixas, posição recalculada com geometria/zoom/movimento, supressão de colisões e controle de visibilidade. O modelo existente representa cada trecho como um par de vértices; polilinhas usam vários desses trechos. |
| Responsividade | Validação em 360, 390, 768, 1024 e 1440px. Cronogramas mantêm todas as informações; em telas estreitas, os registros se reorganizam em grade sem rolagem horizontal do Gantt. Bairro/município lado a lado no modal, status e extensão em linhas distintas. Botões com mínimo de 44px e ações separadas. |
| Usuários | Fluxo existente preservado: convite por administrador, edição de nome/perfil/ativação, responsáveis ligados aos perfis. Cancelamento de edição e mensagens de erro do backend melhorados. RPC administrativo protegido, validação de ator e preservação de administrador ativo sob lock transacional. Convites auditados com o administrador verificado. |
| Cadastro público | Desativado em `supabase/config.toml`; a mesma configuração precisa ser aplicada ao Auth hospedado. Não há cadastro público na interface. |
| Auditoria | Diff recursivo por campo e IDs das entidades. Uma ocorrência por salvamento de edição, com mapas anterior/novo contendo somente mudanças. Nenhuma ocorrência para payload/perfil/arquivo sem mudança. Criação e exclusão preservadas; geometria, etapas, orçamentos, checklists e relatórios abrangidos. Backend grava autoria; usuários comuns não têm escrita na trilha. |
| Relatórios Padrão | Link externo no menu lateral, SVG, nova aba e `noopener noreferrer`. Sem integração de dados adicional. |
| Relatórios fotográficos | Fluxo preservado e testado localmente: cadastro de rascunho, imagem armazenada e PDF gerado/baixado. Conclusão e armazenamento remoto exigem validação no projeto Supabase/Drive configurado. |

## Banco e compatibilidade

Nova migração `supabase/007_stages_and_grouped_audit.sql`, transacional e sem exclusão de dados:

- Validação de 12 etapas e de sua ordem.
- Função de comparação JSONB por caminhos, com arrays de entidades identificadas por ID.
- Auditoria agrupada de obras, perfis e arquivos.
- Reforço da proteção administrativa no RPC e registro do convite através de RPC restrito a `service_role`.

O aplicativo normaliza leituras locais/remotas, cache offline, versões aceitas em conflitos e rascunhos recuperados. Obras antigas são persistidas no formato de 12 etapas no primeiro salvamento; não há regravação automática em massa. A aplicação nova requer a migração 007 no servidor antes de salvar. A função `admin-users` deve ser reimplantada junto da migração.

## Arquivos

Criados:

- `.env.example`, `playwright.config.mjs`.
- `src/domains/audit.ts`, `src/domains/timeline.ts`.
- `supabase/007_stages_and_grouped_audit.sql`.
- `tests/run.mjs`, `tests/database.mjs`, `tests/e2e/workflow.spec.mjs`, `tests/e2e/pwa.spec.mjs`.
- `docs/IMPLANTACAO.md`, `docs/RELATORIO_IMPLEMENTACAO.md`.

Modificados:

- `src/App.tsx`, `src/MapEditor.tsx`, `src/model.ts`, `src/data.ts`, `src/sync.ts`, `src/style.css`.
- `src/domains/EditableBlock.tsx`, `ItemTable.tsx`, `Schedule.tsx`, `UserAdmin.tsx`, `planning.ts`.
- `supabase/000_preflight.sql`, `supabase/config.toml`, `supabase/functions/admin-users/index.ts`.
- `scripts/service-worker.mjs`, corrigindo o cache dos assets estáticos que recebiam `Vary: Origin` no servidor de preview. A reabertura offline passou a carregar JavaScript e CSS do cache específico do app shell.
- `BANCO_DE_TESTE.md`, corrigindo as referências a arquivos ausentes e a ordem de instalação.

Dependências e a rotina existente de publicação foram preservadas. Nenhuma chave privada, senha ou chave administrativa foi acrescentada.

## Validação

Ambiente: Node 24.19.0, npm 11.9.0 e Chromium. Resultados e limites:

- `npm run typecheck`: aprovado.
- `npm run build`: aprovado, incluindo service worker. Permanece aviso de bundles acima de 500 kB; não impede compilação.
- `npm test`: 8 testes aprovados, nenhum ignorado. Inclui aplicação das migrações em PostgreSQL local (PGlite), RLS, revisão/conflito, auditoria de obras/perfis/arquivos, convite auditado e bloqueio de inativos.
- `npm run test:e2e`: 15 testes aprovados, nenhum ignorado. Cobrem filtros, cards, cadastro, orçamento, LIG/PNG, checklists, cronogramas, edição/cancelamento/exclusão, persistência local, imagem/PDF, link externo, layout nas cinco larguras e reabertura offline da versão de produção.
- `deno check --no-remote --node-modules-dir=manual` nas duas Edge Functions: aprovado.
- Testes de toque Android/iPhone foram emulados em Chromium, sem aparelhos físicos ou Safari/iOS real. Recursos externos de tiles/geocodificação foram bloqueados intencionalmente nos testes para que a validação da geometria fosse independente da rede.

## Pendências externas

Não há projeto Supabase de teste, usuário remoto nem credenciais Google configurados nesta sessão. Portanto **autenticação real, convites por e-mail, sincronização remota e upload/download/exclusão no Drive não foram testados ponta a ponta**. Os testes SQL locais não simulam Supabase Auth, gateway JWT, envio de e-mail ou Google OAuth.

Antes da publicação, aplicar a migração correta, reimplantar `admin-users`/`drive-files`, configurar Auth, variáveis públicas e secrets do backend e executar os testes remotos de [IMPLANTACAO.md](IMPLANTACAO.md). Não foram executadas operações destrutivas remotas. Verificar também mapas/geocodificação com acesso real aos serviços públicos.

A exclusão online de obras e as restrições de FK de arquivos já existentes permanecem. Não foi criada uma fila offline para exclusão de obras, nem uma integração de dados com Relatórios Padrão, que não fazem parte das alterações solicitadas.

As instruções de inicialização `start_skill` do ambiente cloud foram atualizadas no rascunho para refletir os testes e documentos atuais. O rascunho precisa ser revisado/salvo nas configurações e o ambiente publicado para ativar a versão reutilizável; isso é separado da publicação do aplicativo no GitHub Pages.
