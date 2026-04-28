import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { MonoployezLogo } from "@/components/MonoployezLogo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useToast } from "@/hooks/use-toast";
import { formatError } from "@/lib/errors";
import { Loader2, Plus, LogOut, Users, Lock, Globe, Hash } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { subscribeToPublicLobby } from "@/integrations/supabase/realtime";

interface LobbyGame {
  id: string;
  name: string;
  host_id: string;
  is_private: boolean;
  max_players: number;
  starting_money: number;
  created_at: string;
  player_count?: number;
}

interface Profile {
  username: string;
  avatar_url: string | null;
  games_played: number;
  games_won: number;
}

const generateInviteCode = () =>
  Array.from({ length: 6 }, () =>
    "ABCDEFGHJKMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 31)]
  ).join("");

export default function Home() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [games, setGames] = useState<LobbyGame[]>([]);
  const [loading, setLoading] = useState(true);

  // Create form
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [startingMoney, setStartingMoney] = useState(1500);
  const [gameDurationHours, setGameDurationHours] = useState(2);
  const [creating, setCreating] = useState(false);

  // Join by code
  const [joinCode, setJoinCode] = useState("");

  useEffect(() => {
    if (!user) return;
    void loadProfile();
    void loadGames();

    const unsub = subscribeToPublicLobby(() => void loadGames());
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const loadProfile = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("profiles")
      .select("username, avatar_url, games_played, games_won")
      .eq("id", user.id)
      .maybeSingle();
    if (error) {
      toast({ title: "Could not load profile", description: error.message, variant: "destructive" });
      setProfile(null);
      return;
    }
    if (!data) {
      setProfile(null);
      return;
    }
    setProfile({
      username: data.username,
      avatar_url: data.avatar_url ?? null,
      games_played: data.games_played ?? 0,
      games_won: data.games_won ?? 0,
    });
  };

  const loadGames = async () => {
    try {
      const { data, error } = await supabase
        .from("games")
        .select("id, name, host_id, is_private, max_players, starting_money, created_at")
        .eq("status", "lobby")
        .eq("is_private", false)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;

      const ids = (data ?? []).map((g) => g.id);
      let counts: Record<string, number> = {};
      if (ids.length) {
        const { data: ps, error: pErr } = await supabase
          .from("game_players")
          .select("game_id")
          .in("game_id", ids);
        if (pErr) throw pErr;
        counts = (ps ?? []).reduce<Record<string, number>>((acc, row: { game_id: string }) => {
          acc[row.game_id] = (acc[row.game_id] ?? 0) + 1;
          return acc;
        }, {});
      }

      setGames(
        (data ?? []).map((g) => ({
          id: g.id,
          name: g.name,
          host_id: g.host_id,
          is_private: g.is_private,
          max_players: g.max_players,
          starting_money: g.starting_money,
          created_at: g.created_at,
          player_count: counts[g.id] ?? 0,
        }))
      );
    } catch (err: unknown) {
      toast({ title: "Could not load games", description: formatError(err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setCreating(true);
    try {
      const inviteCode = isPrivate ? generateInviteCode() : null;
      const { data: game, error } = await supabase
        .from("games")
        .insert({
          name: name.trim() || `${profile?.username ?? "Player"}'s game`,
          host_id: user.id,
          status: "lobby",
          is_private: isPrivate,
          invite_code: inviteCode,
          max_players: maxPlayers,
          starting_money: startingMoney,
          game_duration_hours: gameDurationHours,
          state: null,
        })
        .select("id")
        .single();
      if (error) throw error;

      // Auto-join host as seat 0
      const { error: pErr } = await supabase.from("game_players").insert({
        game_id: game.id,
        user_id: user.id,
        seat_index: 0,
        token: "top-hat",
        is_ready: false,
      });
      if (pErr) throw pErr;

      setCreateOpen(false);
      navigate(`/lobby/${game.id}`);
    } catch (err: unknown) {
      toast({ title: "Could not create game", description: formatError(err), variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const handleJoin = async (gameId: string) => {
    if (!user) return;
    const { data: existing, error } = await supabase
      .from("game_players")
      .select("user_id, seat_index, token")
      .eq("game_id", gameId);
    if (error) {
      toast({ title: "Could not join", description: error.message, variant: "destructive" });
      return;
    }
    if ((existing ?? []).some((p: { user_id: string }) => p.user_id === user.id)) {
      navigate(`/lobby/${gameId}`);
      return;
    }
    const seats = new Set((existing ?? []).map((p: { seat_index: number }) => p.seat_index));
    const tokens = new Set((existing ?? []).map((p: { token: string }) => p.token));
    const TOKEN_IDS = ["top-hat", "car", "dog", "cat", "ship", "boot", "thimble", "wheelbarrow"];
    let seat = 0;
    while (seats.has(seat)) seat++;
    const token = TOKEN_IDS.find((t) => !tokens.has(t)) ?? "top-hat";

    try {
      const { error: jErr } = await supabase.from("game_players").insert({
        game_id: gameId,
        user_id: user.id,
        seat_index: seat,
        token,
        is_ready: false,
      });
      if (jErr) throw jErr;
      navigate(`/lobby/${gameId}`);
    } catch (err: unknown) {
      if (err && typeof err === "object" && "code" in err && err.code === "23505") {
        navigate(`/lobby/${gameId}`);
        return;
      }
      toast({ title: "Could not join", description: formatError(err), variant: "destructive" });
    }
  };

  const handleJoinByCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = joinCode.trim().toUpperCase();
    if (code.length !== 6) return;
    try {
      // Public invite-code support, if a public game ever has an invite_code.
      // Private lobbies are intentionally joined through the RPC below so their
      // rows do not need to be broadly visible through RLS.
      const { data: g, error } = await supabase
        .from("games")
        .select("id, status, is_private")
        .eq("invite_code", code)
        .maybeSingle();
      if (error) throw error;

      if (g && !g.is_private) {
        if (g.status !== "lobby") {
          toast({ title: "Game already started", variant: "destructive" });
          return;
        }
        await handleJoin(g.id);
        return;
      }

      const { data: gameId, error: inviteError } = await supabase.rpc(
        "join_private_game_by_invite_code",
        { p_invite_code: code }
      );
      if (inviteError) throw inviteError;
      if (!gameId) {
        toast({ title: "Invite code not found", variant: "destructive" });
        return;
      }

      navigate(`/lobby/${gameId}`);
    } catch (err: unknown) {
      toast({ title: "Invite code lookup failed", description: formatError(err), variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container flex items-center justify-between py-4">
          <Link to="/"><MonoployezLogo size="sm" /></Link>
          <div className="flex items-center gap-3">
            {profile && (
              <div className="hidden sm:flex flex-col items-end leading-tight">
                <span className="font-condensed text-sm">{profile.username}</span>
                <span className="text-xs text-muted-foreground">
                  {profile.games_won}W · {profile.games_played}P
                </span>
              </div>
            )}
            <ThemeToggle />
            <Button variant="ghost" size="icon" onClick={() => signOut()} aria-label="Sign out">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="container py-8 space-y-8">
        <section className="grid md:grid-cols-3 gap-6">
          <Card className="md:col-span-2 p-6 bg-felt text-primary-foreground shadow-elevated">
            <h1 className="font-display text-3xl md:text-4xl font-black mb-2">
              Welcome back, <span className="gold-text">{profile?.username ?? "Player"}</span>
            </h1>
            <p className="text-primary-foreground/80 mb-6 max-w-md">
              Create a new game, jump into a public lobby, or join your friends with an invite code.
            </p>
            <div className="flex flex-wrap gap-3">
              <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogTrigger asChild>
                  <Button size="lg" className="bg-accent text-accent-foreground hover:bg-accent/90">
                    <Plus className="h-4 w-4 mr-2" /> Create game
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>New game</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleCreate} className="space-y-4">
                    <div>
                      <Label htmlFor="g-name">Game name</Label>
                      <Input id="g-name" value={name} onChange={(e) => setName(e.target.value)}
                        placeholder={`${profile?.username ?? "Player"}'s game`} maxLength={50} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="g-max">Max players</Label>
                        <Input id="g-max" type="number" min={2} max={8}
                          value={maxPlayers} onChange={(e) => setMaxPlayers(+e.target.value)} />
                      </div>
                      <div>
                        <Label htmlFor="g-money">Starting $</Label>
                        <Input id="g-money" type="number" min={500} max={25000} step={100}
                          value={startingMoney} onChange={(e) => setStartingMoney(+e.target.value)} />
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="g-duration">Game time limit (hours)</Label>
                      <Input
                        id="g-duration"
                        type="number"
                        min={1}
                        max={4}
                        step={1}
                        value={gameDurationHours}
                        onChange={(e) => setGameDurationHours(Math.min(4, Math.max(1, +e.target.value || 1)))}
                      />
                    </div>
                    <div className="flex items-center justify-between rounded-md border p-3">
                      <div className="flex items-center gap-2">
                        {isPrivate ? <Lock className="h-4 w-4" /> : <Globe className="h-4 w-4" />}
                        <span className="text-sm font-medium">
                          {isPrivate ? "Private (invite only)" : "Public lobby"}
                        </span>
                      </div>
                      <Switch checked={isPrivate} onCheckedChange={setIsPrivate} />
                    </div>
                    <DialogFooter>
                      <Button type="submit" disabled={creating}>
                        {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create"}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>

              <form onSubmit={handleJoinByCode} className="flex gap-2">
                <div className="relative">
                  <Hash className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                    placeholder="INVITE"
                    maxLength={6}
                    className="pl-8 w-32 bg-background text-foreground font-condensed tracking-widest"
                  />
                </div>
                <Button type="submit" variant="outline" className="bg-background/10 border-primary-foreground/30 text-primary-foreground hover:bg-background/20">
                  Join
                </Button>
              </form>
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="font-display text-xl font-bold mb-3">Your stats</h3>
            <div className="space-y-2">
              <div className="flex justify-between"><span className="text-muted-foreground">Games played</span><span className="font-bold">{profile?.games_played ?? 0}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Games won</span><span className="font-bold">{profile?.games_won ?? 0}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Win rate</span>
                <span className="font-bold">
                  {profile && profile.games_played > 0
                    ? `${Math.round((profile.games_won / profile.games_played) * 100)}%`
                    : "—"}
                </span>
              </div>
            </div>
          </Card>
        </section>

        <section>
          <h2 className="font-display text-2xl font-bold mb-4 flex items-center gap-2">
            <Globe className="h-5 w-5" /> Public lobbies
          </h2>
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : games.length === 0 ? (
            <Card className="p-12 text-center text-muted-foreground">
              No open lobbies right now. Be the first to create one!
            </Card>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {games.map((g) => (
                <Card key={g.id} className="p-5 flex flex-col gap-3 hover:shadow-elevated transition-shadow">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-display text-lg font-bold leading-tight">{g.name}</h3>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Users className="h-3 w-3" />{g.player_count}/{g.max_players}</span>
                    <span>${g.starting_money} start</span>
                  </div>
                  <Button
                    onClick={() => handleJoin(g.id)}
                    disabled={(g.player_count ?? 0) >= g.max_players}
                    className="mt-auto"
                  >
                    {(g.player_count ?? 0) >= g.max_players ? "Full" : "Join"}
                  </Button>
                </Card>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
