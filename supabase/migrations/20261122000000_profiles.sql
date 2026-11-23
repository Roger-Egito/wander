-- Profiles: one row per account, made automatically when someone first signs in with
-- Google. It holds the name the app shows, the admin flag that reveals the Editor, and
-- the language and theme a person picked.
--
-- Row Level Security is on before any row exists. A person reads and edits only their
-- own profile, and only its name, language and theme: nobody can make themselves an
-- admin through the API. is_admin is set by hand in the SQL editor (see the README).
--
-- The Data API doesn't grant access to new tables automatically in this project, so the
-- grants below are the whole list of what the app may do.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 80),
  is_admin boolean not null default false,
  language text check (language in ('pt', 'en')),
  theme text check (theme in ('dark', 'light')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
-- Column grants: an update that touches is_admin, id or created_at is refused outright.
grant update (display_name, language, theme) on public.profiles to authenticated;

-- (select auth.uid()) runs once per query instead of once per row (Supabase's RLS
-- performance guide).
create policy "read own profile" on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id);

create policy "update own profile" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- No insert or delete policy, and no grant for them: profiles are made by the trigger
-- below and removed with the account.

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''), 80));
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Anyone who signed in before this migration ran gets a profile too.
insert into public.profiles (id, display_name)
select id, left(coalesce(raw_user_meta_data ->> 'full_name', raw_user_meta_data ->> 'name', ''), 80)
from auth.users
on conflict (id) do nothing;
