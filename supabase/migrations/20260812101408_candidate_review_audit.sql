alter table public.store_candidates
  add column reviewed_at timestamptz,
  add column reviewed_by uuid references auth.users (id) on delete set null,
  add column resolved_location_id uuid references public.locations (id) on delete set null,
  add constraint store_candidates_review_state_check check (
    (
      status in ('new', 'known', 'possible_duplicate')
      and reviewed_at is null
      and reviewed_by is null
      and resolved_location_id is null
    )
    or (
      status = 'approved'
      and reviewed_at is not null
      and reviewed_by is not null
      and resolved_location_id is not null
    )
    or (
      status = 'rejected'
      and reviewed_at is not null
      and reviewed_by is not null
      and resolved_location_id is null
    )
  );

create index store_candidates_resolved_location_id_idx
on public.store_candidates (resolved_location_id)
where resolved_location_id is not null;
