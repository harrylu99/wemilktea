-- WM-46: preserve canonical store history by archiving, with a guarded
-- permanent-delete path for records that have no meaningful dependencies.

create or replace function public.archive_location(
  p_location_id uuid
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_status text;
begin
  if not (select public.is_admin()) then
    raise exception using errcode = 'P0001', message = 'admin_access_required';
  end if;

  select locations.publication_status
  into current_status
  from public.locations
  where locations.id = p_location_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'location_not_found';
  end if;

  if current_status = 'archived' then
    raise exception using errcode = 'P0001', message = 'location_already_archived';
  end if;

  if current_status not in ('draft', 'published') then
    raise exception using errcode = 'P0001', message = 'location_not_archivable';
  end if;

  update public.locations
  set publication_status = 'archived'
  where id = p_location_id;
end;
$$;

create or replace function public.restore_archived_location(
  p_location_id uuid
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_status text;
begin
  if not (select public.is_admin()) then
    raise exception using errcode = 'P0001', message = 'admin_access_required';
  end if;

  select locations.publication_status
  into current_status
  from public.locations
  where locations.id = p_location_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'location_not_found';
  end if;

  if current_status <> 'archived' then
    raise exception using errcode = 'P0001', message = 'location_not_archived';
  end if;

  update public.locations
  set publication_status = 'draft'
  where id = p_location_id;
end;
$$;

create or replace function public.delete_location_if_safe(
  p_location_id uuid
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_location public.locations%rowtype;
begin
  if not (select public.is_admin()) then
    raise exception using errcode = 'P0001', message = 'admin_access_required';
  end if;

  select locations.*
  into target_location
  from public.locations
  where locations.id = p_location_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'location_not_found';
  end if;

  if target_location.publication_status not in ('draft', 'archived') then
    raise exception using
      errcode = 'P0001',
      message = 'location_delete_requires_draft_or_archived';
  end if;

  if target_location.google_place_id is not null
    or target_location.source_provenance <> 'wemilktea' then
    raise exception using errcode = 'P0001', message = 'location_has_external_identity';
  end if;

  if exists (
    select 1
    from public.location_products
    where location_id = p_location_id
  ) then
    raise exception using errcode = 'P0001', message = 'location_has_catalogue_records';
  end if;

  if exists (
    select 1
    from public.location_images
    where location_id = p_location_id
  ) then
    raise exception using errcode = 'P0001', message = 'location_has_image_records';
  end if;

  if exists (
    select 1
    from public.location_external_sources
    where location_id = p_location_id
  ) or exists (
    select 1
    from public.product_external_sources
    where location_id = p_location_id
  ) then
    raise exception using errcode = 'P0001', message = 'location_has_external_provenance';
  end if;

  if exists (
    select 1
    from public.store_candidates
    where possible_location_id = p_location_id
       or resolved_location_id = p_location_id
  ) then
    raise exception using errcode = 'P0001', message = 'location_has_candidate_history';
  end if;

  delete from public.locations
  where id = p_location_id;
end;
$$;

revoke all on function public.archive_location(uuid) from public, anon;
revoke all on function public.restore_archived_location(uuid) from public, anon;
revoke all on function public.delete_location_if_safe(uuid) from public, anon;

grant execute on function public.archive_location(uuid) to authenticated;
grant execute on function public.restore_archived_location(uuid) to authenticated;
grant execute on function public.delete_location_if_safe(uuid) to authenticated;
