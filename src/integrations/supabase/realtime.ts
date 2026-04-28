import { supabase } from "@/integrations/supabase/client";

export function subscribeToGame(gameId: string, onAnyChange: () => void) {
  const ch = supabase
    .channel(`game:${gameId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "games", filter: `id=eq.${gameId}` },
      () => onAnyChange()
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "game_players", filter: `game_id=eq.${gameId}` },
      () => onAnyChange()
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "game_chat_messages", filter: `game_id=eq.${gameId}` },
      () => onAnyChange()
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(ch);
  };
}

export function subscribeToPublicLobby(onAnyChange: () => void) {
  const ch = supabase
    .channel("public-lobby")
    .on("postgres_changes", { event: "*", schema: "public", table: "games" }, () => onAnyChange())
    .subscribe();

  return () => {
    void supabase.removeChannel(ch);
  };
}

