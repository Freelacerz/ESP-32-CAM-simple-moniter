-- Security hardening for Monoployez Go.
-- Keep direct client updates scoped to the exact columns the app needs.

revoke update on public.games from anon;
revoke update on public.games from authenticated;
grant update (
  name,
  is_private,
  invite_code,
  max_players,
  starting_money,
  game_duration_hours
) on public.games to authenticated;

revoke update on public.game_players from anon;
revoke update on public.game_players from authenticated;
grant update (
  token,
  is_ready
) on public.game_players to authenticated;
