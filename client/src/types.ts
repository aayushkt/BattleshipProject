export type ShipType = 'carrier' | 'battleship' | 'cruiser' | 'submarine' | 'destroyer';
export type Orientation = 'horizontal' | 'vertical';
export type GamePhase = 'menu' | 'placing' | 'waiting' | 'playing' | 'finished';

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

export type WinReason = 'sunk' | 'forfeit' | 'opponent_forfeit';

export const TURN_DURATION_MS = 45000;

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
  opponentJoined: boolean;
  opponentReady: boolean;
  yourTurn: boolean;
  turnStartedAt: number | null; // timestamp when current turn period started
  yourTurnAtStart: boolean; // was it your turn when turnStartedAt was set?
  winner: 'you' | 'opponent' | null;
  winReason: WinReason | null;
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
  opponentJoined: false,
  opponentReady: false,
  yourTurn: false,
  turnStartedAt: null,
  yourTurnAtStart: false,
  winner: null,
  winReason: null,
  error: null,
};
