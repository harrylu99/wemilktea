alter table public.store_candidates
  add column google_business_status text,
  add column google_website_uri text;

create function public.find_possible_location_duplicate(
  candidate_name text,
  candidate_latitude double precision,
  candidate_longitude double precision
)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select locations.id
  from public.locations
  where candidate_name is not null
    and candidate_latitude is not null
    and candidate_longitude is not null
    and pg_catalog.regexp_replace(
      pg_catalog.lower(locations.display_name),
      '[^a-z0-9]+',
      '',
      'g'
    ) = pg_catalog.regexp_replace(
      pg_catalog.lower(candidate_name),
      '[^a-z0-9]+',
      '',
      'g'
    )
    and extensions.st_dwithin(
      locations.coordinates,
      extensions.st_setsrid(
        extensions.st_makepoint(candidate_longitude, candidate_latitude),
        4326
      )::extensions.geography,
      100
    )
  order by extensions.st_distance(
    locations.coordinates,
    extensions.st_setsrid(
      extensions.st_makepoint(candidate_longitude, candidate_latitude),
      4326
    )::extensions.geography
  )
  limit 1;
$$;

revoke all on function public.find_possible_location_duplicate(
  text,
  double precision,
  double precision
) from public, anon, authenticated;
grant execute on function public.find_possible_location_duplicate(
  text,
  double precision,
  double precision
) to service_role;
