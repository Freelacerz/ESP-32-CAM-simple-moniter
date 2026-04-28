-- Adds configurable game duration for timed games.
alter table public.games
add column if not exists game_duration_hours integer not null default 2
check (game_duration_hours between 1 and 4);
