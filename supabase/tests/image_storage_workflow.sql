begin;

do $$
declare
  admin_user_id uuid := extensions.gen_random_uuid();
  ordinary_user_id uuid := extensions.gen_random_uuid();
  published_location_id uuid;
  draft_location_id uuid;
  brand_id uuid;
  first_image_id uuid;
  second_image_id uuid;
  previous_key text;
begin
  select id into published_location_id
  from public.locations
  where slug = 'gong-cha-albany';

  if published_location_id is null then
    raise exception 'published seed location is missing';
  end if;

  select locations.brand_id into brand_id
  from public.locations
  where locations.id = published_location_id;

  insert into public.locations (
    brand_id,
    display_name,
    slug,
    suburb,
    address,
    coordinates,
    publication_status,
    source_provenance
  )
  values (
    brand_id,
    'WM24 Draft Image Store',
    'wm24-draft-image-store',
    'Auckland CBD',
    '1 Image Test Street, Auckland',
    extensions.st_setsrid(extensions.st_makepoint(174.7633, -36.8485), 4326)::extensions.geography,
    'draft',
    'wemilktea'
  )
  returning id into draft_location_id;

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
      'wm24-image-admin@example.test',
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
      'wm24-image-user@example.test',
      'not-used',
      '{}',
      '{}',
      now(),
      now()
    );
  insert into public.admin_users (user_id) values (admin_user_id);

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', ordinary_user_id::text, true);
  begin
    perform public.attach_location_image(
      published_location_id,
      'stores/' || published_location_id || '/00000000-0000-0000-0000-000000000001.webp',
      'wemilktea',
      'Not allowed',
      'image/webp',
      1024
    );
    raise exception 'ordinary authenticated user attached image metadata';
  exception
    when raise_exception then
      if sqlerrm <> 'admin_access_required' then
        raise;
      end if;
  end;
  execute 'reset role';

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', admin_user_id::text, true);

  select image_id, previous_storage_key
  into first_image_id, previous_key
  from public.attach_location_image(
    published_location_id,
    'stores/' || published_location_id || '/00000000-0000-0000-0000-000000000001.webp',
    'wemilktea',
    'Gong cha Albany storefront',
    'image/webp',
    1024,
    1200,
    800
  );

  if first_image_id is null or previous_key is not null then
    raise exception 'first image attachment did not create the expected primary image';
  end if;

  if not exists (
    select 1
    from public.location_images
    where location_id = published_location_id
      and image_id = first_image_id
      and is_primary
  ) then
    raise exception 'location image relationship was not created';
  end if;

  if not exists (
    select 1
    from public.image_assets
    where id = first_image_id
      and provenance = 'wemilktea'
      and storage_key like 'stores/' || published_location_id || '/%'
      and content_type = 'image/webp'
      and byte_size = 1024
      and width = 1200
      and height = 800
  ) then
    raise exception 'owned image metadata was not persisted correctly';
  end if;

  select image_id, previous_storage_key
  into second_image_id, previous_key
  from public.attach_location_image(
    published_location_id,
    'stores/' || published_location_id || '/00000000-0000-0000-0000-000000000002.png',
    'merchant',
    'Replacement storefront',
    'image/png',
    2048
  );

  if second_image_id is null or previous_key is null then
    raise exception 'replacement did not report the previous object key';
  end if;

  if exists (select 1 from public.image_assets where id = first_image_id)
    or not exists (
      select 1
      from public.location_images
      where location_id = published_location_id
        and image_id = second_image_id
        and is_primary
    ) then
    raise exception 'replacement left stale metadata or lost the primary relationship';
  end if;

  perform public.attach_location_image(
    draft_location_id,
    'stores/' || draft_location_id || '/00000000-0000-0000-0000-000000000004.webp',
    'wemilktea',
    'Draft image',
    'image/webp',
    1024
  );

  execute 'reset role';
  execute 'set local role anon';

  if not exists (
    select 1
    from public.location_images
    where location_id = published_location_id
      and image_id = second_image_id
  ) then
    raise exception 'public users cannot read published image relationships';
  end if;

  if not exists (
    select 1
    from public.image_assets
    where id = second_image_id
      and storage_key like 'stores/' || published_location_id || '/%'
  ) then
    raise exception 'public users cannot read published image metadata';
  end if;

  if exists (
    select 1
    from public.location_images
    where location_id = draft_location_id
  ) then
    raise exception 'anonymous users can read draft image relationships';
  end if;

  begin
    insert into public.image_assets (provenance, storage_key, content_type, byte_size)
    values ('wemilktea', 'stores/' || published_location_id || '/00000000-0000-0000-0000-000000000003.webp', 'image/webp', 100);
    raise exception 'anonymous users can insert image metadata';
  exception
    when insufficient_privilege then null;
  end;

  execute 'reset role';
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', admin_user_id::text, true);
  previous_key := public.remove_location_image(published_location_id);

  if previous_key is null
    or exists (select 1 from public.location_images where location_id = published_location_id) then
    raise exception 'image removal did not preserve expected metadata cleanup state';
  end if;

  if exists (select 1 from public.image_assets where id = second_image_id) then
    raise exception 'orphaned image metadata was not removed';
  end if;

  execute 'reset role';
end;
$$;

rollback;
