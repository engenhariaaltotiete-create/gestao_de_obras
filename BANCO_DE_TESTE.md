# Banco de teste — Sistema de Gestão de Obras

Use um projeto Supabase separado de produção. O repositório não fornece um banco hospedado nem um script de carga com 12 obras fictícias.

1. Em um **projeto novo**, execute no SQL Editor, nesta ordem: `001_schema_teste.sql`, `002_sync.sql`, `004_security.sql`, `005_hardening.sql`, `006_file_audit.sql`, `007_stages_and_grouped_audit.sql` (todos em `supabase/`). Não existe uma migração 003 neste checkout.
2. Em banco existente, consulte `000_preflight.sql` antes de alterar o schema. Se as migrações até 006 já estiverem aplicadas e a estrutura for compatível, execute somente 007. Não reaplique scripts antigos indiscriminadamente: alguns criam triggers/policies sem remover versões anteriores.
3. Desative o cadastro público em Authentication → configuração de usuários → **Allow new users to sign up**. O `supabase/config.toml` também desativa inscrições no ambiente local.
4. Crie o primeiro usuário de teste no painel Auth e promova apenas seu perfil:
   ```sql
   update public.profiles set role = 'admin' where email = 'ADMIN_DE_TESTE@example.com';
   ```
5. Copie `.env.example` para `.env.local` e configure `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` com a URL e a chave pública/anon do projeto de teste. Nunca use `service_role` no frontend.
6. Configure e implante as Edge Functions conforme [Implantação e validação](docs/IMPLANTACAO.md). Reinicie Vite após mudar variáveis. Sem elas, o aplicativo funciona somente em demonstração local.
7. Cadastre uma obra pelo formulário e execute os testes de persistência e permissões descritos na documentação.

A migração 007 exige 12 etapas na ordem definida. O aplicativo lê registros antigos pelo nome das etapas, preserva IDs, anexos, datas e responsáveis e adiciona LIG/PNG. O primeiro salvamento persiste a nova ordem no banco, com controle de revisão e auditoria. Registros não editados não são regravados automaticamente.

Os dados permanecem em JSONB; não há conversão destrutiva para outro modelo. A exclusão de obras continua sendo uma operação online no Supabase e pode ser recusada quando existem arquivos vinculados. Não execute testes de exclusão com dados reais.
