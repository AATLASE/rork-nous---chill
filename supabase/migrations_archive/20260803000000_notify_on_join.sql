-- Somebody just walked in: notify the space when a person joins
--
-- The owner used to learn about arrivals from a card on the home screen — a
-- permanent banner that only existed to say "go to the members screen". The
-- banner is gone: arrivals are now handled where members are handled, and the
-- thing that tells you an arrival happened is a notification, like every other
-- event in the app.
--
-- Who hears it:
--
--   • the owner        → "X a rejoint l'aventure", with what to do next
--                        (autoriser à participer) and a link straight to the
--                        members screen, the only place that can grant it.
--   • the participants → the same arrival, without the call to action: they
--                        cannot promote anybody, they just get to know who is
--                        in.
--
-- Observers stay quiet here, as everywhere else outside a reveal: an arrival
-- they can neither act on nor greet differently is not worth a buzz.
--
-- Two inserts are deliberately silent:
--   • the owner's own membership row, written when the space is created — the
--     space would otherwise announce its creator to himself.
--   • anyone joining a space that has no one else in it yet.
--
-- Like every other notification trigger, this one goes through `notify_user`,
-- which swallows its own errors: failing to announce an arrival must never roll
-- back the arrival itself. Somebody redeeming a code gets in either way.
--
-- Depends on 20260802000000 (notify_user, display_name, space_participant_ids).
-- Idempotent — safe to run twice. Paste it in the Supabase SQL editor.

begin;

create or replace function public.space_members_after_insert_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space text;
  v_newcomer text;
  v_owner uuid;
  v_user uuid;
  v_url text;
begin
  -- The creator's own row, written by the "create space" flow.
  if coalesce(new.role::text, 'observer') = 'owner' then
    return null;
  end if;

  select s.name into v_space from public.spaces s where s.id = new.space_id;
  v_newcomer := public.display_name(new.user_id);
  v_url := '/space-members/' || new.space_id;

  -- The membership row is the source of truth for who owns the space (it is
  -- what the app reads), with the space's creator as a fallback for rows that
  -- predate it.
  select m.user_id into v_owner
  from public.space_members m
  where m.space_id = new.space_id and coalesce(m.role::text, '') = 'owner'
  limit 1;

  if v_owner is null then
    select s.created_by into v_owner from public.spaces s where s.id = new.space_id;
  end if;

  if v_owner is not null and v_owner is distinct from new.user_id then
    perform public.notify_user(
      v_owner,
      new.space_id,
      format('%s a rejoint « %s »', v_newcomer, coalesce(v_space, 'ton aventure')),
      format(
        '%s est observateur pour l''instant. Autorise-la à participer depuis les membres.',
        v_newcomer
      ),
      v_url
    );
  end if;

  -- The other participants: the news, without the button they do not have.
  for v_user in select public.space_participant_ids(new.space_id) loop
    if v_user is distinct from new.user_id and v_user is distinct from v_owner then
      perform public.notify_user(
        v_user,
        new.space_id,
        format('%s a rejoint « %s »', v_newcomer, coalesce(v_space, 'votre aventure')),
        'Une personne de plus dans l''aventure.',
        v_url
      );
    end if;
  end loop;

  return null;
end $$;

drop trigger if exists space_members_notify_join on public.space_members;
create trigger space_members_notify_join
after insert on public.space_members
for each row
execute function public.space_members_after_insert_notify();

commit;
