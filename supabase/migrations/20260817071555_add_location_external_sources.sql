-- WM-51: provider-neutral external store identity mappings.
-- This table is internal integration metadata and is intentionally not exposed
-- to anonymous/public catalogue readers.
create table public.location_external_sources (
  id uuid primary key default extensions.gen_random_uuid(),
  location_id uuid not null references public.locations (id) on delete restrict,
  provider text not null,
  external_store_id text not null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint location_external_sources_provider_check
    check (provider in ('uber_eats')),
  constraint location_external_sources_external_store_id_check
    check (length(trim(external_store_id)) > 0),
  constraint location_external_sources_location_provider_key
    unique (location_id, provider),
  constraint location_external_sources_provider_external_store_id_key
    unique (provider, external_store_id)
);

create trigger location_external_sources_set_updated_at
before update on public.location_external_sources
for each row execute function public.set_updated_at();

alter table public.location_external_sources enable row level security;

-- Do not grant the Data API anonymous access to integration metadata. Admins
-- use the existing authenticated + public.is_admin() authorization boundary.
revoke all on public.location_external_sources from public, anon;
grant select, insert, update, delete
on public.location_external_sources
to authenticated;

create policy "admins can manage location external sources"
on public.location_external_sources
for all to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));
