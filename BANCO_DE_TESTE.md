# Banco de dados de teste — Sistema de Gestão de Obras

Este pacote cria um banco de testes **em um projeto Supabase seu**. Não é um servidor hospedado já ativo.

## Instalação
1. Crie um projeto novo em https://supabase.com/dashboard (não use produção).
2. Em **SQL Editor**, execute `supabase/001_schema_teste.sql`.
3. Depois execute `supabase/003_dados_exemplo.sql` para inserir **12 obras fictícias** com 11 etapas, 19 documentos iniciais e 7 documentos finais cada.
4. Em **Authentication > Users**, crie um usuário de teste com e-mail e senha.
5. Para dar perfil de administrador ao usuário de teste, execute no SQL Editor (substituindo pelo e-mail real):
   `update public.profiles set role='admin' where email='SEU_EMAIL_DE_TESTE';`
6. Em **Project Settings > API** obtenha Project URL e a chave **anon/publishable** (nunca service_role).
7. Crie `.env` a partir de `.env.example` na pasta do aplicativo e preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
8. Rode `npm install` e `npm run dev`. Entre com o usuário criado.

## Observações importantes
- Os dados são fictícios; endereços "Rua Exemplo" não correspondem a obras reais.
- A tabela `obras` usa `payload jsonb`, **compatível com o protótipo atual**, mas é uma solução transitória: o modelo relacional definitivo permanece previsto.
- Há RLS para leitura/edição de usuários ativos e exclusão restrita a administradores.
- A auditoria é gerada por trigger em INSERT/UPDATE/DELETE e não pode ser editada por usuários comuns.
- **Limitação conhecida do protótipo:** a exclusão ainda não usa a fila offline, e o mecanismo de sincronização necessita testes de conflitos, permissões e sessões antes de produção.
- **Limitação de segurança:** usuários inativos ainda podem autenticar no Supabase Auth; as políticas impedem seu acesso aos dados, mas a interface precisa tratar esse estado explicitamente.
- **Limitação de teste:** o protótipo guarda uma obra inteira em JSON; edições simultâneas de partes diferentes da mesma obra podem gerar conflitos que exigem resolução.
- Não execute os scripts de teste sobre dados reais.
