# Implantação e validação

## Desenvolvimento

O código desta entrega corresponde ao checkout `engenhariaaltotiete-create/gestao_de_obras`, base `87ec4391ff18ada66a8edfd73f69c9de28396744`. Foi recebido um prompt em texto; não foi recebido um ZIP de código separado para substituir essa base.

Ambiente validado: Node 24.19.0, npm 11.9.0, Chromium local. A rotina de publicação existente usa Node 22. Não existe lockfile versionado; instalações futuras podem resolver versões compatíveis mais recentes.

```sh
cd gestao_de_obras
npm install --package-lock=false --no-audit --no-fund
npm run typecheck
npm test
npm run build
npm run test:e2e
npm run dev -- --port 5173 --strictPort
```

Os testes E2E iniciam Vite na porta 5173 e uma versão de produção na porta 4173. Se você já estiver executando um preview, rode `npm run build` antes dos testes para que ele sirva a versão atual.

Os testes de navegador usam Chromium disponível em `/usr/bin/chromium` ou `PLAYWRIGHT_CHROMIUM_EXECUTABLE`. Em outras máquinas, instale o navegador do Playwright com `npx playwright install chromium`; quando não há Chromium do sistema, a configuração usa o navegador instalado pelo Playwright. Linux pode precisar das dependências do navegador (`npx playwright install --with-deps chromium`).

Sem variáveis Supabase, entre em demonstração com qualquer e-mail válido. Obras ficam no armazenamento do navegador. Este modo não confirma conectividade remota.

## Supabase

Use um projeto de teste. Para a ordem dos scripts, consulte [BANCO_DE_TESTE.md](../BANCO_DE_TESTE.md). A migração 007 é transacional e não remove tabelas nem registros. Não execute scripts de limpeza ou migrações incompatíveis em um banco remoto sem revisar o destino.

Configure somente os dois valores públicos no frontend, usando `.env.local` ou variáveis do ambiente:

```dotenv
VITE_SUPABASE_URL=https://SEU_PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=CHAVE_PUBLICA_DO_PROJETO
```

Configure Auth: cadastro público desativado, Site URL do aplicativo e Redirect URLs para convites e recuperação de senha. Crie o primeiro administrador pelo painel, usando o procedimento do banco de teste. Outros usuários são convidados pela tela Usuários. E-mail é apresentado como somente leitura na edição de perfis; nome, perfil e situação são editáveis, mantendo o fluxo existente.

Instale e autentique o Supabase CLI na sua máquina conforme a documentação oficial. Use secrets do Supabase para o backend, não arquivos versionados. Com o projeto vinculado:

```sh
supabase functions deploy admin-users --project-ref SEU_PROJECT_REF
supabase functions deploy drive-files --project-ref SEU_PROJECT_REF
```

Preserve a verificação JWT. As funções também validam sessão e perfil ativo; `admin-users` exige administrador. O Supabase fornece `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` às funções. A chave administrativa não deve aparecer em variáveis `VITE_`.

Configure os secrets `APP_ORIGIN` e `APP_URL`. Exemplos para a publicação atual:

- `APP_ORIGIN`: `https://engenhariaaltotiete-create.github.io` (sem caminho).
- `APP_URL`: `https://engenhariaaltotiete-create.github.io/gestao_de_obras/` (URL completa para os convites).

Para desenvolvimento, a origem deve coincidir exatamente com a usada pelo navegador, incluindo a porta. `http://localhost:5173` e `http://127.0.0.1:5173` são origens distintas. O código atual aceita uma origem por implantação; use projeto de teste separado quando necessário.

### Teste funcional do Supabase

1. Reinicie o aplicativo após configurar as variáveis. O botão passa de “Entrar em demonstração” para “Entrar”.
2. Entre com o administrador de teste e cadastre uma obra com campos obrigatórios e pavimento.
3. Aguarde dados pendentes chegar a zero. Confira o registro e o JSONB em `obras` no painel.
4. Edite a etapa LIG/PNG: status, responsável, datas e observação. Confirme as alterações.
5. Em outro navegador/dispositivo, entre novamente e confirme os dados da obra e as 12 etapas na ordem correta. Verifique o cronograma.
6. Edite dois campos em um salvamento. Em `audit_log`, confirme uma ocorrência UPDATE, contendo somente os caminhos alterados em `old_value`/`new_value`, com autor e data. Salvar sem alteração de payload não deve criar auditoria de edição.
7. Convide um usuário comum, teste nome/perfil/ativação e confira a auditoria administrativa. Usuário comum não pode chamar `admin-users`, escrever em perfis nem alterar/excluir auditoria. Um inativo não pode acessar dados operacionais, mesmo com uma sessão anterior. Confira a recusa do backend, não apenas a interface.
8. Teste edição concorrente em dois navegadores: a segunda gravação de uma revisão antiga deve gerar conflito e exigir resolução, preservando a versão local.

No ambiente cloud, autorize o hostname exato do projeto Supabase caso a política de rede recuse acesso. Não substitua a lista de destinos existente. Nunca envie tokens de sessão, senhas ou chaves privadas pelo chat.

## Google Drive

Fluxo: navegador → Edge Function `drive-files` no Supabase → Google OAuth/Drive. O frontend não usa a chave privada Google.

1. Ative Google Drive API no projeto Google Cloud e crie uma conta de serviço.
2. Use uma pasta de teste em um **Drive compartilhado**, dando à conta de serviço permissão para criar arquivos e subpastas. Contas de serviço não possuem quota de armazenamento própria em Meu Drive.
3. Nos secrets da função, configure `GOOGLE_SERVICE_ACCOUNT_JSON` com o JSON da conta de serviço e `GOOGLE_DRIVE_ROOT_FOLDER_ID` com o ID da pasta raiz. Use o painel seguro; não versionar o arquivo de chave ou incluí-lo na entrega.
4. Configure `APP_ORIGIN` e implante `drive-files` conforme descrito acima. A função precisa alcançar `oauth2.googleapis.com` e `www.googleapis.com` a partir do servidor Supabase. Na cloud do desenvolvimento, o aplicativo precisa alcançar o projeto Supabase; não é necessário colocar a chave privada Google no ambiente do frontend.

### Teste funcional do Drive

1. Em uma obra já sincronizada, anexe um arquivo pequeno e descartável a uma etapa ou documento.
2. Aguarde confirmação. Confira o arquivo no Drive e seu registro em `drive_files`: `status = uploaded`, `drive_id` preenchido e vínculo correto à obra/entidade.
3. Baixe pelo aplicativo em outro navegador, garantindo que não está lendo apenas a cópia local. Compare nome e conteúdo.
4. Teste um relatório fotográfico: inclua imagem, salve rascunho, disponibilize PDF e conclua somente após confirmação dos arquivos remotos. Verifique o PDF baixado.
5. Para verificar exclusão, use somente arquivo de teste e confirme permissões, resultado remoto e auditoria. Não exclua uma obra com anexos reais para testar conectividade.

### Diagnóstico

| Sintoma | Conferir |
| --- | --- |
| 401 | Sessão, JWT e implantação da função |
| 403 | Perfil ativo, papel, obra/entidade acessível e permissões do Drive |
| CORS | `APP_ORIGIN` igual à origem exata do navegador |
| Google Drive não configurado | `GOOGLE_SERVICE_ACCOUNT_JSON` |
| Pasta raiz não configurada | `GOOGLE_DRIVE_ROOT_FOLDER_ID` |
| Falha de autenticação Google | Validade da chave e configuração da conta de serviço |
| Drive HTTP 403 | API habilitada, acesso à pasta, Drive compartilhado e quota |
| Dados/arquivos pendentes | Erros em Sincronização, revisão da obra e logs da função |

Consulte Rede no navegador e Logs de Edge Functions no painel Supabase. Não compartilhe cabeçalhos Authorization ou secrets ao copiar diagnósticos.

## Atualização do GitHub e publicação

Revise o diff e aplique os arquivos desta entrega ao repositório existente. Não inclua `node_modules`, `.env.local`, chaves, `test-results`, `dist` ou caches. Execute os comandos de validação antes de fazer commit/push.

A rotina existente `.github/workflows/deploy.yml` publica GitHub Pages após push em main. Configure os secrets GitHub `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`, aplique 007 e atualize `admin-users` antes de publicar o novo frontend. O build incorpora as variáveis `VITE_`; alterar secrets exige recompilar e publicar novamente.

Após publicar, faça os testes remotos acima, confira o link Relatórios Padrão e verifique a atualização do service worker. Se um navegador mantiver a versão antiga, feche abas antigas/recarregue e confira a versão do frontend antes de diagnosticar o backend. Esta entrega não executou push, implantação de funções, migração remota ou publicação.
