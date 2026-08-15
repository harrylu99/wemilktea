begin;

do $$
declare
  admin_user_id uuid := extensions.gen_random_uuid();
  private_count integer;
  public_count integer;
begin
  if not exists (select 1 from pg_extension where extname = 'postgis') then
    raise exception 'PostGIS extension is missing';
  end if;

  if not exists (
    select 1 from pg_indexes where schemaname = 'public' and indexname = 'locations_coordinates_idx'
  ) then
    raise exception 'locations_coordinates_idx is missing';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'store_candidates'
      and column_name in ('google_business_status', 'google_website_uri')
  ) then
    raise exception 'Google Places content columns must not be persisted';
  end if;

  begin
    insert into public.store_candidates (
      google_place_id,
      candidate_name,
      source_provenance,
      status
    )
    values ('ChIJrlsVerification', 'Google-provided name', 'google', 'new');
    raise exception 'Google Places content can be persisted in a candidate';
  exception
    when check_violation then null;
  end;

  begin
    update public.store_candidates
    set status = 'approved'
    where google_place_id = 'ChIJseedCandidateDominionRoad';
    raise exception 'approved candidates can omit review resolution';
  exception
    when check_violation then null;
  end;

  if not exists (
    select 1
    from pg_proc
    where oid = 'public.find_possible_location_duplicate(text, double precision, double precision)'::regprocedure
  ) then
    raise exception 'possible location duplicate function is missing';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.location_products'::regclass and contype = 'f'
  ) then
    raise exception 'location_products foreign keys are missing';
  end if;

  if (select count(*) from public.locations where google_place_id is not null) <> (
    select count(distinct google_place_id) from public.locations where google_place_id is not null
  ) then
    raise exception 'location Google Place IDs are not unique';
  end if;

  if (
    select count(distinct price_cents)
    from public.location_products
    join public.products on products.id = location_products.product_id
    where products.slug = 'brown-sugar-pearl-milk-tea'
  ) < 2 then
    raise exception 'seed data does not include location-specific product prices';
  end if;

  if (
    select count(*) from public.locations
    where extensions.st_dwithin(
      coordinates,
      extensions.st_setsrid(extensions.st_makepoint(174.7633, -36.8485), 4326)::extensions.geography,
      5000
    )
  ) < 2 then
    raise exception 'nearby location query did not return expected seeded locations';
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename in ('discovery_runs', 'store_candidates', 'store_candidate_observations')
      and 'anon' = any(roles)
  ) then
    raise exception 'private discovery tables have anonymous policies';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'store_submissions'
      and cmd = 'INSERT'
      and 'anon' = any(roles)
  ) then
    raise exception 'anonymous store-submission insert policy is missing';
  end if;

  execute 'set local role anon';

  begin
    select count(*) into private_count from public.discovery_runs;
    raise exception 'anonymous users can read discovery runs';
  exception
    when insufficient_privilege then null;
  end;

  begin
    perform public.is_admin();
    raise exception 'anonymous users can execute is_admin';
  exception
    when insufficient_privilege then null;
  end;

  begin
    perform public.find_possible_location_duplicate('Example', -36.8485, 174.7633);
    raise exception 'anonymous users can execute duplicate matching';
  exception
    when insufficient_privilege then null;
  end;

  select count(*) into public_count from public.locations;
  if public_count = 0 then
    raise exception 'anonymous users cannot read published locations';
  end if;

  insert into public.store_submissions (store_name, suburb)
  values ('RLS verification store', 'Auckland');

  execute 'reset role';

  execute 'set local role authenticated';
  if public.is_admin() then
    raise exception 'unlisted authenticated users are administrators';
  end if;
  execute 'reset role';

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
  values (
    extensions.gen_random_uuid(),
    admin_user_id,
    'authenticated',
    'authenticated',
    'rls-admin@example.test',
    'not-used-in-schema-test',
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  );
  insert into public.admin_users (user_id) values (admin_user_id);

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', admin_user_id::text, true);
  if not public.is_admin() then
    raise exception 'allow-listed authenticated users are not administrators';
  end if;
  select count(*) into private_count from public.store_candidates;
  if private_count = 0 then
    raise exception 'allow-listed administrators cannot read candidates';
  end if;
  execute 'reset role';
end;
$$;

rollback;
