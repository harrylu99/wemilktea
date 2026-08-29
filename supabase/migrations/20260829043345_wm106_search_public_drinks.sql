create or replace function public.search_public_drinks(
  p_query text default '',
  p_category_slug text default '',
  p_offset integer default 0,
  p_limit integer default 20
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
with params as (
  select
    lower(trim(coalesce(p_query, ''))) as query_text,
    '%' || replace(
      replace(
        replace(lower(trim(coalesce(p_query, ''))), chr(92), chr(92) || chr(92)),
        '%',
        chr(92) || '%'
      ),
      '_',
      chr(92) || '_'
    ) || '%' as search_pattern,
    nullif(trim(coalesce(p_category_slug, '')), '') as category_slug,
    greatest(coalesce(p_offset, 0), 0) as result_offset,
    least(greatest(coalesce(p_limit, 20), 1), 100) as result_limit
),
eligible_products as (
  select
    p.id,
    p.name,
    p.slug,
    p.description,
    p.is_seasonal,
    p.discovery_tags,
    b.id as brand_id,
    b.name as brand_name,
    b.slug as brand_slug,
    c.id as category_id,
    c.name as category_name,
    c.slug as category_slug,
    count(distinct lp.location_id)::bigint as available_store_count,
    image.product_images
  from public.products as p
  join public.brands as b
    on b.id = p.brand_id
  join public.categories as c
    on c.id = p.category_id
  join public.location_products as lp
    on lp.product_id = p.id
    and lp.brand_id = p.brand_id
    and lp.availability_status = 'available'
  join public.locations as l
    on l.id = lp.location_id
    and l.brand_id = lp.brand_id
    and l.publication_status = 'published'
  left join lateral (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'is_primary', pi.is_primary,
          'image_assets', jsonb_build_object(
            'id', ia.id,
            'provenance', ia.provenance,
            'storage_key', ia.storage_key,
            'external_url', ia.external_url,
            'alt_text', ia.alt_text
          )
        )
        order by pi.is_primary desc, pi.sort_order, pi.image_id
      ),
      '[]'::jsonb
    ) as product_images
    from public.product_images as pi
    join public.image_assets as ia
      on ia.id = pi.image_id
    where pi.product_id = p.id
  ) as image on true
  cross join params
  where p.is_published
    and b.is_published
    and c.is_published
    and (params.category_slug is null or c.slug = params.category_slug)
    and (
      params.query_text = ''
      or p.name ilike params.search_pattern escape chr(92)
      or coalesce(p.description, '') ilike params.search_pattern escape chr(92)
      or b.name ilike params.search_pattern escape chr(92)
      or c.name ilike params.search_pattern escape chr(92)
      or exists (
        select 1
        from unnest(p.discovery_tags) as tag
        where tag ilike params.search_pattern escape chr(92)
      )
    )
  group by
    p.id,
    b.id,
    c.id,
    image.product_images
),
filtered_products as (
  select eligible_products.*
  from eligible_products
  cross join params
  order by name, id
  offset (select result_offset from params)
  limit (select result_limit from params)
)
select jsonb_build_object(
  'data', coalesce(
    jsonb_agg(
      jsonb_build_object(
        'product', jsonb_build_object(
          'id', id,
          'name', name,
          'slug', slug,
          'description', description,
          'is_seasonal', is_seasonal,
          'discovery_tags', discovery_tags,
          'brands', jsonb_build_object(
            'id', brand_id,
            'name', brand_name,
            'slug', brand_slug
          ),
          'categories', jsonb_build_object(
            'id', category_id,
            'name', category_name,
            'slug', category_slug
          ),
          'product_images', product_images
        ),
        'available_store_count', available_store_count
      )
      order by name, id
    ),
    '[]'::jsonb
  ),
  'total_results', (select count(*)::bigint from eligible_products)
)
from filtered_products;
$$;

revoke execute on function public.search_public_drinks(text, text, integer, integer) from public;
grant execute on function public.search_public_drinks(text, text, integer, integer) to anon, authenticated;
