begin;

do $$
<<workflow>>
declare
  brand_id uuid;
  category_id uuid;
  published_product_id uuid;
  draft_product_id uuid := extensions.gen_random_uuid();
  draft_image_id uuid := extensions.gen_random_uuid();
  expected_available_count integer;
  public_available_count integer;
begin
  select id into brand_id from public.brands where slug = 'gong-cha';
  select id into category_id from public.categories where slug = 'milk-tea';
  select products.id into published_product_id
  from public.products
  where products.slug = 'brown-sugar-pearl-milk-tea'
    and products.brand_id = workflow.brand_id;

  if workflow.published_product_id is null then
    raise exception 'seed does not include the published product';
  end if;

  insert into public.products (
    id, brand_id, category_id, name, slug, description, is_published
  )
  values (
    workflow.draft_product_id,
    workflow.brand_id,
    workflow.category_id,
    'Private Draft Drink',
    'private-draft-drink',
    'Must not be visible publicly.',
    false
  );

  insert into public.image_assets (
    id, provenance, storage_key, alt_text
  )
  values (
    workflow.draft_image_id,
    'wemilktea',
    'products/' || workflow.draft_product_id || '/00000000-0000-0000-0000-000000000099.jpg',
    'Private draft image'
  );

  insert into public.product_images (product_id, image_id, is_primary)
  values (workflow.draft_product_id, workflow.draft_image_id, true);

  select count(*) into expected_available_count
  from public.location_products
  join public.locations on locations.id = location_products.location_id
  join public.brands on brands.id = locations.brand_id
  join public.products on products.id = location_products.product_id
  join public.categories on categories.id = products.category_id
  where location_products.product_id = workflow.published_product_id
    and location_products.availability_status = 'available'
    and locations.publication_status = 'published'
    and brands.is_published
    and products.is_published
    and categories.is_published;

  if expected_available_count <> 2 then
    raise exception 'seed availability count expected 2, got %', expected_available_count;
  end if;

  execute 'set local role anon';

  if not exists (
    select 1 from public.products where id = workflow.published_product_id
  ) then
    raise exception 'published product is not publicly readable';
  end if;

  if exists (
    select 1 from public.products where id = workflow.draft_product_id
  ) then
    raise exception 'draft product is publicly readable';
  end if;

  select count(*) into public_available_count
  from public.location_products
  where product_id = workflow.published_product_id
    and availability_status = 'available';
  if public_available_count <> expected_available_count then
    raise exception 'public availability count is not filtered to published locations';
  end if;

  if not exists (
    select 1
    from public.product_images
    where product_id = workflow.published_product_id and is_primary
  ) then
    raise exception 'published product image metadata is not publicly readable';
  end if;

  if exists (
    select 1
    from public.product_images
    where product_id = workflow.draft_product_id
  ) then
    raise exception 'draft product image metadata is publicly readable';
  end if;

  begin
    select count(*) from public.store_candidates;
    raise exception 'candidate data is publicly readable from Drinks';
  exception
    when insufficient_privilege then null;
  end;

  execute 'reset role';
end;
$$;

rollback;
