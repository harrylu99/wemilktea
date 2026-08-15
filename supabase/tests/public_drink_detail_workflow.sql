begin;

do $$
<<workflow>>
declare
  brand_id uuid;
  category_id uuid;
  product_id uuid;
  draft_product_id uuid := extensions.gen_random_uuid();
  draft_location_id uuid := extensions.gen_random_uuid();
  draft_image_id uuid := extensions.gen_random_uuid();
  available_count integer;
  unavailable_count integer;
begin
  select id into brand_id from public.brands where slug = 'gong-cha';
  select id into category_id from public.categories where slug = 'milk-tea';
  select products.id into product_id
  from public.products
  join public.brands on brands.id = products.brand_id
  where products.slug = 'brown-sugar-pearl-milk-tea'
    and brands.slug = 'gong-cha';

  if workflow.product_id is null then
    raise exception 'seed does not include the published drink';
  end if;

  insert into public.products (
    id, brand_id, category_id, name, slug, description, is_published
  )
  values (
    workflow.draft_product_id,
    workflow.brand_id,
    workflow.category_id,
    'Private Draft Drink Detail',
    'private-draft-drink-detail',
    'Must not be publicly reachable.',
    false
  );

  insert into public.image_assets (
    id, provenance, storage_key, alt_text
  )
  values (
    workflow.draft_image_id,
    'wemilktea',
    'products/' || workflow.draft_product_id || '/00000000-0000-0000-0000-000000000098.jpg',
    'Private draft image'
  );

  insert into public.product_images (product_id, image_id, is_primary)
  values (workflow.draft_product_id, workflow.draft_image_id, true);

  insert into public.locations (
    id, brand_id, display_name, slug, suburb, address, coordinates,
    publication_status, source_provenance
  )
  values (
    workflow.draft_location_id,
    workflow.brand_id,
    'Draft Gong cha branch',
    'draft-gong-cha-branch',
    'Auckland',
    'Draft address',
    extensions.st_setsrid(extensions.st_makepoint(174.7, -36.72), 4326)::extensions.geography,
    'draft',
    'wemilktea'
  );

  insert into public.location_products (
    location_id, product_id, brand_id, price_cents, currency,
    availability_status, source_provenance
  )
  values (
    workflow.draft_location_id,
    workflow.product_id,
    workflow.brand_id,
    999,
    'NZD',
    'available',
    'wemilktea'
  );

  update public.location_products
  set availability_status = 'unavailable'
  where location_id = (
    select id from public.locations where slug = 'gong-cha-newmarket'
  )
    and public.location_products.product_id = workflow.product_id;

  execute 'set local role anon';

  if not exists (
    select 1
    from public.products
    join public.brands on brands.id = products.brand_id
    join public.categories on categories.id = products.category_id
    where products.id = workflow.product_id
      and products.slug = 'brown-sugar-pearl-milk-tea'
      and brands.slug = 'gong-cha'
      and products.is_published
      and brands.is_published
      and categories.is_published
  ) then
    raise exception 'published product is not publicly reachable by its brand/product identity';
  end if;

  if exists (
    select 1
    from public.products
    join public.brands on brands.id = products.brand_id
    where products.id = workflow.product_id and brands.slug = 'chatime'
  ) then
    raise exception 'wrong brand/product combination is publicly reachable';
  end if;

  if exists (
    select 1 from public.products where id = workflow.draft_product_id
  ) then
    raise exception 'draft product is publicly reachable';
  end if;

  select count(*) into available_count
  from public.location_products
  where public.location_products.product_id = workflow.product_id
    and availability_status = 'available';
  if available_count <> 1 then
    raise exception 'public availability should contain only one still-available published location, got %', available_count;
  end if;

  select count(*) into unavailable_count
  from public.location_products
  where public.location_products.product_id = workflow.product_id
    and location_id = workflow.draft_location_id;
  if unavailable_count <> 0 then
    raise exception 'draft location relationship is publicly reachable';
  end if;

  if not exists (
    select 1
    from public.location_products
    where public.location_products.product_id = workflow.product_id
      and location_id = (
        select id from public.locations where slug = 'gong-cha-albany'
      )
      and price_cents = 690
      and currency = 'NZD'
  ) then
    raise exception 'location-specific price is not publicly readable';
  end if;

  if not exists (
    select 1
    from public.product_images
    where public.product_images.product_id = workflow.product_id and is_primary
  ) then
    raise exception 'published product image metadata is not publicly readable';
  end if;

  if exists (
    select 1 from public.product_images where public.product_images.product_id = workflow.draft_product_id
  ) then
    raise exception 'draft product image metadata is publicly readable';
  end if;

  execute 'reset role';
end;
$$;

rollback;
