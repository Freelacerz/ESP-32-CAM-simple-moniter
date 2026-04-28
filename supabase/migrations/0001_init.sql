-- Core schema for Monoployez Go (Supabase / Postgres)
-- Safe to rerun. This version fixes recursive game_players RLS policies by
-- using SECURITY DEFINER helper functions below.
-- Enable required extensions
create extension if not exists "pgcrypto";

-- Profiles (one per auth user)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  avatar_url text,
  games_played integer not null default 0,
  games_won integer not null default 0,
  xp integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Games / rooms
create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  host_id uuid not null references auth.users(id) on delete restrict,
  status text not null check (status in ('lobby','in_progress','finished','abandoned')) default 'lobby',
  is_private boolean not null default false,
  invite_code text unique,
  max_players integer not null default 4 check (max_players between 2 and 8),
  starting_money integer not null default 1500,
  game_duration_hours integer not null default 2 check (game_duration_hours between 1 and 4),
  -- JSON state is authoritative and updated only by edge functions (RLS enforced)
  state jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists games_status_idx on public.games(status);
create index if not exists games_invite_code_idx on public.games(invite_code);

-- Game players (seats)
create table if not exists public.game_players (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  seat_index integer not null check (seat_index between 0 and 7),
  token text not null,
  is_ready boolean not null default false,
  created_at timestamptz not null default now(),
  unique (game_id, user_id),
  unique (game_id, seat_index),
  unique (game_id, token)
);

create index if not exists game_players_game_id_idx on public.game_players(game_id);

-- Chat
create table if not exists public.game_chat_messages (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  message text not null check (char_length(message) between 1 and 500),
  created_at timestamptz not null default now()
);

create index if not exists game_chat_messages_game_id_created_idx on public.game_chat_messages(game_id, created_at desc);

-- Reactions (lightweight, can be ephemeral in UI but persisted for replay)
create table if not exists public.game_reactions (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now()
);

create index if not exists game_reactions_game_id_created_idx on public.game_reactions(game_id, created_at desc);

-- Achievements catalog + user unlocks
create table if not exists public.achievements (
  id text primary key,
  title text not null,
  description text not null,
  xp integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.user_achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  achievement_id text not null references public.achievements(id) on delete cascade,
  unlocked_at timestamptz not null default now(),
  unique (user_id, achievement_id)
);

-- Cosmetics unlocks (avatars, themes, badges, skins)
create table if not exists public.cosmetics (
  id text primary key,
  kind text not null check (kind in ('avatar','theme','badge','board_skin')),
  title text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.user_cosmetics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  cosmetic_id text not null references public.cosmetics(id) on delete cascade,
  unlocked_at timestamptz not null default now(),
  unique (user_id, cosmetic_id)
);

-- updated_at helper
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists games_set_updated_at on public.games;
create trigger games_set_updated_at
before update on public.games
for each row execute function public.set_updated_at();

-- Bootstrap profile on new auth user
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', 'player_' || substring(new.id::text from 1 for 8)),
    null
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- RLS helper functions. SECURITY DEFINER avoids recursive policies when a
-- policy needs to check membership in game_players.
create or replace function public.is_game_member(p_game_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.game_players gp
    where gp.game_id = p_game_id
      and gp.user_id = auth.uid()
  );
$$;

create or replace function public.is_game_host(p_game_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.games g
    where g.id = p_game_id
      and g.host_id = auth.uid()
  );
$$;

create or replace function public.is_public_lobby_game(p_game_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.games g
    where g.id = p_game_id
      and g.status = 'lobby'
      and g.is_private = false
  );
$$;

create or replace function public.can_direct_join_game(p_game_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.games g
    where g.id = p_game_id
      and g.status = 'lobby'
      and (
        g.host_id = auth.uid()
        or (
          g.is_private = false
          and (
            select count(*)
            from public.game_players gp
            where gp.game_id = g.id
          ) < g.max_players
        )
      )
  );
$$;

revoke all on function public.is_game_member(uuid) from public;
revoke all on function public.is_game_host(uuid) from public;
revoke all on function public.is_public_lobby_game(uuid) from public;
revoke all on function public.can_direct_join_game(uuid) from public;
grant execute on function public.is_game_member(uuid) to authenticated;
grant execute on function public.is_game_host(uuid) to authenticated;
grant execute on function public.is_public_lobby_game(uuid) to authenticated;
grant execute on function public.can_direct_join_game(uuid) to authenticated;

-- Strict private invite flow. Private games are not broadly selectable; this
-- RPC finds a lobby by invite code and seats the current user atomically.
create or replace function public.join_private_game_by_invite_code(p_invite_code text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_game public.games%rowtype;
  v_existing_player_id uuid;
  v_player_count integer;
  v_seat_index integer;
  v_token text;
  v_tokens text[] := array[
    'top-hat',
    'car',
    'dog',
    'cat',
    'ship',
    'boot',
    'thimble',
    'wheelbarrow'
  ];
begin
  if v_user_id is null then
    raise exception 'You must be signed in to join a private game'
      using errcode = '28000';
  end if;

  select *
    into v_game
    from public.games
    where upper(invite_code) = upper(trim(p_invite_code))
      and is_private = true
      and status = 'lobby'
    for update;

  if not found then
    raise exception 'Invite code not found'
      using errcode = 'P0002';
  end if;

  select gp.id
    into v_existing_player_id
    from public.game_players gp
    where gp.game_id = v_game.id
      and gp.user_id = v_user_id;

  if found then
    return v_game.id;
  end if;

  select count(*)
    into v_player_count
    from public.game_players gp
    where gp.game_id = v_game.id;

  if v_player_count >= v_game.max_players then
    raise exception 'Game is full'
      using errcode = 'P0001';
  end if;

  select seats.seat_index
    into v_seat_index
    from generate_series(0, v_game.max_players - 1) as seats(seat_index)
    where not exists (
      select 1
      from public.game_players gp
      where gp.game_id = v_game.id
        and gp.seat_index = seats.seat_index
    )
    order by seats.seat_index
    limit 1;

  if v_seat_index is null then
    raise exception 'No open seats are available'
      using errcode = 'P0001';
  end if;

  select tokens.token
    into v_token
    from unnest(v_tokens) with ordinality as tokens(token, ord)
    where not exists (
      select 1
      from public.game_players gp
      where gp.game_id = v_game.id
        and gp.token = tokens.token
    )
    order by ord
    limit 1;

  if v_token is null then
    raise exception 'No open tokens are available'
      using errcode = 'P0001';
  end if;

  insert into public.game_players (
    game_id,
    user_id,
    seat_index,
    token,
    is_ready
  )
  values (
    v_game.id,
    v_user_id,
    v_seat_index,
    v_token,
    false
  );

  return v_game.id;
end;
$$;

revoke all on function public.join_private_game_by_invite_code(text) from public;
grant execute on function public.join_private_game_by_invite_code(text) to authenticated;

-- RLS
alter table public.profiles enable row level security;
alter table public.games enable row level security;
alter table public.game_players enable row level security;
alter table public.game_chat_messages enable row level security;
alter table public.game_reactions enable row level security;
alter table public.user_achievements enable row level security;
alter table public.user_cosmetics enable row level security;

-- Profiles: public read, self write
drop policy if exists "profiles_read_all" on public.profiles;
create policy "profiles_read_all" on public.profiles
for select using (true);

drop policy if exists "profiles_insert_self" on public.profiles;
create policy "profiles_insert_self" on public.profiles
for insert with check (auth.uid() = id);

drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self" on public.profiles
for update using (auth.uid() = id);

-- Games: lobby list only for public games; members can read their games
drop policy if exists "games_select_public_lobbies" on public.games;
create policy "games_select_public_lobbies" on public.games
for select using (
  (status = 'lobby' and is_private = false)
  or host_id = auth.uid()
  or public.is_game_member(id)
);

-- Create game: any authed user
drop policy if exists "games_insert_authed" on public.games;
create policy "games_insert_authed" on public.games
for insert with check (auth.uid() = host_id);

-- Update game: only edge function (service role) should update state; disallow client updates broadly
drop policy if exists "games_update_host_metadata_only" on public.games;
create policy "games_update_host_metadata_only" on public.games
for update using (auth.uid() = host_id)
with check (auth.uid() = host_id);

drop policy if exists "games_delete_host" on public.games;
create policy "games_delete_host" on public.games
for delete using (auth.uid() = host_id);

-- Players: members can read; users can insert themselves; users can update their own readiness/token
drop policy if exists "game_players_select_members" on public.game_players;
create policy "game_players_select_members" on public.game_players
for select using (
  auth.uid() = user_id
  or public.is_game_member(game_id)
  or public.is_public_lobby_game(game_id)
);

drop policy if exists "game_players_insert_self" on public.game_players;
create policy "game_players_insert_self" on public.game_players
for insert with check (
  auth.uid() = user_id
  and public.can_direct_join_game(game_id)
);

drop policy if exists "game_players_update_self" on public.game_players;
create policy "game_players_update_self" on public.game_players
for update using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "game_players_delete_self" on public.game_players;
create policy "game_players_delete_self" on public.game_players
for delete using (auth.uid() = user_id);

-- Chat: members can read/write
drop policy if exists "chat_select_members" on public.game_chat_messages;
create policy "chat_select_members" on public.game_chat_messages
for select using (public.is_game_member(game_id));

drop policy if exists "chat_insert_members" on public.game_chat_messages;
create policy "chat_insert_members" on public.game_chat_messages
for insert with check (
  auth.uid() = user_id
  and public.is_game_member(game_id)
);

-- Reactions: members can read/write
drop policy if exists "reactions_select_members" on public.game_reactions;
create policy "reactions_select_members" on public.game_reactions
for select using (public.is_game_member(game_id));

drop policy if exists "reactions_insert_members" on public.game_reactions;
create policy "reactions_insert_members" on public.game_reactions
for insert with check (
  auth.uid() = user_id
  and public.is_game_member(game_id)
);

-- Achievements/unlocks: self read, service role writes (client inserts disallowed by omission)
drop policy if exists "user_achievements_select_self" on public.user_achievements;
create policy "user_achievements_select_self" on public.user_achievements
for select using (auth.uid() = user_id);

drop policy if exists "user_cosmetics_select_self" on public.user_cosmetics;
create policy "user_cosmetics_select_self" on public.user_cosmetics
for select using (auth.uid() = user_id);

-- Realtime: publish table changes for lobby/game subscriptions. Safe to rerun.
alter table public.games replica identity full;
alter table public.game_players replica identity full;
alter table public.game_chat_messages replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.games;
    exception
      when duplicate_object then null;
    end;

    begin
      alter publication supabase_realtime add table public.game_players;
    exception
      when duplicate_object then null;
    end;

    begin
      alter publication supabase_realtime add table public.game_chat_messages;
    exception
      when duplicate_object then null;
    end;
  end if;
end;
$$;
