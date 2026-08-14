begin;

do $$
<<public_picker_result_workflow>>
declare
  product_id uuid;
  location_id uuid;
  wrong_location_id uuid;
  draft_product_id uuid := extensions.gen_random_uuid();
  draft_location_id uuid := extensions.gen_random_uuid();
  brand_id uuid;
  category_id uuid;
begin
  select products.id, products.brand_id, products.category_id
  into product_id, brand_id, category_id
  from public.products
  join public.brands on brands.id = products.brand_id
  join public.categories on categories.id = products.category_id
  where products.slug = 'brown-sugar-pearl-milk-tea'
    and brands.slug = 'gong-cha'
    and products.is_published
    and brands.is_published
    and categories.is_published;

  select id into location_id
  from public.locations
  where slug = 'gong-cha-albany';

  select id into wrong_location_id
  from public.locations
  where slug = 'chatime-auckland-cbd';

  if product_id is null or location_id is null or wrong_location_id is null then
    raise exception 'seed is missing Picker Result fixtures';
  end if;

  insert into public.products (
    id, brand_id, category_id, name, slug, description, is_published
  )
  values (
    draft_product_id,
    brand_id,
    category_id,
    'Picker result private draft',
    'picker-result-private-draft',
    'Must not resolve as a public result.',
    false
  );

  insert into public.locations (
    id, brand_id, display_name, slug, suburb, address, coordinates, publication_status
  )
  values (
    draft_location_id,
    brand_id,
    'Picker result private draft store',
    'picker-result-private-draft-store',
    'Private area',
    'Not public, Auckland',
    extensions.st_setsrid(extensions.st_makepoint(174.7, -36.8), 4326)::extensions.geography,
    'draft'
  );

  insert into public.location_products (
    location_id, product_id, brand_id, price_cents, currency, availability_status
  )
  values
    (draft_location_id, product_id, brand_id, 850, 'NZD', 'available'),
    (location_id, draft_product_id, brand_id, 850, 'NZD', 'available');

  execute 'set local role anon';

  if not exists (
    select 1
    from public.products
    where id = product_id
  ) then
    raise exception 'published product is not visible to Picker Result';
  end if;

  if not exists (
    select 1
    from public.location_products as lp
    where lp.product_id = public_picker_result_workflow.product_id
      and lp.location_id = public_picker_result_workflow.location_id
      and lp.availability_status = 'available'
      and lp.price_cents = 690
      and lp.currency = 'NZD'
  ) then
    raise exception 'valid product/store price relationship is not visible to Picker Result';
  end if;

  if not exists (
    select 1
    from public.product_images as pi
    join public.image_assets as ia on ia.id = pi.image_id
    where pi.product_id = public_picker_result_workflow.product_id
      and ia.provenance = 'wemilktea'
  ) then
    raise exception 'public product image is not visible to Picker Result';
  end if;

  if exists (
    select 1
    from public.location_products as lp
    where lp.product_id = public_picker_result_workflow.product_id
      and lp.location_id = public_picker_result_workflow.wrong_location_id
  ) then
    raise exception 'wrong product/store relationship is visible to Picker Result';
  end if;

  if exists (select 1 from public.products where id = draft_product_id) then
    raise exception 'draft product is visible to Picker Result';
  end if;

  if exists (select 1 from public.locations where id = draft_location_id) then
    raise exception 'draft location is visible to Picker Result';
  end if;

  if exists (
    select 1
    from public.location_products as lp
    where lp.location_id = public_picker_result_workflow.draft_location_id
       or lp.product_id = public_picker_result_workflow.draft_product_id
  ) then
    raise exception 'draft relationship is visible to Picker Result';
  end if;

  execute 'reset role';
end;
$$;

rollback;
