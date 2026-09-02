begin;

select plan(6);

do $$
declare
  owner_id uuid := extensions.gen_random_uuid();
  other_id uuid := extensions.gen_random_uuid();
  upload_owner_id uuid := extensions.gen_random_uuid();
  per_post_owner_id uuid := extensions.gen_random_uuid();
  upload_post_id uuid;
  post_id uuid;
  stale_post_id uuid;
  created_ids uuid[] := '{}'::uuid[];
  post_ids uuid[] := '{}'::uuid[];
  index integer;
begin
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    (extensions.gen_random_uuid(), owner_id, 'authenticated', 'authenticated', 'wm115-owner@example.test', 'unused', '{}'::jsonb, '{}'::jsonb, now(), now()),
    (extensions.gen_random_uuid(), other_id, 'authenticated', 'authenticated', 'wm115-other@example.test', 'unused', '{}'::jsonb, '{}'::jsonb, now(), now()),
    (extensions.gen_random_uuid(), upload_owner_id, 'authenticated', 'authenticated', 'wm115-upload-owner@example.test', 'unused', '{}'::jsonb, '{}'::jsonb, now(), now()),
    (extensions.gen_random_uuid(), per_post_owner_id, 'authenticated', 'authenticated', 'wm115-per-post-owner@example.test', 'unused', '{}'::jsonb, '{}'::jsonb, now(), now());

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', owner_id::text, true);

  for index in 1..4 loop
    select public.create_community_post_draft('WM-115 hourly test') into post_id;
    created_ids := array_append(created_ids, post_id);
    execute 'reset role';
    update public.community_posts set deleted_at = now() where id = post_id;
    execute 'set local role authenticated';
    perform set_config('request.jwt.claim.sub', owner_id::text, true);
  end loop;

  begin
    perform public.create_community_post_draft('WM-115 hourly blocked');
    raise exception 'hourly draft quota was not enforced';
  exception
    when sqlstate 'P0001' then
      if sqlerrm <> 'draft_hourly_limit' then raise; end if;
  end;

  execute 'reset role';
  update public.community_posts
  set created_at = now() - interval '2 hours'
  where id = any(created_ids);
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', owner_id::text, true);

  for index in 1..4 loop
    select public.create_community_post_draft('WM-115 daily batch one') into post_id;
    created_ids := array_append(created_ids, post_id);
    execute 'reset role';
    update public.community_posts set deleted_at = now() where id = post_id;
    execute 'set local role authenticated';
    perform set_config('request.jwt.claim.sub', owner_id::text, true);
  end loop;

  execute 'reset role';
  update public.community_posts
  set created_at = now() - interval '2 hours'
  where owner_user_id = owner_id
    and created_at >= now() - interval '1 hour';
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', owner_id::text, true);

  for index in 1..4 loop
    select public.create_community_post_draft('WM-115 daily batch two') into post_id;
    execute 'reset role';
    update public.community_posts set deleted_at = now() where id = post_id;
    execute 'set local role authenticated';
    perform set_config('request.jwt.claim.sub', owner_id::text, true);
  end loop;

  begin
    perform public.create_community_post_draft('WM-115 daily blocked');
    raise exception 'daily draft quota was not enforced';
  exception
    when sqlstate 'P0001' then
      if sqlerrm <> 'draft_daily_limit' then raise; end if;
  end;

  perform set_config('request.jwt.claim.sub', other_id::text, true);
  for index in 1..3 loop
    select public.create_community_post_draft('WM-115 open draft test') into post_id;
  end loop;
  begin
    perform public.create_community_post_draft('WM-115 open draft blocked');
    raise exception 'open draft quota was not enforced';
  exception
    when sqlstate 'P0001' then
      if sqlerrm <> 'open_draft_limit' then raise; end if;
  end;

  execute 'reset role';
  select id into stale_post_id
  from public.community_posts
  where owner_user_id = other_id and status = 'draft' and deleted_at is null
  order by created_at
  limit 1;
  update public.community_posts
  set created_at = now() - interval '25 hours'
  where id = stale_post_id;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', other_id::text, true);
  select public.create_community_post_draft('WM-115 stale cleanup test') into post_id;
  if exists (select 1 from public.community_posts where id = stale_post_id) then
    raise exception 'stale empty draft was not cleaned';
  end if;
  begin
    perform public.create_community_post_draft('WM-115 fresh draft must remain');
    raise exception 'fresh open draft quota was not enforced';
  exception
    when sqlstate 'P0001' then
      if sqlerrm <> 'open_draft_limit' then raise; end if;
  end;

  execute 'reset role';
  for index in 1..13 loop
    insert into public.community_posts (owner_user_id, caption)
    values (upload_owner_id, 'WM-115 upload quota test')
    returning id into upload_post_id;
    post_ids := array_append(post_ids, upload_post_id);
  end loop;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', upload_owner_id::text, true);
  for index in 1..6 loop
    if not public.consume_community_image_upload_authorization(post_ids[index]) then
      raise exception 'valid upload authorization was rejected';
    end if;
  end loop;
  begin
    perform public.consume_community_image_upload_authorization(post_ids[7]);
    raise exception 'hourly upload quota was not enforced';
  exception
    when sqlstate 'P0001' then
      if sqlerrm <> 'upload_hourly_limit' then raise; end if;
  end;

  execute 'reset role';
  update private.community_post_upload_authorizations
  set created_at = now() - interval '2 hours'
  where owner_user_id = upload_owner_id;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', upload_owner_id::text, true);
  for index in 7..12 loop
    if not public.consume_community_image_upload_authorization(post_ids[index]) then
      raise exception 'valid daily upload authorization was rejected';
    end if;
  end loop;
  begin
    perform public.consume_community_image_upload_authorization(post_ids[13]);
    raise exception 'daily upload quota was not enforced';
  exception
    when sqlstate 'P0001' then
      if sqlerrm <> 'upload_daily_limit' then raise; end if;
  end;

  execute 'reset role';
  insert into public.community_posts (owner_user_id, caption)
  values (per_post_owner_id, 'WM-115 per-post quota test')
  returning id into upload_post_id;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', per_post_owner_id::text, true);
  for index in 1..3 loop
    if not public.consume_community_image_upload_authorization(upload_post_id) then
      raise exception 'valid per-post upload authorization was rejected';
    end if;
  end loop;
  begin
    perform public.consume_community_image_upload_authorization(upload_post_id);
    raise exception 'per-post upload quota was not enforced';
  exception
    when sqlstate 'P0001' then
      if sqlerrm <> 'post_upload_limit' then raise; end if;
  end;

  perform set_config('request.jwt.claim.sub', other_id::text, true);
  begin
    perform public.consume_community_image_upload_authorization(upload_post_id);
    raise exception 'cross-user upload authorization was accepted';
  exception
    when sqlstate 'P0001' then
      if sqlerrm <> 'post_not_uploadable' then raise; end if;
  end;
end;
$$;

select pass('WM-115 Moments write limits and ownership');
select ok(
  has_schema_privilege('authenticated', 'private', 'USAGE') = false,
  'authenticated cannot use the private quota schema'
);
select ok(
  has_table_privilege('authenticated', 'private.community_post_upload_authorizations', 'SELECT') = false,
  'authenticated cannot read upload accounting'
);
select ok(
  has_table_privilege('authenticated', 'private.community_post_upload_authorizations', 'INSERT') = false,
  'authenticated cannot insert upload accounting directly'
);
select ok(
  has_function_privilege('authenticated', 'public.consume_community_image_upload_authorization(uuid)', 'EXECUTE'),
  'authenticated can call the constrained quota function'
);
select ok(
  has_function_privilege('anon', 'public.consume_community_image_upload_authorization(uuid)', 'EXECUTE') = false,
  'anon cannot call the quota function without an authenticated identity'
);

select * from finish();

rollback;
