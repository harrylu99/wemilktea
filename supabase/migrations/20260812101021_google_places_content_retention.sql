alter table public.store_candidates
  alter column candidate_name drop not null,
  drop column google_business_status,
  drop column google_website_uri;

update public.store_candidates
set
  candidate_name = null,
  formatted_address = null,
  coordinates = null
where source_provenance = 'google';

alter table public.store_candidates
  add constraint store_candidates_google_content_not_persisted check (
    source_provenance <> 'google'
    or (
      candidate_name is null
      and formatted_address is null
      and coordinates is null
    )
  );
