// Classic Monoployez Go board definition (40 tiles, US edition)
export type TileKind =
  | "corner"
  | "property"
  | "railroad"
  | "utility"
  | "tax"
  | "chance"
  | "community";

export type ColorGroup =
  | "brown"
  | "lightblue"
  | "pink"
  | "orange"
  | "red"
  | "yellow"
  | "green"
  | "darkblue";

export interface Tile {
  index: number;
  name: string;
  kind: TileKind;
  group?: ColorGroup;
  price?: number;
  rent?: number;
  cornerLabel?: string;
}

export const BOARD: Tile[] = [
  { index: 0, name: "GO", kind: "corner", cornerLabel: "Collect $200" },
  { index: 1, name: "Mediterranean Ave", kind: "property", group: "brown", price: 60, rent: 2 },
  { index: 2, name: "Community Chest", kind: "community" },
  { index: 3, name: "Baltic Ave", kind: "property", group: "brown", price: 60, rent: 4 },
  { index: 4, name: "Income Tax", kind: "tax" },
  { index: 5, name: "Reading Railroad", kind: "railroad", price: 200, rent: 25 },
  { index: 6, name: "Oriental Ave", kind: "property", group: "lightblue", price: 100, rent: 10 },
  { index: 7, name: "Chance", kind: "chance" },
  { index: 8, name: "Vermont Ave", kind: "property", group: "lightblue", price: 100, rent: 6 },
  { index: 9, name: "Connecticut Ave", kind: "property", group: "lightblue", price: 120, rent: 8 },
  { index: 10, name: "Jail", kind: "corner", cornerLabel: "Just Visiting" },
  { index: 11, name: "St. Charles Place", kind: "property", group: "pink", price: 140, rent: 10 },
  { index: 12, name: "Electric Company", kind: "utility", price: 150 },
  { index: 13, name: "States Ave", kind: "property", group: "pink", price: 140, rent: 10 },
  { index: 14, name: "Virginia Ave", kind: "property", group: "pink", price: 160, rent: 12 },
  { index: 15, name: "Pennsylvania Railroad", kind: "railroad", price: 200, rent: 25 },
  { index: 16, name: "St. James Place", kind: "property", group: "orange", price: 180, rent: 14 },
  { index: 17, name: "Community Chest", kind: "community" },
  { index: 18, name: "Tennessee Ave", kind: "property", group: "orange", price: 180, rent: 14 },
  { index: 19, name: "New York Ave", kind: "property", group: "orange", price: 200, rent: 16 },
  { index: 20, name: "Free Parking", kind: "corner", cornerLabel: "Free Parking" },
  { index: 21, name: "Kentucky Ave", kind: "property", group: "red", price: 220, rent: 18 },
  { index: 22, name: "Chance", kind: "chance" },
  { index: 23, name: "Indiana Ave", kind: "property", group: "red", price: 220, rent: 18 },
  { index: 24, name: "Illinois Ave", kind: "property", group: "red", price: 240, rent: 20 },
  { index: 25, name: "B. & O. Railroad", kind: "railroad", price: 200, rent: 25 },
  { index: 26, name: "Atlantic Ave", kind: "property", group: "yellow", price: 260, rent: 22 },
  { index: 27, name: "Ventnor Ave", kind: "property", group: "yellow", price: 260, rent: 22 },
  { index: 28, name: "Water Works", kind: "utility", price: 150 },
  { index: 29, name: "Marvin Gardens", kind: "property", group: "yellow", price: 280, rent: 24 },
  { index: 30, name: "Go to Jail", kind: "corner", cornerLabel: "Go to Jail" },
  { index: 31, name: "Pacific Ave", kind: "property", group: "green", price: 300, rent: 26 },
  { index: 32, name: "North Carolina Ave", kind: "property", group: "green", price: 300, rent: 26 },
  { index: 33, name: "Community Chest", kind: "community" },
  { index: 34, name: "Pennsylvania Ave", kind: "property", group: "green", price: 320, rent: 28 },
  { index: 35, name: "Short Line", kind: "railroad", price: 200, rent: 25 },
  { index: 36, name: "Chance", kind: "chance" },
  { index: 37, name: "Park Place", kind: "property", group: "darkblue", price: 350, rent: 35 },
  { index: 38, name: "Luxury Tax", kind: "tax" },
  { index: 39, name: "Boardwalk", kind: "property", group: "darkblue", price: 400, rent: 50 },
];

export const GROUP_BG: Record<ColorGroup, string> = {
  brown: "bg-group-brown",
  lightblue: "bg-group-lightblue",
  pink: "bg-group-pink",
  orange: "bg-group-orange",
  red: "bg-group-red",
  yellow: "bg-group-yellow",
  green: "bg-group-green",
  darkblue: "bg-group-darkblue",
};

export const TOKENS = [
  { id: "top-hat", label: "Top Hat", emoji: "🎩" },
  { id: "car", label: "Car", emoji: "🚗" },
  { id: "dog", label: "Scottie", emoji: "🐕" },
  { id: "cat", label: "Cat", emoji: "🐈" },
  { id: "ship", label: "Battleship", emoji: "🚢" },
  { id: "boot", label: "Boot", emoji: "👢" },
  { id: "thimble", label: "Thimble", emoji: "🧵" },
  { id: "wheelbarrow", label: "Wheelbarrow", emoji: "🛒" },
];
