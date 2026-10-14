-- Apply after 006_file_audit.sql. Transactional, additive, no data deletion.
-- Existing 11-stage payloads are normalized by the application by name on read;
-- their IDs and values are preserved. The first save persists the 12-stage layout.
begin;

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

-- Diff JSON objects recursively; entity arrays use IDs rather than positions.
create or replace function public.json_field_changes(a jsonb, b jsonb, path text default '')
returns jsonb language plpgsql immutable set search_path = public as $$
declare
  result jsonb := '{}'::jsonb;
  k text;
  prior jsonb;
  next_value jsonb;
begin
  if a is not distinct from b then return result; end if;
  if jsonb_typeof(a) = 'object' and jsonb_typeof(b) = 'object' then
    for k in select jsonb_object_keys(a || b) loop
      if k = '__revision' then continue; end if;
      result := result || public.json_field_changes(a->k, b->k,
        case when path = '' then k else path || '.' || k end);
    end loop;
  elsif jsonb_typeof(a) = 'array' and jsonb_typeof(b) = 'array'
    and not exists (
      select 1 from jsonb_array_elements(a || b) v
      where jsonb_typeof(v) <> 'object' or not (v ? 'id')
    ) then
    for k in select distinct v->>'id' from jsonb_array_elements(a || b) v loop
      select v into prior from jsonb_array_elements(a) v where v->>'id' = k;
      select v into next_value from jsonb_array_elements(b) v where v->>'id' = k;
      result := result || public.json_field_changes(prior, next_value, path || '[' || k || ']');
    end loop;
  else
    result := jsonb_build_object(path, jsonb_build_object('anterior', a, 'novo', b));
  end if;
  return result;
end;
$$;

create or replace function public.audit_work_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare changes jsonb; prior jsonb; next_value jsonb;
begin
  if tg_op = 'UPDATE' then
    changes := public.json_field_changes(old.payload, new.payload);
    if changes = '{}'::jsonb then return new; end if;
    select jsonb_object_agg(key, value->'anterior'), jsonb_object_agg(key, value->'novo')
      into prior, next_value from jsonb_each(changes);
  else
    prior := case when tg_op = 'DELETE' then old.payload else null end;
    next_value := case when tg_op = 'INSERT' then new.payload else null end;
  end if;
  insert into audit_log(work_id,entity,entity_id,field,old_value,new_value,actor_id)
    values(coalesce(new.id,old.id),'obras',coalesce(new.id,old.id)::text,tg_op,prior,next_value,auth.uid());
  return coalesce(new,old);
end;
$$;

create or replace function public.admin_update_profile(
  p_id uuid, p_name text, p_role text, p_active boolean, p_actor uuid
) returns void language plpgsql security definer set search_path = public as $$
declare previous jsonb; current_value jsonb; changes jsonb; prior jsonb; next_value jsonb;
begin
  -- Serialize administrative updates to preserve at least one active administrator.
  perform pg_advisory_xact_lock(73012026);
  if not exists(select 1 from profiles where id=p_actor and active and role='admin') then
    raise exception 'permission denied';
  end if;
  if trim(coalesce(p_name,''))='' or p_role not in ('admin','user') or p_role is null or p_active is null then
    raise exception 'validation: dados de perfil inválidos';
  end if;
  select to_jsonb(p) into previous from profiles p where id=p_id for update;
  if previous is null then raise exception 'validation: perfil não encontrado'; end if;
  if p_id=p_actor and (p_role<>'admin' or not p_active) then
    raise exception 'permission denied: preserve seu perfil administrativo';
  end if;
  if previous->>'role'='admin' and previous->>'active'='true'
     and (p_role<>'admin' or not p_active)
     and (select count(*) from profiles where role='admin' and active)<=1 then
    raise exception 'validation: mantenha um administrador ativo';
  end if;
  update profiles set name=trim(p_name),role=p_role,active=p_active where id=p_id;
  select to_jsonb(p) into current_value from profiles p where id=p_id;
  changes:=public.json_field_changes(previous,current_value);
  if changes<>'{}'::jsonb then
    select jsonb_object_agg(key,value->'anterior'),jsonb_object_agg(key,value->'novo')
      into prior,next_value from jsonb_each(changes);
    insert into audit_log(entity,entity_id,field,old_value,new_value,actor_id)
      values('profiles',p_id::text,'ADMIN_UPDATE',prior,next_value,p_actor);
  end if;
end;
$$;
revoke all on function public.admin_update_profile(uuid,text,text,boolean,uuid) from public,anon,authenticated;
grant execute on function public.admin_update_profile(uuid,text,text,boolean,uuid) to service_role;

create or replace function public.audit_file_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare changes jsonb; prior jsonb; next_value jsonb;
begin
  if tg_op='UPDATE' then
    changes:=public.json_field_changes(to_jsonb(old),to_jsonb(new));
    if changes='{}'::jsonb then return new; end if;
    select jsonb_object_agg(key,value->'anterior'),jsonb_object_agg(key,value->'novo')
      into prior,next_value from jsonb_each(changes);
  else next_value:=to_jsonb(new); end if;
  insert into audit_log(work_id,entity,entity_id,field,old_value,new_value,actor_id)
    values(new.work_id,'drive_files',new.id::text,tg_op,prior,next_value,coalesce(new.updated_by,new.uploaded_by));
  return new;
end;
$$;
create or replace function public.admin_audit_invitation(p_id uuid, p_actor uuid)
returns void language plpgsql security definer set search_path = public as $$
declare profile jsonb;
begin
  if not exists(select 1 from profiles where id=p_actor and active and role='admin') then
    raise exception 'permission denied';
  end if;
  select to_jsonb(p) into profile from profiles p where id=p_id;
  if profile is null then raise exception 'validation: perfil não encontrado'; end if;
  insert into audit_log(entity,entity_id,field,old_value,new_value,actor_id)
    values('profiles',p_id::text,'CREATE',null,profile,p_actor);
end;
$$;
revoke all on function public.admin_audit_invitation(uuid,uuid) from public,anon,authenticated;
grant execute on function public.admin_audit_invitation(uuid,uuid) to service_role;
commit;
