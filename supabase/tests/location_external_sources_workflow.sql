begin;

do $$
declare
  admin_user_id uuid := extensions.gen_random_uuid();
  ordinary_user_id uuid := extensions.gen_random_uuid();
  brand_id uuid;
  first_location_id uuid := extensions.gen_random_uuid();
  second_location_id uuid := extensions.gen_random_uuid();
  mapping_id uuid;
  mapping_count integer;
begin
  select id into brand_id
  from public.brands
  where slug = 'gong-cha';

  if brand_id is null then
    raise exception 'WM-51 test seed brand is missing';
  end if;

  insert into public.locations (
    id,
    brand_id,
    display_name,
    slug,
    suburb,
    address,
    coordinates,
    publication_status,
    source_provenance
  )
  values
    (
      first_location_id,
      brand_id,
      'WM-51 External Mapping One',
      'wm-51-external-mapping-one',
      'Auckland CBD',
      '1 WM-51 Test Street, Auckland',
      extensions.st_setsrid(extensions.st_makepoint(174.7633, -36.8485), 4326)::extensions.geography,
      'draft',
      'wemilktea'
    ),
    (
      second_location_id,
      brand_id,
      'WM-51 External Mapping Two',
      'wm-51-external-mapping-two',
      'Auckland CBD',
      '2 WM-51 Test Street, Auckland',
      extensions.st_setsrid(extensions.st_makepoint(174.7643, -36.8485), 4326)::extensions.geography,
      'draft',
      'wemilktea'
    );

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

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', ordinary_user_id::text, true);

  begin
    select count(*) into mapping_count
    from public.location_external_sources;
    if mapping_count <> 0 then
      raise exception 'ordinary authenticated user can read external mappings';
    end if;
  exception
    when insufficient_privilege then null;
  end;

  begin
    insert into public.location_external_sources (
      location_id,
      provider,
      external_store_id
    )
    values (first_location_id, 'uber_eats', 'ordinary-user-store');
    raise exception 'ordinary authenticated user inserted an external mapping';
  exception
    when insufficient_privilege then null;
  end;

  perform set_config('request.jwt.claim.sub', admin_user_id::text, true);

  insert into public.location_external_sources (
    location_id,
    provider,
    external_store_id,
    verified_at
  )
  values (
    first_location_id,
    'uber_eats',
    'bff943ba-f5d8-4773-9699-f2109743369c',
    now()
  )
  returning id into mapping_id;

  select count(*) into mapping_count
  from public.location_external_sources
  where id = mapping_id;
  if mapping_count <> 1 then
    raise exception 'authorized admin could not read a valid external mapping';
  end if;

  update public.location_external_sources
  set verified_at = now()
  where id = mapping_id;

  begin
    insert into public.location_external_sources (
      location_id,
      provider,
      external_store_id
    )
    values (first_location_id, 'uber_eats', 'different-store');
    raise exception 'duplicate location/provider mapping was accepted';
  exception
    when unique_violation then null;
  end;

  begin
    insert into public.location_external_sources (
      location_id,
      provider,
      external_store_id
    )
    values (second_location_id, 'uber_eats', 'bff943ba-f5d8-4773-9699-f2109743369c');
    raise exception 'duplicate provider/external identity was accepted';
  exception
    when unique_violation then null;
  end;

  begin
    insert into public.location_external_sources (
      location_id,
      provider,
      external_store_id
    )
    values (extensions.gen_random_uuid(), 'uber_eats', 'missing-location-store');
    raise exception 'mapping with a missing canonical location was accepted';
  exception
    when foreign_key_violation then null;
  end;

  begin
    insert into public.location_external_sources (
      location_id,
      provider,
      external_store_id
    )
    values (second_location_id, 'doordash', 'future-provider-store');
    raise exception 'unsupported provider was accepted';
  exception
    when check_violation then null;
  end;

  execute 'reset role';
  execute 'set local role anon';

  begin
    select count(*) into mapping_count
    from public.location_external_sources;
    raise exception 'anonymous users can read external mappings';
  exception
    when insufficient_privilege then null;
  end;

  begin
    insert into public.location_external_sources (
      location_id,
      provider,
      external_store_id
    )
    values (second_location_id, 'uber_eats', 'anonymous-store');
    raise exception 'anonymous users inserted an external mapping';
  exception
    when insufficient_privilege then null;
  end;

  begin
    update public.location_external_sources
    set verified_at = now()
    where id = mapping_id;
    raise exception 'anonymous users updated an external mapping';
  exception
    when insufficient_privilege then null;
  end;

  begin
    delete from public.location_external_sources
    where id = mapping_id;
    raise exception 'anonymous users deleted an external mapping';
  exception
    when insufficient_privilege then null;
  end;

  execute 'reset role';
end;
$$;

rollback;
