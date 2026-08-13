begin;

do $$
declare
  published_count integer;
  candidate_count integer;
begin
  select count(*) into published_count
  from public.locations
  join public.brands on brands.id = locations.brand_id
  where locations.publication_status = 'published'
    and brands.is_published = true;

  if published_count = 0 then
    raise exception 'seed data does not include a published public location';
  end if;

  execute 'set local role anon';

  if (select count(*) from public.locations) <> published_count then
    raise exception 'anonymous location policy exposes unpublished locations';
  end if;

  if exists (
    select 1
    from public.locations
    where publication_status <> 'published'
  ) then
    raise exception 'anonymous users can read draft locations';
  end if;

  begin
    select count(*) into candidate_count from public.store_candidates;
    raise exception 'anonymous users can read store candidates';
  exception
    when insufficient_privilege then null;
  end;

  execute 'reset role';

end;
$$;

rollback;
