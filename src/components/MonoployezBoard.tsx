import { BOARD, GROUP_BG, Tile, TOKENS } from "@/lib/board";

interface PlayerPos { user_id: string; token: string; position: number; }
interface PropertyOwner { tile_index: number; owner_user_id: string | null; label?: string; token?: string; }

/**
 * Static classic Monoployez Go board, CSS-grid 11x11.
 * Center reserved for title / dice / log (children).
 */
export function MonoployezBoard({
  children,
  playerPositions = [],
  propertyOwners = [],
}: {
  children?: React.ReactNode;
  playerPositions?: PlayerPos[];
  propertyOwners?: PropertyOwner[];
}) {
  // Map tile index -> grid cell (row, col) on an 11x11 grid
  const cellFor = (i: number): { row: number; col: number } => {
    if (i === 0) return { row: 11, col: 11 };
    if (i >= 1 && i <= 9) return { row: 11, col: 11 - i };
    if (i === 10) return { row: 11, col: 1 };
    if (i >= 11 && i <= 19) return { row: 11 - (i - 10), col: 1 };
    if (i === 20) return { row: 1, col: 1 };
    if (i >= 21 && i <= 29) return { row: 1, col: i - 19 };
    if (i === 30) return { row: 1, col: 11 };
    if (i >= 31 && i <= 39) return { row: i - 29, col: 11 };
    return { row: 1, col: 1 };
  };

  return (
    <div className="aspect-square w-full max-w-[760px] mx-auto bg-board-bg border-2 border-board-frame shadow-elevated p-1">
      <div
        className="grid w-full h-full gap-0 bg-board-frame"
        style={{
          gridTemplateColumns: "1.6fr repeat(9, 1fr) 1.6fr",
          gridTemplateRows: "1.6fr repeat(9, 1fr) 1.6fr",
        }}
      >
        {BOARD.map((tile) => {
          const { row, col } = cellFor(tile.index);
          const here = playerPositions.filter((p) => p.position === tile.index);
          const owner = propertyOwners.find((p) => p.tile_index === tile.index && p.owner_user_id);
          return (
            <div
              key={tile.index}
              style={{ gridRow: row, gridColumn: col }}
              className="bg-board-bg border border-board-line/70 overflow-hidden relative"
            >
              <BoardTile tile={tile} owner={owner} />
              {here.length > 0 && (
                <div className="absolute inset-0 flex flex-wrap items-end justify-center gap-0.5 p-0.5 pointer-events-none">
                  {here.map((p) => {
                    const tok = TOKENS.find((t) => t.id === p.token);
                    return (
                      <span
                        key={p.user_id}
                        className="text-base md:text-xl drop-shadow-md leading-none animate-in fade-in zoom-in-50 duration-300"
                        aria-label={tok?.label}
                      >
                        {tok?.emoji ?? "🎲"}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        {/* Center */}
        <div
          style={{ gridRow: "2 / span 9", gridColumn: "2 / span 9" }}
          className="bg-board-bg border border-board-line/70 flex items-center justify-center p-4"
        >
          {children ?? <CenterLogo />}
        </div>
      </div>
    </div>
  );
}

function CenterLogo() {
  return (
    <div className="text-center" style={{ transform: "rotate(-45deg)" }}>
      <div className="monoployez-title text-2xl md:text-4xl">MONOPLOYEZ GO</div>
    </div>
  );
}

function BoardTile({ tile, owner }: { tile: Tile; owner?: PropertyOwner }) {
  if (tile.kind === "corner") {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center text-center p-1">
        <div className="font-condensed text-[0.6rem] md:text-[0.7rem] leading-tight">{tile.name}</div>
        {tile.cornerLabel && (
          <div className="text-[0.5rem] md:text-[0.6rem] text-muted-foreground mt-1 leading-tight">
            {tile.cornerLabel}
          </div>
        )}
      </div>
    );
  }

  // Determine tile orientation by side of board
  const i = tile.index;
  const side: "bottom" | "left" | "top" | "right" =
    i > 0 && i < 10 ? "bottom" :
    i > 10 && i < 20 ? "left" :
    i > 20 && i < 30 ? "top" : "right";

  const colorBand = tile.kind === "property" && tile.group ? GROUP_BG[tile.group] : null;

  // Layout: color band on the inner edge
  const bandClass: Record<typeof side, string> = {
    bottom: "h-[22%] w-full order-first",
    top: "h-[22%] w-full order-last",
    left: "w-[22%] h-full order-first",
    right: "w-[22%] h-full order-last",
  };
  const flexDir: Record<typeof side, string> = {
    bottom: "flex-col",
    top: "flex-col",
    left: "flex-row",
    right: "flex-row",
  };
  return (
    <div className={`w-full h-full flex ${flexDir[side]}`}>
      {colorBand && (
        <div className={`${bandClass[side]} ${colorBand} border-board-line/70 ${
          side === "bottom" ? "border-b" : side === "top" ? "border-t" : side === "left" ? "border-l" : "border-r"
        }`} />
      )}
      <div className="flex-1 flex items-center justify-center p-1">
        <div className="text-center">
          {owner && (
            <div className="mx-auto mb-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary text-[0.45rem] font-bold leading-none text-primary-foreground ring-1 ring-board-line/50">
              {owner.token ? TOKENS.find((t) => t.id === owner.token)?.emoji : owner.label?.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="font-condensed text-[0.45rem] md:text-[0.55rem] leading-tight">
            {tile.kind === "chance" ? "Chance" :
             tile.kind === "community" ? "Community Chest" :
             tile.kind === "tax" ? tile.name :
             tile.kind === "railroad" ? tile.name :
             tile.kind === "utility" ? tile.name :
             tile.name}
          </div>
          {tile.price && (
            <div className="text-[0.45rem] md:text-[0.55rem] text-muted-foreground mt-0.5">
              ${tile.price}
            </div>
          )}
          {tile.kind === "chance" && <div className="text-base md:text-lg text-chance">?</div>}
          {tile.kind === "community" && <div className="text-sm md:text-base text-community">▣</div>}
        </div>
      </div>
    </div>
  );
}
