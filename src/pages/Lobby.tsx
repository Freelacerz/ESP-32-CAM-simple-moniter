import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { MonoployezBoard } from "@/components/MonoployezBoard";
import { MonoployezLogo } from "@/components/MonoployezLogo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { TOKENS } from "@/lib/board";
import { ArrowLeft, Copy, Crown, Loader2, Lock, LogOut, Play, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { invokeGameAction } from "@/integrations/supabase/gameAction";
import { subscribeToGame } from "@/integrations/supabase/realtime";
import { GameChat } from "@/components/GameChat";

interface GameRow {
  id: string;
  name: string;
  host_id: string;
  status: string;
  is_private: boolean;
  invite_code: string | null;
  max_players: number;
  starting_money: number;
}

interface PlayerRow {
  id: string;
  user_id: string;
  seat_index: number;
  token: string;
  is_ready: boolean;
  profile?: { username: string; avatar_url: string | null };
}

export default function Lobby() {
  const { gameId } = useParams<{ gameId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [game, setGame] = useState<GameRow | null>(null);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!gameId || !user) return;
    void load();
    const unsub = subscribeToGame(gameId, () => void load());
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, user]);

  const load = async () => {
    if (!gameId) return;
    try {
      const [gRes, pRes] = await Promise.all([
        supabase
          .from("games")
          .select("id, name, host_id, status, is_private, invite_code, max_players, starting_money")
          .eq("id", gameId)
          .maybeSingle(),
        supabase
          .from("game_players")
          .select("id, user_id, seat_index, token, is_ready")
          .eq("game_id", gameId)
          .order("seat_index", { ascending: true }),
      ]);

      const g = gRes.data;
      const gErr = gRes.error;
      const ps = pRes.data ?? [];
      const pErr = pRes.error;
      if (gErr) throw gErr;
      if (pErr) throw pErr;

      if (!g) {
        toast({ title: "Game not found", variant: "destructive" });
        navigate("/");
        return;
      }

      const status = g.status as string;
      if (status === "in_progress") {
        navigate(`/game/${gameId}`, { replace: true });
        return;
      }

      setGame({
        id: g.id,
        name: g.name,
        host_id: g.host_id,
        status,
        is_private: !!g.is_private,
        invite_code: g.invite_code ?? null,
        max_players: g.max_players,
        starting_money: g.starting_money,
      });

      const ids = ps.map((p) => p.user_id).filter(Boolean);
      const profiles: Record<string, { username: string; avatar_url: string | null }> = {};
      if (ids.length) {
        const { data: profs, error } = await supabase
          .from("profiles")
          .select("id, username, avatar_url")
          .in("id", ids)
          .limit(100);
        if (error) throw error;
        (profs ?? []).forEach((p: { id: string; username: string; avatar_url: string | null }) => {
          profiles[p.id] = { username: p.username, avatar_url: p.avatar_url ?? null };
        });
      }

      setPlayers(
        ps.map((p: { id: string; user_id: string; seat_index: number; token: string; is_ready: boolean }) => ({
          id: p.id,
          user_id: p.user_id,
          seat_index: p.seat_index,
          token: p.token,
          is_ready: !!p.is_ready,
          profile: profiles[p.user_id],
        }))
      );
    } finally {
      setLoading(false);
    }
  };

  const me = players.find((p) => p.user_id === user?.id);
  const isHost = game && user && game.host_id === user.id;
  const usedTokens = new Set(players.map((p) => p.token));

  const handleLeave = async () => {
    if (!gameId || !user) return;
    if (isHost) {
      await supabase.from("games").delete().eq("id", gameId);
    } else {
      await supabase.from("game_players").delete().eq("game_id", gameId).eq("user_id", user.id);
    }
    navigate("/");
  };

  const setToken = async (token: string) => {
    if (!me || !gameId) return;
    if (usedTokens.has(token) && me.token !== token) return;
    await supabase.from("game_players").update({ token }).eq("id", me.id);
    void load();
  };

  const toggleReady = async () => {
    if (!me) return;
    await supabase.from("game_players").update({ is_ready: !me.is_ready }).eq("id", me.id);
    void load();
  };

  const copyInvite = () => {
    if (!game?.invite_code) return;
    navigator.clipboard.writeText(game.invite_code);
    toast({ title: "Invite code copied", description: game.invite_code });
  };

  const canStart =
    isHost &&
    players.length >= 2 &&
    players.filter((p) => p.user_id !== game?.host_id).every((p) => p.is_ready);

  const handleStart = async () => {
    if (!gameId) return;
    try {
      const res = await invokeGameAction({ action: "start_game", game_id: gameId });
      if (res?.error) throw new Error(res.error);
      navigate(`/game/${gameId}`);
    } catch (err: unknown) {
      toast({ title: "Couldn't start", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
      return;
    }
  };

  if (loading || !game) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container flex items-center justify-between py-4 gap-3">
          <div className="flex items-center gap-3">
            <Link to="/">
              <Button variant="ghost" size="icon" aria-label="Back">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <MonoployezLogo size="sm" />
          </div>
          <Button variant="outline" size="sm" onClick={handleLeave}>
            <LogOut className="h-4 w-4 mr-2" /> {isHost ? "Cancel game" : "Leave"}
          </Button>
        </div>
      </header>

      <main className="container py-6 grid lg:grid-cols-[1fr_360px] gap-6">
        <div>
          <div className="mb-4 flex items-baseline justify-between gap-3 flex-wrap">
            <h1 className="font-display text-3xl font-black">{game.name}</h1>
            <div className="flex items-center gap-2">
              {game.is_private ? (
                <Badge variant="outline" className="gap-1"><Lock className="h-3 w-3" /> Private</Badge>
              ) : (
                <Badge variant="outline">Public</Badge>
              )}
              <Badge>${game.starting_money} start</Badge>
            </div>
          </div>
          <MonoployezBoard>
            <div className="text-center space-y-3">
              <div className="monoployez-title text-3xl md:text-4xl">MONOPLOYEZ GO</div>
              <p className="text-muted-foreground text-sm max-w-xs mx-auto">
                Waiting in lobby. Once everyone is ready, the host starts the game.
              </p>
            </div>
          </MonoployezBoard>
        </div>

        <aside className="space-y-4">
          {game.is_private && game.invite_code && (
            <Card className="p-4 bg-felt text-primary-foreground">
              <div className="text-xs uppercase tracking-wider text-primary-foreground/70 mb-1">Invite code</div>
              <div className="flex items-center justify-between">
                <span className="font-condensed text-3xl tracking-widest">{game.invite_code}</span>
                <Button size="icon" variant="ghost" onClick={copyInvite} className="text-primary-foreground hover:bg-white/10">
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </Card>
          )}

          <Card className="p-4">
            <h3 className="font-display text-lg font-bold mb-3 flex items-center gap-2">
              <Users className="h-4 w-4" /> Players ({players.length}/{game.max_players})
            </h3>
            <ul className="space-y-2">
              {players.map((p) => {
                const tok = TOKENS.find((t) => t.id === p.token);
                return (
                  <li key={p.id} className="flex items-center gap-3 p-2 rounded-md bg-muted/50">
                    <span className="text-2xl" aria-hidden>{tok?.emoji ?? "🎲"}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate flex items-center gap-1">
                        {p.profile?.username ?? "Player"}
                        {p.user_id === game.host_id && <Crown className="h-3 w-3 text-accent" />}
                      </div>
                      <div className="text-xs text-muted-foreground">{tok?.label}</div>
                    </div>
                    {p.user_id === game.host_id ? (
                      <Badge variant="outline" className="text-xs">Host</Badge>
                    ) : p.is_ready ? (
                      <Badge className="bg-money text-primary-foreground">Ready</Badge>
                    ) : (
                      <Badge variant="outline">Waiting</Badge>
                    )}
                  </li>
                );
              })}
              {Array.from({ length: game.max_players - players.length }).map((_, i) => (
                <li key={`empty-${i}`} className="flex items-center gap-3 p-2 rounded-md border border-dashed text-muted-foreground text-sm">
                  Empty seat
                </li>
              ))}
            </ul>
          </Card>

          {me && (
            <Card className="p-4">
              <h3 className="font-display text-lg font-bold mb-3">Your token</h3>
              <div className="grid grid-cols-4 gap-2 mb-4">
                {TOKENS.map((t) => {
                  const taken = usedTokens.has(t.id) && me.token !== t.id;
                  const selected = me.token === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setToken(t.id)}
                      disabled={taken}
                      title={t.label}
                      className={`aspect-square rounded-md border-2 flex items-center justify-center text-2xl transition ${
                        selected ? "border-primary bg-primary/10" : "border-transparent bg-muted hover:bg-muted/70"
                      } ${taken ? "opacity-30 cursor-not-allowed" : ""}`}
                    >
                      {t.emoji}
                    </button>
                  );
                })}
              </div>
              {!isHost ? (
                <Button onClick={toggleReady} className="w-full" variant={me.is_ready ? "outline" : "default"}>
                  {me.is_ready ? "Not ready" : "I'm ready"}
                </Button>
              ) : (
                <Button onClick={handleStart} disabled={!canStart} className="w-full">
                  <Play className="h-4 w-4 mr-2" />
                  {players.length < 2
                    ? "Need 2+ players"
                    : !canStart
                    ? "Waiting for ready"
                    : "Start game"}
                </Button>
              )}
            </Card>
          )}

          {gameId && <GameChat gameId={gameId} title="Lobby chat" />}
        </aside>
      </main>
    </div>
  );
}
