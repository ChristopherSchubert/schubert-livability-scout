-- Feedback notes submitted from the trip-walkthrough deck (public/mockups/
-- trip-walkthrough.html). The deck is a public static page, so inserts come
-- through /api/walkthrough-feedback anonymously; reads are for signed-in
-- users (Chris) only.
create table if not exists public.walkthrough_feedback (
  id uuid primary key default gen_random_uuid(),
  slide int not null,
  phase text not null default '',
  note text not null,
  ua text not null default '',
  created_at timestamptz not null default now()
);

alter table public.walkthrough_feedback enable row level security;

create policy walkthrough_feedback_insert on public.walkthrough_feedback
  for insert to anon, authenticated with check (true);

create policy walkthrough_feedback_select on public.walkthrough_feedback
  for select to authenticated using (true);
