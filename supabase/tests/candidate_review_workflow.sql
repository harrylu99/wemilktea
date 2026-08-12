begin;

do $$
declare
  admin_user_id uuid := extensions.gen_random_uuid();
  ordinary_user_id uuid := extensions.gen_random_uuid();
  approve_candidate_id uuid := extensions.gen_random_uuid();
  existing_brand_candidate_id uuid := extensions.gen_random_uuid();
  merge_candidate_id uuid := extensions.gen_random_uuid();
  reject_candidate_id uuid := extensions.gen_random_uuid();
  atomic_candidate_id uuid := extensions.gen_random_uuid();
  target_location_id uuid := extensions.gen_random_uuid();
  approved_location_id uuid;
  existing_brand_location_id uuid;
  merged_location_id uuid;
  gong_cha_brand_id uuid;
  location_count_before integer;
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  )
  values
    (extensions.gen_random_uuid(), admin_user_id, 'authenticated', 'authenticated', 'candidate-admin@example.test', 'not-used', '{}'::jsonb, '{}'::jsonb, now(), now()),
    (extensions.gen_random_uuid(), ordinary_user_id, 'authenticated', 'authenticated', 'candidate-user@example.test', 'not-used', '{}'::jsonb, '{}'::jsonb, now(), now());
  insert into public.admin_users (user_id) values (admin_user_id);

  select id into gong_cha_brand_id from public.brands where slug = 'gong-cha';

  insert into public.locations (
    id, brand_id, display_name, slug, suburb, address, coordinates,
    publication_status, source_provenance
  )
  values (
    target_location_id,
    gong_cha_brand_id,
    'Gong cha Test Merge',
    'gong-cha-test-merge',
    'Auckland CBD',
    '99 Test Street, Auckland',
    extensions.st_setsrid(extensions.st_makepoint(174.764, -36.849), 4326)::extensions.geography,
    'draft',
    'wemilktea'
  );

  insert into public.store_candidates (id, google_place_id, source_provenance, status)
  values
    (approve_candidate_id, 'ChIJcandidateApprove', 'google', 'new'),
    (existing_brand_candidate_id, 'ChIJcandidateExistingBrand', 'google', 'new'),
    (merge_candidate_id, 'ChIJcandidateMerge', 'google', 'possible_duplicate'),
    (reject_candidate_id, 'ChIJcandidateReject', 'google', 'new'),
    (atomic_candidate_id, 'ChIJcandidateAtomic', 'google', 'new');

  insert into public.discovery_runs (
    trigger_type, status, finished_at, query_count, result_count, new_candidate_count
  )
  values ('manual', 'succeeded', now(), 1, 1, 1)
  returning id into approved_location_id;
  insert into public.store_candidate_observations (discovery_run_id, candidate_id)
  values (approved_location_id, approve_candidate_id);

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', ordinary_user_id::text, true);
  begin
    perform public.reject_store_candidate(reject_candidate_id, 'other');
    raise exception 'ordinary authenticated user resolved a candidate';
  exception
    when raise_exception then
      if sqlerrm <> 'admin_access_required' then
        raise;
      end if;
  end;
  execute 'reset role';

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', admin_user_id::text, true);

  approved_location_id := public.approve_store_candidate(
    approve_candidate_id,
    null,
    'Candidate Test Tea',
    'candidate-test-tea',
    'Candidate Test Tea Central',
    'candidate-test-tea-central',
    'Auckland CBD',
    '10 Test Street, Auckland',
    -36.8485,
    174.7633,
    'https://example.test/candidate-test-tea'
  );

  if not exists (
    select 1
    from public.locations
    where id = approved_location_id
      and publication_status = 'draft'
      and google_place_id = 'ChIJcandidateApprove'
  ) then
    raise exception 'approval did not create a draft canonical location';
  end if;

  if not exists (
    select 1
    from public.store_candidates
    where id = approve_candidate_id
      and status = 'approved'
      and reviewed_by = admin_user_id
      and reviewed_at is not null
      and resolved_location_id = approved_location_id
  ) then
    raise exception 'approval audit fields are incomplete';
  end if;

  if not exists (
    select 1 from public.store_candidate_observations where candidate_id = approve_candidate_id
  ) then
    raise exception 'approval removed candidate observations';
  end if;

  existing_brand_location_id := public.approve_store_candidate(
    existing_brand_candidate_id,
    gong_cha_brand_id,
    null,
    null,
    'Gong cha Test Branch',
    'gong-cha-test-branch',
    'Takapuna',
    '11 Test Street, Takapuna',
    -36.7875,
    174.7750,
    null
  );

  if (select brand_id from public.locations where id = existing_brand_location_id) <> gong_cha_brand_id then
    raise exception 'existing brand was not reused';
  end if;

  select count(*) into location_count_before from public.locations;
  merged_location_id := public.merge_store_candidate(merge_candidate_id, target_location_id);
  if merged_location_id <> target_location_id
    or (select count(*) from public.locations) <> location_count_before
    or (select google_place_id from public.locations where id = target_location_id) <> 'ChIJcandidateMerge' then
    raise exception 'merge created or failed to associate a canonical location';
  end if;

  perform public.reject_store_candidate(reject_candidate_id, 'outside_scope');
  if not exists (
    select 1
    from public.store_candidates
    where id = reject_candidate_id
      and status = 'rejected'
      and reviewed_by = admin_user_id
      and reviewed_at is not null
      and resolved_location_id is null
      and rejection_reason = 'outside_scope'
  ) then
    raise exception 'rejection audit fields are incomplete';
  end if;

  begin
    perform public.approve_store_candidate(
      approve_candidate_id, gong_cha_brand_id, null, null,
      'Duplicate Approval', 'duplicate-approval', 'Auckland CBD',
      '12 Test Street, Auckland', -36.8485, 174.7633, null
    );
    raise exception 'already reviewed candidate can be approved again';
  exception
    when raise_exception then
      if sqlerrm <> 'candidate_not_reviewable' then
        raise;
      end if;
  end;

  begin
    perform public.approve_store_candidate(
      atomic_candidate_id, null, 'Atomic Failure Brand', 'atomic-failure-brand',
      'Atomic Failure Location', 'INVALID SLUG', 'Auckland CBD',
      '13 Test Street, Auckland', -36.8485, 174.7633, null
    );
    raise exception 'invalid approval completed';
  exception
    when raise_exception then
      if sqlerrm <> 'invalid_location_data' then
        raise;
      end if;
  end;

  execute 'reset role';

  if exists (select 1 from public.brands where slug = 'atomic-failure-brand')
    or (select status from public.store_candidates where id = atomic_candidate_id) <> 'new' then
    raise exception 'failed approval was not atomic';
  end if;
end;
$$;

rollback;
