# Revisão de segurança e estabilidade

Revisão baseada na `main` 7890bec, preservando as alterações recentes do usuário no mapa, programação e layout. Foram feitas correções de lógica, validação, concorrência e dependências. Não foram alterados CSS, estrutura das telas, modelos visuais dos relatórios ou os fluxos válidos de uso.

## Achados e correções

| Área | Evidência | Correção |
|---|---|---|
| Dependências | jsPDF 3.0.4 com avisos conhecidos de severidade até crítica no npm audit | Atualizado para 4.2.1, versão exata. Auditoria após atualização: zero alertas conhecidos, incluindo dependências de desenvolvimento. A presença de um aviso na biblioteca não demonstra que todos os caminhos vulneráveis eram usados pelo aplicativo |
| Sessões e cache | Testes com a versão anterior reproduziram retorno de obras da sessão anterior e gravação de resposta de conflito no cache de outro usuário | Operações vinculadas à versão da sessão, descarte de leituras antigas e recusa de escritas/respostas após troca de usuário. Downloads também conferem a sessão antes de entregar o binário |
| Perfil offline | JSON inválido no cache podia interromper a verificação; identidade do perfil cacheado não era comparada à sessão | JSON inválido retorna perfil indisponível; o ID deve coincidir com o usuário da sessão |
| Uploads do Drive | IDs procurados por substring em JSON podiam ser aceitos em observações em vez de referência de arquivo | Validação de campos estruturados, ID exato de anexo/foto, UUID e tipo de operação. PDFs gerados continuam permitidos para entidades de relatório |
| Concorrência no Drive | Upsert podia sobrescrever vínculo/dono de um ID reservado simultaneamente | Reserva com `ignoreDuplicates`, seguida de leitura e verificação de dono, obra e entidade antes do upload |
| Downloads | Conteúdo arbitrário era devolvido somente com o MIME informado pelo arquivo | `Content-Disposition: attachment` e `X-Content-Type-Options: nosniff`, preservando os bytes |
| Integridade da obra | O RPC aceitava p_id diferente de payload.id; isso foi reproduzido em PostgreSQL local | Migração 010 bloqueia gravações com identidade divergente e alterações do ID primário. Não regrava dados existentes e pode ser reaplicada |
| Indicadores dos dashboards | Busca em endereço/município no Gantt podia divergir da busca em outros campos usada nos totais | Mesmo critério de busca para os indicadores e a tabela, mantendo a pesquisa ampla na lista |

A revisão não demonstrou execução de scripts pelos nomes dos trechos: os rótulos usam `textContent` e os demais textos de tela são renderizados por React. As proteções existentes de autenticação, usuário ativo, administrador, controle de revisão, RLS e auditoria foram mantidas e testadas localmente. A revisão de segredos nos arquivos de aplicação não encontrou os padrões procurados de chaves privadas/tokens administrativos; os valores reais dos secrets não foram lidos nem copiados.

## Verificações

No conteúdo isolado destinado ao GitHub:

- `npm test`: 19 testes de regras, banco, OAuth, vínculo de arquivos, croquis e integridade.
- `npm run test:security`: 6 testes do handler real do Drive com banco, autorização e transporte simulados, sem rede externa ou credenciais reais.
- `VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= npm run test:e2e`: 30 testes de navegador, incluindo os fluxos completos de cadastro, edição, exclusão, filtros, croquis, seleção parcial, relatórios/PDF, PWA/offline, dispositivos móveis e isolamento de sessão.
- `npm run typecheck` e build de produção.
- Deno check dos módulos das Edge Functions e da versão para o editor.
- `npm audit`: zero alertas conhecidos no momento da verificação. O projeto continua sem lockfile; jsPDF está fixado em 4.2.1, mas as demais faixas de dependências existentes podem resolver versões diferentes em instalações futuras.
- Igualdade dos nós JSX dos componentes de Diagnósticos e Topografias com a versão mais recente da main, e ausência de alterações novas no CSS. A atualização do PDF foi validada por geração/download de documento no teste de navegador; não foi feita comparação visual pixel a pixel de todo relatório possível.

Os testes de cache e integridade foram reproduzidos antes da correção usando dados fictícios em ambientes locais. As falhas anteriores das suítes causadas por mudanças de seletor/navegação no GitHub foram investigadas e os testes atualizados; nenhuma asserção de segurança foi desabilitada para obter aprovação.

## Aplicação no Supabase

Publicar o frontend pelo GitHub não aplica SQL nem implanta Edge Functions. Estas ações permanecem separadas:

1. No projeto Supabase usado pelo sistema, abra SQL Editor e execute todo `supabase/010_work_identity.sql`. Não reaplique 001–009. O script somente instala uma validação em novas gravações, em transação; não apaga nem corrige automaticamente registros antigos.
2. Em Edge Functions → drive-files → Code, substitua todo o index.ts pelo conteúdo de `supabase/deploy/drive-files-editor.ts`, gerado a partir dos módulos atuais, e publique mantendo a verificação JWT. Não cole TypeScript no SQL Editor.
3. Preserve os secrets já configurados: APP_ORIGIN, APP_URL, GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_REFRESH_TOKEN e GOOGLE_DRIVE_ROOT_FOLDER_ID. As variáveis SUPABASE_* são fornecidas pelo serviço. Não envie valores pelo chat e não use service_role no frontend.
4. Com administrador, envie um arquivo descartável, confira uploaded/drive_id, baixe em outra sessão e verifique o conteúdo. Confira também que um usuário comum não consegue excluir arquivos e que os convites reais continuam funcionando.

Para implantação via CLI, use `supabase functions deploy drive-files --project-ref zxcbpqsmorcxlcgpumrg`, com autenticação administrativa disponível no seu ambiente. A versão para o editor pode ser regenerada com `node scripts/build-edge-editor.mjs` e não contém credenciais.

Nesta sessão, apenas URL/chave pública do frontend estão disponíveis para o Supabase; não há acesso administrativo para aplicar SQL ou implantar funções hospedadas. Essas ações não foram executadas. Não foram enviados convites nem alterados arquivos/dados reais para testar vulnerabilidades. A revisão cobre o código e os cenários executados; as configurações efetivas de SMTP, Google OAuth, credenciais, perfis e logs do serviço hospedado não foram auditadas administrativamente.
