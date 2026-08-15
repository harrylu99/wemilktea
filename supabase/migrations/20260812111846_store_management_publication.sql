create function public.update_location_management(
  p_location_id uuid,
  p_expected_updated_at timestamptz,
  p_brand_id uuid,
  p_display_name text,
  p_location_slug text,
  p_suburb text,
  p_address text,
  p_latitude double precision,
  p_longitude double precision,
  p_source_reference text default null
)
returns timestamptz
language plpgsql
security invoker
set search_path = ''
as $$
declare
  location_row public.locations%rowtype;
  updated_timestamp timestamptz;
begin
  if not (select public.is_admin()) then
    raise exception using errcode = 'P0001', message = 'admin_access_required';
  end if;

  select *
  into location_row
  from public.locations
  where id = p_location_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'location_not_found';
  end if;

  if location_row.updated_at is distinct from p_expected_updated_at then
    raise exception using errcode = 'P0001', message = 'stale_location_update';
  end if;

  if not exists (select 1 from public.brands where id = p_brand_id) then
    raise exception using errcode = 'P0001', message = 'brand_not_found';
  end if;

  if p_display_name is null or length(trim(p_display_name)) = 0
    or p_location_slug is null or p_location_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    or p_suburb is null or length(trim(p_suburb)) = 0
    or p_address is null or length(trim(p_address)) = 0
    or p_latitude is null or p_latitude < -90 or p_latitude > 90
    or p_longitude is null or p_longitude < -180 or p_longitude > 180
    or (
      p_source_reference is not null
      and length(trim(p_source_reference)) > 0
      and p_source_reference !~ '^https?://'
    ) then
    raise exception using errcode = 'P0001', message = 'invalid_location_data';
  end if;

  update public.locations
  set
    brand_id = p_brand_id,
    display_name = trim(p_display_name),
    slug = p_location_slug,
    suburb = trim(p_suburb),
    address = trim(p_address),
    coordinates = extensions.st_setsrid(
      extensions.st_makepoint(p_longitude, p_latitude),
      4326
    )::extensions.geography,
    source_reference = nullif(trim(p_source_reference), '')
  where id = location_row.id
  returning updated_at into updated_timestamp;

  return updated_timestamp;
end;
$$;

create function public.get_location_management_detail(p_location_id uuid)
returns table (
  id uuid,
  brand_id uuid,
  brand_name text,
  display_name text,
  slug text,
  suburb text,
  address text,
  latitude double precision,
  longitude double precision,
  publication_status text,
  source_provenance text,
  source_reference text,
  google_place_id text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not (select public.is_admin()) then
    raise exception using errcode = 'P0001', message = 'admin_access_required';
  end if;

  return query
  select
    locations.id,
    locations.brand_id,
    brands.name,
    locations.display_name,
    locations.slug,
    locations.suburb,
    locations.address,
    extensions.st_y(locations.coordinates::extensions.geometry),
    extensions.st_x(locations.coordinates::extensions.geometry),
    locations.publication_status,
    locations.source_provenance,
    locations.source_reference,
    locations.google_place_id,
    locations.created_at,
    locations.updated_at
  from public.locations
  join public.brands on brands.id = locations.brand_id
  where locations.id = p_location_id;
end;
$$;

create function public.publish_location(p_location_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  location_row public.locations%rowtype;
  brand_row public.brands%rowtype;
begin
  if not (select public.is_admin()) then
    raise exception using errcode = 'P0001', message = 'admin_access_required';
  end if;

  select *
  into location_row
  from public.locations
  where id = p_location_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'location_not_found';
  end if;

  if location_row.publication_status = 'published' then
    raise exception using errcode = 'P0001', message = 'location_already_published';
  end if;

  if location_row.publication_status <> 'draft' then
    raise exception using errcode = 'P0001', message = 'location_not_publishable';
  end if;

  select *
  into brand_row
  from public.brands
  where id = location_row.brand_id
  for update;

  if not found
    or length(trim(brand_row.name)) = 0
    or brand_row.slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    or length(trim(location_row.display_name)) = 0
    or location_row.slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    or length(trim(location_row.suburb)) = 0
    or length(trim(location_row.address)) = 0
    or location_row.coordinates is null then
    raise exception using errcode = 'P0001', message = 'location_missing_publish_requirements';
  end if;

  update public.brands
  set is_published = true
  where id = brand_row.id;

  update public.locations
  set publication_status = 'published'
  where id = location_row.id;
end;
$$;

create function public.unpublish_location(p_location_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  location_row public.locations%rowtype;
begin
  if not (select public.is_admin()) then
    raise exception using errcode = 'P0001', message = 'admin_access_required';
  end if;

  select *
  into location_row
  from public.locations
  where id = p_location_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'location_not_found';
  end if;

  if location_row.publication_status <> 'published' then
    raise exception using errcode = 'P0001', message = 'location_not_published';
  end if;

  update public.locations
  set publication_status = 'draft'
  where id = location_row.id;
end;
$$;

revoke all on function public.update_location_management(
  uuid, timestamptz, uuid, text, text, text, text, double precision, double precision, text
) from public, anon;
revoke all on function public.get_location_management_detail(uuid) from public, anon;
revoke all on function public.publish_location(uuid) from public, anon;
revoke all on function public.unpublish_location(uuid) from public, anon;

grant execute on function public.update_location_management(
  uuid, timestamptz, uuid, text, text, text, text, double precision, double precision, text
) to authenticated;
grant execute on function public.get_location_management_detail(uuid) to authenticated;
grant execute on function public.publish_location(uuid) to authenticated;
grant execute on function public.unpublish_location(uuid) to authenticated;
