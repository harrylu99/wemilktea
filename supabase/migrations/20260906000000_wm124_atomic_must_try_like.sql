-- WM-124: Must Try is one transactional positive action.
create or replace function public.save_community_post_must_try(p_post_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  must_try_inserted boolean;
begin
  if auth.uid() is null then
    raise exception using errcode = 'P0001', message = 'authentication_required';
  end if;
  if not exists (select 1 from public.community_posts where id = p_post_id and status = 'active' and deleted_at is null) then
    raise exception using errcode = 'P0001', message = 'post_not_active';
  end if;

  insert into public.community_post_must_tries (post_id, user_id)
  values (p_post_id, auth.uid())
  on conflict (post_id, user_id) do nothing
  returning true into must_try_inserted;

  insert into public.community_post_likes (post_id, user_id)
  values (p_post_id, auth.uid())
  on conflict (post_id, user_id) do nothing;

  return coalesce(must_try_inserted, false);
end;
$$;

revoke all on function public.save_community_post_must_try(uuid) from public, anon;
grant execute on function public.save_community_post_must_try(uuid) to authenticated;
