begin;

do $$
<<workflow>>
declare
  admin_user_id uuid := extensions.gen_random_uuid();
  brand_id uuid;
  location_id uuid := extensions.gen_random_uuid();
  category_id uuid;
  first_image_id uuid;
  second_image_id uuid;
  assigned_image_id uuid;
  created boolean;
  assigned boolean;
  previous_key text;
begin
  select id into brand_id from public.brands where slug = 'gong-cha';
  select id into category_id from public.categories where slug = 'milk-tea';
  if brand_id is null or category_id is null then
    raise exception 'WM-77 seed brand/category is missing';
  end if;

  if has_function_privilege(
       'anon',
       'public.upsert_store_showcase_image(text, text, text, text, text, text, text, bigint, integer, integer, text, smallint)',
       'execute'
     )
     or has_function_privilege(
       'authenticated',
       'public.upsert_store_showcase_image(text, text, text, text, text, text, text, bigint, integer, integer, text, smallint)',
       'execute'
     )
     or not has_function_privilege(
       'service_role',
       'public.upsert_store_showcase_image(text, text, text, text, text, text, text, bigint, integer, integer, text, smallint)',
       'execute'
     )
     or has_function_privilege(
       'anon',
       'public.assign_showcase_image_to_location(uuid, uuid)',
       'execute'
     )
     or has_function_privilege(
       'authenticated',
       'public.assign_showcase_image_to_location(uuid, uuid)',
       'execute'
     )
     or not has_function_privilege(
       'service_role',
       'public.assign_showcase_image_to_location(uuid, uuid)',
       'execute'
     ) then
    raise exception 'Store showcase RPC execute privileges are not service_role-only';
  end if;

  insert into public.locations (
    id, brand_id, display_name, slug, suburb, address, coordinates,
    publication_status, source_provenance
  )
  values (
    location_id,
    brand_id,
    'WM-77 Store Image Test Location',
    'wm-77-store-image-test-location',
    'Auckland CBD',
    '1 WM-77 Test Street, Auckland',
    extensions.st_setsrid(extensions.st_makepoint(174.7633, -36.8485), 4326)::extensions.geography,
    'draft',
    'wemilktea'
  );

  execute 'set local role authenticated';
  begin
    perform public.upsert_store_showcase_image(
      'pexels', 'wm77-denied', 'showcase/pexels/wm77-denied.jpg',
      'https://www.pexels.com/photo/wm77-denied/',
      'Photo by Example via Pexels', 'Bubble tea shop interior',
      'image/jpeg', 1024, 1200, 800, 'bubble tea shop', 0::smallint
    );
    raise exception 'authenticated user imported Store showcase image';
  exception
    when insufficient_privilege then null;
  end;
  execute 'reset role';

  execute 'set local role service_role';

  select result.image_id, result.created
  into first_image_id, created
  from public.upsert_showcase_image(
    category_id,
    'pexels',
    'wm77-cross-pool',
    'showcase/pexels/wm77-cross-pool.jpg',
    'https://www.pexels.com/photo/wm77-cross-pool/',
    'Photo by Example via Pexels',
    'Milk Tea showcase image',
    'image/jpeg',
    1024,
    1200,
    800,
    'milk tea',
    0::smallint
  ) as result;
  if first_image_id is null or created is not true then
    raise exception 'Product showcase source was not created';
  end if;

  select result.image_id, result.created
  into assigned_image_id, created
  from public.upsert_store_showcase_image(
    'pexels',
    'wm77-cross-pool',
    'showcase/pexels/wm77-cross-pool.jpg',
    'https://www.pexels.com/photo/wm77-cross-pool/',
    'Photo by Example via Pexels',
    'Bubble tea shop interior',
    'image/jpeg',
    1024,
    1200,
    800,
    'bubble tea shop',
    0::smallint
  ) as result;
  if assigned_image_id <> first_image_id or created is not true then
    raise exception 'Store pool did not reuse the Product showcase asset';
  end if;

  select result.image_id, result.created
  into assigned_image_id, created
  from public.upsert_store_showcase_image(
    'pexels',
    'wm77-cross-pool',
    'showcase/pexels/wm77-cross-pool.jpg',
    'https://www.pexels.com/photo/wm77-cross-pool/',
    'Photo by Example via Pexels',
    'Bubble tea shop interior',
    'image/jpeg',
    1024,
    1200,
    800,
    'bubble tea shop',
    0::smallint
  ) as result;
  if assigned_image_id <> first_image_id or created is not false then
    raise exception 'Repeated Store showcase import was not idempotent';
  end if;

  execute 'reset role';
  update public.store_showcase_image_pool
  set is_active = false
  where provider = 'pexels' and external_photo_id = 'wm77-cross-pool';
  execute 'set local role service_role';
  begin
    perform public.assign_showcase_image_to_location(location_id, first_image_id);
    raise exception 'inactive Store showcase image was assignable';
  exception
    when others then
      if sqlerrm <> 'store_showcase_image_not_available' then raise; end if;
  end;
  execute 'reset role';
  update public.store_showcase_image_pool
  set is_active = true
  where provider = 'pexels' and external_photo_id = 'wm77-cross-pool';
  execute 'set local role service_role';

  select result.image_id, result.assigned
  into assigned_image_id, assigned
  from public.assign_showcase_image_to_location(location_id, first_image_id) as result;
  if assigned_image_id <> first_image_id or assigned is not true then
    raise exception 'Store showcase image was not assigned';
  end if;

  select result.image_id, result.assigned
  into assigned_image_id, assigned
  from public.assign_showcase_image_to_location(location_id, first_image_id) as result;
  if assigned_image_id <> first_image_id or assigned is not false then
    raise exception 'Repeated Store showcase assignment was not idempotent';
  end if;

  execute 'reset role';
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  )
  values (
    extensions.gen_random_uuid(), admin_user_id, 'authenticated', 'authenticated',
    'wm77-store-image-admin@example.test', 'not-used', '{}', '{}', now(), now()
  );
  insert into public.admin_users (user_id) values (admin_user_id);

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', admin_user_id::text, true);
  previous_key := public.remove_location_image(location_id);
  if previous_key is not null
    or exists (select 1 from public.location_images where location_id = workflow.location_id)
    or not exists (select 1 from public.image_assets where id = workflow.first_image_id)
    or not exists (select 1 from public.store_showcase_image_pool where image_id = workflow.first_image_id) then
    raise exception 'removing a Store pool image deleted reusable stock metadata';
  end if;
  execute 'reset role';

  execute 'set local role service_role';
  select result.image_id, result.assigned
  into assigned_image_id, assigned
  from public.assign_showcase_image_to_location(location_id, first_image_id) as result;
  if assigned_image_id <> first_image_id or assigned is not true then
    raise exception 'Store showcase image could not be reassigned after removal';
  end if;

  select result.image_id, result.created
  into second_image_id, created
  from public.upsert_store_showcase_image(
    'pexels',
    'wm77-second',
    'showcase/pexels/wm77-second.jpg',
    'https://www.pexels.com/photo/wm77-second/',
    'Photo by Example via Pexels',
    'Bubble tea counter',
    'image/jpeg',
    1024,
    1200,
    800,
    'bubble tea counter',
    1::smallint
  ) as result;
  execute 'reset role';
  if second_image_id is null or created is not true then
    raise exception 'Second Store showcase image was not created';
  end if;

  execute 'set local role service_role';
  select result.image_id, result.assigned
  into assigned_image_id, assigned
  from public.assign_showcase_image_to_location(location_id, second_image_id) as result;
  execute 'reset role';
  if assigned_image_id <> first_image_id or assigned is not false
    or exists (
      select 1 from public.location_images
      where location_id = workflow.location_id
        and image_id = workflow.second_image_id
        and is_primary
    ) then
    raise exception 'existing primary Store image was replaced';
  end if;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', admin_user_id::text, true);
  select attached.previous_storage_key into previous_key
  from public.attach_location_image(
    location_id,
    'stores/' || location_id || '/00000000-0000-0000-0000-000000000077.jpg',
    'merchant',
    'Merchant replacement',
    'image/jpeg',
    1024,
    1200,
    800
  ) as attached;
  if previous_key is not null
    or exists (select 1 from public.image_assets where id = workflow.first_image_id)
       is not true
    or exists (select 1 from public.store_showcase_image_pool where image_id = workflow.first_image_id)
       is not true then
    raise exception 'replacing a Store pool image exposed a deletable storage key';
  end if;
  execute 'reset role';
end;
$$;

rollback;
