begin;

do $$
declare
  submission_id uuid;
  admin_user_id uuid := extensions.gen_random_uuid();
  anonymous_count integer;
begin
  execute 'set local role anon';

  insert into public.store_submissions (
    store_name,
    suburb,
    google_maps_url,
    official_url,
    notes,
    submitter_email
  )
  values (
    'SQL Verification Tea',
    'Auckland CBD',
    'https://maps.google.com/?q=SQL+Verification+Tea',
    'https://example.test/tea',
    'Created by the WM-23 RLS verification.',
    'reviewer@example.test'
  );

  execute 'reset role';
  select id into submission_id
  from public.store_submissions
  where store_name = 'SQL Verification Tea'
    and suburb = 'Auckland CBD'
  order by created_at desc
  limit 1;

  if not exists (
    select 1
    from public.store_submissions
    where id = submission_id
      and moderation_status = 'pending'
      and reviewed_at is null
      and reviewed_by is null
  ) then
    raise exception 'anonymous valid submission was not persisted as pending';
  end if;

  execute 'set local role anon';

  begin
    select count(*) into anonymous_count from public.store_submissions;
    raise exception 'anonymous users can read store submissions';
  exception
    when insufficient_privilege then null;
  end;

  begin
    update public.store_submissions
    set moderation_status = 'approved'
    where id = submission_id;
    raise exception 'anonymous users can update store submissions';
  exception
    when insufficient_privilege then null;
  end;

  begin
    delete from public.store_submissions where id = submission_id;
    raise exception 'anonymous users can delete store submissions';
  exception
    when insufficient_privilege then null;
  end;

  begin
    insert into public.store_submissions (store_name, suburb)
    values ('Invalid suburb', '   ');
    raise exception 'blank suburb bypassed database validation';
  exception
    when check_violation then null;
  end;

  begin
    insert into public.store_submissions (store_name, suburb, google_maps_url)
    values ('Invalid URL', 'Auckland CBD', 'javascript:alert(1)');
    raise exception 'invalid URL bypassed database validation';
  exception
    when check_violation then null;
  end;

  begin
    insert into public.store_submissions (store_name, suburb, moderation_status)
    values ('Invalid status', 'Auckland CBD', 'approved');
    raise exception 'anonymous users can set moderation status';
  exception
    when check_violation then null;
    when insufficient_privilege then null;
  end;

  execute 'reset role';

  insert into auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at
  )
  values (
    extensions.gen_random_uuid(),
    admin_user_id,
    'authenticated',
    'authenticated',
    'wm23-test-admin@example.test',
    'not-used',
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  );
  insert into public.admin_users (user_id) values (admin_user_id);

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', admin_user_id::text, true);
  if not exists (
    select 1 from public.store_submissions where id = submission_id
  ) then
    raise exception 'authorized admin cannot read submissions';
  end if;

  execute 'reset role';
end;
$$;

rollback;
