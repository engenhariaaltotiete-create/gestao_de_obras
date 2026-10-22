-- Executar uma vez após as migrações existentes, no SQL Editor.
-- Idempotente: não altera registros, políticas, perfis ou arquivos existentes.
begin;

create or replace function public.guard_work_identity()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if jsonb_typeof(new.payload) is distinct from 'object'
     or lower(new.payload->>'id') is distinct from new.id::text
     or (tg_op = 'UPDATE' and new.id is distinct from old.id)
  then
    raise exception using
      errcode = '23514',
      message = 'validation: ID da obra inconsistente com o registro';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_identity_obras on public.obras;
create trigger guard_identity_obras
before insert or update on public.obras
for each row execute function public.guard_work_identity();

commit;
