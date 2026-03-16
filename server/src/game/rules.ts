import { GameState, Ship, Shot, Player, PlayerBoard, getShipCells, isShipSunk, ShipType, GameMode, TURN_DURATION_MS } from './types';

export function createGame(gameId: string, playerId: string, mode: GameMode): GameState {
  const player1: Player = {
    id: playerId,
    board: { ships: [], shotsReceived: [] },
    ready: false,
  };

  const player2: Player | null = mode === 'ai' ? {
    id: 'AI',
    board: { ships: [], shotsReceived: [] },
    ready: false,
  } : null;

  return {
    gameId,
    mode,
    phase: 'placing',
    player1,
    player2,
    currentTurn: playerId,
    turnStartedAt: 0,
    winner: null,
  };
}

export function joinGame(state: GameState, playerId: string): GameState {
  if (state.player2 !== null) {
    throw new Error('Game already full');
  }
  if (state.mode === 'ai') {
    throw new Error('Cannot join AI game');
  }

  return {
    ...state,
    player2: {
      id: playerId,
      board: { ships: [], shotsReceived: [] },
      ready: false,
    },
  };
}

export function placeShips(state: GameState, playerId: string, ships: Ship[]): GameState {
  const player = getPlayer(state, playerId);
  if (!player) throw new Error('Player not in game');
  if (player.ready) throw new Error('Ships already placed');

  const updatedPlayer: Player = {
    ...player,
    board: { ...player.board, ships },
    ready: true,
  };

  const newState = updatePlayer(state, playerId, updatedPlayer);

  // Check if both players ready
  if (newState.player1.ready && newState.player2?.ready) {
    return { ...newState, phase: 'playing', turnStartedAt: Date.now() };
  }

  return newState;
}

export interface SunkShipInfo {
  type: ShipType;
  cells: { x: number; y: number }[];
}

export interface FireResult {
  state: GameState;
  hit: boolean;
  sunk?: SunkShipInfo;
  gameOver: boolean;
  winner?: string;
}

// Calculate whose turn it is based on elapsed time
export function calculateCurrentTurn(state: GameState): { playerId: string; remainingMs: number } {
  const elapsed = Date.now() - state.turnStartedAt;
  const turnIndex = Math.floor(elapsed / TURN_DURATION_MS) % 2;
  const remainingMs = TURN_DURATION_MS - (elapsed % TURN_DURATION_MS);
  
  // turnIndex 0 = currentTurn (whoever started), turnIndex 1 = opponent
  const baseTurnPlayer = state.currentTurn;
  const otherPlayer = state.player1.id === baseTurnPlayer ? state.player2!.id : state.player1.id;
  
  const playerId = turnIndex === 0 ? baseTurnPlayer : otherPlayer;
  return { playerId, remainingMs };
}

export function fire(state: GameState, playerId: string, x: number, y: number): FireResult {
  if (state.phase !== 'playing') {
    throw new Error('Game not in playing phase');
  }
  if (state.currentTurn !== playerId) {
    throw new Error('Not your turn');
  }

  const opponent = getOpponent(state, playerId);
  if (!opponent) throw new Error('No opponent');

  // Check if hit
  const hitShip = opponent.board.ships.find(ship => {
    const cells = getShipCells(ship);
    return cells.some(c => c.x === x && c.y === y);
  });

  const hit = !!hitShip;
  const shot: Shot = { x, y, hit };

  // Check if sunk
  let sunk: SunkShipInfo | undefined;
  if (hitShip) {
    const newShots = [...opponent.board.shotsReceived, shot];
    if (isShipSunk(hitShip, newShots)) {
      shot.sunk = hitShip.type;
      sunk = {
        type: hitShip.type,
        cells: getShipCells(hitShip),
      };
    }
  }

  // Update opponent's board
  const updatedOpponent: Player = {
    ...opponent,
    board: {
      ...opponent.board,
      shotsReceived: [...opponent.board.shotsReceived, shot],
    },
  };

  let newState = updatePlayer(state, opponent.id, updatedOpponent);

  // Check win condition
  const allSunk = updatedOpponent.board.ships.every(ship =>
    isShipSunk(ship, updatedOpponent.board.shotsReceived)
  );

  if (allSunk) {
    return {
      state: { ...newState, phase: 'finished', winner: playerId },
      hit,
      sunk,
      gameOver: true,
      winner: playerId,
    };
  }

  // Switch turns
  const nextTurn = opponent.id;
  newState = { ...newState, currentTurn: nextTurn };

  return { state: newState, hit, sunk, gameOver: false };
}

// Helpers
function getPlayer(state: GameState, playerId: string): Player | null {
  if (state.player1.id === playerId) return state.player1;
  if (state.player2?.id === playerId) return state.player2;
  return null;
}

function getOpponent(state: GameState, playerId: string): Player | null {
  if (state.player1.id === playerId) return state.player2;
  if (state.player2?.id === playerId) return state.player1;
  return null;
}

function updatePlayer(state: GameState, playerId: string, player: Player): GameState {
  if (state.player1.id === playerId) {
    return { ...state, player1: player };
  }
  if (state.player2?.id === playerId) {
    return { ...state, player2: player };
  }
  return state;
}

export { getPlayer, getOpponent };
