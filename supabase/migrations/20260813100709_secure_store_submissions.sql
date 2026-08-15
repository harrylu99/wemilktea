-- WM-23: keep anonymous suggestions small, usable, and safe to review.
alter table public.store_submissions
  alter column suburb set not null;

alter table public.store_submissions
  add constraint store_submissions_store_name_length_check
    check (length(trim(store_name)) between 1 and 160),
  add constraint store_submissions_suburb_not_blank_check
    check (length(trim(suburb)) between 1 and 120),
  add constraint store_submissions_google_maps_url_check
    check (
      google_maps_url is null
      or (
        length(google_maps_url) <= 2048
        and google_maps_url ~* '^https?://[^[:space:]]+$'
      )
    ),
  add constraint store_submissions_official_url_check
    check (
      official_url is null
      or (
        length(official_url) <= 2048
        and official_url ~* '^https?://[^[:space:]]+$'
      )
    ),
  add constraint store_submissions_notes_length_check
    check (notes is null or length(notes) <= 2000),
  add constraint store_submissions_submitter_email_check
    check (
      submitter_email is null
      or (
        length(submitter_email) between 3 and 320
        and submitter_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      )
    );
