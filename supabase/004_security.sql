-- Evolução compatível com a estrutura fornecida.
-- Aplicar depois de 001 e 002 em um projeto novo.
-- Em banco existente, verificar primeiro a compatibilidade.
-- Nunca executar dados de exemplo em produção.

begin;

create table if not exists public.work_assignments (
  work_id uuid references public.obras(id) on delete cascade,
  entity_kind text,
  entity_id text,
  responsible_id uuid
    references public.profiles(id) on delete restrict,
  primary key (work_id, entity_kind, entity_id)
);

alter table public.work_assignments
  enable row level security;

create policy assignments_read
on public.work_assignments
for select
to authenticated
using (public.is_active_user());

create table if not exists public.drive_files (
  id uuid primary key,
  work_id uuid not null
    references public.obras(id) on delete restrict,
  entity_id text not null,
  kind text not null,
  drive_id text unique,
  folder_id text,
  name text not null,
  mime text not null,
  size bigint not null,
  uploaded_by uuid
    references public.profiles(id) on delete restrict,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

alter table public.drive_files
  enable row level security;

create policy files_read
on public.drive_files
for select
to authenticated
using (public.is_active_user());

create or replace function public.validate_work()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  k text;
  item jsonb;
  previous jsonb;
  r jsonb;
begin
  if not public.is_active_user() then
    raise exception 'permission denied';
  end if;

  if coalesce(jsonb_array_length(new.payload->'stages'), 0) <> 11
     or coalesce(jsonb_array_length(new.payload->'startDocs'), 0) <> 19
     or coalesce(jsonb_array_length(new.payload->'endDocs'), 0) <> 7
  then
    raise exception
      'validation: estrutura de etapas/checklists inválida';
  end if;

  for k in
    select unnest(array['stages', 'startDocs', 'endDocs'])
  loop
    for item in
      select value
      from jsonb_array_elements(new.payload->k)
    loop
      previous = null;

      if tg_op = 'UPDATE' then
        select value
        into previous
        from jsonb_array_elements(old.payload->k)
        where value->>'id' = item->>'id';
      end if;

      if coalesce(item->>'responsible', '') <> '' then
        if previous->>'responsible'
             is distinct from item->>'responsible'
           and not exists (
             select 1
             from profiles
             where id::text = item->>'responsible'
           )
        then
          raise exception 'validation: responsável inexistente';
        end if;

        if previous->>'responsible'
             is distinct from item->>'responsible'
           and not exists (
             select 1
             from profiles
             where id::text = item->>'responsible'
               and active
           )
        then
          raise exception 'validation: responsável inativo';
        end if;
      end if;

      if previous is not null
         and item is distinct from previous
         and item->>'status' = 'CADASTRADO'
         and not (
           k = 'stages'
           and item->>'name' in (
             'Checklist de Início de Obra',
             'Checklist de Conclusão de Obra'
           )
         )
      then
        raise exception 'validation: selecione outro status';
      end if;

      if coalesce(item->>'start', '') <> ''
         and coalesce(item->>'end', '') <> ''
         and item->>'end' < item->>'start'
      then
        raise exception 'validation: intervalo inválido';
      end if;
    end loop;
  end loop;

  if tg_op = 'UPDATE' and not public.is_admin_user() then
    for r in
      select value
      from jsonb_array_elements(old.payload->'reports')
      where value->>'status' = 'CONCLUÍDO'
    loop
      select value
      into previous
      from jsonb_array_elements(new.payload->'reports')
      where value->>'id' = r->>'id';

      if previous is distinct from r then
        raise exception
          'permission denied: relatório concluído imutável';
      end if;
    end loop;
  end if;

  return new;
end;
$$;

create trigger validate_obras
before insert or update on public.obras
for each row
execute function public.validate_work();

create or replace function public.project_assignments()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  k text;
  item jsonb;
begin
  delete from work_assignments
  where work_id = new.id;

  for k in
    select unnest(array['stages', 'startDocs', 'endDocs'])
  loop
    for item in
      select value
      from jsonb_array_elements(new.payload->k)
    loop
      if exists (
        select 1
        from profiles
        where id::text = item->>'responsible'
      ) then
        insert into work_assignments (
          work_id,
          entity_kind,
          entity_id,
          responsible_id
        )
        values (
          new.id,
          k,
          item->>'id',
          (item->>'responsible')::uuid
        );
      end if;
    end loop;
  end loop;

  return new;
end;
$$;

create trigger project_work_assignments
after insert or update on public.obras
for each row
execute function public.project_assignments();

create or replace function public.audit_work_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  k text;
  a jsonb;
  b jsonb;
  item jsonb;
  prior jsonb;
  field_name text;
begin
  if tg_op <> 'UPDATE' then
    insert into audit_log (
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
      old.payload,
      new.payload,
      auth.uid()
    );

    return coalesce(new, old);
  end if;

  for k in
    select jsonb_object_keys(new.payload || old.payload)
  loop
    a = old.payload->k;
    b = new.payload->k;

    if a is distinct from b then
      if k in (
        'stages',
        'startDocs',
        'endDocs',
        'segments',
        'budget',
        'reports'
      ) then
        for item in
          select value
          from jsonb_array_elements(coalesce(b, '[]'::jsonb))
        loop
          select value
          into prior
          from jsonb_array_elements(coalesce(a, '[]'::jsonb))
          where value->>'id' = item->>'id';

          for field_name in
            select jsonb_object_keys(
              item || coalesce(prior, '{}'::jsonb)
            )
          loop
            if prior->field_name
                 is distinct from item->field_name
            then
              insert into audit_log (
                work_id,
                entity,
                entity_id,
                field,
                old_value,
                new_value,
                actor_id
              )
              values (
                new.id,
                k,
                item->>'id',
                field_name,
                prior->field_name,
                item->field_name,
                auth.uid()
              );
            end if;
          end loop;
        end loop;

        for prior in
          select value
          from jsonb_array_elements(coalesce(a, '[]'::jsonb))
        loop
          if not exists (
            select 1
            from jsonb_array_elements(coalesce(b, '[]'::jsonb))
            where value->>'id' = prior->>'id'
          ) then
            insert into audit_log (
              work_id,
              entity,
              entity_id,
              field,
              old_value,
              actor_id
            )
            values (
              new.id,
              k,
              prior->>'id',
              'DELETE',
              prior,
              auth.uid()
            );
          end if;
        end loop;
      else
        insert into audit_log (
          work_id,
          entity,
          entity_id,
          field,
          old_value,
          new_value,
          actor_id
        )
        values (
          new.id,
          'obras',
          new.id::text,
          k,
          a,
          b,
          auth.uid()
        );
      end if;
    end if;
  end loop;

  return new;
end;
$$;

-- Escrita somente pelo RPC:
-- impede alterações REST que contornem o controle de revisão.

drop policy if exists obras_insert on public.obras;
drop policy if exists obras_update on public.obras;

create or replace function public.save_work_if_revision(
  p_id uuid,
  p_created_at timestamptz,
  p_payload jsonb,
  p_expected_revision bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  rev bigint;
begin
  if not public.is_active_user() then
    raise exception 'permission denied';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_id::text, 0)
  );

  select revision
  into rev
  from obras
  where id = p_id
  for update;

  if not found then
    if p_expected_revision is not null then
      return jsonb_build_object(
        'ok', false,
        'reason', 'Registro removido no servidor'
      );
    end if;

    insert into obras(id, created_at, payload, revision)
    values (p_id, p_created_at, p_payload, 1);

    return jsonb_build_object(
      'ok', true,
      'revision', 1
    );
  end if;

  if rev is distinct from p_expected_revision then
    return jsonb_build_object(
      'ok', false,
      'reason', 'Conflito: obra alterada em outra sessão'
    );
  end if;

  update obras
  set
    payload = p_payload,
    revision = revision + 1,
    updated_at = now()
  where id = p_id
  returning revision into rev;

  return jsonb_build_object(
    'ok', true,
    'revision', rev
  );
end;
$$;

revoke all
on function public.save_work_if_revision(
  uuid, timestamptz, jsonb, bigint
)
from public, anon;

grant execute
on function public.save_work_if_revision(
  uuid, timestamptz, jsonb, bigint
)
to authenticated;

create or replace function public.admin_update_profile(
  p_id uuid,
  p_name text,
  p_role text,
  p_active boolean,
  p_actor uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  previous jsonb;
  current_value jsonb;
begin
  if not exists (
    select 1
    from profiles
    where id = p_actor
      and active
      and role = 'admin'
  ) then
    raise exception 'permission denied';
  end if;

  select to_jsonb(p)
  into previous
  from profiles p
  where id = p_id
  for update;

  update profiles
  set
    name = p_name,
    role = p_role,
    active = p_active
  where id = p_id;

  select to_jsonb(p)
  into current_value
  from profiles p
  where id = p_id;

  insert into audit_log (
    entity,
    entity_id,
    field,
    old_value,
    new_value,
    actor_id
  )
  values (
    'profiles',
    p_id::text,
    'ADMIN_UPDATE',
    previous,
    current_value,
    p_actor
  );
end;
$$;

revoke all
on function public.admin_update_profile(
  uuid, text, text, boolean, uuid
)
from public, anon, authenticated;

grant execute
on function public.admin_update_profile(
  uuid, text, text, boolean, uuid
)
to service_role;

commit;
