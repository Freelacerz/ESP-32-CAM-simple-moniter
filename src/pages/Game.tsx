import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { MonoployezBoard } from "@/components/MonoployezBoard";
import { MonoployezLogo } from "@/components/MonoployezLogo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { BOARD, TOKENS } from "@/lib/board";
import { ArrowLeft, ArrowRightLeft, Crown, Dice5, Loader2, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { invokeGameAction } from "@/integrations/supabase/gameAction";
import { subscribeToGame } from "@/integrations/supabase/realtime";
import { GameChat } from "@/components/GameChat";

interface PlayerState {
  user_id: string;
  position: number;
  money: number;
  in_jail: boolean;
  jail_turns: number;
}
interface PropertyState {
  tile_index: number;
  owner_user_id: string | null;
  mortgaged: boolean;
  houses: number;
}
interface GameState {
  players: PlayerState[];
  turn_order: string[];
  last_roll: [number, number] | null;
  doubles_count: number;
  phase: "rolling" | "rolled" | "awaiting_buy_or_auction" | "awaiting_trade" | "ended";
  properties: PropertyState[];
  log_tail: string[];
  current_turn_user_id?: string | null;
  turn_ends_at?: string | null;
}
interface GameRow {
  id: string; name: string; host_id: string; status: string;
  current_turn_player_id: string | null; state: GameState;
}
interface SeatRow { user_id: string; token: string; seat_index: number; }
type ProfileMap = Record<string, { username: string; avatar_url: string | null }>;

const DICE_FACES = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];

export default function Game() {
  const { gameId } = useParams<{ gameId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [game, setGame] = useState<GameRow | null>(null);
  const [seats, setSeats] = useState<SeatRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileMap>({});
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [rollAnim, setRollAnim] = useState<[number, number] | null>(null);
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const [tradeTile, setTradeTile] = useState("");
  const [tradeTarget, setTradeTarget] = useState("");

  useEffect(() => {
    if (!gameId || !user) return;
    void load();
    const unsub = subscribeToGame(gameId, () => void load());
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, user]);

  useEffect(() => {
    if (!gameId || !game?.state?.turn_ends_at) return;
    const t = setInterval(async () => {
      const endsAt = game.state.turn_ends_at ? Date.parse(game.state.turn_ends_at) : null;
      if (!endsAt) return;
      const ms = endsAt - Date.now();
      setRemainingMs(ms);
      if (ms <= 0) {
        // Best-effort: any client can advance if timer expired.
        try {
          await invokeGameAction({ action: "tick_turn", game_id: gameId });
        } catch {
          // ignore
        }
      }
    }, 500);
    return () => clearInterval(t);
  }, [gameId, game?.state?.turn_ends_at]);

  const load = async () => {
    if (!gameId) return;
    try {
      const [gRes, pRes] = await Promise.all([
        supabase
          .from("games")
          .select("id, name, host_id, status, state")
          .eq("id", gameId)
          .maybeSingle(),
        supabase
          .from("game_players")
          .select("user_id, token, seat_index")
          .eq("game_id", gameId)
          .order("seat_index", { ascending: true }),
      ]);
      if (gRes.error) throw gRes.error;
      if (pRes.error) throw pRes.error;
      const g = gRes.data as { id: string; name: string; host_id: string; status: string; state: unknown } | null;
      const seatDocs = (pRes.data ?? []) as { user_id: string; token: string; seat_index: number }[];

      if (!g) {
        navigate("/");
        return;
      }
      if (g.status === "lobby") {
        navigate(`/lobby/${gameId}`, { replace: true });
        return;
      }

      const state = (g.state ?? null) as GameState | null;
      const currentTurn = state?.current_turn_user_id ?? null;

      setGame({
        id: g.id,
        name: g.name,
        host_id: g.host_id,
        status: g.status,
        current_turn_player_id: currentTurn,
        state: (state ?? {
          players: [],
          turn_order: [],
          last_roll: null,
          doubles_count: 0,
          phase: "rolling",
          properties: [],
          log_tail: [],
        }) as GameState,
      });

      setSeats(seatDocs.map((p) => ({ user_id: p.user_id, token: p.token, seat_index: p.seat_index })));

      const ids = seatDocs.map((p) => p.user_id).filter(Boolean);
      if (ids.length) {
        const { data: profs, error } = await supabase
          .from("profiles")
          .select("id, username, avatar_url")
          .in("id", ids)
          .limit(100);
        if (error) throw error;
        const map: ProfileMap = {};
        (profs ?? []).forEach((p) => {
          map[p.id] = { username: p.username, avatar_url: p.avatar_url ?? null };
        });
        setProfiles(map);
      } else {
        setProfiles({});
      }
    } catch (e: unknown) {
      toast({
        title: "Could not load game",
        description: e instanceof Error ? e.message : "Failed to fetch game data",
        variant: "destructive",
      });
      navigate("/");
    } finally {
      setLoading(false);
    }
  };

  const playerPositions = useMemo(() => {
    if (!game) return [];
    const tokenByUser = new Map(seats.map((s) => [s.user_id, s.token]));
    return game.state.players.map((p) => ({
      user_id: p.user_id,
      token: tokenByUser.get(p.user_id) ?? "top-hat",
      position: p.position,
    }));
  }, [game, seats]);

  const propertyOwners = useMemo(() => {
    if (!game) return [];
    return (game.state.properties ?? [])
      .filter((p) => p.owner_user_id)
      .map((p) => {
        const seat = seats.find((s) => s.user_id === p.owner_user_id);
        const profile = p.owner_user_id ? profiles[p.owner_user_id] : null;
        return {
          tile_index: p.tile_index,
          owner_user_id: p.owner_user_id,
          token: seat?.token,
          label: profile?.username ?? "Player",
        };
      });
  }, [game, profiles, seats]);

  const isMyTurn = !!game && game.current_turn_player_id === user?.id;
  const me = game?.state.players.find((p) => p.user_id === user?.id);
  const activePlayer = game?.state.players.find((p) => p.user_id === game.current_turn_player_id);
  const activeProfile = activePlayer ? profiles[activePlayer.user_id] : null;
  const activeSeat = activePlayer ? seats.find((s) => s.user_id === activePlayer.user_id) : null;
  const activeTok = activeSeat ? TOKENS.find((t) => t.id === activeSeat.token) : null;
  const currentTile = me ? BOARD[me.position] : null;
  const timerSec = remainingMs == null ? null : Math.max(0, Math.ceil(remainingMs / 1000));
  const ownedProperties = (game?.state.properties ?? [])
    .filter((p) => p.owner_user_id)
    .map((p) => ({ ...p, tile: BOARD[p.tile_index] }))
    .filter((p) => p.tile?.price)
    .sort((a, b) => a.tile_index - b.tile_index);
  const myProperties = ownedProperties.filter((p) => p.owner_user_id === user?.id);
  const buyableTile =
    currentTile?.price && game?.state.phase === "awaiting_buy_or_auction"
      ? currentTile
      : null;
  const canAffordCurrentTile = !!buyableTile && !!me && me.money >= (buyableTile.price ?? 0);

  const callAction = async (action: "roll_dice" | "end_turn" | "buy_property" | "skip_buy") => {
    if (!gameId) return;
    setActing(true);
    try {
      const data = await invokeGameAction({ action, game_id: gameId });
      if (data?.error) throw new Error(data.error);
      const d1 = typeof data?.d1 === "number" ? data.d1 : null;
      const d2 = typeof data?.d2 === "number" ? data.d2 : null;
      if (action === "roll_dice" && d1 && d2) {
        // brief animated reveal
        let ticks = 0;
        const t = setInterval(() => {
          ticks++;
          setRollAnim([1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)]);
          if (ticks >= 6) { clearInterval(t); setRollAnim([d1, d2]); }
        }, 80);
      }
    } catch (e: unknown) {
      toast({ title: "Action failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setActing(false);
    }
  };

  const handleTrade = async () => {
    if (!gameId || !tradeTile || !tradeTarget) return;
    setActing(true);
    try {
      const data = await invokeGameAction({
        action: "trade_property",
        game_id: gameId,
        tile_index: Number(tradeTile),
        to_user_id: tradeTarget,
      });
      if (data?.error) throw new Error(data.error);
      setTradeTile("");
      setTradeTarget("");
      void load();
    } catch (e: unknown) {
      toast({ title: "Trade failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setActing(false);
    }
  };

  const handleLeave = async () => {
    if (!gameId || !user) return;
    await supabase.from("game_players").delete().eq("game_id", gameId).eq("user_id", user.id);
    navigate("/");
  };

  if (loading || !game) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const lastRoll = rollAnim ?? game.state.last_roll;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container flex items-center justify-between py-4 gap-3">
          <div className="flex items-center gap-3">
            <Link to="/"><Button variant="ghost" size="icon" aria-label="Back"><ArrowLeft className="h-4 w-4" /></Button></Link>
            <MonoployezLogo size="sm" />
          </div>
          <Button variant="outline" size="sm" onClick={handleLeave}>
            <LogOut className="h-4 w-4 mr-2" /> Leave
          </Button>
        </div>
      </header>

      <main className="container py-6 grid lg:grid-cols-[1fr_360px] gap-6">
        <div>
          <div className="mb-4 flex items-baseline justify-between gap-3 flex-wrap">
            <h1 className="font-display text-3xl font-black">{game.name}</h1>
            <div className="flex items-center gap-2">
              <Badge variant={isMyTurn ? "default" : "outline"} className="gap-1">
                <span className="text-base">{activeTok?.emoji ?? "🎲"}</span>
                {isMyTurn ? "Your turn" : `${activeProfile?.username ?? "Player"}'s turn`}
              </Badge>
              {timerSec != null && (
                <Badge variant="outline" className="font-condensed">
                  {timerSec}s
                </Badge>
              )}
            </div>
          </div>
          <MonoployezBoard playerPositions={playerPositions} propertyOwners={propertyOwners}>
            <div className="text-center space-y-4">
              <div className="monoployez-title text-2xl md:text-4xl">MONOPLOYEZ GO</div>
              <div className="flex items-center justify-center gap-3 text-5xl md:text-6xl">
                <span className="text-foreground">{lastRoll ? DICE_FACES[lastRoll[0] - 1] : "·"}</span>
                <span className="text-foreground">{lastRoll ? DICE_FACES[lastRoll[1] - 1] : "·"}</span>
              </div>
              {lastRoll && (
                <div className="text-sm text-muted-foreground font-condensed">
                  Rolled {lastRoll[0]} + {lastRoll[1]} = <strong>{lastRoll[0] + lastRoll[1]}</strong>
                </div>
              )}
            </div>
          </MonoployezBoard>
        </div>

        <aside className="space-y-4">
          <Card className="p-4">
            <h3 className="font-display text-lg font-bold mb-3">30s action</h3>
            {isMyTurn ? (
              <div className="space-y-2">
                {buyableTile ? (
                  <>
                    <div className="rounded-md border bg-muted/40 p-3 text-sm">
                      <div className="font-medium text-foreground">{buyableTile.name}</div>
                      <div className="text-muted-foreground">
                        Buy for ${buyableTile.price}
                        {timerSec != null ? ` before ${timerSec}s` : ""}
                      </div>
                    </div>
                    <Button
                      onClick={() => callAction("buy_property")}
                      disabled={acting || !canAffordCurrentTile}
                      className="w-full"
                    >
                      Buy place
                    </Button>
                    <Button
                      onClick={() => callAction("skip_buy")}
                      disabled={acting}
                      variant="outline"
                      className="w-full"
                    >
                      {canAffordCurrentTile ? "Pass place" : "No money - pass place"}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      onClick={() => callAction("roll_dice")}
                      disabled={acting || game.state.phase !== "rolling"}
                      className="w-full"
                    >
                      <Dice5 className="h-4 w-4 mr-2" /> Roll dice
                    </Button>
                    <Button
                      onClick={() => callAction("end_turn")}
                      disabled={acting || game.state.phase !== "rolled"}
                      variant="outline"
                      className="w-full"
                    >
                      {game.state.doubles_count > 0 && !me?.in_jail ? "Move again (doubles)" : "Move / end turn"}
                    </Button>
                  </>
                )}
                {currentTile && (
                  <div className="text-xs text-muted-foreground pt-2 border-t mt-2">
                    You're on <strong className="text-foreground">{currentTile.name}</strong>
                    {currentTile.price ? ` ($${currentTile.price})` : ""}.
                  </div>
                )}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">
                Waiting for <strong className="text-foreground">{activeProfile?.username ?? "player"}</strong> to act…
              </div>
            )}
          </Card>

          <Card className="p-4">
            <h3 className="font-display text-lg font-bold mb-3 flex items-center gap-2">
              <ArrowRightLeft className="h-4 w-4" /> Trade place
            </h3>
            {myProperties.length > 0 ? (
              <div className="space-y-2">
                <Select value={tradeTile} onValueChange={setTradeTile}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose your place" />
                  </SelectTrigger>
                  <SelectContent>
                    {myProperties.map((p) => (
                      <SelectItem key={p.tile_index} value={String(p.tile_index)}>
                        {p.tile.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={tradeTarget} onValueChange={setTradeTarget}>
                  <SelectTrigger>
                    <SelectValue placeholder="Trade to player" />
                  </SelectTrigger>
                  <SelectContent>
                    {game.state.players
                      .filter((p) => p.user_id !== user?.id)
                      .map((p) => (
                        <SelectItem key={p.user_id} value={p.user_id}>
                          {profiles[p.user_id]?.username ?? "Player"}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <Button
                  onClick={handleTrade}
                  disabled={acting || !tradeTile || !tradeTarget}
                  variant="outline"
                  className="w-full"
                >
                  Trade place
                </Button>
                <p className="text-xs text-muted-foreground">
                  Trade is a 30s option and transfers ownership immediately for now.
                </p>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">Buy a place first, then it can be traded.</div>
            )}
          </Card>

          <Card className="p-4">
            <h3 className="font-display text-lg font-bold mb-3">Players</h3>
            <ul className="space-y-2">
              {game.state.players.map((p) => {
                const seat = seats.find((s) => s.user_id === p.user_id);
                const tok = TOKENS.find((t) => t.id === seat?.token);
                const prof = profiles[p.user_id];
                const active = p.user_id === game.current_turn_player_id;
                return (
                  <li
                    key={p.user_id}
                    className={`flex items-center gap-3 p-2 rounded-md ${active ? "bg-primary/10 ring-1 ring-primary" : "bg-muted/50"}`}
                  >
                    <span className="text-2xl" aria-hidden>{tok?.emoji ?? "🎲"}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate flex items-center gap-1">
                        {prof?.username ?? "Player"}
                        {p.user_id === game.host_id && <Crown className="h-3 w-3 text-accent" />}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {BOARD[p.position]?.name}{p.in_jail ? " • In Jail" : ""}
                      </div>
                    </div>
                    <Badge variant="outline" className="font-condensed">${p.money}</Badge>
                  </li>
                );
              })}
            </ul>
          </Card>

          <Card className="p-4">
            <h3 className="font-display text-lg font-bold mb-3">Places bought</h3>
            {ownedProperties.length === 0 ? (
              <div className="text-sm text-muted-foreground">No places bought yet.</div>
            ) : (
              <ul className="space-y-2">
                {ownedProperties.map((p) => {
                  const owner = profiles[p.owner_user_id ?? ""]?.username ?? "Player";
                  const seat = seats.find((s) => s.user_id === p.owner_user_id);
                  const tok = TOKENS.find((t) => t.id === seat?.token);
                  return (
                    <li key={p.tile_index} className="flex items-center justify-between gap-3 rounded-md bg-muted/50 p-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{p.tile.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {tok?.emoji ?? "🎲"} {owner}
                        </div>
                      </div>
                      <Badge variant="outline">${p.tile.price}</Badge>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card className="p-4">
            <h3 className="font-display text-lg font-bold mb-3">Game log</h3>
            <ul className="space-y-1 text-xs text-muted-foreground font-condensed max-h-48 overflow-y-auto">
              {game.state.log_tail.slice().reverse().map((line, i) => (
                <li key={i} className={i === 0 ? "text-foreground" : ""}>{line}</li>
              ))}
            </ul>
          </Card>

          {gameId && <GameChat gameId={gameId} title="Game chat" />}
        </aside>
      </main>
    </div>
  );
}
