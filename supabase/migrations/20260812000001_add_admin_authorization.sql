create table public.admin_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;

create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from public.admin_users
      where user_id = auth.uid()
    );
$$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

grant select, insert, update, delete on
  public.brands,
  public.categories,
  public.locations,
  public.products,
  public.location_products,
  public.image_assets,
  public.product_images,
  public.location_images,
  public.discovery_runs,
  public.store_candidates,
  public.store_candidate_observations,
  public.store_submissions
to authenticated;

create policy "admins can manage brands"
on public.brands for all to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy "admins can manage categories"
on public.categories for all to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy "admins can manage locations"
on public.locations for all to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy "admins can manage products"
on public.products for all to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy "admins can manage location products"
on public.location_products for all to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy "admins can manage image assets"
on public.image_assets for all to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy "admins can manage product images"
on public.product_images for all to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy "admins can manage location images"
on public.location_images for all to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy "admins can manage discovery runs"
on public.discovery_runs for all to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy "admins can manage store candidates"
on public.store_candidates for all to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy "admins can manage store candidate observations"
on public.store_candidate_observations for all to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy "admins can manage store submissions"
on public.store_submissions for all to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));
