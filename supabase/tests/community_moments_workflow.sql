begin;

do $$
declare
  admin_id uuid := extensions.gen_random_uuid();
  owner_id uuid := extensions.gen_random_uuid();
  other_id uuid := extensions.gen_random_uuid();
  post_id uuid;
  second_post_id uuid;
  cursor_post_id uuid;
  cursor_submitted_at timestamptz;
  image_id uuid := extensions.gen_random_uuid();
  brand_id uuid;
  location_id uuid;
  product_id uuid;
  draft_status text;
  public_count integer;
  like_count bigint;
  liked boolean;
  must_try boolean;
begin
  select id into brand_id from public.brands where is_published order by id limit 1;
  select l.id into location_id
  from public.locations as l
  join public.brands as b on b.id = l.brand_id
  where l.publication_status = 'published' and b.is_published
  order by l.id limit 1;
  select p.id into product_id
  from public.products as p
  join public.brands as b on b.id = p.brand_id
  join public.categories as c on c.id = p.category_id
  where p.is_published and b.is_published and c.is_published
  order by p.id limit 1;

  if brand_id is null or location_id is null or product_id is null then
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

  execute 'reset role';
  update public.community_posts
  set image_asset_id = image_id
  where id = post_id;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', owner_id::text, true);
  if not public.activate_community_post(post_id) then
    raise exception 'owner could not activate a finalized community image';
  end if;

  execute 'set local role anon';
  select count(*) into public_count from public.list_public_community_posts();
  if public_count < 1 then
    raise exception 'anonymous users cannot read active public Moments';
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

  select like_count, liked_by_me, must_try_by_me
  into like_count, liked, must_try
  from public.list_public_community_posts()
  where id = post_id;
  if like_count <> 0 or liked or must_try then
    raise exception 'new public feed reaction state is incorrect';
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

  select like_count, liked_by_me, must_try_by_me
  into like_count, liked, must_try
  from public.list_public_community_posts()
  where id = post_id;
  if like_count <> 1 or not liked or not must_try then
    raise exception 'owner reaction state is incorrect';
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

rollback;
