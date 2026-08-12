begin;

do $$
declare
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
end;
$$;

rollback;
