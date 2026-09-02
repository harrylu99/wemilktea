-- WM-115: bound Moments draft and image-upload resource growth per identity.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.community_post_upload_authorizations (
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  post_id uuid not null references public.community_posts (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index community_post_upload_authorizations_owner_created_idx
  on private.community_post_upload_authorizations (owner_user_id, created_at desc);
create index community_post_upload_authorizations_post_created_idx
  on private.community_post_upload_authorizations (post_id, created_at desc);

revoke all on private.community_post_upload_authorizations from public, anon, authenticated;

create or replace function public.create_community_post_draft(
  p_caption text default '',
  p_location_id uuid default null,
  p_location_text text default null,
  p_product_id uuid default null,
  p_product_text text default null,
  p_display_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_post_id uuid;
  caller_id uuid := auth.uid();
  location_brand_id uuid;
  product_brand_id uuid;
  recent_post_count bigint;
  open_draft_count bigint;
begin
  if caller_id is null then
    raise exception using errcode = 'P0001', message = 'authentication_required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(caller_id::text, 0)
  );

  delete from public.community_posts
  where owner_user_id = caller_id
    and status = 'draft'
    and image_asset_id is null
    and submitted_at is null
    and created_at < now() - interval '24 hours';

  select count(*) into recent_post_count
  from public.community_posts
  where owner_user_id = caller_id
    and created_at >= now() - interval '1 hour';
  if recent_post_count >= 4 then
    raise exception using errcode = 'P0001', message = 'draft_hourly_limit';
  end if;

  select count(*) into recent_post_count
  from public.community_posts
  where owner_user_id = caller_id
    and created_at >= now() - interval '24 hours';
  if recent_post_count >= 12 then
    raise exception using errcode = 'P0001', message = 'draft_daily_limit';
  end if;

  select count(*) into open_draft_count
  from public.community_posts
  where owner_user_id = caller_id
    and status = 'draft'
    and deleted_at is null;
  if open_draft_count >= 3 then
    raise exception using errcode = 'P0001', message = 'open_draft_limit';
  end if;

  if p_location_id is not null then
    select l.brand_id into location_brand_id
    from public.locations as l
    join public.brands as b on b.id = l.brand_id
    where l.id = p_location_id and l.publication_status = 'published' and b.is_published;
    if location_brand_id is null then
      raise exception using errcode = 'P0001', message = 'location_not_public';
    end if;
  end if;

  if p_product_id is not null then
    select p.brand_id into product_brand_id
    from public.products as p
    join public.brands as b on b.id = p.brand_id
    join public.categories as c on c.id = p.category_id
    where p.id = p_product_id and p.is_published and b.is_published and c.is_published;
    if product_brand_id is null then
      raise exception using errcode = 'P0001', message = 'product_not_public';
    end if;
  end if;

  if location_brand_id is not null and product_brand_id is not null and location_brand_id <> product_brand_id then
    raise exception using errcode = 'P0001', message = 'catalogue_brand_mismatch';
  end if;

  insert into public.community_posts (
    owner_user_id, caption, location_id, location_text,
    product_id, product_text, display_name
  )
  values (
    caller_id,
    coalesce(p_caption, ''),
    p_location_id,
    nullif(trim(p_location_text), ''),
    p_product_id,
    nullif(trim(p_product_text), ''),
    nullif(trim(p_display_name), '')
  )
  returning id into new_post_id;

  return new_post_id;
end;
$$;

create function public.consume_community_image_upload_authorization(p_post_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  recent_upload_count bigint;
  post_upload_count bigint;
begin
  if caller_id is null then
    raise exception using errcode = 'P0001', message = 'authentication_required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(caller_id::text, 0)
  );

  if not exists (
    select 1
    from public.community_posts as cp
    where cp.id = p_post_id
      and cp.owner_user_id = caller_id
      and cp.status = 'draft'
      and cp.deleted_at is null
      and cp.image_asset_id is null
      and cp.created_at >= now() - interval '24 hours'
  ) then
    raise exception using errcode = 'P0001', message = 'post_not_uploadable';
  end if;

  delete from private.community_post_upload_authorizations
  where owner_user_id = caller_id
    and created_at < now() - interval '24 hours';

  select count(*) into recent_upload_count
  from private.community_post_upload_authorizations
  where owner_user_id = caller_id
    and created_at >= now() - interval '1 hour';
  if recent_upload_count >= 6 then
    raise exception using errcode = 'P0001', message = 'upload_hourly_limit';
  end if;

  select count(*) into recent_upload_count
  from private.community_post_upload_authorizations
  where owner_user_id = caller_id
    and created_at >= now() - interval '24 hours';
  if recent_upload_count >= 12 then
    raise exception using errcode = 'P0001', message = 'upload_daily_limit';
  end if;

  select count(*) into post_upload_count
  from private.community_post_upload_authorizations
  where owner_user_id = caller_id
    and post_id = p_post_id;
  if post_upload_count >= 3 then
    raise exception using errcode = 'P0001', message = 'post_upload_limit';
  end if;

  insert into private.community_post_upload_authorizations (owner_user_id, post_id)
  values (caller_id, p_post_id);
  return true;
end;
$$;

revoke all on function public.create_community_post_draft(text, uuid, text, uuid, text, text) from public, anon;
revoke all on function public.consume_community_image_upload_authorization(uuid) from public, anon;
grant execute on function public.create_community_post_draft(text, uuid, text, uuid, text, text) to authenticated;
grant execute on function public.consume_community_image_upload_authorization(uuid) to authenticated;
