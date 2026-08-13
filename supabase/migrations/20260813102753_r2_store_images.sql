alter table public.image_assets
  add column content_type text,
  add column byte_size bigint,
  add column width integer,
  add column height integer;

alter table public.image_assets
  add constraint image_assets_storage_key_format_check
    check (
      storage_key is null
      or (
        storage_key !~ '(^/|\.\.|//)'
        and storage_key ~ '^[a-z0-9][a-z0-9/_-]*\.(jpg|jpeg|png|webp)$'
      )
    ),
  add constraint image_assets_content_type_check
    check (content_type is null or content_type in ('image/jpeg', 'image/png', 'image/webp')),
  add constraint image_assets_byte_size_check
    check (byte_size is null or byte_size between 1 and 10485760),
  add constraint image_assets_dimensions_check
    check (
      (width is null and height is null)
      or (width between 1 and 10000 and height between 1 and 10000)
    );

create or replace function public.attach_location_image(
  p_location_id uuid,
  p_storage_key text,
  p_provenance text,
  p_alt_text text,
  p_content_type text,
  p_byte_size bigint,
  p_width integer default null,
  p_height integer default null
)
returns table (image_id uuid, previous_storage_key text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous_image_id uuid;
  new_image_id uuid;
  previous_key text;
begin
  if not (select public.is_admin()) then
    raise exception using errcode = 'P0001', message = 'admin_access_required';
  end if;

  if not exists (select 1 from public.locations where id = p_location_id) then
    raise exception using errcode = 'P0001', message = 'location_not_found';
  end if;

  if p_storage_key is null
    or p_storage_key !~ ('^stores/' || p_location_id::text || '/[0-9a-f-]+\.(jpg|jpeg|png|webp)$')
    or p_provenance not in ('wemilktea', 'merchant', 'user')
    or p_content_type not in ('image/jpeg', 'image/png', 'image/webp')
    or p_byte_size is null or p_byte_size < 1 or p_byte_size > 10485760
    or (p_width is not null and (p_width < 1 or p_width > 10000))
    or (p_height is not null and (p_height < 1 or p_height > 10000))
    or (p_width is null and p_height is not null)
    or (p_width is not null and p_height is null)
    or (p_alt_text is not null and length(trim(p_alt_text)) > 200) then
    raise exception using errcode = 'P0001', message = 'invalid_image_metadata';
  end if;

  select image_assets.id, image_assets.storage_key
  into previous_image_id, previous_key
  from public.location_images
  join public.image_assets on image_assets.id = location_images.image_id
  where location_images.location_id = p_location_id
    and location_images.is_primary
  for update;

  delete from public.location_images
  where location_id = p_location_id
    and is_primary;

  insert into public.image_assets (
    provenance,
    storage_key,
    alt_text,
    content_type,
    byte_size,
    width,
    height
  )
  values (
    p_provenance,
    p_storage_key,
    nullif(trim(p_alt_text), ''),
    p_content_type,
    p_byte_size,
    p_width,
    p_height
  )
  returning id into new_image_id;

  insert into public.location_images (location_id, image_id, sort_order, is_primary)
  values (p_location_id, new_image_id, 0, true);

  if previous_image_id is not null
    and not exists (select 1 from public.location_images where location_images.image_id = previous_image_id)
    and not exists (select 1 from public.product_images where product_images.image_id = previous_image_id) then
    delete from public.image_assets where id = previous_image_id;
  end if;

  return query select new_image_id, previous_key;
end;
$$;

create or replace function public.remove_location_image(p_location_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous_image_id uuid;
  previous_key text;
begin
  if not (select public.is_admin()) then
    raise exception using errcode = 'P0001', message = 'admin_access_required';
  end if;

  select image_assets.id, image_assets.storage_key
  into previous_image_id, previous_key
  from public.location_images
  join public.image_assets on image_assets.id = location_images.image_id
  where location_images.location_id = p_location_id
    and location_images.is_primary
  for update;

  if previous_image_id is null then
    return null;
  end if;

  delete from public.location_images
  where location_id = p_location_id
    and image_id = previous_image_id;

  if not exists (select 1 from public.location_images where location_images.image_id = previous_image_id)
    and not exists (select 1 from public.product_images where product_images.image_id = previous_image_id) then
    delete from public.image_assets where id = previous_image_id;
  end if;

  return previous_key;
end;
$$;

revoke all on function public.attach_location_image(uuid, text, text, text, text, bigint, integer, integer) from public, anon;
revoke all on function public.remove_location_image(uuid) from public, anon;
grant execute on function public.attach_location_image(uuid, text, text, text, text, bigint, integer, integer) to authenticated;
grant execute on function public.remove_location_image(uuid) to authenticated;

revoke insert, update, delete on public.image_assets, public.location_images from authenticated;
