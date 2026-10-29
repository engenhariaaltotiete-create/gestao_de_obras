-- Apply after 010_work_identity.sql, before deploying the new application.
-- No tables or existing records are deleted. History is captured on the next cancellation.
begin;

create or replace function public.apply_work_cancellation()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  cancelled boolean;
  was_cancelled boolean := false;
  snapshot jsonb;
  source jsonb;
  k text;
  items jsonb;
  statuses jsonb;
begin
  select coalesce(bool_or(s->>'status' = 'CANCELADO'), false) into cancelled
    from jsonb_array_elements(new.payload->'stages') s
    where s->>'name' = 'Execução de Obra';
  if tg_op = 'UPDATE' then
    select coalesce(bool_or(s->>'status' = 'CANCELADO'), false) into was_cancelled
      from jsonb_array_elements(old.payload->'stages') s
      where s->>'name' = 'Execução de Obra';
    if was_cancelled then snapshot := old.payload->'cancellationStatuses'; end if;
  end if;

  if cancelled then
    if snapshot is null then
      source := case when tg_op = 'UPDATE' then old.payload else new.payload end;
      snapshot := '{}'::jsonb;
      foreach k in array array['stages','startDocs','endDocs'] loop
        select coalesce(jsonb_object_agg(i->>'id', i->>'status'), '{}'::jsonb)
          into statuses from jsonb_array_elements(source->k) i;
        -- Newly normalized legacy items had no persisted status yet.
        -- Existing IDs always retain their server-side history.
        select coalesce(jsonb_object_agg(i->>'id', 'CADASTRADO'), '{}'::jsonb) || statuses
          into statuses from jsonb_array_elements(new.payload->k) i;
        snapshot := jsonb_set(snapshot, array[k], statuses);
      end loop;
    end if;
    new.payload := jsonb_set(new.payload, '{cancellationStatuses}', snapshot);
    foreach k in array array['stages','startDocs','endDocs'] loop
      select coalesce(jsonb_agg(case when i->>'status' = 'CANCELADO' then i else
        i || jsonb_build_object('status','CANCELADO','statusAt',to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) end order by n), '[]'::jsonb)
        into items from jsonb_array_elements(new.payload->k) with ordinality t(i,n);
      new.payload := jsonb_set(new.payload, array[k], items);
    end loop;
  else
    if was_cancelled and snapshot is not null then
      foreach k in array array['stages','startDocs','endDocs'] loop
        select coalesce(jsonb_agg(case
          when k = 'stages' and i->>'name' = 'Execução de Obra' then i
          when snapshot->k ? (i->>'id') and i->>'status' is distinct from snapshot->k->>(i->>'id') then
            i || jsonb_build_object('status', snapshot->k->>(i->>'id'), 'statusAt',to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
          else i end order by n), '[]'::jsonb)
          into items from jsonb_array_elements(new.payload->k) with ordinality t(i,n);
        new.payload := jsonb_set(new.payload, array[k], items);
      end loop;
    end if;
    new.payload := new.payload - 'cancellationStatuses';
  end if;
  return new;
end;
$$;

revoke all on function public.apply_work_cancellation() from public;
drop trigger if exists apply_work_cancellation on public.obras;
-- Runs before guard_obras / validate_obras, so validation sees the final statuses.
create trigger apply_work_cancellation before insert or update on public.obras
for each row execute function public.apply_work_cancellation();

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

  if coalesce(jsonb_array_length(new.payload->'stages'), 0) <> 12
     or coalesce(jsonb_array_length(new.payload->'startDocs'), 0) <> 19
     or coalesce(jsonb_array_length(new.payload->'endDocs'), 0) <> 7
  then
    raise exception
      'validation: estrutura de etapas/checklists inválida';
  end if;

  if (select jsonb_agg(value->>'name' order by ordinality)
      from jsonb_array_elements(new.payload->'stages') with ordinality) <> to_jsonb(array[
    'Diagnóstico','Estudo','Projeto','Checklist de Início de Obra','Materiais','Obrasoft',
    'Execução de Obra','LIG/PNG','Reposição','Testes','Instalação de Equipamento','Checklist de Conclusão de Obra'
  ]) then raise exception 'validation: ordem de etapas inválida'; end if;

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
           coalesce(old.payload->'cancellationStatuses'->k->>(item->>'id'), '') = 'CADASTRADO'
           and exists (select 1 from jsonb_array_elements(old.payload->'stages') s
             where s->>'name' = 'Execução de Obra' and s->>'status' = 'CANCELADO')
           and exists (select 1 from jsonb_array_elements(new.payload->'stages') s
             where s->>'name' = 'Execução de Obra' and s->>'status' <> 'CANCELADO')
         )
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


commit;
