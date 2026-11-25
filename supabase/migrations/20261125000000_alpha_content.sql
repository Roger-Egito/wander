-- The Alpha group: my players, who also see content with status alpha (adapted from
-- other games, or tried in our own games before everyone gets it).
--
-- Membership is a flag on the profile, set by hand in the SQL editor like is_admin (see
-- the README). Nobody can set it on themselves: the profiles migration grants updates on
-- display_name, language and theme only.
--
-- Alpha content is a JSON snapshot in the private bucket below. The snapshot workflow
-- uploads it with the service key, which bypasses Row Level Security, so there is no
-- write policy at all. Reading it needs a signed-in Alpha member or an admin.

alter table public.profiles add column is_alpha boolean not null default false;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('alpha', 'alpha', false, 10485760, array['application/json']);

-- The subquery reads the person's own profile, which "read own profile" allows.
create policy "alpha members read alpha content" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'alpha'
    and exists (
      select 1 from public.profiles
      where id = (select auth.uid()) and (is_alpha or is_admin)
    )
  );
