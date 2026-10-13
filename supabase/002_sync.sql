-- Executar após a criação da tabela public.obras.
-- As migrações de segurança seguintes também são necessárias.

alter table public.obras
  add column if not exists revision bigint not null default 1;

create or replace function public.save_work_if_revision(
  p_id uuid,
  p_created_at timestamptz,
  p_payload jsonb,
  p_expected_revision bigint
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_revision bigint;
  next_revision bigint;
begin
  select revision
  into current_revision
  from public.obras
  where id = p_id
  for update;

  if not found then
    if p_expected_revision is not null then
      return jsonb_build_object(
        'ok', false,
        'reason', 'Registro removido no servidor'
      );
    end if;

    insert into public.obras(
      id,
      created_at,
      payload,
      updated_at,
      revision
    )
    values (
      p_id,
      p_created_at,
      p_payload,
      now(),
      1
    );

    return jsonb_build_object(
      'ok', true,
      'revision', 1
    );
  end if;

  if p_expected_revision is distinct from current_revision then
    return jsonb_build_object(
      'ok', false,
      'reason', 'Conflito: registro alterado em outra sessão'
    );
  end if;

  update public.obras
  set
    payload = p_payload,
    updated_at = now(),
    revision = revision + 1
  where id = p_id
  returning revision into next_revision;

  return jsonb_build_object(
    'ok', true,
    'revision', next_revision
  );
end;
$$;

revoke all
on function public.save_work_if_revision(
  uuid, timestamptz, jsonb, bigint
)
from public;

grant execute
on function public.save_work_if_revision(
  uuid, timestamptz, jsonb, bigint
)
to authenticated;
