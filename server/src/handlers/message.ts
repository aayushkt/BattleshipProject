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
  Ship,
  GameState,
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

  // Notify joiner
  await sendToConnection(connectionId, {
    event: 'gameJoined',
    payload: { gameId: payload.gameId, playerId },
  });

  // Notify existing player
  const connections = await getConnectionsForGame(payload.gameId);
  await broadcast(connections, {
    event: 'opponentJoined',
    payload: { opponentId: playerId },
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

  // If game started, notify both players
  if (newState.phase === 'playing') {
    const connections = await getConnectionsForGame(conn.gameId);
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

  if (state.currentTurn !== conn.playerId) {
    await sendError(connectionId, 'NOT_YOUR_TURN', 'Not your turn');
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
            reason: 'All ships sunk',
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
        reason: 'All ships sunk',
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
