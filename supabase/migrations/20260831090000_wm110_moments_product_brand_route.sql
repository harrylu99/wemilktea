drop function if exists public.list_public_community_posts(timestamptz, uuid, integer);

create function public.list_public_community_posts(
  p_before_submitted_at timestamptz default null,
  p_before_id uuid default null,
  p_limit integer default 20
)
returns table (
  id uuid,
  image_asset_id uuid,
  storage_key text,
  content_type text,
  width integer,
  height integer,
  caption text,
  display_name text,
  location_id uuid,
  location_text text,
  location_name text,
  location_slug text,
  product_id uuid,
  product_text text,
  product_name text,
  product_slug text,
  product_brand_slug text,
  created_at timestamptz,
  submitted_at timestamptz,
  like_count bigint,
  liked_by_me boolean,
  must_try_by_me boolean
)
language sql
security definer
set search_path = ''
as $$
  select
    cp.id,
    ia.id,
    ia.storage_key,
    ia.content_type,
    ia.width,
    ia.height,
    cp.caption,
    cp.display_name,
    l.id,
    cp.location_text,
    l.display_name,
    l.slug,
    p.id,
    cp.product_text,
    p.name,
    p.slug,
    pb.slug,
    cp.created_at,
    cp.submitted_at,
    (select count(*) from public.community_post_likes as all_likes where all_likes.post_id = cp.id),
    exists (
      select 1 from public.community_post_likes as my_like
      where my_like.post_id = cp.id and my_like.user_id = (select auth.uid())
    ),
    exists (
      select 1 from public.community_post_must_tries as my_save
      where my_save.post_id = cp.id and my_save.user_id = (select auth.uid())
    )
  from public.community_posts as cp
  join public.image_assets as ia on ia.id = cp.image_asset_id
  left join public.locations as l
    on l.id = cp.location_id
    and l.publication_status = 'published'
    and exists (select 1 from public.brands as lb where lb.id = l.brand_id and lb.is_published)
  left join public.products as p
    on p.id = cp.product_id
    and p.is_published
    and exists (select 1 from public.brands as p_brand where p_brand.id = p.brand_id and p_brand.is_published)
    and exists (select 1 from public.categories as pc where pc.id = p.category_id and pc.is_published)
  left join public.brands as pb
    on pb.id = p.brand_id
    and pb.is_published
  where cp.status = 'active'
    and cp.deleted_at is null
    and ia.storage_key is not null
    and (p_before_submitted_at is null or p_before_id is null or (cp.submitted_at, cp.id) < (p_before_submitted_at, p_before_id))
  order by cp.submitted_at desc, cp.id desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

revoke all on function public.list_public_community_posts(timestamptz, uuid, integer) from public, anon;
grant execute on function public.list_public_community_posts(timestamptz, uuid, integer) to anon, authenticated;
