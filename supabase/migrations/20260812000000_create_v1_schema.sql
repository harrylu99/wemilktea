create extension if not exists pgcrypto with schema extensions;
create extension if not exists postgis with schema extensions;

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.brands (
  id uuid primary key default extensions.gen_random_uuid(),
  name text not null,
  slug text not null,
  description text,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint brands_name_key unique (name),
  constraint brands_slug_key unique (slug),
  constraint brands_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

create table public.categories (
  id uuid primary key default extensions.gen_random_uuid(),
  name text not null,
  slug text not null,
  description text,
  sort_order smallint not null default 0,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint categories_name_key unique (name),
  constraint categories_slug_key unique (slug),
  constraint categories_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

create table public.locations (
  id uuid primary key default extensions.gen_random_uuid(),
  brand_id uuid not null references public.brands (id) on delete restrict,
  display_name text not null,
  slug text not null,
  suburb text not null,
  address text not null,
  coordinates extensions.geography(point, 4326) not null,
  google_place_id text,
  publication_status text not null default 'draft',
  source_provenance text not null default 'wemilktea',
  source_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint locations_slug_key unique (slug),
  constraint locations_google_place_id_key unique (google_place_id),
  constraint locations_id_brand_id_key unique (id, brand_id),
  constraint locations_publication_status_check check (publication_status in ('draft', 'published', 'archived')),
  constraint locations_source_provenance_check check (source_provenance in ('wemilktea', 'merchant', 'user', 'google')),
  constraint locations_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

create table public.products (
  id uuid primary key default extensions.gen_random_uuid(),
  brand_id uuid not null references public.brands (id) on delete restrict,
  category_id uuid not null references public.categories (id) on delete restrict,
  name text not null,
  slug text not null,
  description text,
  discovery_tags text[] not null default '{}',
  is_seasonal boolean not null default false,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_brand_slug_key unique (brand_id, slug),
  constraint products_id_brand_id_key unique (id, brand_id),
  constraint products_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

create table public.location_products (
  location_id uuid not null references public.locations (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete restrict,
  price_cents integer,
  currency char(3) not null default 'NZD',
  availability_status text not null default 'unknown',
  last_verified_at timestamptz,
  source_provenance text not null default 'wemilktea',
  source_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (location_id, product_id),
  constraint location_products_location_brand_id_fkey foreign key (location_id, brand_id) references public.locations (id, brand_id) on delete cascade,
  constraint location_products_product_brand_id_fkey foreign key (product_id, brand_id) references public.products (id, brand_id) on delete cascade,
  constraint location_products_price_cents_check check (price_cents is null or price_cents >= 0),
  constraint location_products_currency_check check (currency ~ '^[A-Z]{3}$'),
  constraint location_products_availability_status_check check (availability_status in ('available', 'unavailable', 'unknown')),
  constraint location_products_source_provenance_check check (source_provenance in ('wemilktea', 'merchant', 'user', 'google'))
);

create table public.image_assets (
  id uuid primary key default extensions.gen_random_uuid(),
  provenance text not null,
  storage_key text,
  external_url text,
  external_source_reference text,
  alt_text text,
  attribution_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint image_assets_provenance_check check (provenance in ('wemilktea', 'merchant', 'user', 'google')),
  constraint image_assets_source_check check (
    storage_key is not null or external_url is not null or external_source_reference is not null
  ),
  constraint image_assets_google_not_r2_check check (
    provenance <> 'google' or storage_key is null
  )
);

create table public.product_images (
  product_id uuid not null references public.products (id) on delete cascade,
  image_id uuid not null references public.image_assets (id) on delete cascade,
  sort_order smallint not null default 0,
  is_primary boolean not null default false,
  primary key (product_id, image_id)
);

create table public.location_images (
  location_id uuid not null references public.locations (id) on delete cascade,
  image_id uuid not null references public.image_assets (id) on delete cascade,
  sort_order smallint not null default 0,
  is_primary boolean not null default false,
  primary key (location_id, image_id)
);

create table public.discovery_runs (
  id uuid primary key default extensions.gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  trigger_type text not null,
  status text not null default 'queued',
  query_count integer not null default 0,
  result_count integer not null default 0,
  new_candidate_count integer not null default 0,
  known_count integer not null default 0,
  duplicate_count integer not null default 0,
  error_summary text,
  constraint discovery_runs_trigger_type_check check (trigger_type in ('manual', 'scheduled', 'retry')),
  constraint discovery_runs_status_check check (status in ('queued', 'running', 'succeeded', 'failed')),
  constraint discovery_runs_counts_check check (
    query_count >= 0 and result_count >= 0 and new_candidate_count >= 0 and known_count >= 0 and duplicate_count >= 0
  ),
  constraint discovery_runs_finished_after_started_check check (finished_at is null or finished_at >= started_at)
);

create table public.store_candidates (
  id uuid primary key default extensions.gen_random_uuid(),
  google_place_id text not null,
  candidate_name text not null,
  formatted_address text,
  coordinates extensions.geography(point, 4326),
  source_provenance text not null default 'google',
  status text not null default 'new',
  possible_location_id uuid references public.locations (id) on delete set null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint store_candidates_google_place_id_key unique (google_place_id),
  constraint store_candidates_source_provenance_check check (source_provenance in ('google', 'merchant', 'user', 'wemilktea')),
  constraint store_candidates_status_check check (status in ('new', 'known', 'possible_duplicate', 'approved', 'rejected')),
  constraint store_candidates_last_seen_after_first_seen_check check (last_seen_at >= first_seen_at)
);

create table public.store_candidate_observations (
  discovery_run_id uuid not null references public.discovery_runs (id) on delete cascade,
  candidate_id uuid not null references public.store_candidates (id) on delete cascade,
  observed_at timestamptz not null default now(),
  primary key (discovery_run_id, candidate_id)
);

create table public.store_submissions (
  id uuid primary key default extensions.gen_random_uuid(),
  store_name text not null,
  suburb text,
  google_maps_url text,
  official_url text,
  notes text,
  submitter_email text,
  moderation_status text not null default 'pending',
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users (id) on delete set null,
  constraint store_submissions_store_name_not_blank check (length(trim(store_name)) > 0),
  constraint store_submissions_moderation_status_check check (moderation_status in ('pending', 'approved', 'rejected', 'duplicate')),
  constraint store_submissions_review_check check (
    (moderation_status = 'pending' and reviewed_at is null and reviewed_by is null)
    or (moderation_status <> 'pending' and reviewed_at is not null and reviewed_by is not null)
  )
);

create index locations_brand_id_idx on public.locations (brand_id);
create index locations_published_brand_id_idx on public.locations (brand_id) where publication_status = 'published';
create index locations_coordinates_idx on public.locations using gist (coordinates);
create index products_brand_id_idx on public.products (brand_id);
create index products_category_id_idx on public.products (category_id);
create index products_slug_idx on public.products (slug);
create index products_published_category_id_idx on public.products (category_id, brand_id) where is_published;
create index location_products_product_id_idx on public.location_products (product_id);
create index location_products_available_product_id_idx on public.location_products (product_id) where availability_status = 'available';
create index product_images_image_id_idx on public.product_images (image_id);
create unique index image_assets_storage_key_idx on public.image_assets (storage_key) where storage_key is not null;
create unique index product_images_primary_idx on public.product_images (product_id) where is_primary;
create index location_images_image_id_idx on public.location_images (image_id);
create unique index location_images_primary_idx on public.location_images (location_id) where is_primary;
create index discovery_runs_status_started_at_idx on public.discovery_runs (status, started_at desc);
create index store_candidates_status_idx on public.store_candidates (status);
create index store_candidates_possible_location_id_idx on public.store_candidates (possible_location_id) where possible_location_id is not null;
create index store_candidates_coordinates_idx on public.store_candidates using gist (coordinates);
create index store_candidate_observations_candidate_id_idx on public.store_candidate_observations (candidate_id);
create index store_submissions_moderation_status_created_at_idx on public.store_submissions (moderation_status, created_at desc);

create trigger brands_set_updated_at before update on public.brands for each row execute function public.set_updated_at();
create trigger categories_set_updated_at before update on public.categories for each row execute function public.set_updated_at();
create trigger locations_set_updated_at before update on public.locations for each row execute function public.set_updated_at();
create trigger products_set_updated_at before update on public.products for each row execute function public.set_updated_at();
create trigger location_products_set_updated_at before update on public.location_products for each row execute function public.set_updated_at();
create trigger image_assets_set_updated_at before update on public.image_assets for each row execute function public.set_updated_at();
create trigger store_candidates_set_updated_at before update on public.store_candidates for each row execute function public.set_updated_at();

alter table public.brands enable row level security;
alter table public.categories enable row level security;
alter table public.locations enable row level security;
alter table public.products enable row level security;
alter table public.location_products enable row level security;
alter table public.image_assets enable row level security;
alter table public.product_images enable row level security;
alter table public.location_images enable row level security;
alter table public.discovery_runs enable row level security;
alter table public.store_candidates enable row level security;
alter table public.store_candidate_observations enable row level security;
alter table public.store_submissions enable row level security;

create policy "public can read published brands"
on public.brands for select to anon, authenticated
using (is_published);

create policy "public can read published categories"
on public.categories for select to anon, authenticated
using (is_published);

create policy "public can read published locations"
on public.locations for select to anon, authenticated
using (
  publication_status = 'published'
  and exists (select 1 from public.brands where brands.id = locations.brand_id and brands.is_published)
);

create policy "public can read published products"
on public.products for select to anon, authenticated
using (
  is_published
  and exists (select 1 from public.brands where brands.id = products.brand_id and brands.is_published)
  and exists (select 1 from public.categories where categories.id = products.category_id and categories.is_published)
);

create policy "public can read available published location products"
on public.location_products for select to anon, authenticated
using (
  availability_status = 'available'
  and exists (
    select 1 from public.locations
    join public.brands on brands.id = locations.brand_id
    where locations.id = location_products.location_id
      and locations.publication_status = 'published'
      and brands.is_published
  )
  and exists (
    select 1 from public.products
    join public.categories on categories.id = products.category_id
    join public.brands on brands.id = products.brand_id
    where products.id = location_products.product_id
      and products.is_published
      and categories.is_published
      and brands.is_published
  )
);

create policy "public can read product image links"
on public.product_images for select to anon, authenticated
using (
  exists (
    select 1 from public.products
    join public.brands on brands.id = products.brand_id
    join public.categories on categories.id = products.category_id
    where products.id = product_images.product_id
      and products.is_published
      and brands.is_published
      and categories.is_published
  )
);

create policy "public can read location image links"
on public.location_images for select to anon, authenticated
using (
  exists (
    select 1 from public.locations
    join public.brands on brands.id = locations.brand_id
    where locations.id = location_images.location_id
      and locations.publication_status = 'published'
      and brands.is_published
  )
);

create policy "public can read images for published content"
on public.image_assets for select to anon, authenticated
using (
  exists (
    select 1 from public.product_images
    join public.products on products.id = product_images.product_id
    join public.brands on brands.id = products.brand_id
    join public.categories on categories.id = products.category_id
    where product_images.image_id = image_assets.id
      and products.is_published
      and brands.is_published
      and categories.is_published
  )
  or exists (
    select 1 from public.location_images
    join public.locations on locations.id = location_images.location_id
    join public.brands on brands.id = locations.brand_id
    where location_images.image_id = image_assets.id
      and locations.publication_status = 'published'
      and brands.is_published
  )
);

create policy "public can submit store suggestions"
on public.store_submissions for insert to anon, authenticated
with check (
  moderation_status = 'pending'
  and reviewed_at is null
  and reviewed_by is null
);

grant usage on schema public to anon, authenticated;
grant select on public.brands, public.categories, public.locations, public.products, public.location_products, public.image_assets, public.product_images, public.location_images to anon, authenticated;
grant insert on public.store_submissions to anon, authenticated;
