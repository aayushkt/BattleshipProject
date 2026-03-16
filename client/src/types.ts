export type ShipType = 'carrier' | 'battleship' | 'cruiser' | 'submarine' | 'destroyer';
export type Orientation = 'horizontal' | 'vertical';
export type GamePhase = 'menu' | 'placing' | 'playing' | 'finished';

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

export interface SunkShip {
  type: ShipType;
  cells: { x: number; y: number }[];
}

export interface GameState {
  gameId: string | null;
  playerId: string | null;
  phase: GamePhase;
  mode: 'ai' | 'pvp' | null;
  myShips: Ship[];
  myShots: Shot[];
  opponentShots: Shot[];
  sunkEnemyShips: SunkShip[];
  pendingShot: { x: number; y: number } | null;
  yourTurn: boolean;
  winner: 'you' | 'opponent' | null;
  error: string | null;
}

export const initialState: GameState = {
  gameId: null,
  playerId: null,
  phase: 'menu',
  mode: null,
  myShips: [],
  myShots: [],
  opponentShots: [],
  sunkEnemyShips: [],
  pendingShot: null,
  yourTurn: false,
  winner: null,
  error: null,
};
