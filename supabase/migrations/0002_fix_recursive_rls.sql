-- Fix recursive game_players RLS policies.
-- Run this in Supabase SQL Editor if you see:
-- "infinite recursion detected in policy for relation game_players"

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
revoke all on function public.is_public_lobby_game(uuid) from public;
revoke all on function public.can_direct_join_game(uuid) from public;
grant execute on function public.is_game_member(uuid) to authenticated;
grant execute on function public.is_public_lobby_game(uuid) to authenticated;
grant execute on function public.can_direct_join_game(uuid) to authenticated;

drop policy if exists "games_select_public_lobbies" on public.games;
create policy "games_select_public_lobbies" on public.games
for select using (
  (status = 'lobby' and is_private = false)
  or host_id = auth.uid()
  or public.is_game_member(id)
);

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

drop policy if exists "chat_select_members" on public.game_chat_messages;
create policy "chat_select_members" on public.game_chat_messages
for select using (public.is_game_member(game_id));

drop policy if exists "chat_insert_members" on public.game_chat_messages;
create policy "chat_insert_members" on public.game_chat_messages
for insert with check (
  auth.uid() = user_id
  and public.is_game_member(game_id)
);

drop policy if exists "reactions_select_members" on public.game_reactions;
create policy "reactions_select_members" on public.game_reactions
for select using (public.is_game_member(game_id));

drop policy if exists "reactions_insert_members" on public.game_reactions;
create policy "reactions_insert_members" on public.game_reactions
for insert with check (
  auth.uid() = user_id
  and public.is_game_member(game_id)
);
