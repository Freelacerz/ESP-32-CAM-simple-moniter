export type GameStatus = "lobby" | "in_progress" | "finished" | "abandoned";

export type GamePhase =
  | "rolling"
  | "resolving_tile"
  | "awaiting_buy_or_auction"
  | "awaiting_trade"
  | "awaiting_card_choice"
  | "ended";

export interface PlayerState {
  user_id: string;
  position: number;
  money: number;
  in_jail: boolean;
  jail_turns: number;
  bankrupt: boolean;
}

export interface PropertyState {
  tile_index: number;
  owner_user_id: string | null;
  mortgaged: boolean;
  houses: number; // 0-4; (hotels later)
}

export interface TradeOffer {
  id: string;
  from_user_id: string;
  to_user_id: string;
  status: "open" | "accepted" | "declined" | "cancelled";
  offer: {
    cash?: number;
    properties?: number[];
    getOutOfJailFree?: number;
  };
  request: {
    cash?: number;
    properties?: number[];
    getOutOfJailFree?: number;
  };
  created_at: string;
}

export interface GameState {
  version: number;
  players: PlayerState[];
  turn_order: string[];
  current_turn_user_id: string | null;
  turn_ends_at: string | null;
  last_roll: [number, number] | null;
  doubles_count: number;
  phase: GamePhase;
  properties: PropertyState[];
  pending?: {
    tile_index?: number;
    auction?: {
      tile_index: number;
      highest_bid: number;
      highest_bidder_user_id: string | null;
      ends_at: string;
      bidders: Record<string, number>;
    };
    trade?: TradeOffer;
    card?: { deck: "chance" | "community"; card_id: string };
  };
  log_tail: string[];
}

export interface ProfileRow {
  id: string; // user id
  username: string;
  avatar_url: string | null;
  games_played: number;
  games_won: number;
  xp: number;
}

export interface GameRow {
  id: string;
  name: string;
  host_id: string;
  status: GameStatus;
  is_private: boolean;
  invite_code: string | null;
  max_players: number;
  starting_money: number;
  state: GameState | null;
  created_at: string;
  updated_at: string;
}

export interface GamePlayerRow {
  id: string;
  game_id: string;
  user_id: string;
  seat_index: number;
  token: string;
  is_ready: boolean;
  created_at: string;
}

export interface ChatMessageRow {
  id: string;
  game_id: string;
  user_id: string;
  message: string;
  created_at: string;
}

