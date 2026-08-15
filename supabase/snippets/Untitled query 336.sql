grant select, insert, update
on public.discovery_runs
to service_role;

grant select
on public.locations
to service_role;

grant select, insert, update
on public.store_candidates
to service_role;

grant select, insert
on public.store_candidate_observations
to service_role;