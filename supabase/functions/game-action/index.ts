// Supabase Edge Function: server-authoritative Monoployez Go turn engine.
// Actions: start_game, roll_dice, buy_property, skip_buy, trade_property, end_turn, tick_turn
//
// Uses SERVICE_ROLE (function env) to update game state while validating caller JWT.

import { createClient } from "jsr:@supabase/supabase-js@2";

type Json = Record<string, unknown> | unknown[] | string | number | boolean | null;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(status: number, body: Json) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function nowIso() {
  return new Date().toISOString();
}

function plusSecondsIso(sec: number) {
  return new Date(Date.now() + sec * 1000).toISOString();
}

function randDie() {
  return 1 + Math.floor(Math.random() * 6);
}

const ACTION_SECONDS = 30;
const MAX_MONEY = 25000;
const MAX_BODY_BYTES = 2048;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_ACTIONS = new Set([
  "start_game",
  "roll_dice",
  "buy_property",
  "build_house",
  "build_hotel",
  "skip_buy",
  "trade_property",
  "end_turn",
  "tick_turn",
]);

type GameStatus = "lobby" | "in_progress" | "finished" | "abandoned";
type GamePhase = "rolling" | "resolving_tile" | "awaiting_buy_or_auction" | "awaiting_trade" | "ended" | "rolled";

type PlayerState = {
  user_id: string;
  position: number;
  money: number;
  in_jail: boolean;
  jail_turns: number;
  bankrupt: boolean;
};

type PropertyState = {
  tile_index: number;
  owner_user_id: string | null;
  mortgaged: boolean;
  houses: number;
};

type GameState = {
  version: number;
  players: PlayerState[];
  turn_order: string[];
  current_turn_user_id: string | null;
  turn_ends_at: string | null;
  game_ends_at?: string | null;
  winner_user_id?: string | null;
  last_roll: [number, number] | null;
  doubles_count: number;
  phase: GamePhase;
  properties: PropertyState[];
  log_tail: string[];
};

type BuyableTile = {
  name: string;
  price: number;
  rent: number;
  kind: "property" | "railroad" | "utility";
  group?: "brown" | "lightblue" | "pink" | "orange" | "red" | "yellow" | "green" | "darkblue";
  rentLevels?: [number, number, number, number, number, number];
};

const BUYABLE_TILES: Record<number, BuyableTile> = {
  1: { name: "Mediterranean Ave", price: 60, rent: 2, kind: "property", group: "brown", rentLevels: [2, 10, 30, 90, 160, 250] },
  3: { name: "Baltic Ave", price: 60, rent: 4, kind: "property", group: "brown", rentLevels: [4, 20, 60, 180, 320, 450] },
  5: { name: "Reading Railroad", price: 200, rent: 25, kind: "railroad" },
  6: { name: "Oriental Ave", price: 100, rent: 6, kind: "property", group: "lightblue", rentLevels: [6, 30, 90, 270, 400, 550] },
  8: { name: "Vermont Ave", price: 100, rent: 6, kind: "property", group: "lightblue", rentLevels: [6, 30, 90, 270, 400, 550] },
  9: { name: "Connecticut Ave", price: 120, rent: 8, kind: "property", group: "lightblue", rentLevels: [8, 40, 100, 300, 450, 600] },
  11: { name: "St. Charles Place", price: 140, rent: 10, kind: "property", group: "pink", rentLevels: [10, 50, 150, 450, 625, 750] },
  12: { name: "Electric Company", price: 150, rent: 10, kind: "utility" },
  13: { name: "States Ave", price: 140, rent: 10, kind: "property", group: "pink", rentLevels: [10, 50, 150, 450, 625, 750] },
  14: { name: "Virginia Ave", price: 160, rent: 12, kind: "property", group: "pink", rentLevels: [12, 60, 180, 500, 700, 900] },
  15: { name: "Pennsylvania Railroad", price: 200, rent: 25, kind: "railroad" },
  16: { name: "St. James Place", price: 180, rent: 14, kind: "property", group: "orange", rentLevels: [14, 70, 200, 550, 750, 950] },
  18: { name: "Tennessee Ave", price: 180, rent: 14, kind: "property", group: "orange", rentLevels: [14, 70, 200, 550, 750, 950] },
  19: { name: "New York Ave", price: 200, rent: 16, kind: "property", group: "orange", rentLevels: [16, 80, 220, 600, 800, 1000] },
  21: { name: "Kentucky Ave", price: 220, rent: 18, kind: "property", group: "red", rentLevels: [18, 90, 250, 700, 875, 1050] },
  23: { name: "Indiana Ave", price: 220, rent: 18, kind: "property", group: "red", rentLevels: [18, 90, 250, 700, 875, 1050] },
  24: { name: "Illinois Ave", price: 240, rent: 20, kind: "property", group: "red", rentLevels: [20, 100, 300, 750, 925, 1100] },
  25: { name: "B. & O. Railroad", price: 200, rent: 25, kind: "railroad" },
  26: { name: "Atlantic Ave", price: 260, rent: 22, kind: "property", group: "yellow", rentLevels: [22, 110, 330, 800, 975, 1150] },
  27: { name: "Ventnor Ave", price: 260, rent: 22, kind: "property", group: "yellow", rentLevels: [22, 110, 330, 800, 975, 1150] },
  28: { name: "Water Works", price: 150, rent: 10, kind: "utility" },
  29: { name: "Marvin Gardens", price: 280, rent: 24, kind: "property", group: "yellow", rentLevels: [24, 120, 360, 850, 1025, 1200] },
  31: { name: "Pacific Ave", price: 300, rent: 26, kind: "property", group: "green", rentLevels: [26, 130, 390, 900, 1100, 1275] },
  32: { name: "North Carolina Ave", price: 300, rent: 26, kind: "property", group: "green", rentLevels: [26, 130, 390, 900, 1100, 1275] },
  34: { name: "Pennsylvania Ave", price: 320, rent: 28, kind: "property", group: "green", rentLevels: [28, 150, 450, 1000, 1200, 1400] },
  35: { name: "Short Line", price: 200, rent: 25, kind: "railroad" },
  37: { name: "Park Place", price: 350, rent: 35, kind: "property", group: "darkblue", rentLevels: [35, 175, 500, 1100, 1300, 1500] },
  39: { name: "Boardwalk", price: 400, rent: 50, kind: "property", group: "darkblue", rentLevels: [50, 200, 600, 1400, 1700, 2000] },
};

const BUILD_COST_BY_GROUP: Record<NonNullable<BuyableTile["group"]>, number> = {
  brown: 50,
  lightblue: 50,
  pink: 100,
  orange: 100,
  red: 150,
  yellow: 150,
  green: 200,
  darkblue: 200,
};

function tailLog(state: GameState, line: string) {
  const tail = Array.isArray(state.log_tail) ? state.log_tail : [];
  state.log_tail = [...tail.slice(-9), line];
}

function getPlayer(state: GameState, userId: string) {
  return state.players.find((p) => p.user_id === userId) ?? null;
}

function activePlayers(state: GameState) {
  return state.players.filter((p) => !p.bankrupt);
}

function capMoney(value: number) {
  return Math.max(0, Math.min(MAX_MONEY, value));
}

function getProperty(state: GameState, tileIndex: number) {
  return state.properties.find((p) => p.tile_index === tileIndex) ?? null;
}

function calculateRent(tile: BuyableTile, property: PropertyState, lastRoll: [number, number] | null) {
  if (tile.kind === "utility") {
    const rollTotal = lastRoll ? lastRoll[0] + lastRoll[1] : 10;
    return rollTotal * 4;
  }
  if (tile.kind === "railroad") return tile.rent;
  return tile.rentLevels?.[Math.min(5, Math.max(0, property.houses ?? 0))] ?? tile.rent;
}

function buildCost(tile: BuyableTile) {
  return tile.group ? BUILD_COST_BY_GROUP[tile.group] : null;
}

function propertyValue(property: PropertyState) {
  const tile = BUYABLE_TILES[property.tile_index];
  if (!tile) return 0;
  const cost = buildCost(tile) ?? 0;
  return tile.price + cost * Math.min(5, Math.max(0, property.houses ?? 0));
}

function netWorth(state: GameState, userId: string) {
  const player = getPlayer(state, userId);
  const ownedValue = state.properties
    .filter((p) => p.owner_user_id === userId)
    .reduce((sum, property) => sum + propertyValue(property), 0);
  return (player?.money ?? 0) + ownedValue;
}

function wealthByUser(state: GameState) {
  return state.players.map((p) => ({
    user_id: p.user_id,
    money: p.money ?? 0,
    property_value: state.properties
      .filter((property) => property.owner_user_id === p.user_id)
      .reduce((sum, property) => sum + propertyValue(property), 0),
    net_worth: netWorth(state, p.user_id),
  }));
}

function finishGameByWealth(state: GameState) {
  const ranking = wealthByUser(state).sort((a, b) => b.net_worth - a.net_worth);
  state.phase = "ended";
  state.current_turn_user_id = null;
  state.turn_ends_at = null;
  state.winner_user_id = ranking[0]?.user_id ?? null;
  tailLog(state, state.winner_user_id ? "Time limit reached. Winner decided by net worth." : "Game ended.");
}

function computeWinner(state: GameState): string | null {
  const alive = activePlayers(state);
  if (alive.length === 1) return alive[0].user_id;
  return null;
}

export default async function handler(req: Request) {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (contentLength > MAX_BODY_BYTES) return json(413, { error: "Request body too large" });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) return json(500, { error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" });

    // Create supabase client with the caller's JWT for auth.uid() validation, but service role for writes.
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!jwt) return json(401, { error: "Missing bearer token" });

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });

    const { data: auth, error: authErr } = await admin.auth.getUser(jwt);
    if (authErr || !auth?.user) return json(401, { error: "Unauthorized" });
    const userId = auth.user.id;

    const body = await req.json().catch(() => ({}));
    const reqBody = body as Record<string, unknown>;
    const action = reqBody?.action as string | undefined;
    const gameId = reqBody?.game_id as string | undefined;
    if (!action || !gameId) return json(400, { error: "Missing action or game_id" });
    if (!ALLOWED_ACTIONS.has(action)) return json(400, { error: "Unknown action" });
    if (!UUID_RE.test(gameId)) return json(400, { error: "Invalid game_id" });

    // Load game + seats
    const { data: game, error: gErr } = await admin
      .from("games")
      .select("id, host_id, status, starting_money, max_players, game_duration_hours, state")
      .eq("id", gameId)
      .maybeSingle();
    if (gErr) return json(500, { error: gErr.message });
    if (!game) return json(404, { error: "Game not found" });

    const { data: seats, error: sErr } = await admin
      .from("game_players")
      .select("user_id, seat_index, token, is_ready")
      .eq("game_id", gameId)
      .order("seat_index", { ascending: true });
    if (sErr) return json(500, { error: sErr.message });
    const isMember = (seats ?? []).some((p) => p.user_id === userId);
    if (!isMember) return json(403, { error: "Not a member" });

    if (action === "start_game") {
      if ((game.status as GameStatus) !== "lobby") return json(400, { error: "Already started" });
      if (game.host_id !== userId) return json(403, { error: "Only host can start" });
      if ((seats ?? []).length < 2) return json(400, { error: "Need at least 2 players" });
      const nonHostReady = (seats ?? []).filter((p) => p.user_id !== game.host_id).every((p) => !!p.is_ready);
      if (!nonHostReady) return json(400, { error: "Waiting for players to ready up" });

      const turnOrder = (seats ?? []).map((s) => s.user_id);
      const startingMoney = capMoney((game.starting_money as number) ?? 1500);
      const gameDurationHours = Math.min(4, Math.max(1, (game.game_duration_hours as number) ?? 2));
      const state: GameState = {
        version: 1,
        players: (seats ?? []).map((s) => ({
          user_id: s.user_id,
          position: 0,
          money: startingMoney,
          in_jail: false,
          jail_turns: 0,
          bankrupt: false,
        })),
        turn_order: turnOrder,
        current_turn_user_id: turnOrder[0] ?? null,
        turn_ends_at: plusSecondsIso(ACTION_SECONDS),
        game_ends_at: plusSecondsIso(gameDurationHours * 60 * 60),
        winner_user_id: null,
        last_roll: null,
        doubles_count: 0,
        phase: "rolling",
        properties: Array.from({ length: 40 }, (_v, i) => ({
          tile_index: i,
          owner_user_id: null,
          mortgaged: false,
          houses: 0,
        })),
        log_tail: ["Game started."],
      };

      const { error: uErr } = await admin.from("games").update({
        status: "in_progress",
        state,
      }).eq("id", gameId);
      if (uErr) return json(500, { error: uErr.message });
      return json(200, { ok: true });
    }

    if ((game.status as GameStatus) !== "in_progress") return json(400, { error: "Game not in progress" });

    const state = (game.state as GameState | null) ?? null;
    if (!state) return json(500, { error: "Missing game state" });
    if (!Array.isArray(state.properties)) {
      state.properties = Array.from({ length: 40 }, (_v, i) => ({
        tile_index: i,
        owner_user_id: null,
        mortgaged: false,
        houses: 0,
      }));
    }
    if (state.phase !== "ended" && state.game_ends_at && Date.now() >= Date.parse(state.game_ends_at)) {
      finishGameByWealth(state);
      const { error: uErr } = await admin.from("games").update({ status: "finished", state }).eq("id", gameId);
      if (uErr) return json(500, { error: uErr.message });
      return json(200, { ok: true, game_over: true, winner_user_id: state.winner_user_id, wealth: wealthByUser(state) });
    }

    const isMyTurn = state.current_turn_user_id === userId;

    const doAdvanceTurn = () => {
      const order = state.turn_order ?? [];
      const alive = new Set(activePlayers(state).map((p) => p.user_id));
      const idx = order.indexOf(state.current_turn_user_id ?? "");
      for (let i = 1; i <= order.length; i++) {
        const next = order[(Math.max(idx, 0) + i) % order.length];
        if (alive.has(next)) {
          state.current_turn_user_id = next;
          state.turn_ends_at = plusSecondsIso(ACTION_SECONDS);
          state.phase = "rolling";
          state.doubles_count = 0;
          state.last_roll = null;
          tailLog(state, "Turn passed.");
          return;
        }
      }
    };

    const finishTurnOrAllowDoubles = () => {
      const me = state.current_turn_user_id ? getPlayer(state, state.current_turn_user_id) : null;
      const justJailed = !!me?.in_jail;
      const rolledDoubles = (state.doubles_count ?? 0) > 0 && !justJailed;

      if (rolledDoubles) {
        state.phase = "rolling";
        state.turn_ends_at = plusSecondsIso(ACTION_SECONDS);
        tailLog(state, "Doubles — roll again.");
        return;
      }

      doAdvanceTurn();
    };

    if (action === "tick_turn") {
      const ends = state.turn_ends_at ? Date.parse(state.turn_ends_at) : null;
      if (!ends) return json(200, { ok: true });
      if (Date.now() < ends) return json(200, { ok: true, remaining_ms: ends - Date.now() });
      if (state.game_ends_at && Date.now() >= Date.parse(state.game_ends_at)) {
        finishGameByWealth(state);
        const { error: uErr } = await admin.from("games").update({ status: "finished", state }).eq("id", gameId);
        if (uErr) return json(500, { error: uErr.message });
        return json(200, { ok: true, game_over: true, winner_user_id: state.winner_user_id, wealth: wealthByUser(state) });
      }
      if (state.phase === "awaiting_buy_or_auction") {
        const current = state.current_turn_user_id ? getPlayer(state, state.current_turn_user_id) : null;
        const tile = current ? BUYABLE_TILES[current.position] : null;
        if (tile) tailLog(state, `No purchase made for ${tile.name}.`);
        state.phase = "rolled";
        finishTurnOrAllowDoubles();
      } else {
        doAdvanceTurn();
      }
      const { error: uErr } = await admin.from("games").update({ state }).eq("id", gameId);
      if (uErr) return json(500, { error: uErr.message });
      return json(200, { ok: true, advanced: true });
    }

    if (action === "roll_dice") {
      if (!isMyTurn) return json(403, { error: "Not your turn" });
      if (state.phase !== "rolling") return json(400, { error: "Already rolled this turn" });

      const d1 = randDie();
      const d2 = randDie();
      const isDoubles = d1 === d2;
      const me = getPlayer(state, userId);
      if (!me) return json(403, { error: "Not a member" });

      let logLine = `Rolled ${d1} + ${d2}`;
      let newDoubles = isDoubles ? (state.doubles_count ?? 0) + 1 : 0;

      if (isDoubles && newDoubles >= 3) {
        me.position = 10;
        me.in_jail = true;
        me.jail_turns = 0;
        newDoubles = 0;
        logLine += " — three doubles! Off to Jail.";
      } else {
        const prev = me.position ?? 0;
        const next = (prev + d1 + d2) % 40;
        if (next < prev) {
          me.money = capMoney((me.money ?? 0) + 200);
          logLine += " — passed GO, +$200.";
        }
        me.position = next;
        if (next === 30) {
          me.position = 10;
          me.in_jail = true;
          me.jail_turns = 0;
          logLine += " — Go to Jail!";
        }
      }

      state.last_roll = [d1, d2];
      state.doubles_count = newDoubles;
      state.turn_ends_at = plusSecondsIso(ACTION_SECONDS);
      tailLog(state, logLine);

      const landedTile = BUYABLE_TILES[me.position];
      const property = getProperty(state, me.position);
      if (landedTile && property) {
        if (!property.owner_user_id) {
          state.phase = "awaiting_buy_or_auction";
          state.turn_ends_at = plusSecondsIso(ACTION_SECONDS);
          tailLog(state, `${landedTile.name} is available for $${landedTile.price}.`);
        } else if (property.owner_user_id !== userId) {
          const owner = getPlayer(state, property.owner_user_id);
          const rent = Math.min(calculateRent(landedTile, property, state.last_roll), me.money ?? 0);
          me.money = (me.money ?? 0) - rent;
          if (owner) owner.money = capMoney((owner.money ?? 0) + rent);
          state.phase = "rolled";
          tailLog(state, `Paid $${rent} rent for ${landedTile.name}.`);
        } else {
          state.phase = "rolled";
          tailLog(state, `Landed on your ${landedTile.name}.`);
        }
      } else {
        state.phase = "rolled";
      }

      const winner = computeWinner(state);
      if (winner) {
        tailLog(state, "Game over.");
      }

      const { error: uErr } = await admin.from("games").update({ state }).eq("id", gameId);
      if (uErr) return json(500, { error: uErr.message });
      return json(200, { ok: true, d1, d2, position: me.position });
    }

    if (action === "buy_property") {
      if (!isMyTurn) return json(403, { error: "Not your turn" });
      if (state.phase !== "awaiting_buy_or_auction") return json(400, { error: "No property is waiting to be bought" });

      const me = getPlayer(state, userId);
      if (!me) return json(403, { error: "Not a member" });
      const tile = BUYABLE_TILES[me.position];
      const property = getProperty(state, me.position);
      if (!tile || !property) return json(400, { error: "This space cannot be bought" });
      if (property.owner_user_id) return json(400, { error: "Property already owned" });
      if ((me.money ?? 0) < tile.price) return json(400, { error: "Not enough money to buy this place" });

      me.money = (me.money ?? 0) - tile.price;
      property.owner_user_id = userId;
      state.phase = "rolled";
      state.turn_ends_at = plusSecondsIso(ACTION_SECONDS);
      tailLog(state, `Bought ${tile.name} for $${tile.price}.`);

      const { error: uErr } = await admin.from("games").update({ state }).eq("id", gameId);
      if (uErr) return json(500, { error: uErr.message });
      return json(200, { ok: true, bought: me.position });
    }

    if (action === "build_house" || action === "build_hotel") {
      const tileIndex = Number(reqBody?.tile_index);
      if (!Number.isInteger(tileIndex)) return json(400, { error: "Missing property" });
      const property = getProperty(state, tileIndex);
      const tile = BUYABLE_TILES[tileIndex];
      const me = getPlayer(state, userId);
      if (!property || !tile || !me) return json(400, { error: "This place cannot be built on" });
      if (tile.kind !== "property") return json(400, { error: "Only color properties can build houses or hotels" });
      if (property.owner_user_id !== userId) return json(403, { error: "You do not own this place" });

      const nextLevel = action === "build_hotel" ? 5 : (property.houses ?? 0) + 1;
      if (action === "build_house" && (property.houses ?? 0) >= 4) return json(400, { error: "Build a hotel next" });
      if (action === "build_hotel" && (property.houses ?? 0) !== 4) return json(400, { error: "Build 4 houses before a hotel" });
      const cost = buildCost(tile);
      if (!cost) return json(400, { error: "Build cost not available" });
      if ((me.money ?? 0) < cost) return json(400, { error: "Not enough money to build" });

      me.money = (me.money ?? 0) - cost;
      property.houses = nextLevel;
      state.turn_ends_at = state.current_turn_user_id ? plusSecondsIso(ACTION_SECONDS) : state.turn_ends_at;
      tailLog(state, `${nextLevel === 5 ? "Built a hotel" : `Built house ${nextLevel}`} on ${tile.name} for $${cost}.`);

      const { error: uErr } = await admin.from("games").update({ state }).eq("id", gameId);
      if (uErr) return json(500, { error: uErr.message });
      return json(200, { ok: true, built: tileIndex, level: nextLevel });
    }

    if (action === "skip_buy") {
      if (!isMyTurn) return json(403, { error: "Not your turn" });
      if (state.phase !== "awaiting_buy_or_auction") return json(400, { error: "No property is waiting to be skipped" });

      const me = getPlayer(state, userId);
      const tile = me ? BUYABLE_TILES[me.position] : null;
      if (tile) tailLog(state, `Passed on ${tile.name}; auction/trade option is open for table rules.`);
      state.phase = "rolled";
      finishTurnOrAllowDoubles();

      const { error: uErr } = await admin.from("games").update({ state }).eq("id", gameId);
      if (uErr) return json(500, { error: uErr.message });
      return json(200, { ok: true, skipped: true, next: state.current_turn_user_id });
    }

    if (action === "trade_property") {
      if (!isMember) return json(403, { error: "Not a member" });
      const tileIndex = Number(reqBody?.tile_index);
      const toUserId = reqBody?.to_user_id as string | undefined;
      if (!Number.isInteger(tileIndex) || !toUserId) return json(400, { error: "Missing property or player" });
      if (!(seats ?? []).some((p) => p.user_id === toUserId)) return json(400, { error: "Trade target is not in this game" });
      if (toUserId === userId) return json(400, { error: "Choose another player" });

      const property = getProperty(state, tileIndex);
      const tile = BUYABLE_TILES[tileIndex];
      if (!property || !tile) return json(400, { error: "This space cannot be traded" });
      if (property.owner_user_id !== userId) return json(403, { error: "You do not own this place" });

      property.owner_user_id = toUserId;
      state.phase = state.phase === "awaiting_trade" ? "rolled" : state.phase;
      state.turn_ends_at = state.current_turn_user_id ? plusSecondsIso(ACTION_SECONDS) : state.turn_ends_at;
      tailLog(state, `Traded ${tile.name}.`);

      const { error: uErr } = await admin.from("games").update({ state }).eq("id", gameId);
      if (uErr) return json(500, { error: uErr.message });
      return json(200, { ok: true, traded: tileIndex });
    }

    if (action === "end_turn") {
      if (!isMyTurn) return json(403, { error: "Not your turn" });
      if (state.phase !== "rolled") return json(400, { error: "Roll first" });
      finishTurnOrAllowDoubles();
      const { error: uErr } = await admin.from("games").update({ state }).eq("id", gameId);
      if (uErr) return json(500, { error: uErr.message });
      return json(200, { ok: true, next: state.current_turn_user_id });
    }

    return json(400, { error: "Unknown action" });
  } catch (e: unknown) {
    return json(500, { error: e instanceof Error ? e.message : String(e) });
  }
}
