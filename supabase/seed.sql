-- Local test data, loaded by `supabase start` / `supabase db reset` (never runs on prod).
-- Accounts (password for all: gather-test-1):
--   owner@test.local        owner of "Espace test"
--   membre@test.local       member
--   observateur@test.local  observer
-- Episode 1 is revealed (both participants reviewed), episode 2 is still sealed.

create extension if not exists pgcrypto;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token)
select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
  crypt('gather-test-1', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', jsonb_build_object('name', u.name), now(), now(), '', '', '', ''
from (values
  ('11111111-1111-1111-1111-111111111111'::uuid, 'owner@test.local', 'Olivia'),
  ('22222222-2222-2222-2222-222222222222'::uuid, 'membre@test.local', 'Marc'),
  ('33333333-3333-3333-3333-333333333333'::uuid, 'observateur@test.local', 'Oscar')
) as u(id, email, name);

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), id, id::text, jsonb_build_object('sub', id::text, 'email', email), 'email', now(), now(), now()
from auth.users where email like '%@test.local';

insert into public.profiles (id, name) values
  ('11111111-1111-1111-1111-111111111111', 'Olivia'),
  ('22222222-2222-2222-2222-222222222222', 'Marc'),
  ('33333333-3333-3333-3333-333333333333', 'Oscar')
on conflict (id) do nothing;

insert into public.spaces (id, slug, name, description, created_by, season_start, season_end)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'espace-test', 'Espace test', 'Données de test locales',
  '11111111-1111-1111-1111-111111111111', current_date - 30, current_date + 60);

-- A member only counts as a participant (must review before the reveal) with can_create_episodes.
insert into public.space_members (space_id, user_id, role, can_create_episodes) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'owner', true),
  ('aaaaaaaa-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'member', true),
  ('aaaaaaaa-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'observer', false);

insert into public.invite_codes (code, space_id, role, created_by)
values ('TESTCODE', 'aaaaaaaa-0000-0000-0000-000000000001', 'observer', '11111111-1111-1111-1111-111111111111')
on conflict do nothing;

insert into public.episodes (id, space_id, number, title, date, place, created_by) values
  ('eeeeeeee-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 1, 'Apéro au canal', current_date - 20, 'Paris', '11111111-1111-1111-1111-111111111111'),
  ('eeeeeeee-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 2, 'Ciné du dimanche', current_date - 5, 'Paris', '11111111-1111-1111-1111-111111111111');

-- Both participants answer episode 1 (the reveal trigger fires on the second), only Olivia answers episode 2.
insert into public.reviews (episode_id, space_id, author_id, author_name, rating, favorite_moment, funny_quote) values
  ('eeeeeeee-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Olivia', 5, 'Le coucher de soleil', '« On reste encore 5 min »'),
  ('eeeeeeee-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'Marc', 4, 'Les frites', '« C''est la dernière »'),
  ('eeeeeeee-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Olivia', 3, 'Le popcorn', null);

insert into public.episode_comments (episode_id, space_id, author_id, author_name, body) values
  ('eeeeeeee-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'Marc', 'Trop bien cette soirée');
