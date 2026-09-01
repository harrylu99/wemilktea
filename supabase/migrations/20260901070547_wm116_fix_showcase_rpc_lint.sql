-- WM-116: qualify cleanup-query columns that collide with the output image_id.

create or replace function public.upsert_showcase_image(
  p_category_id uuid,
  p_provider text,
  p_external_photo_id text,
  p_storage_key text,
  p_source_reference text,
  p_attribution_text text,
  p_alt_text text,
  p_content_type text,
  p_byte_size bigint,
  p_width integer default null,
  p_height integer default null,
  p_search_term text default null,
  p_sort_order smallint default 0
)
returns table (pool_id uuid, image_id uuid, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_pool public.showcase_image_pool%rowtype;
  existing_source_pool public.showcase_image_pool%rowtype;
  existing_asset_id uuid;
  inserted_asset_id uuid;
  inserted_pool_id uuid;
  created_asset boolean := false;
begin
  if not exists (select 1 from public.categories where id = p_category_id)
    or p_provider is null
    or p_provider !~ '^[a-z][a-z0-9_-]{1,39}$'
    or p_external_photo_id is null
    or p_external_photo_id !~ '^[A-Za-z0-9_-]{1,120}$'
    or p_storage_key is null
    or p_storage_key !~ ('^showcase/' || p_provider || '/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$')
    or p_source_reference is null
    or p_source_reference !~ '^https?://'
    or p_attribution_text is null
    or length(trim(p_attribution_text)) not between 1 and 500
    or p_alt_text is null
    or length(trim(p_alt_text)) not between 1 and 200
    or p_content_type not in ('image/jpeg', 'image/png', 'image/webp')
    or p_byte_size is null or p_byte_size < 1 or p_byte_size > 10485760
    or (p_width is not null and (p_width < 1 or p_width > 10000))
    or (p_height is not null and (p_height < 1 or p_height > 10000))
    or (p_width is null and p_height is not null)
    or (p_width is not null and p_height is null)
    or (p_search_term is not null and length(trim(p_search_term)) not between 1 and 160)
    or p_sort_order < 0 then
    raise exception using errcode = 'P0001', message = 'invalid_showcase_image_metadata';
  end if;

  select * into existing_pool
  from public.showcase_image_pool
  where category_id = p_category_id
    and provider = p_provider
    and external_photo_id = p_external_photo_id
  for update;

  if existing_pool.id is not null then
    update public.showcase_image_pool
    set search_term = nullif(trim(p_search_term), ''),
        sort_order = p_sort_order,
        is_active = true
    where id = existing_pool.id;

    return query select existing_pool.id, existing_pool.image_id, false;
    return;
  end if;

  select * into existing_source_pool
  from public.showcase_image_pool
  where provider = p_provider and external_photo_id = p_external_photo_id
  order by id
  limit 1
  for update;

  if existing_source_pool.id is not null then
    inserted_asset_id := existing_source_pool.image_id;
  else
    select id into existing_asset_id
    from public.image_assets
    where storage_key = p_storage_key
    for update;
  end if;

  if inserted_asset_id is null and existing_asset_id is null then
    insert into public.image_assets (
      provenance,
      storage_key,
      external_source_reference,
      alt_text,
      attribution_text,
      content_type,
      byte_size,
      width,
      height
    )
    values (
      'stock',
      p_storage_key,
      p_source_reference,
      nullif(trim(p_alt_text), ''),
      nullif(trim(p_attribution_text), ''),
      p_content_type,
      p_byte_size,
      p_width,
      p_height
    )
    returning id into inserted_asset_id;
    created_asset := true;
  elsif inserted_asset_id is null then
    select id into inserted_asset_id
    from public.image_assets
    where id = existing_asset_id and provenance = 'stock';
    if inserted_asset_id is null then
      raise exception using errcode = 'P0001', message = 'showcase_storage_key_conflict';
    end if;
  end if;

  insert into public.showcase_image_pool (
    category_id,
    image_id,
    provider,
    external_photo_id,
    search_term,
    sort_order
  )
  values (
    p_category_id,
    inserted_asset_id,
    p_provider,
    p_external_photo_id,
    nullif(trim(p_search_term), ''),
    p_sort_order
  )
  on conflict (category_id, provider, external_photo_id) do nothing
  returning id into inserted_pool_id;

  if inserted_pool_id is null then
    select * into existing_pool
    from public.showcase_image_pool
    where category_id = p_category_id
      and provider = p_provider
      and external_photo_id = p_external_photo_id
    for update;
    if created_asset and inserted_asset_id <> existing_pool.image_id then
      if not exists (select 1 from public.product_images as pi where pi.image_id = inserted_asset_id)
        and not exists (select 1 from public.location_images as li where li.image_id = inserted_asset_id) then
        delete from public.image_assets where id = inserted_asset_id;
      end if;
    end if;
    return query select existing_pool.id, existing_pool.image_id, false;
    return;
  end if;

  return query select inserted_pool_id, inserted_asset_id, true;
end;
$$;

create or replace function public.upsert_store_showcase_image(
  p_provider text,
  p_external_photo_id text,
  p_storage_key text,
  p_source_reference text,
  p_attribution_text text,
  p_alt_text text,
  p_content_type text,
  p_byte_size bigint,
  p_width integer default null,
  p_height integer default null,
  p_search_term text default null,
  p_sort_order smallint default 0
)
returns table (pool_id uuid, image_id uuid, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_pool public.store_showcase_image_pool%rowtype;
  existing_source_pool public.showcase_image_pool%rowtype;
  existing_asset_id uuid;
  inserted_asset_id uuid;
  inserted_pool_id uuid;
  created_asset boolean := false;
begin
  if p_provider is null
    or p_provider !~ '^[a-z][a-z0-9_-]{1,39}$'
    or p_external_photo_id is null
    or p_external_photo_id !~ '^[A-Za-z0-9_-]{1,120}$'
    or p_storage_key is null
    or p_storage_key !~ ('^showcase/' || p_provider || '/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$')
    or p_source_reference is null
    or p_source_reference !~ '^https?://'
    or p_attribution_text is null
    or length(trim(p_attribution_text)) not between 1 and 500
    or p_alt_text is null
    or length(trim(p_alt_text)) not between 1 and 200
    or p_content_type not in ('image/jpeg', 'image/png', 'image/webp')
    or p_byte_size is null or p_byte_size < 1 or p_byte_size > 10485760
    or (p_width is not null and (p_width < 1 or p_width > 10000))
    or (p_height is not null and (p_height < 1 or p_height > 10000))
    or (p_width is null and p_height is not null)
    or (p_width is not null and p_height is null)
    or (p_search_term is not null and length(trim(p_search_term)) not between 1 and 160)
    or p_sort_order is null or p_sort_order < 0 then
    raise exception using errcode = 'P0001', message = 'invalid_store_showcase_image_metadata';
  end if;

  select * into existing_pool
  from public.store_showcase_image_pool
  where provider = p_provider
    and external_photo_id = p_external_photo_id
  for update;

  if existing_pool.id is not null then
    update public.store_showcase_image_pool
    set search_term = nullif(trim(p_search_term), ''),
        sort_order = p_sort_order,
        is_active = true
    where id = existing_pool.id;
    return query select existing_pool.id, existing_pool.image_id, false;
    return;
  end if;

  select showcase_image_pool.* into existing_source_pool
  from public.showcase_image_pool
  join public.image_assets on image_assets.id = showcase_image_pool.image_id
  where showcase_image_pool.provider = p_provider
    and showcase_image_pool.external_photo_id = p_external_photo_id
    and image_assets.provenance = 'stock'
  order by showcase_image_pool.id
  limit 1
  for update;

  if existing_source_pool.id is not null then
    inserted_asset_id := existing_source_pool.image_id;
  else
    select id into existing_asset_id
    from public.image_assets
    where storage_key = p_storage_key
    for update;
  end if;

  if inserted_asset_id is null and existing_asset_id is null then
    insert into public.image_assets (
      provenance,
      storage_key,
      external_source_reference,
      alt_text,
      attribution_text,
      content_type,
      byte_size,
      width,
      height
    )
    values (
      'stock',
      p_storage_key,
      p_source_reference,
      nullif(trim(p_alt_text), ''),
      nullif(trim(p_attribution_text), ''),
      p_content_type,
      p_byte_size,
      p_width,
      p_height
    )
    returning id into inserted_asset_id;
    created_asset := true;
  elsif inserted_asset_id is null then
    select id into inserted_asset_id
    from public.image_assets
    where id = existing_asset_id and provenance = 'stock';
    if inserted_asset_id is null then
      raise exception using errcode = 'P0001', message = 'showcase_storage_key_conflict';
    end if;
  end if;

  insert into public.store_showcase_image_pool (
    image_id,
    provider,
    external_photo_id,
    search_term,
    sort_order
  )
  values (
    inserted_asset_id,
    p_provider,
    p_external_photo_id,
    nullif(trim(p_search_term), ''),
    p_sort_order
  )
  on conflict (provider, external_photo_id) do nothing
  returning id into inserted_pool_id;

  if inserted_pool_id is null then
    select * into existing_pool
    from public.store_showcase_image_pool
    where provider = p_provider
      and external_photo_id = p_external_photo_id
    for update;
    if created_asset and inserted_asset_id <> existing_pool.image_id
      and not exists (select 1 from public.product_images as pi where pi.image_id = inserted_asset_id)
      and not exists (select 1 from public.location_images as li where li.image_id = inserted_asset_id)
      and not exists (select 1 from public.showcase_image_pool as sip where sip.image_id = inserted_asset_id)
      and not exists (select 1 from public.store_showcase_image_pool as ssip where ssip.image_id = inserted_asset_id) then
      delete from public.image_assets where id = inserted_asset_id;
    end if;
    return query select existing_pool.id, existing_pool.image_id, false;
    return;
  end if;

  return query select inserted_pool_id, inserted_asset_id, true;
end;
$$;
