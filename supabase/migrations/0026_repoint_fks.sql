-- 0026_repoint_fks.sql — Ticket 3 / #90 (epic #84), part 2 of 3.
-- Re-point the six owner FKs from the interim travel.profiles to travel.member,
-- then drop travel.profiles. The per-user tables are EMPTY at this point (the
-- #89 data copy is blocked on DB credentials and lands after #90), so the
-- re-point is clean — no rows to remap here.
--
-- IMPORTANT for the #89 data copy: because profiles is now gone and the FKs
-- point at travel.member, the per-user rows must be inserted with user_id /
-- author_id ALREADY mapped old-schubert-travel-auth-uid → platform.member.id
-- (by email; 2 users) so they satisfy these constraints. travel.member is
-- seeded (0025) ready for that map.

alter table travel.felt_surveys       drop constraint felt_surveys_user_id_fkey;
alter table travel.felt_surveys       add  constraint felt_surveys_user_id_fkey
  foreign key (user_id)   references travel.member (id) on delete cascade;

alter table travel.journal_entries    drop constraint journal_entries_user_id_fkey;
alter table travel.journal_entries    add  constraint journal_entries_user_id_fkey
  foreign key (user_id)   references travel.member (id) on delete cascade;

alter table travel.baseline_ratings   drop constraint baseline_ratings_user_id_fkey;
alter table travel.baseline_ratings   add  constraint baseline_ratings_user_id_fkey
  foreign key (user_id)   references travel.member (id) on delete cascade;

alter table travel.user_weights       drop constraint user_weights_user_id_fkey;
alter table travel.user_weights       add  constraint user_weights_user_id_fkey
  foreign key (user_id)   references travel.member (id) on delete cascade;

alter table travel.trips              drop constraint trips_user_id_fkey;
alter table travel.trips              add  constraint trips_user_id_fkey
  foreign key (user_id)   references travel.member (id) on delete cascade;

alter table travel.trip_fork_comments drop constraint trip_fork_comments_author_id_fkey;
alter table travel.trip_fork_comments add  constraint trip_fork_comments_author_id_fkey
  foreign key (author_id) references travel.member (id) on delete cascade;

-- travel.trip_entries owns via the trips subquery (no owner column) — its policy
-- changes in 0027, no FK here.

drop table travel.profiles;
