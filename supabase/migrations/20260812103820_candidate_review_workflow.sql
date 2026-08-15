alter table public.store_candidates
  add column rejection_reason text,
  drop constraint store_candidates_review_state_check,
  add constraint store_candidates_review_state_check check (
    (
      status in ('new', 'known', 'possible_duplicate')
      and reviewed_at is null
      and reviewed_by is null
      and resolved_location_id is null
      and rejection_reason is null
    )
    or (
      status = 'approved'
      and reviewed_at is not null
      and reviewed_by is not null
      and resolved_location_id is not null
      and rejection_reason is null
    )
    or (
      status = 'rejected'
      and reviewed_at is not null
      and reviewed_by is not null
      and resolved_location_id is null
      and rejection_reason in (
        'not_milk_tea',
        'duplicate',
        'incorrect_location',
        'permanently_closed',
        'outside_scope',
        'other'
      )
    )
  );

create function public.approve_store_candidate(
  p_candidate_id uuid,
  p_brand_id uuid,
  p_new_brand_name text,
  p_new_brand_slug text,
  p_display_name text,
  p_location_slug text,
  p_suburb text,
  p_address text,
  p_latitude double precision,
  p_longitude double precision,
  p_source_reference text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  candidate public.store_candidates%rowtype;
  resolved_brand_id uuid;
  new_location_id uuid;
begin
  if not (select public.is_admin()) then
    raise exception using errcode = 'P0001', message = 'admin_access_required';
  end if;

  select *
  into candidate
  from public.store_candidates
  where id = p_candidate_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'candidate_not_found';
  end if;

  if candidate.status not in ('new', 'possible_duplicate') then
    raise exception using errcode = 'P0001', message = 'candidate_not_reviewable';
  end if;

  if (
    p_brand_id is null
    and (p_new_brand_name is null or p_new_brand_slug is null)
  ) or (
    p_brand_id is not null
    and (p_new_brand_name is not null or p_new_brand_slug is not null)
  ) then
    raise exception using errcode = 'P0001', message = 'invalid_brand_resolution';
  end if;

  if p_display_name is null or length(trim(p_display_name)) = 0
    or p_location_slug is null or p_location_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    or p_suburb is null or length(trim(p_suburb)) = 0
    or p_address is null or length(trim(p_address)) = 0
    or p_latitude is null or p_latitude < -90 or p_latitude > 90
    or p_longitude is null or p_longitude < -180 or p_longitude > 180 then
    raise exception using errcode = 'P0001', message = 'invalid_location_data';
  end if;

  if p_brand_id is not null then
    select id
    into resolved_brand_id
    from public.brands
    where id = p_brand_id;

    if not found then
      raise exception using errcode = 'P0001', message = 'brand_not_found';
    end if;
  else
    if length(trim(p_new_brand_name)) = 0
      or p_new_brand_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
      raise exception using errcode = 'P0001', message = 'invalid_new_brand';
    end if;

    insert into public.brands (name, slug)
    values (trim(p_new_brand_name), p_new_brand_slug)
    returning id into resolved_brand_id;
  end if;

  insert into public.locations (
    brand_id,
    display_name,
    slug,
    suburb,
    address,
    coordinates,
    google_place_id,
    publication_status,
    source_provenance,
    source_reference
  )
  values (
    resolved_brand_id,
    trim(p_display_name),
    p_location_slug,
    trim(p_suburb),
    trim(p_address),
    extensions.st_setsrid(
      extensions.st_makepoint(p_longitude, p_latitude),
      4326
    )::extensions.geography,
    candidate.google_place_id,
    'draft',
    'wemilktea',
    nullif(trim(p_source_reference), '')
  )
  returning id into new_location_id;

  update public.store_candidates
  set
    status = 'approved',
    reviewed_at = now(),
    reviewed_by = auth.uid(),
    resolved_location_id = new_location_id,
    rejection_reason = null
  where id = candidate.id;

  return new_location_id;
end;
$$;

create function public.merge_store_candidate(
  p_candidate_id uuid,
  p_target_location_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  candidate public.store_candidates%rowtype;
  target_location public.locations%rowtype;
begin
  if not (select public.is_admin()) then
    raise exception using errcode = 'P0001', message = 'admin_access_required';
  end if;

  select *
  into candidate
  from public.store_candidates
  where id = p_candidate_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'candidate_not_found';
  end if;

  if candidate.status not in ('new', 'possible_duplicate') then
    raise exception using errcode = 'P0001', message = 'candidate_not_reviewable';
  end if;

  select *
  into target_location
  from public.locations
  where id = p_target_location_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'target_location_not_found';
  end if;

  if target_location.google_place_id is not null
    and target_location.google_place_id <> candidate.google_place_id then
    raise exception using errcode = 'P0001', message = 'target_location_google_place_conflict';
  end if;

  if target_location.google_place_id is null then
    update public.locations
    set google_place_id = candidate.google_place_id
    where id = target_location.id;
  end if;

  update public.store_candidates
  set
    status = 'approved',
    reviewed_at = now(),
    reviewed_by = auth.uid(),
    resolved_location_id = target_location.id,
    rejection_reason = null
  where id = candidate.id;

  return target_location.id;
end;
$$;

create function public.reject_store_candidate(
  p_candidate_id uuid,
  p_rejection_reason text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  candidate public.store_candidates%rowtype;
begin
  if not (select public.is_admin()) then
    raise exception using errcode = 'P0001', message = 'admin_access_required';
  end if;

  select *
  into candidate
  from public.store_candidates
  where id = p_candidate_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'candidate_not_found';
  end if;

  if candidate.status not in ('new', 'possible_duplicate') then
    raise exception using errcode = 'P0001', message = 'candidate_not_reviewable';
  end if;

  if p_rejection_reason not in (
    'not_milk_tea',
    'duplicate',
    'incorrect_location',
    'permanently_closed',
    'outside_scope',
    'other'
  ) then
    raise exception using errcode = 'P0001', message = 'invalid_rejection_reason';
  end if;

  update public.store_candidates
  set
    status = 'rejected',
    reviewed_at = now(),
    reviewed_by = auth.uid(),
    resolved_location_id = null,
    rejection_reason = p_rejection_reason
  where id = candidate.id;
end;
$$;

revoke all on function public.approve_store_candidate(
  uuid, uuid, text, text, text, text, text, text, double precision, double precision, text
) from public, anon;
revoke all on function public.merge_store_candidate(uuid, uuid) from public, anon;
revoke all on function public.reject_store_candidate(uuid, text) from public, anon;
grant execute on function public.approve_store_candidate(
  uuid, uuid, text, text, text, text, text, text, double precision, double precision, text
) to authenticated;
grant execute on function public.merge_store_candidate(uuid, uuid) to authenticated;
grant execute on function public.reject_store_candidate(uuid, text) to authenticated;
