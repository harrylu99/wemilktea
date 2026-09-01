-- WM-109: attach only a server-verified, owner-scoped normalized image.

create or replace function public.finalize_community_post_image(
  p_post_id uuid,
  p_owner_user_id uuid,
  p_quarantine_key text,
  p_storage_key text,
  p_content_type text,
  p_byte_size bigint,
  p_width integer,
  p_height integer,
  p_etag text
)
returns table (
  post_id uuid,
  image_asset_id uuid,
  storage_key text,
  content_type text,
  byte_size bigint,
  width integer,
  height integer,
  etag text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_image_id uuid;
  current_storage_key text;
  new_image_id uuid;
begin
  if p_post_id is null
    or p_owner_user_id is null
    or p_quarantine_key is null
    or p_storage_key is null
    or p_content_type <> 'image/webp'
    or p_byte_size is null
    or p_byte_size < 1
    or p_byte_size > 10485760
    or p_width is null
    or p_height is null
    or p_width < 1
    or p_height < 1
    or p_width > 8000
    or p_height > 8000
    or p_width * p_height > 40000000
    or greatest(p_width, p_height) > 2048
    or p_etag is null
    or p_etag = ''
    or p_quarantine_key !~ ('^community-quarantine/' || p_owner_user_id::text || '/' || p_post_id::text || '/[0-9a-f-]{36}\.webp$')
    or p_storage_key <> replace(p_quarantine_key, 'community-quarantine/', 'community/') then
    raise exception using errcode = 'P0001', message = 'invalid_verified_image';
  end if;

  select cp.image_asset_id, ia.storage_key
  into current_image_id, current_storage_key
  from public.community_posts as cp
  left join public.image_assets as ia on ia.id = cp.image_asset_id
  where cp.id = p_post_id
    and cp.owner_user_id = p_owner_user_id
  for update of cp;

  if current_storage_key = p_storage_key then
    return query
      select p_post_id, current_image_id, ia.storage_key, ia.content_type,
        ia.byte_size, ia.width, ia.height, p_etag
      from public.image_assets as ia
      where ia.id = current_image_id;
    return;
  end if;

  if current_image_id is not null then
    raise exception using errcode = 'P0001', message = 'post_image_already_attached';
  end if;

  if not exists (
    select 1
    from public.community_posts as cp
    where cp.id = p_post_id
      and cp.owner_user_id = p_owner_user_id
      and cp.status = 'draft'
      and cp.deleted_at is null
  ) then
    raise exception using errcode = 'P0001', message = 'post_not_uploadable';
  end if;

  insert into public.image_assets (
    owner_user_id,
    provenance,
    storage_key,
    content_type,
    byte_size,
    width,
    height
  )
  values (
    p_owner_user_id,
    'user',
    p_storage_key,
    p_content_type,
    p_byte_size,
    p_width,
    p_height
  )
  returning id into new_image_id;

  update public.community_posts as cp
  set image_asset_id = new_image_id,
      status = 'active',
      submitted_at = now()
  where cp.id = p_post_id
    and cp.owner_user_id = p_owner_user_id
    and cp.status = 'draft'
    and cp.deleted_at is null
    and cp.image_asset_id is null;

  if not found then
    delete from public.image_assets where id = new_image_id;
    raise exception using errcode = 'P0001', message = 'post_not_uploadable';
  end if;

  return query
    select p_post_id, ia.id, ia.storage_key, ia.content_type,
      ia.byte_size, ia.width, ia.height, p_etag
    from public.image_assets as ia
    where ia.id = new_image_id;
end;
$$;

revoke all on function public.finalize_community_post_image(uuid, uuid, text, text, text, bigint, integer, integer, text) from public, anon, authenticated;
grant execute on function public.finalize_community_post_image(uuid, uuid, text, text, text, bigint, integer, integer, text) to service_role;
