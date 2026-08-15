begin;

do $$
declare
  brand_id uuid;
  draft_id uuid := extensions.gen_random_uuid();
  published_id uuid;
  published_count integer;
  drink_count integer;
begin
  select id into brand_id from public.brands where slug = 'gong-cha';
  select id into published_id from public.locations where slug = 'gong-cha-albany';

  insert into public.locations (
    id, brand_id, display_name, slug, suburb, address, coordinates,
    publication_status, source_provenance
  )
  values (
    draft_id,
    brand_id,
    'Draft Detail Store',
    'draft-detail-store',
    'Auckland CBD',
    '1 Draft Street, Auckland',
    extensions.st_setsrid(extensions.st_makepoint(174.7633, -36.8485), 4326)::extensions.geography,
    'draft',
    'wemilktea'
  );

  execute 'set local role anon';

  select count(*) into published_count
  from public.locations
  where id = published_id;
  if published_count <> 1 then
    raise exception 'published canonical store is not publicly readable by slug';
  end if;

  if exists (select 1 from public.locations where id = draft_id) then
    raise exception 'draft store detail is publicly readable';
  end if;

  select count(*) into drink_count
  from public.location_products
  where location_id = published_id;
  if drink_count = 0 then
    raise exception 'available published store drinks are not publicly readable';
  end if;

  begin
    perform 1 from public.store_candidates;
    raise exception 'candidate data is publicly readable from Store Detail';
  exception
    when insufficient_privilege then null;
  end;

  begin
    perform 1 from public.discovery_runs;
    raise exception 'discovery data is publicly readable from Store Detail';
  exception
    when insufficient_privilege then null;
  end;

  execute 'reset role';
end;
$$;

rollback;
