export type ShipType = 'carrier' | 'battleship' | 'cruiser' | 'submarine' | 'destroyer';
export type Orientation = 'horizontal' | 'vertical';
export type GamePhase = 'menu' | 'placing' | 'waiting' | 'lobby' | 'playing' | 'finished' | 'kicked';
export type GameMode = 'ai' | 'pvp' | 'streamer';
export type Role = 'player' | 'streamer' | 'viewer';

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

export interface GameState {
  gameId: string | null;
  playerId: string | null;
  phase: GamePhase;
  mode: GameMode | null;
  role: Role;
  myShips: Ship[];
  myShots: Shot[];
  opponentShots: Shot[];
  sunkEnemyShips: SunkShip[];
  pendingShot: { x: number; y: number } | null;
  opponentJoined: boolean;
  opponentReady: boolean;
  yourTurn: boolean;
  winner: 'you' | 'opponent' | 'streamer' | 'viewers' | null;
  winReason: WinReason | null;
  error: string | null;
  // Streamer mode
  viewerCount: number;
  readyCount: number;
  lobbyLocked: boolean;
  cellHits: Record<string, number>;
  cellMisses: Record<string, number>;
  attackHitRatios: Record<string, number>; // streamer's shots: "x,y" -> hit ratio (0-1)
  kickReason: string | null;
  waitingForViewers: boolean;
  streamerReady: boolean;
  hasFiredThisTurn: boolean;
  viewersFired: number;
  activeViewerCount: number;
}

export const initialState: GameState = {
  gameId: null,
  playerId: null,
  phase: 'menu',
  mode: null,
  role: 'player',
  myShips: [],
  myShots: [],
  opponentShots: [],
  sunkEnemyShips: [],
  pendingShot: null,
  opponentJoined: false,
  opponentReady: false,
  yourTurn: false,
  winner: null,
  winReason: null,
  error: null,
  viewerCount: 0,
  readyCount: 0,
  lobbyLocked: false,
  cellHits: {},
  cellMisses: {},
  attackHitRatios: {},
  kickReason: null,
  waitingForViewers: false,
  streamerReady: false,
  hasFiredThisTurn: false,
  viewersFired: 0,
  activeViewerCount: 0,
};
