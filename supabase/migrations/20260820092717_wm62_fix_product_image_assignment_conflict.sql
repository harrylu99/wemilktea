-- WM-62: target the product_images primary key explicitly during assignment.

create or replace function public.assign_showcase_image_to_product(
  p_product_id uuid,
  p_image_id uuid
)
returns table (image_id uuid, assigned boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  product_category_id uuid;
  current_image_id uuid;
  pool_image_id uuid;
begin
  select category_id into product_category_id
  from public.products
  where id = p_product_id
  for update;
  if product_category_id is null then
    raise exception using errcode = 'P0001', message = 'product_not_found';
  end if;

  select product_images.image_id into current_image_id
  from public.product_images
  where product_id = p_product_id and is_primary
  for update;
  if current_image_id is not null then
    return query select current_image_id, false;
    return;
  end if;

  select showcase_image_pool.image_id into pool_image_id
  from public.showcase_image_pool
  join public.image_assets on image_assets.id = showcase_image_pool.image_id
  where showcase_image_pool.image_id = p_image_id
    and showcase_image_pool.category_id = product_category_id
    and showcase_image_pool.is_active
    and image_assets.provenance = 'stock'
  limit 1;
  if pool_image_id is null then
    raise exception using errcode = 'P0001', message = 'showcase_image_not_available_for_product';
  end if;

  insert into public.product_images (product_id, image_id, sort_order, is_primary)
  values (p_product_id, pool_image_id, 0, true)
  on conflict on constraint product_images_pkey do update
  set sort_order = 0, is_primary = true;

  return query select pool_image_id, true;
end;
$$;

revoke all on function public.assign_showcase_image_to_product(uuid, uuid)
from public, anon, authenticated;
grant execute on function public.assign_showcase_image_to_product(uuid, uuid)
to service_role;
