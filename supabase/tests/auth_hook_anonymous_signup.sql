begin;

select plan(14);

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
  ),
  '{"error":{"http_code":403,"message":"New permanent-user signups are not allowed."}}'::jsonb,
  'permanent-user creation returns the HTTP 403 rejection object'
);

select is(
  public.hook_allow_anonymous_signups_only('{"user":{}}'::jsonb)
    -> 'error' ->> 'http_code',
  '403',
  'missing is_anonymous rejects closed'
);

select is(
  public.hook_allow_anonymous_signups_only('{"user":{"is_anonymous":null}}'::jsonb)
    -> 'error' ->> 'http_code',
  '403',
  'null is_anonymous rejects closed'
);

select is(
  public.hook_allow_anonymous_signups_only(
    '{"user":{"is_anonymous":"true"}}'::jsonb
  ) -> 'error' ->> 'http_code',
  '403',
  'string true rejects closed'
);

select is(
  public.hook_allow_anonymous_signups_only(
    '{"user":{"is_anonymous":"1"}}'::jsonb
  ) -> 'error' ->> 'http_code',
  '403',
  'string 1 rejects closed'
);

select is(
  public.hook_allow_anonymous_signups_only(
    '{"user":{"is_anonymous":1}}'::jsonb
  ) -> 'error' ->> 'http_code',
  '403',
  'number 1 rejects closed'
);

select is(
  public.hook_allow_anonymous_signups_only(
    '{"user":{"is_anonymous":"yes"}}'::jsonb
  ) -> 'error' ->> 'http_code',
  '403',
  'string yes rejects closed'
);

select is(
  public.hook_allow_anonymous_signups_only(
    '{"user":{"is_anonymous":"on"}}'::jsonb
  ) -> 'error' ->> 'http_code',
  '403',
  'string on rejects closed'
);

select is(
  public.hook_allow_anonymous_signups_only(
    '{"user":{"is_anonymous":"t"}}'::jsonb
  ) -> 'error' ->> 'http_code',
  '403',
  'string t rejects closed'
);

select is(
  public.hook_allow_anonymous_signups_only('{"user":[]}'::jsonb)
    -> 'error' ->> 'http_code',
  '403',
  'unexpected user structure rejects closed'
);

select is(
  public.hook_allow_anonymous_signups_only('{"user":"unexpected"}'::jsonb)
    -> 'error' ->> 'http_code',
  '403',
  'scalar user structure rejects closed'
);

select is(
  public.hook_allow_anonymous_signups_only('[]'::jsonb)
    -> 'error' ->> 'http_code',
  '403',
  'unexpected event structure rejects closed'
);

select is(
  public.hook_allow_anonymous_signups_only('null'::jsonb)
    -> 'error' ->> 'http_code',
  '403',
  'null event rejects closed'
);

select * from finish();

rollback;
