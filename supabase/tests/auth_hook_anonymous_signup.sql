begin;

select plan(4);

select is(
  public.hook_allow_anonymous_signups_only(
    '{"user":{"is_anonymous":true}}'::jsonb
  ),
  '{}'::jsonb,
  'anonymous user creation is allowed'
);

select is(
  public.hook_allow_anonymous_signups_only(
    '{"user":{"is_anonymous":false,"email":"new-user@example.com"}}'::jsonb
  ) -> 'error' ->> 'http_code',
  '403',
  'permanent-user creation returns HTTP 403'
);

select is(
  public.hook_allow_anonymous_signups_only('{"user":{}}'::jsonb)
    -> 'error' ->> 'http_code',
  '403',
  'missing is_anonymous rejects closed'
);

select is(
  public.hook_allow_anonymous_signups_only(
    '{"user":{"is_anonymous":"not-a-boolean"}}'::jsonb
  ) -> 'error' ->> 'http_code',
  '403',
  'malformed is_anonymous rejects closed'
);

select * from finish();

rollback;
