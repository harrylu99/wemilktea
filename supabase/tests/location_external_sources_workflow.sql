begin;

select plan(14);

do $$
declare
  admin_user_id uuid := extensions.gen_random_uuid();
  ordinary_user_id uuid := extensions.gen_random_uuid();
  brand_id uuid;
  first_location_id uuid := extensions.gen_random_uuid();
  second_location_id uuid := extensions.gen_random_uuid();
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

  perform set_config('wm51.admin_user_id', admin_user_id::text, true);
  perform set_config('wm51.ordinary_user_id', ordinary_user_id::text, true);
  perform set_config('wm51.first_location_id', first_location_id::text, true);
  perform set_config('wm51.second_location_id', second_location_id::text, true);
end;
$$;

set local role authenticated;
do $$
begin
  perform set_config(
    'request.jwt.claim.sub',
    current_setting('wm51.admin_user_id'),
    true
  );
end;
$$;

select lives_ok(
  $$
    insert into public.location_external_sources (
      location_id,
      provider,
      external_store_id,
      verified_at
    )
    values (
      current_setting('wm51.first_location_id')::uuid,
      'uber_eats',
      'bff943ba-f5d8-4773-9699-f2109743369c',
      now()
    )
  $$,
  'admin can create a valid Uber Eats location mapping'
);

select is(
  (
    select count(*)
    from public.location_external_sources
    where external_store_id = 'bff943ba-f5d8-4773-9699-f2109743369c'
  ),
  1::bigint,
  'admin can read the created location mapping'
);

select lives_ok(
  $$
    update public.location_external_sources
    set verified_at = now()
    where external_store_id = 'bff943ba-f5d8-4773-9699-f2109743369c'
  $$,
  'admin can update permitted mapping fields'
);

select is(
  (
    select count(*)
    from public.location_external_sources
    where external_store_id = 'bff943ba-f5d8-4773-9699-f2109743369c'
      and verified_at is not null
  ),
  1::bigint,
  'admin mapping update is persisted'
);

do $$
begin
  perform set_config(
    'request.jwt.claim.sub',
    current_setting('wm51.ordinary_user_id'),
    true
  );
end;
$$;

select is(
  (select count(*) from public.location_external_sources),
  0::bigint,
  'ordinary authenticated users cannot read external mappings'
);

select throws_ok(
  $$
    insert into public.location_external_sources (
      location_id,
      provider,
      external_store_id
    )
    values (
      current_setting('wm51.first_location_id')::uuid,
      'uber_eats',
      'ordinary-user-store'
    )
  $$,
  '42501',
  null,
  'ordinary authenticated users cannot insert external mappings'
);

do $$
begin
  perform set_config(
    'request.jwt.claim.sub',
    current_setting('wm51.admin_user_id'),
    true
  );
end;
$$;

select throws_ok(
  $$
    insert into public.location_external_sources (
      location_id,
      provider,
      external_store_id
    )
    values (
      current_setting('wm51.first_location_id')::uuid,
      'uber_eats',
      'different-store'
    )
  $$,
  '23505',
  null,
  'duplicate location and provider mapping is rejected'
);

select throws_ok(
  $$
    insert into public.location_external_sources (
      location_id,
      provider,
      external_store_id
    )
    values (
      current_setting('wm51.second_location_id')::uuid,
      'uber_eats',
      'bff943ba-f5d8-4773-9699-f2109743369c'
    )
  $$,
  '23505',
  null,
  'duplicate provider and external identity is rejected'
);

select throws_ok(
  $$
    insert into public.location_external_sources (
      location_id,
      provider,
      external_store_id
    )
    values (
      extensions.gen_random_uuid(),
      'uber_eats',
      'missing-location-store'
    )
  $$,
  '23503',
  null,
  'mapping with a missing canonical location is rejected'
);

select throws_ok(
  $$
    insert into public.location_external_sources (
      location_id,
      provider,
      external_store_id
    )
    values (
      current_setting('wm51.second_location_id')::uuid,
      'doordash',
      'future-provider-store'
    )
  $$,
  '23514',
  null,
  'unsupported provider is rejected'
);

set local role anon;
do $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
end;
$$;

select throws_ok(
  $$select count(*) from public.location_external_sources$$,
  '42501',
  null,
  'anonymous users cannot read external mappings'
);

select throws_ok(
  $$
    insert into public.location_external_sources (
      location_id,
      provider,
      external_store_id
    )
    values (
      current_setting('wm51.second_location_id')::uuid,
      'uber_eats',
      'anonymous-store'
    )
  $$,
  '42501',
  null,
  'anonymous users cannot insert external mappings'
);

select throws_ok(
  $$
    update public.location_external_sources
    set verified_at = now()
  $$,
  '42501',
  null,
  'anonymous users cannot update external mappings'
);

select throws_ok(
  $$delete from public.location_external_sources$$,
  '42501',
  null,
  'anonymous users cannot delete external mappings'
);

select * from finish();

rollback;
