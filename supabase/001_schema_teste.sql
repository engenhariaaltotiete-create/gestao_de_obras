-- AMBIENTE DE TESTE:
-- executar no SQL Editor de um projeto Supabase NOVO.
-- Não executar em um projeto de produção.

create table if not exists public.profiles (
  id uuid primary key
    references auth.users(id) on delete cascade,
  name text not null default '',
  email text not null default '',
  role text not null default 'user'
    check (role in ('admin', 'user')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.obras (
  id uuid primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision bigint not null default 1,
  payload jsonb not null
);

create index if not exists obras_updated_idx
  on public.obras(updated_at desc);

create index if not exists obras_payload_city_idx
  on public.obras ((payload->>'city'));

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  work_id uuid,
  entity text not null,
  entity_id text,
  field text not null,
  old_value jsonb,
  new_value jsonb,
  actor_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists audit_log_work_idx
  on public.audit_log(work_id, created_at desc);

create index if not exists audit_log_created_idx
  on public.audit_log(created_at desc);

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and active
  );
$$;

create or replace function public.is_admin_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and active
      and role = 'admin'
  );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles(id, name, email, role, active)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'name',
      split_part(coalesce(new.email, ''), '@', 1)
    ),
    coalesce(new.email, ''),
    'user',
    true
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created
  on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

insert into public.profiles(id, name, email, role, active)
select
  id,
  coalesce(
    raw_user_meta_data->>'name',
    split_part(coalesce(email, ''), '@', 1)
  ),
  coalesce(email, ''),
  'user',
  true
from auth.users
on conflict (id) do nothing;

alter table public.profiles
  enable row level security;

alter table public.obras
  enable row level security;

alter table public.audit_log
  enable row level security;

drop policy if exists profiles_read
  on public.profiles;

create policy profiles_read
on public.profiles
for select
to authenticated
using (public.is_active_user());

drop policy if exists obras_read
  on public.obras;

create policy obras_read
on public.obras
for select
to authenticated
using (public.is_active_user());

drop policy if exists obras_insert
  on public.obras;

create policy obras_insert
on public.obras
for insert
to authenticated
with check (public.is_active_user());

drop policy if exists obras_update
  on public.obras;

create policy obras_update
on public.obras
for update
to authenticated
using (public.is_active_user())
with check (public.is_active_user());

drop policy if exists obras_delete
  on public.obras;

create policy obras_delete
on public.obras
for delete
to authenticated
using (public.is_admin_user());

drop policy if exists audit_read
  on public.audit_log;

create policy audit_read
on public.audit_log
for select
to authenticated
using (public.is_active_user());

-- Não criar políticas de escrita para audit_log.
-- Somente triggers internos gravam a auditoria.

create or replace function public.audit_work_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_log(
    work_id,
    entity,
    entity_id,
    field,
    old_value,
    new_value,
    actor_id
  )
  values (
    coalesce(new.id, old.id),
    'obras',
    coalesce(new.id, old.id)::text,
    tg_op,
    case
      when tg_op = 'INSERT' then null
      else to_jsonb(old.payload)
    end,
    case
      when tg_op = 'DELETE' then null
      else to_jsonb(new.payload)
    end,
    auth.uid()
  );

  return coalesce(new, old);
end;
$$;

drop trigger if exists audit_obras
  on public.obras;

create trigger audit_obras
after insert or update or delete on public.obras
for each row
execute function public.audit_work_change();

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
  if not public.is_active_user() then
    raise exception 'Usuario inativo ou sem permissao';
  end if;

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
      'reason', 'Conflito: registro alterado em outra sessao'
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
