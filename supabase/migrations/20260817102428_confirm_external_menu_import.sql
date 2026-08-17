-- WM-54: provider-neutral provenance for reviewed external menu items.
create extension if not exists unaccent with schema extensions;

create table public.product_external_sources (
  id uuid primary key default extensions.gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  location_id uuid not null references public.locations (id) on delete restrict,
  provider text not null,
  external_item_id text not null,
  verified_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_external_sources_provider_check
    check (provider in ('uber_eats')),
  constraint product_external_sources_external_item_id_check
    check (length(trim(external_item_id)) between 1 and 255),
  constraint product_external_sources_identity_key
    unique (location_id, provider, external_item_id)
);

create index product_external_sources_product_id_idx
  on public.product_external_sources (product_id);

create index product_external_sources_location_id_idx
  on public.product_external_sources (location_id);

create trigger product_external_sources_set_updated_at
before update on public.product_external_sources
for each row execute function public.set_updated_at();

alter table public.product_external_sources enable row level security;

revoke all on public.product_external_sources from public, anon;
grant select, insert, update, delete
on public.product_external_sources
to authenticated;

create policy "admins can manage product external sources"
on public.product_external_sources
for all to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create or replace function public.confirm_external_menu_import(
  p_location_id uuid,
  p_provider text,
  p_items jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
<<confirm_import>>
declare
  location_brand_id uuid;
  item_value jsonb;
  valid_item jsonb;
  item_index integer := 0;
  external_item_id text;
  item_name text;
  item_description text;
  target_category_text text;
  target_category_id uuid;
  canonical_slug text;
  existing_product_id uuid;
  existing_provenance_product_id uuid;
  product_id uuid;
  product_was_created boolean;
  failures jsonb := '[]'::jsonb;
  valid_items jsonb := '[]'::jsonb;
  created jsonb := '[]'::jsonb;
  reused jsonb := '[]'::jsonb;
  seen_external_item_ids text[] := '{}'::text[];
  seen_slugs text[] := '{}'::text[];
  same_name_count integer;
begin
  if not (select public.is_admin()) then
    raise exception using errcode = 'P0001', message = 'admin_access_required';
  end if;

  if p_provider <> 'uber_eats' then
    raise exception using errcode = 'P0001', message = 'unsupported_provider';
  end if;

  if p_items is null
    or jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) > 100 then
    raise exception using errcode = 'P0001', message = 'invalid_import_items';
  end if;

  select locations.brand_id
  into location_brand_id
  from public.locations
  where locations.id = p_location_id
  for share;

  if location_brand_id is null then
    raise exception using errcode = 'P0001', message = 'location_not_found';
  end if;

  -- Validate every selected item before performing any writes. This gives the
  -- caller item-level reasons while keeping the database operation atomic.
  for item_value in
    select value from jsonb_array_elements(p_items) as elements(value)
  loop
    item_index := item_index + 1;

    if jsonb_typeof(item_value) <> 'object' then
      failures := failures || jsonb_build_array(jsonb_build_object(
        'externalItemId', '',
        'reason', format('Item %s is not an object.', item_index)
      ));
      continue;
    end if;

    external_item_id := nullif(trim(item_value ->> 'externalItemId'), '');
    if jsonb_typeof(item_value -> 'externalItemId') <> 'string'
      or external_item_id is null
      or length(external_item_id) > 255 then
      failures := failures || jsonb_build_array(jsonb_build_object(
        'externalItemId', coalesce(external_item_id, ''),
        'reason', 'External item ID is required and must be at most 255 characters.'
      ));
      continue;
    end if;

    item_name := nullif(trim(item_value ->> 'name'), '');
    if jsonb_typeof(item_value -> 'name') <> 'string'
      or item_name is null
      or length(item_name) > 160 then
      failures := failures || jsonb_build_array(jsonb_build_object(
        'externalItemId', external_item_id,
        'reason', 'Product name is required and must be at most 160 characters.'
      ));
      continue;
    end if;

    item_description := nullif(trim(item_value ->> 'description'), '');
    if item_value ? 'description'
      and jsonb_typeof(item_value -> 'description') not in ('string', 'null') then
      failures := failures || jsonb_build_array(jsonb_build_object(
        'externalItemId', external_item_id,
        'reason', 'Description must be text or null.'
      ));
      continue;
    end if;
    if item_description is not null and length(item_description) > 2000 then
      failures := failures || jsonb_build_array(jsonb_build_object(
        'externalItemId', external_item_id,
        'reason', 'Description must be at most 2000 characters.'
      ));
      continue;
    end if;

    target_category_text := nullif(trim(item_value ->> 'targetCategoryId'), '');
    if jsonb_typeof(item_value -> 'targetCategoryId') <> 'string'
      or target_category_text is null
      or target_category_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      failures := failures || jsonb_build_array(jsonb_build_object(
        'externalItemId', external_item_id,
        'reason', 'A valid canonical category is required.'
      ));
      continue;
    end if;
    target_category_id := target_category_text::uuid;

    if not exists (
      select 1 from public.categories
      where categories.id = target_category_id
    ) then
      failures := failures || jsonb_build_array(jsonb_build_object(
        'externalItemId', external_item_id,
        'reason', 'The selected canonical category no longer exists.'
      ));
      continue;
    end if;

    canonical_slug := regexp_replace(
      regexp_replace(
        lower(extensions.unaccent(item_name)),
        '[^a-z0-9]+', '-', 'g'
      ),
      '(^-+|-+$)', '', 'g'
    );
    if canonical_slug = '' or length(canonical_slug) > 160 then
      failures := failures || jsonb_build_array(jsonb_build_object(
        'externalItemId', external_item_id,
        'reason', 'The product name does not produce a valid canonical slug.'
      ));
      continue;
    end if;

    if external_item_id = any(seen_external_item_ids) then
      failures := failures || jsonb_build_array(jsonb_build_object(
        'externalItemId', external_item_id,
        'reason', 'The same external item was selected more than once.'
      ));
      continue;
    end if;
    seen_external_item_ids := array_append(seen_external_item_ids, external_item_id);

    if canonical_slug = any(seen_slugs) then
      failures := failures || jsonb_build_array(jsonb_build_object(
        'externalItemId', external_item_id,
        'reason', 'Multiple selected items resolve to the same canonical product identity.'
      ));
      continue;
    end if;
    seen_slugs := array_append(seen_slugs, canonical_slug);

    existing_product_id := null;
    select products.id
    into existing_product_id
    from public.products
    where products.brand_id = location_brand_id
      and products.slug = canonical_slug
    for update;

    same_name_count := 0;
    if existing_product_id is null then
      select count(*)
      into same_name_count
      from public.products
      where products.brand_id = location_brand_id
        and lower(trim(products.name)) = lower(item_name)
        and products.slug <> canonical_slug;
    end if;

    existing_provenance_product_id := null;
    select product_external_sources.product_id
    into existing_provenance_product_id
    from public.product_external_sources
    where product_external_sources.location_id = p_location_id
      and product_external_sources.provider = p_provider
      and product_external_sources.external_item_id = confirm_import.external_item_id
    for update;

    if existing_provenance_product_id is not null
      and (existing_product_id is null or existing_provenance_product_id <> existing_product_id) then
      failures := failures || jsonb_build_array(jsonb_build_object(
        'externalItemId', external_item_id,
        'reason', 'This external item is already linked to another canonical product.'
      ));
      continue;
    end if;

    if same_name_count > 0 then
      failures := failures || jsonb_build_array(jsonb_build_object(
        'externalItemId', external_item_id,
        'reason', 'Possible existing product requires manual resolution.'
      ));
      continue;
    end if;

    valid_items := valid_items || jsonb_build_array(jsonb_build_object(
      'externalItemId', external_item_id,
      'name', item_name,
      'description', item_description,
      'targetCategoryId', target_category_id,
      'slug', canonical_slug
    ));
  end loop;

  if jsonb_array_length(failures) > 0 then
    return jsonb_build_object(
      'status', 'validation_failed',
      'created', '[]'::jsonb,
      'reused', '[]'::jsonb,
      'failed', failures
    );
  end if;

  -- All writes below are in this function's transaction. Existing canonical
  -- fields and existing location relationship fields are never updated.
  for valid_item in
    select value from jsonb_array_elements(valid_items) as elements(value)
  loop
    external_item_id := valid_item ->> 'externalItemId';
    item_name := valid_item ->> 'name';
    item_description := valid_item ->> 'description';
    target_category_id := (valid_item ->> 'targetCategoryId')::uuid;
    canonical_slug := valid_item ->> 'slug';
    product_id := null;
    product_was_created := false;

    select products.id
    into product_id
    from public.products
    where products.brand_id = location_brand_id
      and products.slug = canonical_slug
    for update;

    if product_id is null then
      insert into public.products (
        brand_id,
        category_id,
        name,
        slug,
        description,
        discovery_tags,
        is_seasonal,
        is_published
      )
      values (
        location_brand_id,
        target_category_id,
        item_name,
        canonical_slug,
        item_description,
        '{}',
        false,
        false
      )
      on conflict (brand_id, slug) do nothing
      returning products.id into product_id;

      if product_id is not null then
        product_was_created := true;
      else
        select products.id
        into product_id
        from public.products
        where products.brand_id = location_brand_id
          and products.slug = canonical_slug
        for update;
      end if;
    end if;

    if product_id is null then
      raise exception using errcode = 'P0001', message = 'product_resolution_failed';
    end if;

    existing_provenance_product_id := null;
    select product_external_sources.product_id
    into existing_provenance_product_id
    from public.product_external_sources
    where product_external_sources.location_id = p_location_id
      and product_external_sources.provider = p_provider
      and product_external_sources.external_item_id = confirm_import.external_item_id
    for update;

    if existing_provenance_product_id is not null
      and existing_provenance_product_id <> product_id then
      raise exception using errcode = 'P0001', message = 'external_identity_conflict';
    end if;

    if existing_provenance_product_id is null then
      insert into public.product_external_sources (
        product_id,
        location_id,
        provider,
        external_item_id
      )
      values (
        confirm_import.product_id,
        p_location_id,
        p_provider,
        confirm_import.external_item_id
      )
      on conflict (location_id, provider, external_item_id) do nothing;
    end if;

    insert into public.location_products (
      location_id,
      product_id,
      brand_id,
      availability_status,
      source_provenance
    )
    values (
      p_location_id,
      confirm_import.product_id,
      location_brand_id,
      'unknown',
      'wemilktea'
    )
    on conflict (location_id, product_id) do nothing;

    if product_was_created then
      created := created || jsonb_build_array(jsonb_build_object(
        'externalItemId', external_item_id,
        'name', item_name,
        'productId', product_id
      ));
    else
      reused := reused || jsonb_build_array(jsonb_build_object(
        'externalItemId', external_item_id,
        'name', item_name,
        'productId', product_id
      ));
    end if;
  end loop;

  return jsonb_build_object(
    'status', 'success',
    'created', created,
    'reused', reused,
    'failed', '[]'::jsonb
  );
end;
$$;

revoke all on function public.confirm_external_menu_import(uuid, text, jsonb)
from public, anon;
grant execute on function public.confirm_external_menu_import(uuid, text, jsonb)
to authenticated;
