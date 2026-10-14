-- Verificação somente de leitura para bancos existentes.
-- Execute antes das migrações e guarde os resultados.

select
  table_name,
  column_name,
  data_type
from information_schema.columns
where table_schema = 'public'
  and table_name in ('obras', 'profiles', 'audit_log')
order by table_name, ordinal_position;

select
  tablename,
  policyname,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public';

-- Obras com quantidade de etapas ou documentos diferente da esperada.

select
  id,
  payload->>'address' as address,
  jsonb_array_length(payload->'stages') as stages,
  jsonb_array_length(payload->'startDocs') as initial_docs,
  jsonb_array_length(payload->'endDocs') as final_docs
from public.obras
where jsonb_array_length(payload->'stages') is distinct from 12
   or jsonb_array_length(payload->'startDocs') is distinct from 19
   or jsonb_array_length(payload->'endDocs') is distinct from 7;

-- Responsáveis antigos que ainda não correspondem a um perfil.

select
  o.id as work_id,
  k.kind,
  i.value->>'id' as entity_id,
  i.value->>'responsible' as legacy_responsible
from public.obras o
cross join lateral
  unnest(array['stages', 'startDocs', 'endDocs']) k(kind)
cross join lateral
  jsonb_array_elements(o.payload->k.kind) i
where coalesce(i.value->>'responsible', '') <> ''
  and not exists (
    select 1
    from public.profiles p
    where p.id::text = i.value->>'responsible'
  );

-- Extensões manuais antigas, preservadas para revisão.

select
  id,
  payload->>'address' as address,
  payload->>'manualLength' as historical_manual_length
from public.obras
where payload->>'manualLength' is not null;
