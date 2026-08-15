begin;

do $$
<<workflow>>
declare
  admin_user_id uuid := extensions.gen_random_uuid();
  ordinary_user_id uuid := extensions.gen_random_uuid();
  brand_id uuid;
  category_id uuid;
  location_id uuid;
  other_brand_location_id uuid;
  product_id uuid;
  product_updated_at timestamptz;
  image_id uuid;
  public_count integer;
begin
  select id into brand_id from public.brands where slug = 'gong-cha';
  select id into category_id from public.categories where slug = 'milk-tea';
  select id into location_id from public.locations where slug = 'gong-cha-albany';
  select locations.id into other_brand_location_id
  from public.locations
  join public.brands on brands.id = locations.brand_id
  where brands.slug = 'chatime'
  limit 1;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  )
  values
    (extensions.gen_random_uuid(), admin_user_id, 'authenticated', 'authenticated', 'wm25-product-admin@example.test', 'not-used', '{}', '{}', now(), now()),
    (extensions.gen_random_uuid(), ordinary_user_id, 'authenticated', 'authenticated', 'wm25-product-user@example.test', 'not-used', '{}', '{}', now(), now());
  insert into public.admin_users (user_id) values (admin_user_id);

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', ordinary_user_id::text, true);
  begin
    perform public.create_product_management(brand_id, category_id, 'WM25 Denied Product', 'wm25-denied-product', null, '{}', false);
    raise exception 'ordinary authenticated user created a product';
  exception
    when raise_exception then
      if sqlerrm <> 'admin_access_required' then raise; end if;
    when insufficient_privilege then null;
  end;
  execute 'reset role';

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', admin_user_id::text, true);
  product_id := public.create_product_management(
    brand_id,
    category_id,
    'WM25 Brown Sugar Test',
    'wm25-brown-sugar-test',
    'A development product for the WM-25 workflow.',
    array['brown-sugar', 'test'],
    false
  );

  if not exists (select 1 from public.products p where p.id = workflow.product_id and not p.is_published) then
    raise exception 'new product was not created as a draft';
  end if;

  select p.updated_at into product_updated_at from public.products p where p.id = workflow.product_id;
  perform public.update_product_management(
    product_id,
    product_updated_at,
    brand_id,
    category_id,
    'WM25 Brown Sugar Updated',
    'wm25-brown-sugar-updated',
    'Updated description.',
    array['brown-sugar'],
    true
  );

  if not exists (select 1 from public.products p where p.id = workflow.product_id and p.name = 'WM25 Brown Sugar Updated' and p.is_seasonal) then
    raise exception 'product update did not persist canonical fields';
  end if;

  begin
    perform public.update_product_management(
      product_id,
      product_updated_at - interval '1 second',
      brand_id,
      category_id,
      'Stale Product',
      'stale-product',
      null,
      '{}',
      false
    );
    raise exception 'stale product update succeeded';
  exception
    when raise_exception then
      if sqlerrm <> 'stale_product_update' then raise; end if;
  end;

  begin
    perform public.publish_product(product_id);
  exception
    when others then
      raise exception 'valid product could not publish: %', sqlerrm;
  end;

  execute 'reset role';
  execute 'set local role anon';
  select count(*) into public_count from public.products p where p.id = workflow.product_id;
  if public_count <> 1 then raise exception 'published product is not publicly readable'; end if;
  execute 'reset role';

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', admin_user_id::text, true);
  perform public.set_product_location_availability(product_id, location_id, 'available', 750, 'NZD', 'wemilktea', null, now());
  perform public.set_product_location_availability(product_id, location_id, 'available', 780, 'NZD', 'wemilktea', null, now());

  if (select count(*) from public.location_products lp where lp.product_id = workflow.product_id and lp.location_id = workflow.location_id) <> 1
    or (select lp.price_cents from public.location_products lp where lp.product_id = workflow.product_id and lp.location_id = workflow.location_id) <> 780 then
    raise exception 'location availability did not upsert a single price relationship';
  end if;

  begin
    perform public.set_product_location_availability(product_id, other_brand_location_id, 'available', 750, 'NZD', 'wemilktea', null, now());
    raise exception 'cross-brand product/location relationship was accepted';
  exception
    when raise_exception then
      if sqlerrm <> 'product_location_brand_mismatch' then raise; end if;
  end;

  select attached.image_id into workflow.image_id
  from public.attach_product_image(
    product_id,
    'products/' || product_id || '/00000000-0000-0000-0000-000000000025.webp',
    'wemilktea',
    'WM25 test drink',
    'image/webp',
    1024,
    1200,
    1200
  ) attached;

  if not exists (
    select 1 from public.product_images pi
    where pi.product_id = workflow.product_id and pi.image_id = workflow.image_id and pi.is_primary
  ) then
    raise exception 'product image relationship was not created';
  end if;

  execute 'reset role';
  execute 'set local role anon';
  if not exists (select 1 from public.product_images pi where pi.product_id = workflow.product_id and pi.image_id = workflow.image_id)
    or not exists (select 1 from public.image_assets ia where ia.id = workflow.image_id) then
    raise exception 'published product image is not publicly readable';
  end if;
  begin
    insert into public.products (brand_id, category_id, name, slug)
    values (brand_id, category_id, 'Anonymous Product', 'anonymous-product');
    raise exception 'anonymous user inserted a product';
  exception
    when insufficient_privilege then null;
    when check_violation then null;
  end;
  execute 'reset role';

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', ordinary_user_id::text, true);
  begin
    perform public.attach_product_image(product_id, 'products/' || product_id || '/00000000-0000-0000-0000-000000000026.webp', 'wemilktea', 'Denied', 'image/webp', 100);
    raise exception 'ordinary authenticated user attached product image';
  exception
    when raise_exception then
      if sqlerrm <> 'admin_access_required' then raise; end if;
    when insufficient_privilege then null;
  end;
  execute 'reset role';

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', admin_user_id::text, true);
  perform public.remove_product_image(product_id);
  perform public.unpublish_product(product_id);
  execute 'reset role';

  execute 'set local role anon';
  if exists (select 1 from public.products p where p.id = workflow.product_id) then
    raise exception 'unpublished product is publicly readable';
  end if;
  if exists (select 1 from public.image_assets ia where ia.id = workflow.image_id) then
    raise exception 'unpublished product image metadata is publicly readable';
  end if;
  execute 'reset role';
end;
$$;

rollback;
