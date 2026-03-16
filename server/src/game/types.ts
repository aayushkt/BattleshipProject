export type ShipType = 'carrier' | 'battleship' | 'cruiser' | 'submarine' | 'destroyer';
export type Orientation = 'horizontal' | 'vertical';
export type GameMode = 'ai' | 'pvp';
export type GamePhase = 'placing' | 'playing' | 'finished';

export const SHIP_LENGTHS: Record<ShipType, number> = {
  carrier: 5,
  battleship: 4,
  cruiser: 3,
  submarine: 3,
  destroyer: 2,
};

export const BOARD_SIZE = 10;

export interface Ship {
  type: ShipType;
  x: number;
  y: number;
  orientation: Orientation;
}

export interface Shot {
  x: number;
  y: number;
  hit: boolean;
  sunk?: ShipType;
}

export interface PlayerBoard {
  ships: Ship[];
  shotsReceived: Shot[];
}

export interface Player {
  id: string;
  board: PlayerBoard;
  ready: boolean; // ships placed
}

export interface GameState {
  gameId: string;
  mode: GameMode;
  phase: GamePhase;
  player1: Player;
  player2: Player | null; // null until opponent joins (or AI)
  currentTurn: string; // player id
  winner: string | null;
}

// Helper to get ship cells
export function getShipCells(ship: Ship): { x: number; y: number }[] {
  const length = SHIP_LENGTHS[ship.type];
  const cells: { x: number; y: number }[] = [];
  for (let i = 0; i < length; i++) {
    cells.push({
      x: ship.orientation === 'horizontal' ? ship.x + i : ship.x,
      y: ship.orientation === 'vertical' ? ship.y + i : ship.y,
    });
  }
  return cells;
}

// Check if a ship is sunk
export function isShipSunk(ship: Ship, shotsReceived: Shot[]): boolean {
  const cells = getShipCells(ship);
  return cells.every(cell =>
    shotsReceived.some(shot => shot.x === cell.x && shot.y === cell.y && shot.hit)
  );
}
