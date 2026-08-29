create or replace function public.search_public_stores(
  p_query text default '',
  p_brand_slug text default '',
  p_suburb text default ''
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
    nullif(trim(coalesce(p_brand_slug, '')), '') as brand_slug,
    nullif(trim(coalesce(p_suburb, '')), '') as suburb
),
store_rows as (
  select
    l.id,
    l.slug,
    l.display_name,
    l.suburb,
    l.address,
    extensions.st_astext(l.coordinates) as coordinates,
    b.name as brand_name,
    b.slug as brand_slug,
    image.location_images
  from public.locations as l
  join public.brands as b
    on b.id = l.brand_id
  left join lateral (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'image_assets', jsonb_build_object(
            'id', ia.id,
            'provenance', ia.provenance,
            'storage_key', ia.storage_key,
            'external_url', ia.external_url,
            'alt_text', ia.alt_text
          )
        )
        order by li.is_primary desc, li.sort_order, li.image_id
      ),
      '[]'::jsonb
    ) as location_images
    from public.location_images as li
    join public.image_assets as ia
      on ia.id = li.image_id
    where li.location_id = l.id
  ) as image on true
  cross join params
  where l.publication_status = 'published'
    and b.is_published
    and (params.brand_slug is null or b.slug = params.brand_slug)
    and (params.suburb is null or l.suburb = params.suburb)
    and (
      params.query_text = ''
      or l.display_name ilike params.search_pattern escape chr(92)
      or l.suburb ilike params.search_pattern escape chr(92)
      or l.address ilike params.search_pattern escape chr(92)
      or b.name ilike params.search_pattern escape chr(92)
    )
)
select coalesce(
  jsonb_agg(
    jsonb_build_object(
      'id', id,
      'slug', slug,
      'display_name', display_name,
      'suburb', suburb,
      'address', address,
      'coordinates', coordinates,
      'brands', jsonb_build_object(
        'name', brand_name,
        'slug', brand_slug
      ),
      'location_images', location_images
    )
    order by display_name, id
  ),
  '[]'::jsonb
)
from store_rows;
$$;

revoke execute on function public.search_public_stores(text, text, text) from public;
grant execute on function public.search_public_stores(text, text, text) to anon, authenticated;
