begin;

select plan(4);

do $$
declare
  owner_id uuid := extensions.gen_random_uuid();
  other_id uuid := extensions.gen_random_uuid();
  post_id uuid;
  image_id uuid;
  duplicate_image_id uuid;
  valid_quarantine text;
  valid_final text;
begin
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    (extensions.gen_random_uuid(), owner_id, 'authenticated', 'authenticated', 'wm109-owner@example.test', 'unused', '{}'::jsonb, '{}'::jsonb, now(), now()),
    (extensions.gen_random_uuid(), other_id, 'authenticated', 'authenticated', 'wm109-other@example.test', 'unused', '{}'::jsonb, '{}'::jsonb, now(), now());

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', owner_id::text, true);
  select public.create_community_post_draft('WM-109 upload test') into post_id;

  valid_quarantine := 'community/' || owner_id || '/' || post_id || '/quarantine/33333333-3333-4333-8333-333333333333.webp';
  valid_final := replace(valid_quarantine, '/quarantine/', '/');

  begin
    perform public.finalize_community_post_image(
      post_id, owner_id, valid_quarantine, valid_final,
      'image/webp', 1000, 1200, 800, 'test-etag'
    );
    raise exception 'authenticated users can call the service-only finalizer';
  exception
    when insufficient_privilege then null;
  end;
  execute 'reset role';
end;
$$;

select ok(
  has_function_privilege(
    'authenticated',
    'public.finalize_community_post_image(uuid,uuid,text,text,text,bigint,integer,integer,text)',
    'execute'
  ) = false,
  'the finalizer is not executable by public authenticated clients'
);

do $$
declare
  owner_id uuid;
  other_id uuid;
  post_id uuid;
  image_id uuid;
  duplicate_image_id uuid;
  valid_quarantine text;
  valid_final text;
begin
  select id into owner_id from auth.users where email = 'wm109-owner@example.test';
  select id into other_id from auth.users where email = 'wm109-other@example.test';
  select id into post_id from public.community_posts where owner_user_id = owner_id and caption = 'WM-109 upload test';
  valid_quarantine := 'community/' || owner_id || '/' || post_id || '/quarantine/33333333-3333-4333-8333-333333333333.webp';
  valid_final := replace(valid_quarantine, '/quarantine/', '/');

  execute 'set local role service_role';
  select image_asset_id into image_id
  from public.finalize_community_post_image(
    post_id, owner_id, valid_quarantine, valid_final,
    'image/webp', 1000, 1200, 800, 'test-etag'
  );
  select image_asset_id into duplicate_image_id
  from public.finalize_community_post_image(
    post_id, owner_id, valid_quarantine, valid_final,
    'image/webp', 1000, 1200, 800, 'test-etag'
  );
  execute 'reset role';

  if image_id is null or duplicate_image_id <> image_id then
    raise exception 'duplicate finalization was not idempotent';
  end if;
  if not exists (select 1 from public.community_posts where id = post_id and status = 'active' and image_asset_id = image_id) then
    raise exception 'valid finalization did not activate the draft';
  end if;
  if not exists (select 1 from public.image_assets where id = image_id and owner_user_id = owner_id and storage_key = valid_final and content_type = 'image/webp' and byte_size = 1000 and width = 1200 and height = 800) then
    raise exception 'verified metadata was not persisted';
  end if;

  execute 'set local role service_role';
  begin
    perform public.finalize_community_post_image(
      post_id, other_id,
      'community/' || other_id || '/' || post_id || '/quarantine/44444444-4444-4444-8444-444444444444.webp',
      'community/' || other_id || '/' || post_id || '/44444444-4444-4444-8444-444444444444.webp',
      'image/webp', 1000, 1200, 800, 'other-etag'
    );
    raise exception 'a different owner finalized this post';
  exception
    when sqlstate 'P0001' then null;
  end;

  begin
    perform public.finalize_community_post_image(
      post_id, owner_id,
      'community/' || owner_id || '/' || post_id || '/quarantine/55555555-5555-4555-8555-555555555555.webp',
      'community/' || owner_id || '/' || post_id || '/55555555-5555-4555-8555-555555555555.webp',
      'image/webp', 1000, 3000, 3000, 'large-etag'
    );
    raise exception 'an oversized final image was accepted';
  exception
    when sqlstate 'P0001' then null;
  end;

  execute 'reset role';
end;
$$;

select ok(
  (select status = 'active' from public.community_posts where caption = 'WM-109 upload test'),
  'a verified owner image activates exactly the owned draft'
);
select ok(
  (select count(*) = 1
   from public.image_assets
   where owner_user_id = (select id from auth.users where email = 'wm109-owner@example.test')
     and storage_key like 'community/%'),
  'image asset rows remain database-owned metadata'
);
select pass('WM-109 database finalization contract');

select * from finish();
rollback;
