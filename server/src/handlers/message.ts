import { APIGatewayProxyWebsocketHandlerV2 } from 'aws-lambda';
import { randomUUID } from 'crypto';
import {
  createGame,
  joinGame,
  placeShips,
  fire,
  validateShipPlacement,
  validateShot,
  generateAIShips,
  getAIShot,
  getShipCells,
  calculateCurrentTurn,
  Ship,
  GameState,
  TURN_DURATION_MS,
} from '../game';
import {
  getGame,
  saveGame,
  saveConnection,
  getConnection,
  getConnectionsForGame,
  saveMove,
} from '../db';
import { initApiClient, sendToConnection, broadcast } from './websocket';

interface Message {
  action: string;
  payload?: any;
}

export const handler: APIGatewayProxyWebsocketHandlerV2 = async (event) => {
  const connectionId = event.requestContext.connectionId!;
  const endpoint = `https://${event.requestContext.domainName}/${event.requestContext.stage}`;
  initApiClient(endpoint);

  let message: Message;
  try {
    message = JSON.parse(event.body || '{}');
  } catch {
    await sendError(connectionId, 'INVALID_JSON', 'Invalid JSON');
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  try {
    switch (message.action) {
      case 'createGame':
        await handleCreateGame(connectionId, message.payload);
        break;
      case 'joinGame':
        await handleJoinGame(connectionId, message.payload);
        break;
      case 'placeShips':
        await handlePlaceShips(connectionId, message.payload);
        break;
      case 'fire':
        await handleFire(connectionId, message.payload);
        break;
      case 'forfeit':
        await handleForfeit(connectionId);
        break;
      case 'reconnect':
        await handleReconnect(connectionId, message.payload);
        break;
      case 'getState':
        await handleGetState(connectionId, message.payload);
        break;
      default:
        await sendError(connectionId, 'UNKNOWN_ACTION', `Unknown action: ${message.action}`);
    }
  } catch (err: any) {
    console.error('Handler error:', err);
    await sendError(connectionId, 'SERVER_ERROR', err.message || 'Server error');
  }

  return { statusCode: 200, body: 'OK' };
};

async function handleCreateGame(connectionId: string, payload: { mode: 'ai' | 'pvp' }) {
  const gameId = randomUUID().slice(0, 8);
  const playerId = randomUUID().slice(0, 8);

  let state = createGame(gameId, playerId, payload.mode);

  // For AI mode, place AI ships immediately
  if (payload.mode === 'ai' && state.player2) {
    const aiShips = generateAIShips();
    state = placeShips(state, 'AI', aiShips);
  }

  await saveGame(state);
  await saveConnection(connectionId, gameId, playerId);

  await sendToConnection(connectionId, {
    event: 'gameCreated',
    payload: { gameId, playerId, mode: payload.mode },
  });
}

async function handleJoinGame(connectionId: string, payload: { gameId: string }) {
  const state = await getGame(payload.gameId);
  if (!state) {
    await sendError(connectionId, 'GAME_NOT_FOUND', 'Game not found');
    return;
  }

  const playerId = randomUUID().slice(0, 8);
  const newState = joinGame(state, playerId);

  await saveGame(newState);
  await saveConnection(connectionId, payload.gameId, playerId);

  // Check if creator (player1) has already placed ships
  const opponentReady = state.player1.ready;

  // Notify joiner
  await sendToConnection(connectionId, {
    event: 'gameJoined',
    payload: { gameId: payload.gameId, playerId, opponentReady },
  });

  // Notify existing player
  const connections = await getConnectionsForGame(payload.gameId);
  await broadcast(connections, {
    event: 'opponentJoined',
    payload: { opponentId: playerId },
  });
}

async function handleReconnect(connectionId: string, payload: { gameId: string; playerId: string }) {
  const state = await getGame(payload.gameId);
  if (!state) {
    await sendError(connectionId, 'GAME_NOT_FOUND', 'Game not found');
    return;
  }

  // Verify player is part of this game
  const isPlayer1 = state.player1.id === payload.playerId;
  const isPlayer2 = state.player2?.id === payload.playerId;
  if (!isPlayer1 && !isPlayer2) {
    await sendError(connectionId, 'NOT_IN_GAME', 'Not a participant in this game');
    return;
  }

  // Save new connection
  await saveConnection(connectionId, payload.gameId, payload.playerId);

  // Build reconnect payload
  const me = isPlayer1 ? state.player1 : state.player2!;
  const opponent = isPlayer1 ? state.player2 : state.player1;

  // Compute sunk enemy ships from opponent's board
  const sunkEnemyShips: { type: string; cells: { x: number; y: number }[] }[] = [];
  if (opponent) {
    for (const ship of opponent.board.ships) {
      const cells = getShipCells(ship);
      const allHit = cells.every(cell =>
        opponent.board.shotsReceived.some(shot => shot.x === cell.x && shot.y === cell.y && shot.hit)
      );
      if (allHit) {
        sunkEnemyShips.push({ type: ship.type, cells });
      }
    }
  }

  // Calculate actual current turn if game is playing
  let yourTurn = false;
  let turnStartedAt = state.turnStartedAt;
  if (state.phase === 'playing' && state.turnStartedAt > 0) {
    const { playerId: actualTurn } = calculateCurrentTurn(state);
    yourTurn = actualTurn === payload.playerId;
  }

  await sendToConnection(connectionId, {
    event: 'reconnected',
    payload: {
      gameId: state.gameId,
      playerId: payload.playerId,
      mode: state.mode,
      phase: state.phase,
      myShips: me.board.ships,
      myShots: opponent?.board.shotsReceived || [],
      opponentShots: me.board.shotsReceived,
      sunkEnemyShips,
      opponentJoined: !!opponent,
      opponentReady: opponent?.ready || false,
      yourTurn,
      turnStartedAt,
      winner: state.winner === payload.playerId ? 'you' : state.winner ? 'opponent' : null,
    },
  });
}

async function handlePlaceShips(connectionId: string, payload: { ships: Ship[] }) {
  const conn = await getConnection(connectionId);
  if (!conn) {
    await sendError(connectionId, 'NOT_IN_GAME', 'Not in a game');
    return;
  }

  const validation = validateShipPlacement(payload.ships);
  if (!validation.valid) {
    await sendError(connectionId, 'INVALID_PLACEMENT', validation.error!);
    return;
  }

  const state = await getGame(conn.gameId);
  if (!state) {
    await sendError(connectionId, 'GAME_NOT_FOUND', 'Game not found');
    return;
  }

  const newState = placeShips(state, conn.playerId, payload.ships);
  await saveGame(newState);

  await sendToConnection(connectionId, {
    event: 'shipsPlaced',
    payload: { success: true },
  });

  // Notify opponent that this player is ready
  const connections = await getConnectionsForGame(conn.gameId);
  for (const connId of connections) {
    if (connId !== connectionId) {
      await sendToConnection(connId, {
        event: 'opponentReady',
        payload: {},
      });
    }
  }

  // If game started, notify both players
  if (newState.phase === 'playing') {
    for (const connId of connections) {
      const c = await getConnection(connId);
      if (c) {
        await sendToConnection(connId, {
          event: 'gameStarted',
          payload: { yourTurn: newState.currentTurn === c.playerId },
        });
      }
    }
  }
}

async function handleFire(connectionId: string, payload: { x: number; y: number }) {
  const conn = await getConnection(connectionId);
  if (!conn) {
    await sendError(connectionId, 'NOT_IN_GAME', 'Not in a game');
    return;
  }

  const state = await getGame(conn.gameId);
  if (!state) {
    await sendError(connectionId, 'GAME_NOT_FOUND', 'Game not found');
    return;
  }

  // Calculate whose turn it actually is based on elapsed time
  const { playerId: actualTurn, remainingMs } = calculateCurrentTurn(state);
  if (actualTurn !== conn.playerId) {
    await sendToConnection(connectionId, {
      event: 'error',
      payload: { code: 'NOT_YOUR_TURN', message: 'Not your turn', remainingMs },
    });
    return;
  }

  // Get opponent's shots received to validate
  const opponent = state.player1.id === conn.playerId ? state.player2 : state.player1;
  if (!opponent) {
    await sendError(connectionId, 'NO_OPPONENT', 'No opponent');
    return;
  }

  const validation = validateShot(payload.x, payload.y, opponent.board.shotsReceived);
  if (!validation.valid) {
    await sendError(connectionId, 'INVALID_SHOT', validation.error!);
    return;
  }

  const result = fire(state, conn.playerId, payload.x, payload.y);
  
  // Reset turn timer on successful fire
  result.state.turnStartedAt = Date.now();
  result.state.currentTurn = opponent.id; // Base turn is now opponent
  
  await saveGame(result.state);
  await saveMove(conn.gameId, conn.playerId, payload.x, payload.y, result.hit, result.sunk?.type);

  // Notify both players
  const connections = await getConnectionsForGame(conn.gameId);
  for (const connId of connections) {
    const c = await getConnection(connId);
    if (c) {
      const isShooter = c.playerId === conn.playerId;
      await sendToConnection(connId, {
        event: 'fireResult',
        payload: {
          x: payload.x,
          y: payload.y,
          hit: result.hit,
          sunk: result.sunk,
          yourShot: isShooter,
        },
      });

      if (result.gameOver) {
        await sendToConnection(connId, {
          event: 'gameOver',
          payload: {
            winner: result.winner === c.playerId ? 'you' : 'opponent',
            reason: 'sunk',
          },
        });
      } else {
        await sendToConnection(connId, {
          event: 'turnChange',
          payload: { yourTurn: result.state.currentTurn === c.playerId },
        });
      }
    }
  }

  // AI turn
  if (!result.gameOver && result.state.mode === 'ai' && result.state.currentTurn === 'AI') {
    await handleAITurn(conn.gameId, connectionId, conn.playerId);
  }
}

async function handleForfeit(connectionId: string) {
  const conn = await getConnection(connectionId);
  if (!conn) {
    await sendError(connectionId, 'NOT_IN_GAME', 'Not in a game');
    return;
  }

  const state = await getGame(conn.gameId);
  if (!state) {
    await sendError(connectionId, 'GAME_NOT_FOUND', 'Game not found');
    return;
  }

  // Update game state
  const opponent = state.player1.id === conn.playerId ? state.player2 : state.player1;
  const newState: GameState = {
    ...state,
    phase: 'finished',
    winner: opponent?.id || null,
  };
  await saveGame(newState);

  // Notify the forfeiting player
  await sendToConnection(connectionId, {
    event: 'gameOver',
    payload: { winner: 'opponent', reason: 'forfeit' },
  });

  // Notify opponent
  const connections = await getConnectionsForGame(conn.gameId);
  for (const connId of connections) {
    if (connId !== connectionId) {
      await sendToConnection(connId, {
        event: 'gameOver',
        payload: { winner: 'you', reason: 'opponent_forfeit' },
      });
    }
  }
}

async function handleAITurn(gameId: string, playerConnectionId: string, playerId: string) {
  const state = await getGame(gameId);
  if (!state || state.phase !== 'playing' || state.currentTurn !== 'AI') return;

  const player = state.player1.id === playerId ? state.player1 : state.player2;
  if (!player) return;

  const aiShot = getAIShot(player.board.shotsReceived);
  const result = fire(state, 'AI', aiShot.x, aiShot.y);

  await saveGame(result.state);
  await saveMove(gameId, 'AI', aiShot.x, aiShot.y, result.hit, result.sunk?.type);

  await sendToConnection(playerConnectionId, {
    event: 'fireResult',
    payload: {
      x: aiShot.x,
      y: aiShot.y,
      hit: result.hit,
      sunk: result.sunk,
      yourShot: false,
    },
  });

  if (result.gameOver) {
    await sendToConnection(playerConnectionId, {
      event: 'gameOver',
      payload: {
        winner: result.winner === playerId ? 'you' : 'opponent',
        reason: 'sunk',
      },
    });
  } else {
    await sendToConnection(playerConnectionId, {
      event: 'turnChange',
      payload: { yourTurn: true },
    });
  }
}

async function handleGetState(connectionId: string, payload: { gameId: string }) {
  const conn = await getConnection(connectionId);
  const state = await getGame(payload.gameId);

  if (!state) {
    await sendError(connectionId, 'GAME_NOT_FOUND', 'Game not found');
    return;
  }

  // Build client-safe state (hide opponent ships)
  const playerId = conn?.playerId;
  const isPlayer1 = state.player1.id === playerId;
  const myPlayer = isPlayer1 ? state.player1 : state.player2;
  const opponent = isPlayer1 ? state.player2 : state.player1;

  await sendToConnection(connectionId, {
    event: 'state',
    payload: {
      gameId: state.gameId,
      phase: state.phase,
      yourTurn: state.currentTurn === playerId,
      myBoard: myPlayer ? {
        ships: myPlayer.board.ships,
        shotsReceived: myPlayer.board.shotsReceived,
      } : null,
      opponentBoard: opponent ? {
        shotsFired: opponent.board.shotsReceived, // What I've fired at them
      } : null,
    },
  });
}

async function sendError(connectionId: string, code: string, message: string) {
  await sendToConnection(connectionId, { event: 'error', payload: { code, message } });
}
