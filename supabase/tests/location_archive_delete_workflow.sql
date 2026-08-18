begin;

select plan(20);

do $$
declare
  admin_user_id uuid := extensions.gen_random_uuid();
  ordinary_user_id uuid := extensions.gen_random_uuid();
  brand_id uuid := extensions.gen_random_uuid();
  archive_location_id uuid := extensions.gen_random_uuid();
  published_location_id uuid := extensions.gen_random_uuid();
  identity_location_id uuid := extensions.gen_random_uuid();
  history_location_id uuid := extensions.gen_random_uuid();
  external_location_id uuid := extensions.gen_random_uuid();
  catalogue_location_id uuid := extensions.gen_random_uuid();
  image_location_id uuid := extensions.gen_random_uuid();
  candidate_id uuid := extensions.gen_random_uuid();
  category_id uuid := extensions.gen_random_uuid();
  product_id uuid := extensions.gen_random_uuid();
  image_id uuid := extensions.gen_random_uuid();
begin
  insert into public.brands (id, name, slug, is_published)
  values (brand_id, 'WM-46 Archive Test Brand', 'wm-46-archive-test-brand', true);

  insert into public.locations (
    id, brand_id, display_name, slug, suburb, address, coordinates,
    google_place_id, publication_status, source_provenance
  )
  values
    (
      archive_location_id, brand_id, 'WM-46 Archive Location',
      'wm-46-archive-location', 'Auckland CBD', '1 WM-46 Test Street',
      extensions.st_setsrid(extensions.st_makepoint(174.7633, -36.8485), 4326)::extensions.geography,
      null, 'draft', 'wemilktea'
    ),
    (
      published_location_id, brand_id, 'WM-46 Published Location',
      'wm-46-published-location', 'Auckland CBD', '2 WM-46 Test Street',
      extensions.st_setsrid(extensions.st_makepoint(174.7643, -36.8485), 4326)::extensions.geography,
      null, 'draft', 'wemilktea'
    ),
    (
      identity_location_id, brand_id, 'WM-46 Identity Location',
      'wm-46-identity-location', 'Auckland CBD', '3 WM-46 Test Street',
      extensions.st_setsrid(extensions.st_makepoint(174.7653, -36.8485), 4326)::extensions.geography,
      'ChIJwm46identity', 'draft', 'google'
    ),
    (
      history_location_id, brand_id, 'WM-46 History Location',
      'wm-46-history-location', 'Auckland CBD', '4 WM-46 Test Street',
      extensions.st_setsrid(extensions.st_makepoint(174.7663, -36.8485), 4326)::extensions.geography,
      null, 'draft', 'wemilktea'
    ),
    (
      external_location_id, brand_id, 'WM-46 External Location',
      'wm-46-external-location', 'Auckland CBD', '5 WM-46 Test Street',
      extensions.st_setsrid(extensions.st_makepoint(174.7673, -36.8485), 4326)::extensions.geography,
      null, 'draft', 'wemilktea'
    ),
    (
      catalogue_location_id, brand_id, 'WM-46 Catalogue Location',
      'wm-46-catalogue-location', 'Auckland CBD', '6 WM-46 Test Street',
      extensions.st_setsrid(extensions.st_makepoint(174.7683, -36.8485), 4326)::extensions.geography,
      null, 'draft', 'wemilktea'
    ),
    (
      image_location_id, brand_id, 'WM-46 Image Location',
      'wm-46-image-location', 'Auckland CBD', '7 WM-46 Test Street',
      extensions.st_setsrid(extensions.st_makepoint(174.7693, -36.8485), 4326)::extensions.geography,
      null, 'draft', 'wemilktea'
    );

  insert into public.categories (id, name, slug)
  values (category_id, 'WM-46 Archive Test Category', 'wm-46-archive-test-category');

  insert into public.products (id, brand_id, category_id, name, slug)
  values (
    product_id, brand_id, category_id, 'WM-46 Archive Test Product',
    'wm-46-archive-test-product'
  );

  insert into public.location_products (location_id, product_id, brand_id)
  values (catalogue_location_id, product_id, brand_id);

  insert into public.image_assets (id, provenance, storage_key)
  values (image_id, 'wemilktea', 'wm-46/archive-test.jpg');

  insert into public.location_images (location_id, image_id, is_primary)
  values (image_location_id, image_id, true);

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  )
  values
    (
      extensions.gen_random_uuid(), admin_user_id, 'authenticated', 'authenticated',
      'wm-46-admin@example.test', 'not-used', '{}', '{}', now(), now()
    ),
    (
      extensions.gen_random_uuid(), ordinary_user_id, 'authenticated', 'authenticated',
      'wm-46-user@example.test', 'not-used', '{}', '{}', now(), now()
    );

  insert into public.admin_users (user_id) values (admin_user_id);

  insert into public.store_candidates (
    id, google_place_id, candidate_name, status, reviewed_at, reviewed_by,
    resolved_location_id
  )
  values (
    candidate_id, 'ChIJwm46history', 'WM-46 History Candidate', 'approved',
    now(), admin_user_id, history_location_id
  );

  insert into public.location_external_sources (
    location_id, provider, external_store_id
  )
  values (external_location_id, 'uber_eats', 'wm-46-external-store');
  perform set_config('wm46.admin_user_id', admin_user_id::text, true);
  perform set_config('wm46.ordinary_user_id', ordinary_user_id::text, true);
  perform set_config('wm46.archive_location_id', archive_location_id::text, true);
  perform set_config('wm46.published_location_id', published_location_id::text, true);
  perform set_config('wm46.identity_location_id', identity_location_id::text, true);
  perform set_config('wm46.history_location_id', history_location_id::text, true);
  perform set_config('wm46.external_location_id', external_location_id::text, true);
  perform set_config('wm46.catalogue_location_id', catalogue_location_id::text, true);
  perform set_config('wm46.image_location_id', image_location_id::text, true);
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('wm46.ordinary_user_id'), true);

select throws_ok(
  $$select public.archive_location(current_setting('wm46.archive_location_id')::uuid)$$,
  'P0001',
  'admin_access_required',
  'ordinary authenticated users cannot archive locations'
);

select throws_ok(
  $$select public.delete_location_if_safe(current_setting('wm46.archive_location_id')::uuid)$$,
  'P0001',
  'admin_access_required',
  'ordinary authenticated users cannot delete locations'
);

select set_config('request.jwt.claim.sub', current_setting('wm46.admin_user_id'), true);

select lives_ok(
  $$select public.archive_location(current_setting('wm46.archive_location_id')::uuid)$$,
  'admin can archive a draft location'
);

select is(
  (
    select publication_status
    from public.locations
    where id = current_setting('wm46.archive_location_id')::uuid
  ),
  'archived',
  'archiving preserves the location row and changes only its lifecycle status'
);

select throws_ok(
  $$select public.archive_location(current_setting('wm46.archive_location_id')::uuid)$$,
  'P0001',
  'location_already_archived',
  'archiving an archived location fails predictably'
);

select lives_ok(
  $$select public.restore_archived_location(current_setting('wm46.archive_location_id')::uuid)$$,
  'admin can restore an archived location'
);

select is(
  (
    select publication_status
    from public.locations
    where id = current_setting('wm46.archive_location_id')::uuid
  ),
  'draft',
  'restoring an archived location returns it to draft'
);

select lives_ok(
  $$select public.publish_location(current_setting('wm46.published_location_id')::uuid)$$,
  'test location can be published before archive'
);

select lives_ok(
  $$select public.archive_location(current_setting('wm46.published_location_id')::uuid)$$,
  'admin can archive a published location'
);

set local role anon;

select is(
  (
    select count(*)
    from public.locations
    where id = current_setting('wm46.published_location_id')::uuid
  ),
  0::bigint,
  'archived locations are excluded from public location reads'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('wm46.admin_user_id'), true);

select is(
  (
    select count(*)
    from public.locations
    where id = current_setting('wm46.published_location_id')::uuid
      and publication_status = 'archived'
  ),
  1::bigint,
  'admins can still manage archived locations'
);

select lives_ok(
  $$select public.restore_archived_location(current_setting('wm46.published_location_id')::uuid)$$,
  'admin can restore the archived published location to draft'
);

select lives_ok(
  $$select public.delete_location_if_safe(current_setting('wm46.archive_location_id')::uuid)$$,
  'admin can permanently delete a draft with no identity or dependencies'
);

select is(
  (
    select count(*)
    from public.locations
    where id = current_setting('wm46.archive_location_id')::uuid
  ),
  0::bigint,
  'safe deletion removes only the explicitly targeted location'
);

select throws_ok(
  $$select public.delete_location_if_safe(current_setting('wm46.identity_location_id')::uuid)$$,
  'P0001',
  'location_has_external_identity',
  'Google identity prevents permanent deletion'
);

select throws_ok(
  $$select public.delete_location_if_safe(current_setting('wm46.history_location_id')::uuid)$$,
  'P0001',
  'location_has_candidate_history',
  'candidate review history prevents permanent deletion'
);

select throws_ok(
  $$select public.delete_location_if_safe(current_setting('wm46.external_location_id')::uuid)$$,
  'P0001',
  'location_has_external_provenance',
  'external integration provenance prevents permanent deletion'
);

select throws_ok(
  $$select public.delete_location_if_safe(current_setting('wm46.catalogue_location_id')::uuid)$$,
  'P0001',
  'location_has_catalogue_records',
  'catalogue relationships prevent permanent deletion'
);

select throws_ok(
  $$select public.delete_location_if_safe(current_setting('wm46.image_location_id')::uuid)$$,
  'P0001',
  'location_has_image_records',
  'owned image relationships prevent permanent deletion'
);

select throws_ok(
  $$select public.delete_location_if_safe(current_setting('wm46.published_location_id')::uuid)$$,
  'P0001',
  'location_delete_requires_draft_or_archived',
  'published locations cannot be permanently deleted'
);

select * from finish();
rollback;
