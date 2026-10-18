-- Executar após 007_stages_and_grouped_audit.sql. Não modifica dados de obras.
begin;
create table if not exists public.topografias (
 id uuid primary key,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 payload jsonb not null
);
create index if not exists topografias_status_idx on public.topografias ((payload->>'status'));
create index if not exists topografias_created_idx on public.topografias (created_at desc);
alter table public.topografias enable row level security;
create policy topografias_select on public.topografias for select to authenticated using (public.is_active_user());
create policy topografias_insert on public.topografias for insert to authenticated with check (public.is_active_user());
create policy topografias_update on public.topografias for update to authenticated using (public.is_active_user()) with check (public.is_active_user());
create policy topografias_delete on public.topografias for delete to authenticated using (public.is_active_user() and exists(select 1 from public.profiles where id=auth.uid() and role='admin'));
create or replace function public.validate_topografia() returns trigger language plpgsql security definer set search_path=public as $$
declare previous_status text;
begin
 if not public.is_active_user() then raise exception 'Usuário inativo'; end if;
 if new.payload->>'id' is distinct from new.id::text then raise exception 'ID da topografia inconsistente'; end if;
 if coalesce(new.payload->>'ae','') not in ('Água','Esgoto') then raise exception 'A/E inválido'; end if;
 if trim(coalesce(new.payload->>'address',''))='' then raise exception 'Endereço obrigatório'; end if;
 if coalesce(new.payload->>'status','') not in ('CADASTRADO','LIBERADO','EM PLANEJAMENTO','EM EXECUÇÃO','AGUARDANDO PROJETO','PARALISADO','CONCLUÍDO','CANCELADO') then raise exception 'Status inválido'; end if;
 if coalesce(new.payload->>'plannedStart','')<>'' and coalesce(new.payload->>'plannedEnd','')<>'' and (new.payload->>'plannedEnd')::date<(new.payload->>'plannedStart')::date then raise exception 'Datas previstas inválidas'; end if;
 previous_status:=case when tg_op='UPDATE' then old.payload->>'status' else null end;
 if tg_op='INSERT' or previous_status is distinct from new.payload->>'status' then
   new.payload:=jsonb_set(new.payload,'{statusAt}',to_jsonb((now() at time zone 'America/Sao_Paulo')::date::text));
 else
   new.payload:=jsonb_set(new.payload,'{statusAt}',coalesce(old.payload->'statusAt','null'::jsonb));
 end if;
 new.updated_at:=now();return new;
end;$$;
create trigger topografias_validate before insert or update on public.topografias for each row execute function public.validate_topografia();
create or replace function public.audit_topografia() returns trigger language plpgsql security definer set search_path=public as $$
declare previous jsonb; current_value jsonb; changes jsonb;
begin
 previous:=case when tg_op='INSERT' then null else old.payload end;
 current_value:=case when tg_op='DELETE' then null else new.payload end;
 if tg_op='UPDATE' then
   changes:=public.json_field_changes(previous,current_value);
   if changes='{}'::jsonb then return new;end if;
   select jsonb_object_agg(key,value->'anterior'),jsonb_object_agg(key,value->'novo') into previous,current_value from jsonb_each(changes);
 end if;
 insert into public.audit_log(entity,entity_id,field,old_value,new_value,actor_id)
 values('topografias',(case when tg_op='DELETE' then old.id else new.id end)::text,tg_op,previous,current_value,auth.uid());
 return coalesce(new,old);
end;$$;
create trigger topografias_audit after insert or update or delete on public.topografias for each row execute function public.audit_topografia();
commit;
