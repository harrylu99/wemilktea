begin;

do $$
<<public_picker_workflow>>
declare
  brand_id uuid;
  category_id uuid;
  draft_product_id uuid := extensions.gen_random_uuid();
  unavailable_product_id uuid := extensions.gen_random_uuid();
  draft_location_id uuid := extensions.gen_random_uuid();
  published_location_id uuid;
  eligible_count integer;
begin
  select id into brand_id from public.brands where slug = 'gong-cha';
  select id into category_id from public.categories where slug = 'milk-tea';

  select count(*) into eligible_count
  from public.location_products
  join public.locations on locations.id = location_products.location_id
  join public.brands on brands.id = locations.brand_id
  join public.products on products.id = location_products.product_id
  join public.categories on categories.id = products.category_id
  where products.slug = 'brown-sugar-pearl-milk-tea'
    and location_products.availability_status = 'available'
    and locations.publication_status = 'published'
    and brands.is_published
    and products.is_published
    and categories.is_published;

  if eligible_count = 0 or brand_id is null or category_id is null then
    raise exception 'seed is missing eligible Picker content';
  end if;

  select id into published_location_id
  from public.locations
  where public.locations.brand_id = public_picker_workflow.brand_id
    and public.locations.publication_status = 'published'
  limit 1;

  insert into public.products (
    id, brand_id, category_id, name, slug, description, is_published
  )
  values (
    draft_product_id,
    brand_id,
    category_id,
    'Picker private draft drink',
    'picker-private-draft-drink',
    'Must not enter the public Picker pool.',
    false
  );

  insert into public.products (
    id, brand_id, category_id, name, slug, description, is_published
  )
  values (
    unavailable_product_id,
    brand_id,
    category_id,
    'Picker unavailable drink',
    'picker-unavailable-drink',
    'Must not enter the public Picker pool without an available relationship.',
    true
  );

  insert into public.location_products (
    location_id, product_id, brand_id, price_cents, currency, availability_status
  )
  values (
    published_location_id,
    unavailable_product_id,
    brand_id,
    700,
    'NZD',
    'unavailable'
  );

  insert into public.locations (
    id, brand_id, display_name, slug, suburb, address, coordinates, publication_status
  )
  values (
    draft_location_id,
    brand_id,
    'Picker private draft store',
    'picker-private-draft-store',
    'Private area',
    'Not public, Auckland',
    extensions.st_setsrid(extensions.st_makepoint(174.7, -36.8), 4326)::extensions.geography,
    'draft'
  );

  execute 'set local role anon';

  if not exists (
    select 1 from public.products where slug = 'brown-sugar-pearl-milk-tea'
  ) then
    raise exception 'published product is not visible to Picker';
  end if;

  if exists (select 1 from public.products where id = draft_product_id) then
    raise exception 'draft product is visible to Picker';
  end if;

  if exists (select 1 from public.locations where id = draft_location_id) then
    raise exception 'draft location is visible to Picker';
  end if;

  if exists (
    select 1 from public.location_products
    where availability_status <> 'available'
  ) then
    raise exception 'unavailable relationships are visible to Picker';
  end if;

  if not exists (
    select 1 from public.categories where slug = 'milk-tea'
  ) then
    raise exception 'published category is not visible to Picker';
  end if;

  begin
    perform 1 from public.store_candidates limit 1;
    raise exception 'Picker can read candidate data';
  exception
    when insufficient_privilege then null;
  end;

  execute 'reset role';
end;
$$;

rollback;
