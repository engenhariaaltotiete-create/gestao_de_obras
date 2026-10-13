begin;

drop policy if exists profiles_read
  on public.profiles;

-- Usuário inativo pode consultar apenas seu próprio perfil.
-- Dados operacionais continuam bloqueados pelas demais políticas.

create policy profiles_read
on public.profiles
for select
to authenticated
using (
  id = auth.uid()
  or public.is_active_user()
);

-- Impede que exclusões no Auth apaguem perfis históricos.

alter table public.profiles
  drop constraint if exists profiles_id_fkey;

alter table public.profiles
  add constraint profiles_id_fkey
  foreign key (id)
  references auth.users(id)
  on delete restrict;

create or replace function public.guard_payload()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  k text;
  item jsonb;
  previous jsonb;
  allowed text[];
begin
  if tg_op = 'UPDATE'
     and old.payload->>'dataValidated' = 'true'
     and new.payload->>'dataValidated'
           is distinct from 'true'
  then
    raise exception
      'validation: cadastro não pode voltar a rascunho';
  end if;

  if new.payload->>'dataValidated' = 'true' then
    for k in
      select unnest(array[
        'address',
        'district',
        'city',
        'goal',
        'requester',
        'requestDocument',
        'kind',
        'ae',
        'service',
        'method',
        'priority',
        'createdAt'
      ])
    loop
      if trim(coalesce(new.payload->>k, '')) = '' then
        raise exception
          'validation: campo obrigatório %', k;
      end if;
    end loop;

    for k in
      select unnest(array[
        'links',
        'png',
        'booster',
        'vrp'
      ])
    loop
      if jsonb_typeof(new.payload->k)
           is distinct from 'number'
         or (new.payload->>k)::numeric < 0
      then
        raise exception
          'validation: campo numérico inválido %', k;
      end if;
    end loop;

    if coalesce(
      jsonb_array_length(new.payload->'pavements'),
      0
    ) = 0 then
      raise exception
        'validation: informe os pavimentos';
    end if;
  end if;

  for k in
    select unnest(array[
      'stages',
      'startDocs',
      'endDocs',
      'segments'
    ])
  loop
    allowed = case
      when k = 'stages' then array[
        'CADASTRADO',
        'AGUARDANDO',
        'LIBERADO',
        'EM PLANEJAMENTO',
        'EM ANDAMENTO',
        'PARALISADO',
        'CANCELADO',
        'CONCLUÍDO',
        'NÃO SE APLICA'
      ]
      when k = 'segments' then array[
        'AGUARDANDO',
        'EM EXECUÇÃO',
        'PARALISADO',
        'CANCELADO',
        'CONCLUÍDO'
      ]
      else array[
        'CADASTRADO',
        'AGUARDANDO',
        'EM ANDAMENTO',
        'CANCELADO',
        'CONCLUÍDO',
        'NÃO SE APLICA'
      ]
    end;

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

      if item is distinct from previous
         and not coalesce(
           item->>'status' = any(allowed),
           false
         )
      then
        raise exception
          'validation: status inválido em %', k;
      end if;
    end loop;
  end loop;

  for item in
    select value
    from jsonb_array_elements(new.payload->'reports')
  loop
    previous = null;

    if tg_op = 'UPDATE' then
      select value
      into previous
      from jsonb_array_elements(old.payload->'reports')
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
        raise exception
          'validation: responsável do relatório inexistente';
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
        raise exception
          'validation: responsável do relatório inativo';
      end if;
    end if;
  end loop;

  return new;
end;
$$;

create trigger guard_obras
before insert or update on public.obras
for each row
execute function public.guard_payload();

-- Preserva o JSONB original.
-- Materializa somente responsáveis que correspondem a perfis.
-- Referências legadas inválidas são identificadas pelo preflight.

insert into work_assignments (
  work_id,
  entity_kind,
  entity_id,
  responsible_id
)
select
  o.id,
  k.kind,
  i.value->>'id',
  p.id
from obras o
cross join lateral
  unnest(array['stages', 'startDocs', 'endDocs']) as k(kind)
cross join lateral
  jsonb_array_elements(o.payload->k.kind) i
join profiles p
  on p.id::text = i.value->>'responsible'
on conflict do nothing;

commit;
