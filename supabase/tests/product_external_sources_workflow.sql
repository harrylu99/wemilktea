begin;

select plan(26);

do $$
declare
  admin_user_id uuid := extensions.gen_random_uuid();
  ordinary_user_id uuid := extensions.gen_random_uuid();
  v_brand_id uuid;
  v_category_id uuid;
  v_location_id uuid;
  v_existing_product_id uuid;
  v_ambiguous_product_id uuid;
begin
  select brands.id into v_brand_id
  from public.brands
  where brands.slug = 'gong-cha';
  select categories.id into v_category_id
  from public.categories
  where categories.slug = 'milk-tea';
  select locations.id into v_location_id
  from public.locations
  where locations.slug = 'gong-cha-albany';
  select products.id into v_existing_product_id
  from public.products
  where products.brand_id = v_brand_id
    and products.slug = 'brown-sugar-pearl-milk-tea';

  if v_brand_id is null or v_category_id is null or v_location_id is null or v_existing_product_id is null then
    raise exception 'WM-54 test seed catalogue is missing';
  end if;

  insert into public.products (
    v_brand_id,
    v_category_id,
    name,
    slug,
    description,
    is_published
  )
  values (
    brand_id,
    category_id,
    'WM-54 Ambiguous Tea',
    'wm-54-ambiguous-tea-legacy',
    'Existing ambiguous product.',
    false
  )
  returning id into v_ambiguous_product_id;

  insert into auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at
  )
  values
    (
      extensions.gen_random_uuid(),
      admin_user_id,
      'authenticated',
      'authenticated',
      admin_user_id::text || '@example.test',
      'not-used',
      '{}',
      '{}',
      now(),
      now()
    ),
    (
      extensions.gen_random_uuid(),
      ordinary_user_id,
      'authenticated',
      'authenticated',
      ordinary_user_id::text || '@example.test',
      'not-used',
      '{}',
      '{}',
      now(),
      now()
    );

  insert into public.admin_users (user_id) values (admin_user_id);
  insert into public.product_external_sources (
    product_id,
    location_id,
    provider,
    external_item_id
  )
  values (
    v_existing_product_id,
    v_location_id,
    'uber_eats',
    'wm54-conflicting-external-id'
  );

  perform set_config('wm54.admin_user_id', admin_user_id::text, true);
  perform set_config('wm54.ordinary_user_id', ordinary_user_id::text, true);
  perform set_config('wm54.location_id', v_location_id::text, true);
  perform set_config('wm54.brand_id', v_brand_id::text, true);
  perform set_config('wm54.category_id', v_category_id::text, true);
  perform set_config('wm54.existing_product_id', v_existing_product_id::text, true);
  perform set_config('wm54.ambiguous_product_id', v_ambiguous_product_id::text, true);
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('wm54.admin_user_id'), true);

select lives_ok(
  $$
    select public.confirm_external_menu_import(
      current_setting('wm54.location_id')::uuid,
      'uber_eats',
      jsonb_build_array(jsonb_build_object(
        'externalItemId', 'wm54-new-item',
        'name', 'WM-54 New Draft Tea',
        'description', 'Created by the reviewed menu import.',
        'targetCategoryId', current_setting('wm54.category_id')
      ))
    )
  $$,
  'admin can confirm a valid reviewed menu item'
);

select is(
  (
    select (public.confirm_external_menu_import(
      current_setting('wm54.location_id')::uuid,
      'uber_eats',
      jsonb_build_array(jsonb_build_object(
        'externalItemId', 'wm54-new-item',
        'name', 'WM-54 New Draft Tea',
        'description', 'Created by the reviewed menu import.',
        'targetCategoryId', current_setting('wm54.category_id')
      ))
    )->>'status')
  ),
  'success',
  'repeating the same confirmation succeeds'
);

select is(
  (
    select count(*)
    from public.products
    where brand_id = current_setting('wm54.brand_id')::uuid
      and slug = 'wm-54-new-draft-tea'
      and is_published = false
      and category_id = current_setting('wm54.category_id')::uuid
  ),
  1::bigint,
  'new product is created once as a draft with the reviewed category'
);

select is(
  (
    select count(*)
    from public.location_products
    where location_id = current_setting('wm54.location_id')::uuid
      and product_id = (
        select id from public.products
        where brand_id = current_setting('wm54.brand_id')::uuid
          and slug = 'wm-54-new-draft-tea'
      )
      and price_cents is null
      and currency = 'NZD'
      and availability_status = 'unknown'
      and source_provenance = 'wemilktea'
  ),
  1::bigint,
  'new location relationship contains no imported price and remains unknown'
);

select is(
  (
    select count(*)
    from public.product_external_sources
    where location_id = current_setting('wm54.location_id')::uuid
      and provider = 'uber_eats'
      and external_item_id = 'wm54-new-item'
      and product_id = (
        select id from public.products
        where brand_id = current_setting('wm54.brand_id')::uuid
          and slug = 'wm-54-new-draft-tea'
      )
  ),
  1::bigint,
  'provider-neutral provenance is recorded for the new item'
);

select is(
  (
    select count(*)
    from public.product_images
    where product_id = (
      select id from public.products
      where brand_id = current_setting('wm54.brand_id')::uuid
        and slug = 'wm-54-new-draft-tea'
    )
  ),
  0::bigint,
  'external images are not copied into product images'
);

select is(
  (
    select count(*)
    from public.products
    where brand_id = current_setting('wm54.brand_id')::uuid
      and slug = 'wm-54-new-draft-tea'
  ),
  1::bigint,
  'rerun does not create a duplicate canonical product'
);

select is(
  (
    select count(*)
    from public.product_external_sources
    where location_id = current_setting('wm54.location_id')::uuid
      and provider = 'uber_eats'
      and external_item_id = 'wm54-new-item'
  ),
  1::bigint,
  'rerun does not duplicate provenance'
);

select is(
  (
    select count(*)
    from public.location_products
    where location_id = current_setting('wm54.location_id')::uuid
      and product_id = (
        select id from public.products
        where brand_id = current_setting('wm54.brand_id')::uuid
          and slug = 'wm-54-new-draft-tea'
      )
  ),
  1::bigint,
  'rerun does not duplicate the location relationship'
);

select is(
  (
    select count(*)
    from public.product_images
    where product_id = current_setting('wm54.existing_product_id')::uuid
  ),
  1::bigint,
  'seeded existing product image remains untouched'
);

select is(
  (
    select (public.confirm_external_menu_import(
      current_setting('wm54.location_id')::uuid,
      'uber_eats',
      jsonb_build_array(jsonb_build_object(
        'externalItemId', 'wm54-existing-item',
        'name', 'Brown Sugar Pearl Milk Tea',
        'description', 'Do not overwrite curated content.',
        'targetCategoryId', current_setting('wm54.category_id')
      ))
    )->>'status')
  ),
  'success',
  'exact existing product is safely reused'
);

select is(
  (
    select count(*)
    from public.products
    where id = current_setting('wm54.existing_product_id')::uuid
      and is_published = true
      and description = 'Black tea, milk and brown sugar pearls.'
  ),
  1::bigint,
  'existing product content and publication state are preserved'
);

select is(
  (
    select count(*)
    from public.product_external_sources
    where product_id = current_setting('wm54.existing_product_id')::uuid
      and external_item_id = 'wm54-existing-item'
  ),
  1::bigint,
  'existing product receives provenance without a product update'
);

select is(
  (
    select count(*)
    from public.location_products
    where location_id = current_setting('wm54.location_id')::uuid
      and product_id = current_setting('wm54.existing_product_id')::uuid
      and price_cents = 690
      and currency = 'NZD'
      and availability_status = 'available'
      and source_provenance = 'merchant'
  ),
  1::bigint,
  'existing curated location pricing and availability are preserved'
);

select is(
  (
    select (public.confirm_external_menu_import(
      current_setting('wm54.location_id')::uuid,
      'uber_eats',
      jsonb_build_array(jsonb_build_object(
        'externalItemId', 'wm54-ambiguous-item',
        'name', 'WM-54 Ambiguous Tea',
        'description', 'Should be blocked.',
        'targetCategoryId', current_setting('wm54.category_id')
      ))
    )->>'status')
  ),
  'validation_failed',
  'ambiguous same-brand name fails safely'
);

select is(
  (
    select count(*)
    from public.products
    where id = current_setting('wm54.ambiguous_product_id')::uuid
  ),
  1::bigint,
  'ambiguous validation does not alter the existing product'
);

select is(
  (
    select (public.confirm_external_menu_import(
      current_setting('wm54.location_id')::uuid,
      'uber_eats',
      jsonb_build_array(jsonb_build_object(
        'externalItemId', 'wm54-invalid-category',
        'name', 'WM-54 Invalid Category Tea',
        'description', null,
        'targetCategoryId', extensions.gen_random_uuid()
      ))
    )->>'status')
  ),
  'validation_failed',
  'missing category fails before any write'
);

select is(
  (
    select count(*)
    from public.products
    where brand_id = current_setting('wm54.brand_id')::uuid
      and slug = 'wm-54-invalid-category-tea'
  ),
  0::bigint,
  'invalid category does not create a product'
);

select is(
  (
    select (public.confirm_external_menu_import(
      current_setting('wm54.location_id')::uuid,
      'uber_eats',
      jsonb_build_array(
        jsonb_build_object(
          'externalItemId', 'wm54-partial-valid',
          'name', 'WM-54 Partial Valid Tea',
          'description', null,
          'targetCategoryId', current_setting('wm54.category_id')
        ),
        jsonb_build_object(
          'externalItemId', 'wm54-partial-invalid',
          'name', 'WM-54 Partial Invalid Tea',
          'description', null,
          'targetCategoryId', extensions.gen_random_uuid()
        )
      )
    )->>'status')
  ),
  'validation_failed',
  'a mixed valid and invalid selection is reported atomically'
);

select is(
  (
    select count(*)
    from public.products
    where brand_id = current_setting('wm54.brand_id')::uuid
      and slug = 'wm-54-partial-valid-tea'
  ),
  0::bigint,
  'atomic validation prevents a partial product write'
);

select is(
  (
    select (public.confirm_external_menu_import(
      current_setting('wm54.location_id')::uuid,
      'uber_eats',
      '[]'::jsonb
    )->>'status')
  ),
  'success',
  'an empty selection is a no-op'
);

select is(
  (
    select (public.confirm_external_menu_import(
      current_setting('wm54.location_id')::uuid,
      'uber_eats',
      jsonb_build_array(jsonb_build_object(
        'externalItemId', 'wm54-conflicting-external-id',
        'name', 'WM-54 Different Name',
        'description', null,
        'targetCategoryId', current_setting('wm54.category_id')
      ))
    )->>'status')
  ),
  'validation_failed',
  'conflicting provenance mapping fails safely'
);

set local role anon;
select set_config('request.jwt.claim.sub', '', true);

select throws_ok(
  $$select count(*) from public.product_external_sources$$,
  '42501',
  null,
  'anonymous users cannot read product provenance'
);

select throws_ok(
  $$
    select public.confirm_external_menu_import(
      current_setting('wm54.location_id')::uuid,
      'uber_eats',
      '[]'::jsonb
    )
  $$,
  'P0001',
  'admin_access_required',
  'anonymous users cannot confirm imports'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('wm54.ordinary_user_id'), true);

select throws_ok(
  $$select count(*) from public.product_external_sources$$,
  '42501',
  null,
  'ordinary authenticated users cannot read product provenance'
);

select throws_ok(
  $$
    select public.confirm_external_menu_import(
      current_setting('wm54.location_id')::uuid,
      'uber_eats',
      '[]'::jsonb
    )
  $$,
  'P0001',
  'admin_access_required',
  'ordinary authenticated users cannot confirm imports'
);

select * from finish();
rollback;
