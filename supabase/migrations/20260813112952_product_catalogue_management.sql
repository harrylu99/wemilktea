-- WM-25: canonical product management and product/location operations.
alter table public.products
  add constraint products_name_length_check
    check (length(trim(name)) between 1 and 160),
  add constraint products_description_length_check
    check (description is null or length(description) <= 2000);

create index if not exists products_updated_at_idx
  on public.products (updated_at desc);

create index if not exists location_products_location_id_idx
  on public.location_products (location_id);

create or replace function public.create_product_management(
  p_brand_id uuid,
  p_category_id uuid,
  p_name text,
  p_slug text,
  p_description text default null,
  p_discovery_tags text[] default '{}',
  p_is_seasonal boolean default false
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  product_id uuid;
begin
  if not (select public.is_admin()) then
    raise exception using errcode = 'P0001', message = 'admin_access_required';
  end if;

  if not exists (select 1 from public.brands where id = p_brand_id) then
    raise exception using errcode = 'P0001', message = 'brand_not_found';
  end if;
  if not exists (select 1 from public.categories where id = p_category_id) then
    raise exception using errcode = 'P0001', message = 'category_not_found';
  end if;
  if p_name is null or length(trim(p_name)) not between 1 and 160
    or p_slug is null or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    or (p_description is not null and length(p_description) > 2000) then
    raise exception using errcode = 'P0001', message = 'invalid_product_data';
  end if;

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
    p_brand_id,
    p_category_id,
    trim(p_name),
    p_slug,
    nullif(trim(p_description), ''),
    coalesce(p_discovery_tags, '{}'),
    coalesce(p_is_seasonal, false),
    false
  )
  returning id into product_id;

  return product_id;
exception
  when unique_violation then
    raise exception using errcode = 'P0001', message = 'product_slug_already_exists';
end;
$$;

create or replace function public.update_product_management(
  p_product_id uuid,
  p_expected_updated_at timestamptz,
  p_brand_id uuid,
  p_category_id uuid,
  p_name text,
  p_slug text,
  p_description text default null,
  p_discovery_tags text[] default '{}',
  p_is_seasonal boolean default false
)
returns timestamptz
language plpgsql
security invoker
set search_path = ''
as $$
declare
  product_row public.products%rowtype;
  updated_timestamp timestamptz;
begin
  if not (select public.is_admin()) then
    raise exception using errcode = 'P0001', message = 'admin_access_required';
  end if;

  select * into product_row
  from public.products
  where id = p_product_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'product_not_found';
  end if;
  if product_row.updated_at is distinct from p_expected_updated_at then
    raise exception using errcode = 'P0001', message = 'stale_product_update';
  end if;
  if not exists (select 1 from public.brands where id = p_brand_id) then
    raise exception using errcode = 'P0001', message = 'brand_not_found';
  end if;
  if not exists (select 1 from public.categories where id = p_category_id) then
    raise exception using errcode = 'P0001', message = 'category_not_found';
  end if;
  if p_name is null or length(trim(p_name)) not between 1 and 160
    or p_slug is null or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    or (p_description is not null and length(p_description) > 2000) then
    raise exception using errcode = 'P0001', message = 'invalid_product_data';
  end if;

  update public.products
  set brand_id = p_brand_id,
      category_id = p_category_id,
      name = trim(p_name),
      slug = p_slug,
      description = nullif(trim(p_description), ''),
      discovery_tags = coalesce(p_discovery_tags, '{}'),
      is_seasonal = coalesce(p_is_seasonal, false)
  where id = product_row.id
  returning updated_at into updated_timestamp;

  return updated_timestamp;
exception
  when unique_violation then
    raise exception using errcode = 'P0001', message = 'product_slug_already_exists';
end;
$$;

create or replace function public.publish_product(p_product_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  product_row public.products%rowtype;
  brand_published boolean;
  category_published boolean;
begin
  if not (select public.is_admin()) then
    raise exception using errcode = 'P0001', message = 'admin_access_required';
  end if;

  select * into product_row
  from public.products
  where id = p_product_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'product_not_found';
  end if;
  if product_row.is_published then
    raise exception using errcode = 'P0001', message = 'product_already_published';
  end if;

  select brands.is_published into brand_published
  from public.brands
  where brands.id = product_row.brand_id;
  select categories.is_published into category_published
  from public.categories
  where categories.id = product_row.category_id;

  if not coalesce(brand_published, false) or not coalesce(category_published, false)
    or length(trim(product_row.name)) = 0
    or product_row.slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception using errcode = 'P0001', message = 'product_missing_publish_requirements';
  end if;

  update public.products set is_published = true where id = product_row.id;
end;
$$;

create or replace function public.unpublish_product(p_product_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not (select public.is_admin()) then
    raise exception using errcode = 'P0001', message = 'admin_access_required';
  end if;
  if not exists (select 1 from public.products where id = p_product_id) then
    raise exception using errcode = 'P0001', message = 'product_not_found';
  end if;
  if not exists (select 1 from public.products where id = p_product_id and is_published) then
    raise exception using errcode = 'P0001', message = 'product_not_published';
  end if;
  update public.products set is_published = false where id = p_product_id;
end;
$$;

create or replace function public.set_product_location_availability(
  p_product_id uuid,
  p_location_id uuid,
  p_availability_status text,
  p_price_cents integer default null,
  p_currency text default 'NZD',
  p_source_provenance text default 'wemilktea',
  p_source_reference text default null,
  p_last_verified_at timestamptz default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  product_brand_id uuid;
  location_brand_id uuid;
begin
  if not (select public.is_admin()) then
    raise exception using errcode = 'P0001', message = 'admin_access_required';
  end if;
  select brand_id into product_brand_id from public.products where id = p_product_id;
  if product_brand_id is null then
    raise exception using errcode = 'P0001', message = 'product_not_found';
  end if;
  select brand_id into location_brand_id from public.locations where id = p_location_id;
  if location_brand_id is null then
    raise exception using errcode = 'P0001', message = 'location_not_found';
  end if;
  if product_brand_id <> location_brand_id then
    raise exception using errcode = 'P0001', message = 'product_location_brand_mismatch';
  end if;
  if p_availability_status not in ('available', 'unavailable', 'unknown')
    or (p_price_cents is not null and (p_price_cents < 0 or p_price_cents > 100000))
    or p_currency is null or p_currency !~ '^[A-Z]{3}$'
    or p_source_provenance not in ('wemilktea', 'merchant', 'user', 'google')
    or (p_source_reference is not null and p_source_reference !~ '^https?://') then
    raise exception using errcode = 'P0001', message = 'invalid_product_location_data';
  end if;

  insert into public.location_products (
    location_id, product_id, brand_id, price_cents, currency,
    availability_status, last_verified_at, source_provenance, source_reference
  )
  values (
    p_location_id, p_product_id, product_brand_id, p_price_cents, p_currency,
    p_availability_status, p_last_verified_at, p_source_provenance,
    nullif(trim(p_source_reference), '')
  )
  on conflict (location_id, product_id) do update
  set price_cents = excluded.price_cents,
      currency = excluded.currency,
      availability_status = excluded.availability_status,
      last_verified_at = excluded.last_verified_at,
      source_provenance = excluded.source_provenance,
      source_reference = excluded.source_reference;
end;
$$;

create or replace function public.attach_product_image(
  p_product_id uuid,
  p_storage_key text,
  p_provenance text,
  p_alt_text text,
  p_content_type text,
  p_byte_size bigint,
  p_width integer default null,
  p_height integer default null
)
returns table (image_id uuid, previous_storage_key text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous_image_id uuid;
  new_image_id uuid;
  previous_key text;
begin
  if not (select public.is_admin()) then
    raise exception using errcode = 'P0001', message = 'admin_access_required';
  end if;
  if not exists (select 1 from public.products where id = p_product_id) then
    raise exception using errcode = 'P0001', message = 'product_not_found';
  end if;
  if p_storage_key is null
    or p_storage_key !~ ('^products/' || p_product_id::text || '/[0-9a-f-]+\.(jpg|png|webp)$')
    or p_provenance not in ('wemilktea', 'merchant', 'user')
    or p_content_type not in ('image/jpeg', 'image/png', 'image/webp')
    or p_byte_size is null or p_byte_size < 1 or p_byte_size > 10485760
    or (p_width is not null and (p_width < 1 or p_width > 10000))
    or (p_height is not null and (p_height < 1 or p_height > 10000))
    or (p_width is null and p_height is not null)
    or (p_width is not null and p_height is null)
    or (p_alt_text is not null and length(trim(p_alt_text)) > 200) then
    raise exception using errcode = 'P0001', message = 'invalid_image_metadata';
  end if;

  select image_assets.id, image_assets.storage_key
  into previous_image_id, previous_key
  from public.product_images
  join public.image_assets on image_assets.id = product_images.image_id
  where product_images.product_id = p_product_id
    and product_images.is_primary
  for update;

  delete from public.product_images
  where product_id = p_product_id and is_primary;

  insert into public.image_assets (
    provenance, storage_key, alt_text, content_type, byte_size, width, height
  )
  values (
    p_provenance, p_storage_key, nullif(trim(p_alt_text), ''),
    p_content_type, p_byte_size, p_width, p_height
  )
  returning id into new_image_id;

  insert into public.product_images (product_id, image_id, sort_order, is_primary)
  values (p_product_id, new_image_id, 0, true);

  if previous_image_id is not null
    and not exists (select 1 from public.location_images where location_images.image_id = previous_image_id)
    and not exists (select 1 from public.product_images where product_images.image_id = previous_image_id) then
    delete from public.image_assets where id = previous_image_id;
  end if;
  return query select new_image_id, previous_key;
end;
$$;

create or replace function public.remove_product_image(p_product_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous_image_id uuid;
  previous_key text;
begin
  if not (select public.is_admin()) then
    raise exception using errcode = 'P0001', message = 'admin_access_required';
  end if;
  select image_assets.id, image_assets.storage_key
  into previous_image_id, previous_key
  from public.product_images
  join public.image_assets on image_assets.id = product_images.image_id
  where product_images.product_id = p_product_id
    and product_images.is_primary
  for update;
  if previous_image_id is null then return null; end if;
  delete from public.product_images
  where product_id = p_product_id and image_id = previous_image_id;
  if not exists (select 1 from public.location_images where location_images.image_id = previous_image_id)
    and not exists (select 1 from public.product_images where product_images.image_id = previous_image_id) then
    delete from public.image_assets where id = previous_image_id;
  end if;
  return previous_key;
end;
$$;

revoke all on function public.create_product_management(uuid, uuid, text, text, text, text[], boolean) from public, anon;
revoke all on function public.update_product_management(uuid, timestamptz, uuid, uuid, text, text, text, text[], boolean) from public, anon;
revoke all on function public.publish_product(uuid) from public, anon;
revoke all on function public.unpublish_product(uuid) from public, anon;
revoke all on function public.set_product_location_availability(uuid, uuid, text, integer, text, text, text, timestamptz) from public, anon;
revoke all on function public.attach_product_image(uuid, text, text, text, text, bigint, integer, integer) from public, anon;
revoke all on function public.remove_product_image(uuid) from public, anon;
grant execute on function public.create_product_management(uuid, uuid, text, text, text, text[], boolean) to authenticated;
grant execute on function public.update_product_management(uuid, timestamptz, uuid, uuid, text, text, text, text[], boolean) to authenticated;
grant execute on function public.publish_product(uuid) to authenticated;
grant execute on function public.unpublish_product(uuid) to authenticated;
grant execute on function public.set_product_location_availability(uuid, uuid, text, integer, text, text, text, timestamptz) to authenticated;
grant execute on function public.attach_product_image(uuid, text, text, text, text, bigint, integer, integer) to authenticated;
grant execute on function public.remove_product_image(uuid) to authenticated;
