-- WM-107: public identity and database foundation for Milk Tea Moments.

alter table public.image_assets
  add column owner_user_id uuid references auth.users (id) on delete restrict;

create table public.community_posts (
  id uuid primary key default extensions.gen_random_uuid(),
  owner_user_id uuid not null references auth.users (id) on delete restrict,
  image_asset_id uuid references public.image_assets (id) on delete set null,
  caption text not null default '',
  location_id uuid references public.locations (id) on delete set null,
  location_text text,
  product_id uuid references public.products (id) on delete set null,
  product_text text,
  display_name text,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  moderated_at timestamptz,
  moderated_by uuid references auth.users (id) on delete set null,
  moderation_reason text,
  constraint community_posts_caption_length_check check (length(caption) <= 280),
  constraint community_posts_location_text_length_check check (location_text is null or length(location_text) <= 160),
  constraint community_posts_product_text_length_check check (product_text is null or length(product_text) <= 160),
  constraint community_posts_display_name_length_check check (display_name is null or length(trim(display_name)) between 1 and 40),
  constraint community_posts_status_check check (status in ('draft', 'active', 'hidden', 'removed')),
  constraint community_posts_active_image_check check (status <> 'active' or image_asset_id is not null),
  constraint community_posts_draft_submission_check check (
    (status = 'draft' and submitted_at is null)
    or (status <> 'draft' and submitted_at is not null)
  )
);

create table public.community_post_likes (
  post_id uuid not null references public.community_posts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table public.community_post_must_tries (
  post_id uuid not null references public.community_posts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table public.community_post_reports (
  id uuid primary key default extensions.gen_random_uuid(),
  post_id uuid not null references public.community_posts (id) on delete cascade,
  reporter_user_id uuid not null references auth.users (id) on delete cascade,
  reason text not null,
  details text,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users (id) on delete set null,
  constraint community_post_reports_reason_check check (reason in ('spam', 'harassment', 'copyright', 'unsafe', 'other')),
  constraint community_post_reports_details_length_check check (details is null or length(details) <= 500),
  constraint community_post_reports_status_check check (status in ('pending', 'actioned', 'dismissed')),
  constraint community_post_reports_resolution_check check (
    (status = 'pending' and resolved_at is null and resolved_by is null)
    or (status <> 'pending' and resolved_at is not null and resolved_by is not null)
  ),
  constraint community_post_reports_unique_reporter_post unique (post_id, reporter_user_id)
);

create index image_assets_owner_user_id_idx on public.image_assets (owner_user_id) where owner_user_id is not null;
create index community_posts_feed_idx on public.community_posts (created_at desc, id desc) where status = 'active' and deleted_at is null and image_asset_id is not null;
create index community_posts_owner_created_idx on public.community_posts (owner_user_id, created_at desc);
create index community_posts_location_id_idx on public.community_posts (location_id);
create index community_posts_product_id_idx on public.community_posts (product_id);
create index community_post_reports_status_created_idx on public.community_post_reports (status, created_at desc);
create index community_post_reports_post_id_idx on public.community_post_reports (post_id);

create trigger community_posts_set_updated_at
before update on public.community_posts
for each row execute function public.set_updated_at();

alter table public.community_posts enable row level security;
alter table public.community_post_likes enable row level security;
alter table public.community_post_must_tries enable row level security;
alter table public.community_post_reports enable row level security;

revoke all on public.community_posts, public.community_post_likes, public.community_post_must_tries, public.community_post_reports from public, anon, authenticated;

grant select on public.community_posts to authenticated;
grant select on public.community_post_likes to authenticated;
grant select on public.community_post_must_tries to authenticated;
grant select on public.community_post_reports to authenticated;

create function public.moderate_community_post(
  p_post_id uuid,
  p_status text,
  p_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_status text;
begin
  if not (select public.is_admin()) then
    raise exception using errcode = 'P0001', message = 'admin_access_required';
  end if;
  if p_status not in ('active', 'hidden', 'removed') then
    raise exception using errcode = 'P0001', message = 'invalid_moderation_status';
  end if;

  select status into current_status
  from public.community_posts
  where id = p_post_id
  for update;
  if current_status is null then
    raise exception using errcode = 'P0001', message = 'post_not_found';
  end if;
  if current_status = 'removed' and p_status <> 'removed' then
    raise exception using errcode = 'P0001', message = 'removed_post_is_terminal';
  end if;
  if p_status = 'active' and not exists (
    select 1
    from public.community_posts as cp
    join public.image_assets as ia on ia.id = cp.image_asset_id
    where cp.id = p_post_id
      and ia.owner_user_id = cp.owner_user_id
      and ia.storage_key is not null
      and ia.content_type is not null
      and ia.byte_size is not null
  ) then
    raise exception using errcode = 'P0001', message = 'finalized_image_required';
  end if;

  update public.community_posts
  set status = p_status,
      submitted_at = coalesce(submitted_at, now()),
      moderated_at = now(),
      moderated_by = auth.uid(),
      moderation_reason = nullif(trim(p_reason), '')
  where id = p_post_id;
  return found;
end;
$$;

create function public.resolve_community_post_report(
  p_report_id uuid,
  p_status text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select public.is_admin()) then
    raise exception using errcode = 'P0001', message = 'admin_access_required';
  end if;
  if p_status not in ('actioned', 'dismissed') then
    raise exception using errcode = 'P0001', message = 'invalid_report_status';
  end if;
  update public.community_post_reports
  set status = p_status, resolved_at = now(), resolved_by = auth.uid()
  where id = p_report_id and status = 'pending';
  return found;
end;
$$;

create function public.list_public_community_posts(
  p_before_created_at timestamptz default null,
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
  created_at timestamptz,
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
    cp.created_at,
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
    and exists (select 1 from public.brands as pb where pb.id = p.brand_id and pb.is_published)
    and exists (select 1 from public.categories as pc where pc.id = p.category_id and pc.is_published)
  where cp.status = 'active'
    and cp.deleted_at is null
    and ia.storage_key is not null
    and (p_before_created_at is null or p_before_id is null or (cp.created_at, cp.id) < (p_before_created_at, p_before_id))
  order by cp.created_at desc, cp.id desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

revoke all on function public.moderate_community_post(uuid, text, text) from public, anon;
revoke all on function public.resolve_community_post_report(uuid, text) from public, anon;
revoke all on function public.list_public_community_posts(timestamptz, uuid, integer) from public, anon;

grant execute on function public.moderate_community_post(uuid, text, text) to authenticated;
grant execute on function public.resolve_community_post_report(uuid, text) to authenticated;
grant execute on function public.list_public_community_posts(timestamptz, uuid, integer) to anon, authenticated;

create policy "owners can read their community posts"
on public.community_posts for select to authenticated
using ((select auth.uid()) = owner_user_id);

create policy "admins can manage community posts"
on public.community_posts for all to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy "owners can read their likes"
on public.community_post_likes for select to authenticated
using ((select auth.uid()) = user_id);

create policy "users can like active community posts"
on public.community_post_likes for insert to authenticated
with check ((select auth.uid()) = user_id and exists (select 1 from public.community_posts where id = post_id and status = 'active' and deleted_at is null));

create policy "users can remove their likes"
on public.community_post_likes for delete to authenticated
using ((select auth.uid()) = user_id);

create policy "owners can read their must tries"
on public.community_post_must_tries for select to authenticated
using ((select auth.uid()) = user_id);

create policy "users can save active community posts"
on public.community_post_must_tries for insert to authenticated
with check ((select auth.uid()) = user_id and exists (select 1 from public.community_posts where id = post_id and status = 'active' and deleted_at is null));

create policy "users can remove their must tries"
on public.community_post_must_tries for delete to authenticated
using ((select auth.uid()) = user_id);

create policy "users can submit reports for other active posts"
on public.community_post_reports for insert to authenticated
with check (
  (select auth.uid()) = reporter_user_id
  and status = 'pending' and resolved_at is null and resolved_by is null
  and exists (select 1 from public.community_posts where id = post_id and status = 'active' and deleted_at is null and owner_user_id <> (select auth.uid()))
);

create policy "admins can manage community reports"
on public.community_post_reports for all to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy "owners can read their community image metadata"
on public.image_assets for select to authenticated
using (owner_user_id = (select auth.uid()) and exists (select 1 from public.community_posts where image_asset_id = public.image_assets.id and owner_user_id = (select auth.uid())));

create function public.create_community_post_draft(
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
begin
  if caller_id is null then
    raise exception using errcode = 'P0001', message = 'authentication_required';
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

create function public.activate_community_post(p_post_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception using errcode = 'P0001', message = 'authentication_required';
  end if;
  update public.community_posts as cp
  set status = 'active', submitted_at = now()
  where cp.id = p_post_id
    and cp.owner_user_id = auth.uid()
    and cp.status = 'draft'
    and exists (
      select 1
      from public.image_assets as ia
      where ia.id = cp.image_asset_id
        and ia.owner_user_id = cp.owner_user_id
        and ia.storage_key is not null
        and ia.content_type is not null
        and ia.byte_size is not null
    );
  return found;
end;
$$;

create function public.like_community_post(p_post_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception using errcode = 'P0001', message = 'authentication_required';
  end if;
  if not exists (select 1 from public.community_posts where id = p_post_id and status = 'active' and deleted_at is null) then
    raise exception using errcode = 'P0001', message = 'post_not_active';
  end if;
  insert into public.community_post_likes (post_id, user_id)
  values (p_post_id, auth.uid())
  on conflict (post_id, user_id) do nothing;
  return found;
end;
$$;

create function public.unlike_community_post(p_post_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception using errcode = 'P0001', message = 'authentication_required';
  end if;
  delete from public.community_post_likes where post_id = p_post_id and user_id = auth.uid();
  return found;
end;
$$;

create function public.save_community_post_must_try(p_post_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception using errcode = 'P0001', message = 'authentication_required';
  end if;
  if not exists (select 1 from public.community_posts where id = p_post_id and status = 'active' and deleted_at is null) then
    raise exception using errcode = 'P0001', message = 'post_not_active';
  end if;
  insert into public.community_post_must_tries (post_id, user_id)
  values (p_post_id, auth.uid())
  on conflict (post_id, user_id) do nothing;
  return found;
end;
$$;

create function public.remove_community_post_must_try(p_post_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception using errcode = 'P0001', message = 'authentication_required';
  end if;
  delete from public.community_post_must_tries where post_id = p_post_id and user_id = auth.uid();
  return found;
end;
$$;

create function public.delete_own_community_post(p_post_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception using errcode = 'P0001', message = 'authentication_required';
  end if;
  update public.community_posts
  set deleted_at = coalesce(deleted_at, now())
  where id = p_post_id and owner_user_id = auth.uid();
  return found;
end;
$$;

create function public.report_community_post(
  p_post_id uuid,
  p_reason text,
  p_details text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  report_id uuid;
begin
  if auth.uid() is null then
    raise exception using errcode = 'P0001', message = 'authentication_required';
  end if;
  insert into public.community_post_reports (post_id, reporter_user_id, reason, details)
  select p_post_id, auth.uid(), p_reason, nullif(trim(p_details), '')
  where exists (
    select 1 from public.community_posts
    where id = p_post_id and status = 'active' and deleted_at is null and owner_user_id <> auth.uid()
  )
  returning id into report_id;
  if report_id is null then
    raise exception using errcode = 'P0001', message = 'post_not_reportable';
  end if;
  return report_id;
exception
  when unique_violation then
    raise exception using errcode = 'P0001', message = 'report_already_exists';
end;
$$;

revoke all on function public.create_community_post_draft(text, uuid, text, uuid, text, text) from public, anon;
revoke all on function public.activate_community_post(uuid) from public, anon;
revoke all on function public.like_community_post(uuid) from public, anon;
revoke all on function public.unlike_community_post(uuid) from public, anon;
revoke all on function public.save_community_post_must_try(uuid) from public, anon;
revoke all on function public.remove_community_post_must_try(uuid) from public, anon;
revoke all on function public.delete_own_community_post(uuid) from public, anon;
revoke all on function public.report_community_post(uuid, text, text) from public, anon;

grant execute on function public.create_community_post_draft(text, uuid, text, uuid, text, text) to authenticated;
grant execute on function public.activate_community_post(uuid) to authenticated;
grant execute on function public.like_community_post(uuid) to authenticated;
grant execute on function public.unlike_community_post(uuid) to authenticated;
grant execute on function public.save_community_post_must_try(uuid) to authenticated;
grant execute on function public.remove_community_post_must_try(uuid) to authenticated;
grant execute on function public.delete_own_community_post(uuid) to authenticated;
grant execute on function public.report_community_post(uuid, text, text) to authenticated;
