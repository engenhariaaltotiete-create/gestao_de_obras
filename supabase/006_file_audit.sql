begin;

alter table public.drive_files
  add column if not exists updated_by uuid
  references public.profiles(id)
  on delete restrict;

create or replace function public.audit_file_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  k text;
  previous jsonb;
  next_value jsonb;
begin
  previous = case
    when tg_op = 'INSERT' then '{}'::jsonb
    else to_jsonb(old)
  end;

  next_value = to_jsonb(new);

  for k in
    select jsonb_object_keys(next_value)
  loop
    if previous->k is distinct from next_value->k then
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
        new.work_id,
        'drive_files',
        new.id::text,
        k,
        previous->k,
        next_value->k,
        coalesce(new.updated_by, new.uploaded_by)
      );
    end if;
  end loop;

  return new;
end;
$$;

create trigger audit_drive_files
after insert or update on public.drive_files
for each row
execute function public.audit_file_change();

-- Relatórios no novo formato só podem ser concluídos
-- depois da confirmação dos arquivos e do PDF no Drive.

create or replace function public.guard_report_files()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r jsonb;
  previous jsonb;
  f jsonb;
begin
  for r in
    select value
    from jsonb_array_elements(new.payload->'reports')
  loop
    previous = null;

    if tg_op = 'UPDATE' then
      select value
      into previous
      from jsonb_array_elements(old.payload->'reports')
      where value->>'id' = r->>'id';
    end if;

    if r->>'status' = 'CONCLUÍDO'
       and previous->>'status'
             is distinct from 'CONCLUÍDO'
       and r->'reference' is not null
    then
      for f in
        select value->'imagem'
        from jsonb_array_elements(
          r->'reference'->'fotos'
        )
        where value->'imagem' is not null

        union all

        select value
        from jsonb_array_elements(
          r->'reference'->'anexos'
        )
      loop
        if not exists (
          select 1
          from drive_files
          where id::text = f->>'id'
            and work_id = new.id
            and entity_id = r->>'id'
            and status = 'uploaded'
        ) then
          raise exception
            'validation: arquivo do relatório ainda não enviado';
        end if;
      end loop;

      if not exists (
        select 1
        from drive_files
        where work_id = new.id
          and entity_id = r->>'id'
          and kind = 'pdf'
          and status = 'uploaded'
      ) then
        raise exception
          'validation: PDF do relatório ainda não enviado';
      end if;
    end if;
  end loop;

  return new;
end;
$$;

create trigger guard_report_files
before insert or update on public.obras
for each row
execute function public.guard_report_files();

commit;
