insert into public.brands (name, slug, description, is_published)
values
  ('Gong cha', 'gong-cha', 'Taiwanese tea and milk tea.', true),
  ('Chatime', 'chatime', 'Tea drinks with classic and seasonal flavours.', true)
on conflict (slug) do update
set name = excluded.name,
    description = excluded.description,
    is_published = excluded.is_published;

insert into public.categories (name, slug, description, sort_order, is_published)
values
  ('Milk Tea', 'milk-tea', 'Classic tea with milk or dairy alternatives.', 10, true),
  ('Fruit Tea', 'fruit-tea', 'Tea drinks with fruit flavours.', 20, true)
on conflict (slug) do update
set name = excluded.name,
    description = excluded.description,
    sort_order = excluded.sort_order,
    is_published = excluded.is_published;

insert into public.locations (
  brand_id, display_name, slug, suburb, address, coordinates, google_place_id, publication_status, source_provenance
)
select
  brands.id,
  location_seed.display_name,
  location_seed.slug,
  location_seed.suburb,
  location_seed.address,
  extensions.st_setsrid(extensions.st_makepoint(location_seed.longitude, location_seed.latitude), 4326)::extensions.geography,
  location_seed.google_place_id,
  'published',
  'wemilktea'
from (
  values
    ('gong-cha', 'Gong cha Albany', 'gong-cha-albany', 'Albany', '219 Don McKinnon Drive, Albany, Auckland', -36.7260::double precision, 174.7023::double precision, 'ChIJseedGongChaAlbany'),
    ('gong-cha', 'Gong cha Newmarket', 'gong-cha-newmarket', 'Newmarket', '277 Broadway, Newmarket, Auckland', -36.8681::double precision, 174.7785::double precision, 'ChIJseedGongChaNewmarket'),
    ('chatime', 'Chatime Auckland CBD', 'chatime-auckland-cbd', 'Auckland CBD', '280 Queen Street, Auckland CBD, Auckland', -36.8485::double precision, 174.7633::double precision, 'ChIJseedChatimeCBD')
) as location_seed(brand_slug, display_name, slug, suburb, address, latitude, longitude, google_place_id)
join public.brands on brands.slug = location_seed.brand_slug
on conflict (slug) do update
set display_name = excluded.display_name,
    suburb = excluded.suburb,
    address = excluded.address,
    coordinates = excluded.coordinates,
    google_place_id = excluded.google_place_id,
    publication_status = excluded.publication_status,
    source_provenance = excluded.source_provenance;

insert into public.products (
  brand_id, category_id, name, slug, description, discovery_tags, is_seasonal, is_published
)
select
  brands.id,
  categories.id,
  product_seed.name,
  product_seed.slug,
  product_seed.description,
  product_seed.discovery_tags,
  false,
  true
from (
  values
    ('gong-cha', 'milk-tea', 'Brown Sugar Pearl Milk Tea', 'brown-sugar-pearl-milk-tea', 'Black tea, milk and brown sugar pearls.', array['brown-sugar', 'pearls', 'classic']::text[]),
    ('gong-cha', 'milk-tea', 'Jasmine Green Milk Tea', 'jasmine-green-milk-tea', 'Floral jasmine tea with milk.', array['jasmine', 'floral', 'light']::text[]),
    ('chatime', 'milk-tea', 'Taro Milk Tea', 'taro-milk-tea', 'Creamy taro milk tea.', array['taro', 'creamy', 'classic']::text[])
) as product_seed(brand_slug, category_slug, name, slug, description, discovery_tags)
join public.brands on brands.slug = product_seed.brand_slug
join public.categories on categories.slug = product_seed.category_slug
on conflict (brand_id, slug) do update
set name = excluded.name,
    category_id = excluded.category_id,
    description = excluded.description,
    discovery_tags = excluded.discovery_tags,
    is_seasonal = excluded.is_seasonal,
    is_published = excluded.is_published;

insert into public.location_products (
  location_id, product_id, brand_id, price_cents, currency, availability_status, last_verified_at, source_provenance
)
select
  locations.id,
  products.id,
  brands.id,
  availability_seed.price_cents,
  'NZD',
  'available',
  now(),
  'merchant'
from (
  values
    ('gong-cha-albany', 'gong-cha', 'brown-sugar-pearl-milk-tea', 690),
    ('gong-cha-newmarket', 'gong-cha', 'brown-sugar-pearl-milk-tea', 720),
    ('gong-cha-albany', 'gong-cha', 'jasmine-green-milk-tea', 650),
    ('chatime-auckland-cbd', 'chatime', 'taro-milk-tea', 750)
) as availability_seed(location_slug, brand_slug, product_slug, price_cents)
join public.locations on locations.slug = availability_seed.location_slug
join public.brands on brands.slug = availability_seed.brand_slug
join public.products on products.brand_id = brands.id and products.slug = availability_seed.product_slug
on conflict (location_id, product_id) do update
set price_cents = excluded.price_cents,
    currency = excluded.currency,
    availability_status = excluded.availability_status,
    last_verified_at = excluded.last_verified_at,
    source_provenance = excluded.source_provenance;

insert into public.image_assets (provenance, storage_key, alt_text)
values ('wemilktea', 'products/brown-sugar-pearl-milk-tea.jpg', 'Brown sugar pearl milk tea')
on conflict (storage_key) where storage_key is not null do update
set provenance = excluded.provenance,
    alt_text = excluded.alt_text;

insert into public.product_images (product_id, image_id, is_primary)
select products.id, image_assets.id, true
from public.products
join public.brands on brands.id = products.brand_id
join public.image_assets on image_assets.storage_key = 'products/brown-sugar-pearl-milk-tea.jpg'
where brands.slug = 'gong-cha' and products.slug = 'brown-sugar-pearl-milk-tea'
on conflict (product_id, image_id) do update set is_primary = excluded.is_primary;

insert into public.store_submissions (store_name, suburb, google_maps_url, official_url, notes, submitter_email)
select
  'Example Tea House',
  'Mount Eden',
  'https://maps.google.com/?q=Example+Tea+House+Mount+Eden',
  'https://example-tea-house.test',
  'Suggested for catalogue review.',
  'tea-fan@example.test'
where not exists (
  select 1 from public.store_submissions where store_name = 'Example Tea House' and moderation_status = 'pending'
);

insert into public.store_candidates (
  google_place_id, source_provenance, status
)
values (
  'ChIJseedCandidateDominionRoad',
  'google',
  'new'
)
on conflict (google_place_id) do update
set source_provenance = excluded.source_provenance,
    status = excluded.status,
    last_seen_at = now();

with discovery_run as (
  insert into public.discovery_runs (
    started_at, finished_at, trigger_type, status, query_count, result_count, new_candidate_count, known_count, duplicate_count
  )
  select now() - interval '2 minutes', now() - interval '1 minute', 'manual', 'succeeded', 1, 1, 1, 0, 0
  where not exists (
    select 1
    from public.store_candidate_observations
    join public.store_candidates on store_candidates.id = store_candidate_observations.candidate_id
    where store_candidates.google_place_id = 'ChIJseedCandidateDominionRoad'
  )
  returning id
)
insert into public.store_candidate_observations (discovery_run_id, candidate_id)
select discovery_run.id, store_candidates.id
from discovery_run
join public.store_candidates on store_candidates.google_place_id = 'ChIJseedCandidateDominionRoad'
on conflict do nothing;
