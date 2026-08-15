begin;

do $$
declare
  brand_id uuid;
  category_id uuid;
  draft_product_id uuid := extensions.gen_random_uuid();
  draft_location_id uuid := extensions.gen_random_uuid();
  published_location_count integer;
begin
  select id into brand_id from public.brands where slug = 'gong-cha';
  select id into category_id from public.categories where slug = 'milk-tea';

  select count(*) into published_location_count
  from public.locations
  join public.brands on brands.id = locations.brand_id
  where locations.publication_status = 'published'
    and brands.is_published;

  if published_location_count = 0 or brand_id is null or category_id is null then
    raise exception 'seed is missing published Home content';
  end if;

  insert into public.products (
    id, brand_id, category_id, name, slug, description, is_published
  )
  values (
    draft_product_id,
    brand_id,
    category_id,
    'Home private draft drink',
    'home-private-draft-drink',
    'Must not be visible publicly.',
    false
  );

  insert into public.locations (
    id, brand_id, display_name, slug, suburb, address, coordinates, publication_status
  )
  values (
    draft_location_id,
    brand_id,
    'Home private draft store',
    'home-private-draft-store',
    'Private area',
    'Not public, Auckland',
    extensions.st_setsrid(extensions.st_makepoint(174.7, -36.8), 4326)::extensions.geography,
    'draft'
  );

  execute 'set local role anon';

  if (select count(*) from public.locations) <> published_location_count then
    raise exception 'Home can read unpublished locations';
  end if;

  if exists (select 1 from public.products where id = draft_product_id) then
    raise exception 'Home can read draft products';
  end if;

  if exists (select 1 from public.locations where id = draft_location_id) then
    raise exception 'Home can read draft locations';
  end if;

  if not exists (
    select 1 from public.products where slug = 'brown-sugar-pearl-milk-tea'
  ) then
    raise exception 'Home cannot read published drinks';
  end if;

  begin
    perform 1 from public.store_candidates limit 1;
    raise exception 'Home can read candidate data';
  exception
    when insufficient_privilege then null;
  end;

  begin
    perform 1 from public.discovery_runs limit 1;
    raise exception 'Home can read discovery data';
  exception
    when insufficient_privilege then null;
  end;

  execute 'reset role';
end;
$$;

rollback;
