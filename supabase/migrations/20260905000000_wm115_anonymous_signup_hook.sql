-- WM-115: allow only anonymous Auth user creation through the Before User Created hook.

create or replace function public.hook_allow_anonymous_signups_only(event jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
begin
  if event #> '{user,is_anonymous}' = 'true'::jsonb then
    return '{}'::jsonb;
  end if;

  return jsonb_build_object(
    'error',
    jsonb_build_object(
      'http_code', 403,
      'message', 'New permanent-user signups are not allowed.'
    )
  );
end;
$$;

grant usage on schema public to supabase_auth_admin;
grant execute on function public.hook_allow_anonymous_signups_only(jsonb)
  to supabase_auth_admin;
revoke execute on function public.hook_allow_anonymous_signups_only(jsonb)
  from authenticated, anon, public;
