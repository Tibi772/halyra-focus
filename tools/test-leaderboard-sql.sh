#!/usr/bin/env bash
# Runs docs/supabase.sql + docs/supabase-leaderboard.sql on a throwaway local
# PostgreSQL with a tiny stand-in for Supabase's auth schema, then checks the
# leaderboard functions: privacy, groups, anti-cheat caps, opting out.
# Usage: tools/test-leaderboard-sql.sh   (needs postgres binaries; CI: ubuntu)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)"
[ -x "$PGBIN/initdb" ] || { echo "postgres not installed"; exit 2; }
DIR="$(mktemp -d)"
ROOTUSER=0
if [ "$(id -u)" = "0" ]; then
  ROOTUSER=1
  id halyrapg >/dev/null 2>&1 || useradd -M -s /bin/bash halyrapg
  chown -R halyrapg "$DIR"
fi
# postgres refuses to run as root: drop to a plain user when needed
run() { if [ "$ROOTUSER" = "1" ]; then sudo -u halyrapg "$@"; else "$@"; fi; }
run "$PGBIN/initdb" -D "$DIR/data" -A trust -U postgres >/dev/null
run "$PGBIN/pg_ctl" -D "$DIR/data" -o "-k $DIR -p 55432 -c listen_addresses=''" -l "$DIR/log" start >/dev/null
trap 'run "$PGBIN/pg_ctl" -D "$DIR/data" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$DIR"' EXIT
PSQL=(psql -h "$DIR" -p 55432 -U postgres -v ON_ERROR_STOP=1 -q -X)
"${PSQL[@]}" -d postgres -c "create database t" >/dev/null
P=("${PSQL[@]}" -d t)

"${P[@]}" <<'SQL'
create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.uid', true), '')::uuid $$;
create role anon nologin; create role authenticated nologin;
grant usage on schema public, auth to anon, authenticated;
insert into auth.users values
 ('00000000-0000-0000-0000-00000000000a', 'a@x'), ('00000000-0000-0000-0000-00000000000b', 'b@x'),
 ('00000000-0000-0000-0000-00000000000c', 'c@x');
SQL
"${P[@]}" -f "$ROOT/docs/supabase.sql" >/dev/null
"${P[@]}" -f "$ROOT/docs/supabase-leaderboard.sql" >/dev/null
"${P[@]}" -f "$ROOT/docs/supabase-leaderboard.sql" >/dev/null   # idempotent

"${P[@]}" >/dev/null <<'SQL'
\set ON_ERROR_STOP 1
create function pg_temp.as_user(u text) returns void language sql as $$ select set_config('request.uid', u, false) $$;
create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin if not coalesce(ok, false) then raise exception 'CHECK FAILED: %', what; end if; raise notice 'PASS %', what; end $$;
set role authenticated;

-- A reports, public; B private; C public with an impossible number
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select halyra_lb_report('Anna <b>', '🦊', true, (date_trunc('week', now() at time zone 'utc'))::date, 120, 900, 7, 3);
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select halyra_lb_report('Bence', '🐼', false, (date_trunc('week', now() at time zone 'utc'))::date, 300, 2000, 12, 9);
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select halyra_lb_report('Cheater', '🐙', true, (date_trunc('week', now() at time zone 'utc'))::date, 99999, 99999, 5, 1);

-- direct table access is closed
do $$ begin perform * from halyra_lb; raise exception 'CHECK FAILED: table readable'; exception when insufficient_privilege then raise notice 'PASS tables are closed'; end $$;

-- global board as A: A and C (public), not B (private)
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.check((select count(*) from halyra_lb_board('global')) = 2, 'global board shows only public people (+ me)');
select pg_temp.check(not exists (select 1 from halyra_lb_board('global') where name = 'Bence'), 'private user hidden from global board');
select pg_temp.check((select name from halyra_lb_board('global') where me) = 'Anna b', 'names are cleaned');
select pg_temp.check((select week_minutes from halyra_lb_board('global') where name = 'Cheater') <= 10080, 'week minutes are capped');
select pg_temp.check((select week_minutes from halyra_lb_board('global') where name = 'Cheater') <= ceil(extract(epoch from (now() - ((date_trunc('week', now() at time zone 'utc'))::date::timestamp - interval '14 hours'))) / 60), 'no more minutes than the week has had');

-- B sees self on global even though private
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.check(exists (select 1 from halyra_lb_board('global') where me and name = 'Bence'), 'private user sees own row');

-- groups: A creates, B joins with code, C is not a member
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
create temp table g as select * from halyra_lb_create_group('Study <club>');
select pg_temp.check((select length(code) from g) = 6, 'group code has 6 characters');
select pg_temp.check((select name from g) = 'Study club', 'group name cleaned');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select * from halyra_lb_join((select lower(code) from g));
select pg_temp.check((select count(*) from halyra_lb_board('group', (select id from g))) = 2, 'group board shows members, including private ones');
select pg_temp.check((select members from halyra_lb_groups_mine() where id = (select id from g)) = 2, 'my groups lists member count');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select pg_temp.check((select count(*) from halyra_lb_board('group', (select id from g))) = 0, 'non-members see nothing of a group');
do $$ begin perform halyra_lb_join('ZZZZZZ'); raise exception 'CHECK FAILED: joined a missing group'; exception when others then if sqlerrm like 'CHECK FAILED%' then raise; end if; raise notice 'PASS wrong code is refused'; end $$;

-- growth cap: B reports +500 minutes right away → only +30 allowed
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select halyra_lb_report('Bence', '🐼', false, (date_trunc('week', now() at time zone 'utc'))::date, 800, 2500, 12, 9);
select pg_temp.check((select week_minutes from halyra_lb_board('group', (select id from g)) where me) <= 331, 'minutes cannot jump faster than time passes');

-- anonymous callers get nothing
select pg_temp.as_user('');
select pg_temp.check((select count(*) from halyra_lb_board('global')) = 0, 'signed-out callers see nothing');
do $$ begin perform halyra_lb_report('x', 'x', true, current_date, 1, 1, 1, 1); raise exception 'CHECK FAILED: anonymous report'; exception when others then if sqlerrm like 'CHECK FAILED%' then raise; end if; raise notice 'PASS anonymous report refused'; end $$;

-- leaving: A leaves the group, then deletes their leaderboard data
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select halyra_lb_leave((select id from g));
select pg_temp.check((select count(*) from halyra_lb_groups_mine()) = 0, 'left the group');
select halyra_lb_delete_me();
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select pg_temp.check(not exists (select 1 from halyra_lb_board('global') where name like 'Anna%'), 'deleted user is gone from the board');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.check((select count(*) from halyra_lb_groups_mine()) = 1, 'group survives while someone is in it');
select halyra_lb_leave((select id from g));
reset role;
select pg_temp.check((select count(*) from halyra_lb_groups) = 0, 'empty groups are removed');

-- sync rows: each user sees only their own; "delete my account" removes everything
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
insert into halyra_sync (user_id, data, device) values ('00000000-0000-0000-0000-00000000000b', '{"v":1}', 'pc');
do $$ begin insert into halyra_sync (user_id, data, device) values ('00000000-0000-0000-0000-00000000000c', '{}', 'x'); raise exception 'CHECK FAILED: wrote someone else''s row'; exception when others then if sqlerrm like 'CHECK FAILED%' then raise; end if; raise notice 'PASS cannot write another user''s row'; end $$;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select pg_temp.check((select count(*) from halyra_sync) = 0, 'cannot read another user''s row');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select halyra_lb_report('Bence', '🐼', true, (date_trunc('week', now() at time zone 'utc'))::date, 10, 10, 1, 1);
select halyra_delete_account();
reset role;
select pg_temp.check(not exists (select 1 from auth.users where id = '00000000-0000-0000-0000-00000000000b'), 'account deleted');
select pg_temp.check(not exists (select 1 from halyra_sync where user_id = '00000000-0000-0000-0000-00000000000b'), 'synced data deleted with the account');
select pg_temp.check(not exists (select 1 from halyra_lb where user_id = '00000000-0000-0000-0000-00000000000b'), 'leaderboard entry deleted with the account');
set role anon;
select pg_temp.as_user('');
do $$ begin perform * from halyra_sync; raise exception 'CHECK FAILED: anon reads sync'; exception when insufficient_privilege then raise notice 'PASS signed-out callers cannot touch sync data'; end $$;
reset role;
SQL
echo "LEADERBOARD SQL: ALL PASSED"
