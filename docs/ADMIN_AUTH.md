# Admin authentication

WeMilktea Admin uses Supabase Auth email/password sessions. The public application has no sign-in flow and must continue to use only its published-content policies.

## Authorization

Authentication does not grant operational access. `public.admin_users` is the allow-list of approved Supabase Auth user IDs. The database function `public.is_admin()` checks the current JWT subject against that table.

All admin data policies call `is_admin()`. The browser calls the same function only to choose the login, unauthorized, and protected-route UI; a modified frontend cannot bypass RLS.

`admin_users` has no browser write policy. Add or remove administrators only through trusted database administration until an authorized admin-management workflow is explicitly built.

## Required Supabase configuration

For the production Supabase project:

1. Enable the Email provider with password sign-in.
2. Disable **Allow new users to sign up** and anonymous sign-ins.
3. Set the Auth Site URL and allowed redirect URL to the deployed admin origin, for example `https://admin.wemilktea.example`.
4. Create or invite the first administrator from **Authentication > Users** in the Supabase Dashboard. Do not create users from browser code.
5. In the SQL editor, allow-list that user's ID:

```sql
insert into public.admin_users (user_id)
select id
from auth.users
where email = 'admin@example.com';
```

The local `supabase/config.toml` disables self-service and anonymous signup as well. Local administrators still need a manually created Auth user before being inserted into `admin_users`.

## Browser environment

`apps/admin/.env.local` requires only:

```text
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

Never put `SUPABASE_SERVICE_ROLE_KEY`, a Supabase secret key, Google Places credentials, or R2 credentials in this file. Supabase's user-invite and user-creation APIs are trusted-server or Dashboard operations.

## Admin routes

`/dashboard`, `/stores`, `/candidates`, `/submissions`, and `/products` require an authenticated, allow-listed user. `/login` handles sign-in and `/unauthorized` explains a valid session that lacks approval.
