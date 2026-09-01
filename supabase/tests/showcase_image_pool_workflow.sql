begin;

select plan(1);

do $$
<<workflow>>
declare
  admin_user_id uuid := extensions.gen_random_uuid();
  ordinary_user_id uuid := extensions.gen_random_uuid();
  brand_id uuid;
  category_id uuid;
  first_product_id uuid;
  second_product_id uuid;
  showcase_image_id uuid;
  assigned_image_id uuid;
  created boolean;
  assigned boolean;
  previous_key text;
begin
  select id into brand_id from public.brands where slug = 'gong-cha';
  select id into category_id from public.categories where slug = 'milk-tea';
  if brand_id is null or category_id is null then
    raise exception 'WM-62 seed brand/category is missing';
  end if;

  if has_function_privilege(
       'anon',
       'public.upsert_showcase_image(uuid, text, text, text, text, text, text, text, bigint, integer, integer, text, smallint)',
       'execute'
     )
     or has_function_privilege(
       'authenticated',
       'public.upsert_showcase_image(uuid, text, text, text, text, text, text, text, bigint, integer, integer, text, smallint)',
       'execute'
     )
     or not has_function_privilege(
       'service_role',
       'public.upsert_showcase_image(uuid, text, text, text, text, text, text, text, bigint, integer, integer, text, smallint)',
       'execute'
     )
     or has_function_privilege(
       'anon',
       'public.assign_showcase_image_to_product(uuid, uuid)',
       'execute'
     )
     or has_function_privilege(
       'authenticated',
       'public.assign_showcase_image_to_product(uuid, uuid)',
       'execute'
     )
     or not has_function_privilege(
       'service_role',
       'public.assign_showcase_image_to_product(uuid, uuid)',
       'execute'
     ) then
    raise exception 'showcase RPC execute privileges are not service_role-only';
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  )
  values
    (extensions.gen_random_uuid(), admin_user_id, 'authenticated', 'authenticated', 'wm62-showcase-admin@example.test', 'not-used', '{}', '{}', now(), now()),
    (extensions.gen_random_uuid(), ordinary_user_id, 'authenticated', 'authenticated', 'wm62-showcase-user@example.test', 'not-used', '{}', '{}', now(), now());
  insert into public.admin_users (user_id) values (admin_user_id);

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', ordinary_user_id::text, true);
  begin
    perform public.upsert_showcase_image(
      category_id,
      'pexels',
      'wm62-denied',
      'showcase/pexels/wm62-denied.jpg',
      'https://www.pexels.com/photo/wm62-denied/',
      'Photo by Example via Pexels',
      'Denied showcase image',
      'image/jpeg',
      1024,
      1200,
      800,
      'milk tea',
      0::smallint
    );
    raise exception 'ordinary authenticated user imported showcase image';
  exception
    when insufficient_privilege then null;
  end;
  execute 'reset role';

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', admin_user_id::text, true);
  select public.create_product_management(
    brand_id,
    category_id,
    'WM62 Showcase Product One',
    'wm62-showcase-product-one',
    'Temporary showcase test product.',
    '{}',
    false
  ) into first_product_id;
  select public.create_product_management(
    brand_id,
    category_id,
    'WM62 Showcase Product Two',
    'wm62-showcase-product-two',
    'Temporary showcase test product.',
    '{}',
    false
  ) into second_product_id;
  execute 'reset role';

  execute 'set local role authenticated';
  begin
    perform public.assign_showcase_image_to_product(first_product_id, extensions.gen_random_uuid());
    raise exception 'authenticated user assigned showcase image';
  exception
    when insufficient_privilege then null;
  end;
  execute 'reset role';

  execute 'set local role service_role';

  select result.image_id, result.created
  into showcase_image_id, created
  from public.upsert_showcase_image(
    category_id,
    'pexels',
    'wm62-shared',
    'showcase/pexels/wm62-shared.jpg',
    'https://www.pexels.com/photo/wm62-shared/',
    'Photo by Example via Pexels',
    'Milk Tea showcase image',
    'image/jpeg',
    1024,
    1200,
    800,
    'milk tea',
    0::smallint
  ) as result;
  if showcase_image_id is null or created is not true then
    raise exception 'showcase image was not created';
  end if;

  select result.image_id, result.created
  into assigned_image_id, created
  from public.upsert_showcase_image(
    category_id,
    'pexels',
    'wm62-shared',
    'showcase/pexels/wm62-shared.jpg',
    'https://www.pexels.com/photo/wm62-shared/',
    'Photo by Example via Pexels',
    'Milk Tea showcase image',
    'image/jpeg',
    1024,
    1200,
    800,
    'milk tea',
    0::smallint
  ) as result;
  if assigned_image_id <> showcase_image_id or created is not false then
    raise exception 'repeated showcase import was not idempotent';
  end if;

  execute 'reset role';
  insert into public.product_images (product_id, image_id, sort_order, is_primary)
  values (first_product_id, showcase_image_id, 9, false);
  execute 'set local role service_role';

  select result.image_id, result.assigned
  into assigned_image_id, assigned
  from public.assign_showcase_image_to_product(first_product_id, showcase_image_id) as result;
  execute 'reset role';
  if assigned_image_id <> showcase_image_id
    or assigned is not true
    or not exists (
      select 1
      from public.product_images
      where product_id = first_product_id
        and image_id = showcase_image_id
        and sort_order = 0
        and is_primary
    ) then
    raise exception 'assignment did not update the existing product_images primary-key conflict';
  end if;

  execute 'set local role service_role';
  perform public.assign_showcase_image_to_product(second_product_id, showcase_image_id);
  execute 'reset role';
  if (select count(*) from public.product_images where product_images.image_id = workflow.showcase_image_id and is_primary) <> 2 then
    raise exception 'one showcase asset was not shared across two products';
  end if;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', admin_user_id::text, true);
  previous_key := public.remove_product_image(first_product_id);
  if previous_key is not null
    or exists (select 1 from public.product_images where product_id = first_product_id and is_primary)
    or not exists (select 1 from public.image_assets where image_assets.id = workflow.showcase_image_id)
    or not exists (select 1 from public.showcase_image_pool where showcase_image_pool.image_id = workflow.showcase_image_id) then
    raise exception 'removing one shared showcase relationship removed the pool asset';
  end if;

  select attached.previous_storage_key into previous_key
  from public.attach_product_image(
    second_product_id,
    'products/' || second_product_id || '/00000000-0000-0000-0000-000000000062.jpg',
    'merchant',
    'Merchant replacement',
    'image/jpeg',
    1024,
    1200,
    800
  ) as attached;
  if previous_key is not null
    or not exists (select 1 from public.image_assets where image_assets.id = workflow.showcase_image_id)
    or not exists (select 1 from public.showcase_image_pool where showcase_image_pool.image_id = workflow.showcase_image_id) then
    raise exception 'replacing one shared showcase relationship removed the pool asset';
  end if;

  execute 'reset role';
end;
$$;

select pass('product showcase image pool workflow completed');
select * from finish();

rollback;
