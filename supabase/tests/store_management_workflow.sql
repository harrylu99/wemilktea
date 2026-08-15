begin;

do $$
declare
  admin_user_id uuid := extensions.gen_random_uuid();
  ordinary_user_id uuid := extensions.gen_random_uuid();
  candidate_id uuid := extensions.gen_random_uuid();
  location_id uuid;
  location_updated_at timestamptz;
  candidate_reviewed_at timestamptz;
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  )
  values
    (extensions.gen_random_uuid(), admin_user_id, 'authenticated', 'authenticated', 'store-admin@example.test', 'not-used', '{}'::jsonb, '{}'::jsonb, now(), now()),
    (extensions.gen_random_uuid(), ordinary_user_id, 'authenticated', 'authenticated', 'store-user@example.test', 'not-used', '{}'::jsonb, '{}'::jsonb, now(), now());
  insert into public.admin_users (user_id) values (admin_user_id);
  insert into public.store_candidates (id, google_place_id, source_provenance, status)
  values (candidate_id, 'ChIJstoreManagementCandidate', 'google', 'new');

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', ordinary_user_id::text, true);
  begin
    perform public.publish_location(extensions.gen_random_uuid());
    raise exception 'ordinary authenticated user published a location';
  exception
    when raise_exception then
      if sqlerrm <> 'admin_access_required' then
        raise;
      end if;
  end;
  execute 'reset role';

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', admin_user_id::text, true);

  location_id := public.approve_store_candidate(
    candidate_id,
    null,
    'Store Management Tea',
    'store-management-tea',
    'Store Management Tea CBD',
    'store-management-tea-cbd',
    'Auckland CBD',
    '1 Test Street, Auckland',
    -36.8485,
    174.7633,
    'https://example.test/initial-verification'
  );

  select updated_at into location_updated_at
  from public.locations
  where id = location_id;
  select reviewed_at into candidate_reviewed_at
  from public.store_candidates
  where id = candidate_id;

  if not exists (
    select 1
    from public.get_location_management_detail(location_id)
    where id = location_id
      and latitude = -36.8485
      and longitude = 174.7633
      and google_place_id = 'ChIJstoreManagementCandidate'
  ) then
    raise exception 'canonical store management detail is incomplete';
  end if;

  execute 'reset role';
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', ordinary_user_id::text, true);
  if exists (select 1 from public.locations where id = location_id) then
    raise exception 'ordinary authenticated user can read draft canonical locations';
  end if;
  begin
    perform public.get_location_management_detail(location_id);
    raise exception 'ordinary authenticated user can read store management detail';
  exception
    when raise_exception then
      if sqlerrm <> 'admin_access_required' then
        raise;
      end if;
  end;
  execute 'reset role';

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', admin_user_id::text, true);

  perform public.update_location_management(
    location_id,
    location_updated_at,
    (select brand_id from public.locations where id = location_id),
    'Store Management Tea Central',
    'store-management-tea-central',
    'Auckland CBD',
    '2 Test Street, Auckland',
    -36.8486,
    174.7634,
    'https://example.test/updated-verification'
  );

  if not exists (
    select 1
    from public.locations
    where id = location_id
      and display_name = 'Store Management Tea Central'
      and google_place_id = 'ChIJstoreManagementCandidate'
  ) then
    raise exception 'canonical location update failed or changed Google identity';
  end if;

  begin
    insert into public.locations (
      brand_id, display_name, slug, suburb, address, coordinates,
      google_place_id, publication_status, source_provenance
    )
    values (
      (select brand_id from public.locations where id = location_id),
      'Duplicate identity', 'duplicate-store-identity', 'Auckland CBD',
      '4 Test Street, Auckland',
      extensions.st_setsrid(extensions.st_makepoint(174.7634, -36.8486), 4326)::extensions.geography,
      'ChIJstoreManagementCandidate', 'draft', 'wemilktea'
    );
    raise exception 'duplicate Google Place ID was accepted';
  exception
    when unique_violation then null;
  end;

  if not exists (
    select 1
    from public.store_candidates
    where id = candidate_id
      and status = 'approved'
      and reviewed_at = candidate_reviewed_at
      and resolved_location_id = location_id
      and candidate_name is null
      and formatted_address is null
      and coordinates is null
  ) then
    raise exception 'canonical store update altered candidate history or Google retention state';
  end if;

  begin
    perform public.update_location_management(
      location_id,
      location_updated_at - interval '1 second',
      (select brand_id from public.locations where id = location_id),
      'Stale Update',
      'stale-update',
      'Auckland CBD',
      '3 Test Street, Auckland',
      -36.8486,
      174.7634,
      null
    );
    raise exception 'stale store update succeeded';
  exception
    when raise_exception then
      if sqlerrm <> 'stale_location_update' then
        raise;
      end if;
  end;

  perform public.publish_location(location_id);

  if not exists (
    select 1
    from public.locations locations
    join public.brands brands on brands.id = locations.brand_id
    where locations.id = location_id
      and locations.publication_status = 'published'
      and brands.is_published
  ) then
    raise exception 'draft location was not publicly publishable';
  end if;

  execute 'reset role';
  execute 'set local role anon';
  if not exists (select 1 from public.locations where id = location_id) then
    raise exception 'published canonical location is not visible under public RLS';
  end if;
  begin
    perform public.publish_location(location_id);
    raise exception 'anonymous user published a location';
  exception
    when insufficient_privilege then null;
  end;
  execute 'reset role';

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', admin_user_id::text, true);
  perform public.unpublish_location(location_id);

  if exists (select 1 from public.locations where id = location_id and publication_status = 'published')
    or not exists (
      select 1 from public.store_candidates
      where id = candidate_id and resolved_location_id = location_id and reviewed_at = candidate_reviewed_at
    ) then
    raise exception 'unpublish changed canonical status or candidate audit history';
  end if;
  execute 'reset role';
end;
$$;

rollback;
