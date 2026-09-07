begin;

select plan(1);

do $$
<<workflow>>
declare
  admin_id uuid := extensions.gen_random_uuid();
  owner_id uuid := extensions.gen_random_uuid();
  other_id uuid := extensions.gen_random_uuid();
  post_id uuid;
  second_post_id uuid;
  cursor_post_id uuid;
  cursor_submitted_at timestamptz;
  image_id uuid := extensions.gen_random_uuid();
  selected_brand_id uuid;
  location_id uuid;
  product_id uuid;
  draft_status text;
  public_count integer;
  post_like_count bigint;
  liked boolean;
  must_try boolean;
  owned boolean;
  feed_row record;
begin
  select l.id into location_id
  from public.locations as l
  join public.brands as b on b.id = l.brand_id
  where l.publication_status = 'published' and b.is_published
  order by l.id limit 1;
  select l.brand_id into selected_brand_id
  from public.locations as l
  where l.id = location_id;
  select p.id into product_id
  from public.products as p
  join public.brands as b on b.id = p.brand_id
  join public.categories as c on c.id = p.category_id
  where p.brand_id = selected_brand_id and p.is_published and b.is_published and c.is_published
  order by p.id limit 1;

  if selected_brand_id is null or location_id is null or product_id is null then
    raise exception 'published catalogue fixtures are missing';
  end if;

  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    (extensions.gen_random_uuid(), admin_id, 'authenticated', 'authenticated', 'wm107-admin@example.test', 'unused', '{}'::jsonb, '{}'::jsonb, now(), now()),
    (extensions.gen_random_uuid(), owner_id, 'authenticated', 'authenticated', 'wm107-owner@example.test', 'unused', '{}'::jsonb, '{}'::jsonb, now(), now()),
    (extensions.gen_random_uuid(), other_id, 'authenticated', 'authenticated', 'wm107-other@example.test', 'unused', '{}'::jsonb, '{}'::jsonb, now(), now());
  insert into public.admin_users (user_id) values (admin_id);

  insert into public.image_assets (id, owner_user_id, provenance, storage_key, content_type, byte_size, width, height)
  values (image_id, owner_id, 'user', 'community/' || owner_id || '/' || extensions.gen_random_uuid() || '/image.webp', 'image/webp', 100, 100, 100);

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', owner_id::text, true);

  select public.create_community_post_draft(
    'A photo-only-compatible test post', location_id, null, product_id, null, null
  ) into post_id;

  select status into draft_status from public.community_posts where id = post_id;
  if draft_status <> 'draft' then
    raise exception 'new community posts must begin as draft';
  end if;

  if public.activate_community_post(post_id) then
    raise exception 'a draft without an image became active';
  end if;

  begin
    perform public.like_community_post(post_id);
    raise exception 'a draft accepted a Like';
  exception
    when others then
      if sqlerrm <> 'post_not_active' then
        raise;
      end if;
  end;

  begin
    perform public.save_community_post_must_try(post_id);
    raise exception 'a draft accepted Must Try';
  exception
    when others then
      if sqlerrm <> 'post_not_active' then
        raise;
      end if;
  end;
  if exists (
    select 1
    from public.community_post_must_tries as must_try
    where must_try.post_id = workflow.post_id and must_try.user_id = owner_id
  ) then
    raise exception 'a rejected draft created a Must Try row';
  end if;
  if exists (
    select 1
    from public.community_post_likes as post_like
    where post_like.post_id = workflow.post_id and post_like.user_id = owner_id
  ) then
    raise exception 'a rejected draft created a Like row';
  end if;

  execute 'reset role';
  update public.community_posts
  set image_asset_id = image_id
  where id = post_id;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', owner_id::text, true);
  if not public.activate_community_post(post_id) then
    raise exception 'owner could not activate a finalized community image';
  end if;

  perform set_config('request.jwt.claim.sub', '', true);
  execute 'set local role anon';
  if auth.uid() is not null then
    raise exception 'anonymous test retained an authenticated JWT subject';
  end if;
  select count(*) into public_count from public.list_public_community_posts();
  if public_count < 1 then
    raise exception 'anonymous users cannot read active public Moments';
  end if;
  select feed.* into feed_row
  from public.list_public_community_posts() as feed
  where feed.id = post_id;
  if (to_jsonb(feed_row) ? 'owner_user_id') then
    raise exception 'public feed exposed owner_user_id';
  end if;
  select owned_by_me into owned
  from public.list_public_community_posts()
  where id = post_id;
  if owned then
    raise exception 'anonymous feed incorrectly marked a Moment as owned';
  end if;

  begin
    perform 1 from public.community_posts;
    raise exception 'anonymous users can directly read community_posts';
  exception
    when insufficient_privilege then null;
  end;

  execute 'reset role';
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', owner_id::text, true);

  select like_count, liked_by_me, must_try_by_me, owned_by_me
  into post_like_count, liked, must_try, owned
  from public.list_public_community_posts()
  where id = post_id;
  if post_like_count <> 0 or liked or must_try or not owned then
    raise exception 'owner feed reaction or ownership state is incorrect';
  end if;

  if not public.like_community_post(post_id) then
    raise exception 'first Like was not persisted';
  end if;
  if public.like_community_post(post_id) then
    raise exception 'duplicate Like was not idempotently rejected';
  end if;
  if not public.save_community_post_must_try(post_id) then
    raise exception 'Must Try was not persisted';
  end if;
  if (select count(*) from public.community_post_must_tries as must_try where must_try.post_id = workflow.post_id and must_try.user_id = owner_id) <> 1 then
    raise exception 'Must Try row count is incorrect after first save';
  end if;
  if (select count(*) from public.community_post_likes as post_like where post_like.post_id = workflow.post_id and post_like.user_id = owner_id) <> 1 then
    raise exception 'Like row count is incorrect after Must Try';
  end if;
  if public.save_community_post_must_try(post_id) then
    raise exception 'duplicate Must Try was not idempotently rejected';
  end if;
  if (select count(*) from public.community_post_must_tries as must_try where must_try.post_id = workflow.post_id and must_try.user_id = owner_id) <> 1 then
    raise exception 'duplicate Must Try created a second Must Try row';
  end if;
  if (select count(*) from public.community_post_likes as post_like where post_like.post_id = workflow.post_id and post_like.user_id = owner_id) <> 1 then
    raise exception 'duplicate Must Try created a duplicate Like row';
  end if;

  select like_count, liked_by_me, must_try_by_me, owned_by_me
  into post_like_count, liked, must_try, owned
  from public.list_public_community_posts()
  where id = post_id;
  if post_like_count <> 1 or not liked or not must_try or not owned then
    raise exception 'owner reaction state is incorrect';
  end if;

  execute 'reset role';
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', other_id::text, true);
  select owned_by_me into owned
  from public.list_public_community_posts()
  where id = post_id;
  if owned then
    raise exception 'different identity incorrectly marked the Moment as owned';
  end if;
  if not public.save_community_post_must_try(post_id) then
    raise exception 'new Must Try did not persist for a second authenticated user';
  end if;
  if (select count(*) from public.community_post_must_tries as must_try where must_try.post_id = workflow.post_id and must_try.user_id = other_id) <> 1 then
    raise exception 'new Must Try row is missing for a second authenticated user';
  end if;
  if (select count(*) from public.community_post_likes as post_like where post_like.post_id = workflow.post_id and post_like.user_id = other_id) <> 1 then
    raise exception 'new Like row is missing for a second authenticated user';
  end if;

  select public.create_community_post_draft(
    'Free-text-compatible test post', null, 'New tea shop in Takapuna', null, 'Surprise drink', null
  ) into second_post_id;
  execute 'reset role';
  update public.community_posts
  set image_asset_id = image_id
  where id = second_post_id;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', owner_id::text, true);
  if not public.activate_community_post(second_post_id) then
    raise exception 'owner could not activate the free-text community post';
  end if;

  execute 'set local role anon';
  select count(*) into public_count from public.list_public_community_posts();
  if public_count <> 2 then
    raise exception 'public feed did not return both active community posts';
  end if;
  select id, submitted_at
  into cursor_post_id, cursor_submitted_at
  from public.list_public_community_posts(null, null, 1);
  select count(*) into public_count
  from public.list_public_community_posts(cursor_submitted_at, cursor_post_id, 1);
  if public_count <> 1 then
    raise exception 'submission-time cursor did not return the next post';
  end if;
  if exists (
    select 1
    from public.list_public_community_posts(cursor_submitted_at, cursor_post_id, 1)
    where id = cursor_post_id
  ) then
    raise exception 'submission-time cursor repeated the boundary post';
  end if;

  execute 'reset role';
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', other_id::text, true);

  select count(*) into public_count from public.community_post_must_tries where user_id = owner_id;
  if public_count <> 0 then
    raise exception 'Must Try rows are not private to their owner';
  end if;
  if public.delete_own_community_post(post_id) then
    raise exception 'another user deleted the community post';
  end if;
  if public.report_community_post(post_id, 'spam', 'test report') is null then
    raise exception 'valid report was not created';
  end if;

  execute 'reset role';
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', owner_id::text, true);
  if not public.delete_own_community_post(post_id) then
    raise exception 'owner could not delete their community post';
  end if;

  execute 'reset role';
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  if not public.moderate_community_post(post_id, 'removed', 'test removal') then
    raise exception 'Admin could not moderate a community post';
  end if;
end;
$$;

select pass('WM-107 community Moments workflow');
select * from finish();

rollback;
