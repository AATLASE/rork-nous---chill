-- One invite code per space
--
-- Before: `invite_codes` held one row per invited person, each carrying a role,
-- a usage limit and an expiry date. After: exactly one permanent row per space —
-- the "address" of the space, shared with everyone. Anyone using it joins as an
-- observer and the owner promotes participants from the members screen.
--
-- The apps already tolerate a database that has not run this migration: they read
-- the oldest code of a space and create one on the fly when it is missing. Running
-- it removes the leftover duplicates and makes the invariant enforceable.
--
-- Idempotent — safe to run twice. Paste it in the Supabase SQL editor.

begin;

-- 1. Collapse each space onto its oldest code. Newer per-person codes stop working;
--    people who already joined with them keep their membership (space_members is
--    untouched).
delete from public.invite_codes
where id in (
  select id
  from (
    select id,
           row_number() over (partition by space_id order by created_at asc, id asc) as rn
    from public.invite_codes
  ) ranked
  where rn > 1
);

-- 2. The surviving code becomes permanent and role-neutral. The columns are kept
--    for schema compatibility; the apps always write these values.
update public.invite_codes
set max_uses = null,
    expires_at = null,
    role = 'observer'
where max_uses is not null
   or expires_at is not null
   or role is distinct from 'observer';

-- 3. Enforce the invariant: one code per space, and no two spaces share a code.
create unique index if not exists invite_codes_space_id_key on public.invite_codes (space_id);
create unique index if not exists invite_codes_code_key on public.invite_codes (code);

-- 4. Backfill spaces that never had a code (7 chars, ambiguous glyphs excluded so
--    the code stays easy to dictate). LATERAL forces one draw per space.
insert into public.invite_codes (code, space_id, role, max_uses, use_count, expires_at, created_by)
select gen.code, s.id, 'observer', null, 0, null, s.created_by
from public.spaces s
cross join lateral (
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', floor(random() * 32)::int + 1, 1), '') as code
  from generate_series(1, 7)
) gen
where not exists (
  select 1 from public.invite_codes c where c.space_id = s.id
);

commit;
