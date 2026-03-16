import { randomUUID } from 'crypto';
import {
  validateShipPlacement,
  getShipCells,
  Ship,
  StreamerGameState,
  ViewerState,
  Shot,
} from '../game';
import {
  getStreamerGame,
  saveStreamerGame,
  getViewer,
  saveViewer,
  deleteViewer,
  getAllViewers,
  incrementStreamerLobbyCount,
  saveConnection,
  getConnection,
  getConnectionsForGame,
  batchSaveViewers,
  incrementCellHit,
} from '../db';
import { sendToConnection, broadcast } from './websocket';

async function sendLobbyUpdate(gameId: string, streamerId: string): Promise<void> {
  const state = await getStreamerGame(gameId);
  if (!state) return;
  
  // Find streamer's connection
  const connections = await getConnectionsForGame(gameId);
  for (const connId of connections) {
    const conn = await getConnection(connId);
    if (conn?.playerId === streamerId) {
      await sendToConnection(connId, {
        event: 'lobbyUpdate',
        payload: { viewerCount: state.viewerCount, readyCount: state.readyCount },
      });
      break;
    }
  }
}

export async function handleCreateStreamerGame(connectionId: string): Promise<void> {
  const gameId = randomUUID().slice(0, 8);
  const streamerId = randomUUID().slice(0, 8);

  const state: StreamerGameState = {
    gameId,
    streamerId,
    phase: 'lobby',
    lobbyLocked: false,
    viewerCount: 0,
    readyCount: 0,
    streamerBoard: { ships: [], cellHits: {} },
    winner: null,
    currentTurn: 'streamer',
    viewersFiredThisTurn: 0,
    activeViewerCount: 0,
  };

  await saveStreamerGame(state);
  await saveConnection(connectionId, gameId, streamerId);

  await sendToConnection(connectionId, {
    event: 'gameCreated',
    payload: { gameId, playerId: streamerId, mode: 'streamer' },
  });
}

export async function handleViewerJoin(connectionId: string, payload: { gameId: string }): Promise<void> {
  const state = await getStreamerGame(payload.gameId);
  if (!state) {
    await sendToConnection(connectionId, {
      event: 'error',
      payload: { code: 'GAME_NOT_FOUND', message: 'Game not found' },
    });
    return;
  }

  if (state.phase !== 'lobby') {
    await sendToConnection(connectionId, {
      event: 'error',
      payload: { code: 'GAME_IN_PROGRESS', message: 'Game already in progress' },
    });
    return;
  }

  if (state.lobbyLocked) {
    await sendToConnection(connectionId, {
      event: 'error',
      payload: { code: 'LOBBY_LOCKED', message: 'Lobby is locked' },
    });
    return;
  }

  const viewerId = randomUUID().slice(0, 8);
  const viewer: ViewerState = {
    viewerId,
    ready: false,
    eliminated: false,
    board: { ships: [], shotsReceived: [] },
    shotsAtStreamer: [],
    connectionId,
    hasFiredThisTurn: false,
  };

  await saveViewer(payload.gameId, viewer);
  await saveConnection(connectionId, payload.gameId, viewerId);
  await incrementStreamerLobbyCount(payload.gameId, 'viewerCount', 1);

  await sendToConnection(connectionId, {
    event: 'gameJoined',
    payload: {
      gameId: payload.gameId,
      playerId: viewerId,
      mode: 'streamer',
      role: 'viewer',
      streamerReady: state.streamerBoard.ships.length > 0,
    },
  });

  await sendLobbyUpdate(payload.gameId, state.streamerId);
}

export async function handleStreamerPlaceShips(
  connectionId: string,
  gameId: string,
  streamerId: string,
  ships: Ship[]
): Promise<void> {
  const validation = validateShipPlacement(ships);
  if (!validation.valid) {
    await sendToConnection(connectionId, {
      event: 'error',
      payload: { code: 'INVALID_PLACEMENT', message: validation.error },
    });
    return;
  }

  const state = await getStreamerGame(gameId);
  if (!state || state.streamerId !== streamerId) {
    await sendToConnection(connectionId, {
      event: 'error',
      payload: { code: 'GAME_NOT_FOUND', message: 'Game not found' },
    });
    return;
  }

  state.streamerBoard.ships = ships;
  await saveStreamerGame(state);

  await sendToConnection(connectionId, {
    event: 'shipsPlaced',
    payload: { success: true },
  });
}

export async function handleViewerPlaceShips(
  connectionId: string,
  gameId: string,
  viewerId: string,
  ships: Ship[]
): Promise<void> {
  const validation = validateShipPlacement(ships);
  if (!validation.valid) {
    await sendToConnection(connectionId, {
      event: 'error',
      payload: { code: 'INVALID_PLACEMENT', message: validation.error },
    });
    return;
  }

  const viewer = await getViewer(gameId, viewerId);
  if (!viewer) {
    await sendToConnection(connectionId, {
      event: 'error',
      payload: { code: 'NOT_IN_GAME', message: 'Not in game' },
    });
    return;
  }

  if (viewer.ready) {
    await sendToConnection(connectionId, {
      event: 'error',
      payload: { code: 'ALREADY_READY', message: 'Ships already placed' },
    });
    return;
  }

  viewer.board.ships = ships;
  viewer.ready = true;
  await saveViewer(gameId, viewer);
  await incrementStreamerLobbyCount(gameId, 'readyCount', 1);

  await sendToConnection(connectionId, {
    event: 'shipsPlaced',
    payload: { success: true },
  });

  const state = await getStreamerGame(gameId);
  if (state) {
    await sendLobbyUpdate(gameId, state.streamerId);
  }
}

export async function handleLockLobby(connectionId: string, lock: boolean): Promise<void> {
  const conn = await getConnection(connectionId);
  if (!conn) {
    await sendToConnection(connectionId, {
      event: 'error',
      payload: { code: 'NOT_IN_GAME', message: 'Not in a game' },
    });
    return;
  }

  const state = await getStreamerGame(conn.gameId);
  if (!state || state.streamerId !== conn.playerId) {
    await sendToConnection(connectionId, {
      event: 'error',
      payload: { code: 'NOT_STREAMER', message: 'Only streamer can lock lobby' },
    });
    return;
  }

  state.lobbyLocked = lock;
  await saveStreamerGame(state);

  await sendToConnection(connectionId, {
    event: 'lobbyLockChanged',
    payload: { locked: lock },
  });
}

export async function handleStartStreamerGame(connectionId: string): Promise<void> {
  const conn = await getConnection(connectionId);
  if (!conn) {
    await sendToConnection(connectionId, {
      event: 'error',
      payload: { code: 'NOT_IN_GAME', message: 'Not in a game' },
    });
    return;
  }

  const state = await getStreamerGame(conn.gameId);
  if (!state || state.streamerId !== conn.playerId) {
    await sendToConnection(connectionId, {
      event: 'error',
      payload: { code: 'NOT_STREAMER', message: 'Only streamer can start game' },
    });
    return;
  }

  if (state.streamerBoard.ships.length === 0) {
    await sendToConnection(connectionId, {
      event: 'error',
      payload: { code: 'SHIPS_NOT_PLACED', message: 'Place your ships first' },
    });
    return;
  }

  const viewers = await getAllViewers(conn.gameId);
  const readyViewers = viewers.filter(v => v.ready);
  const unreadyViewers = viewers.filter(v => !v.ready);

  if (readyViewers.length === 0) {
    await sendToConnection(connectionId, {
      event: 'error',
      payload: { code: 'NO_READY_VIEWERS', message: 'Need at least one ready viewer' },
    });
    return;
  }

  // Kick unready viewers
  for (const viewer of unreadyViewers) {
    await sendToConnection(viewer.connectionId, {
      event: 'kicked',
      payload: { reason: 'You did not finish placing your ships before the game started!' },
    });
    await deleteViewer(conn.gameId, viewer.viewerId);
  }

  // Update game state
  state.phase = 'playing';
  state.lobbyLocked = true;
  state.viewerCount = readyViewers.length;
  state.readyCount = readyViewers.length;
  state.currentTurn = 'streamer';
  state.activeViewerCount = readyViewers.length;
  state.viewersFiredThisTurn = 0;
  await saveStreamerGame(state);

  // Notify streamer
  await sendToConnection(connectionId, {
    event: 'gameStarted',
    payload: {
      viewerCount: readyViewers.length,
      yourTurn: true,
    },
  });

  // Notify all ready viewers
  for (const viewer of readyViewers) {
    await sendToConnection(viewer.connectionId, {
      event: 'gameStarted',
      payload: {
        yourTurn: false,
      },
    });
  }
}


// Helper: Check if coordinate hits a ship
function checkHit(x: number, y: number, ships: Ship[]): { hit: boolean; sunkShip?: Ship } {
  for (const ship of ships) {
    const cells = getShipCells(ship);
    if (cells.some(c => c.x === x && c.y === y)) {
      return { hit: true };
    }
  }
  return { hit: false };
}

// Helper: Check if ship is sunk
function isShipSunk(ship: Ship, shotsReceived: Shot[]): boolean {
  const cells = getShipCells(ship);
  return cells.every(cell =>
    shotsReceived.some(s => s.x === cell.x && s.y === cell.y && s.hit)
  );
}

// Helper: Check if all ships are sunk
function allShipsSunk(ships: Ship[], shotsReceived: Shot[]): boolean {
  return ships.every(ship => isShipSunk(ship, shotsReceived));
}

export async function handleStreamerFire(
  connectionId: string,
  payload: { x: number; y: number }
): Promise<void> {
  const conn = await getConnection(connectionId);
  if (!conn) {
    await sendToConnection(connectionId, {
      event: 'error',
      payload: { code: 'NOT_IN_GAME', message: 'Not in a game' },
    });
    return;
  }

  const state = await getStreamerGame(conn.gameId);
  if (!state || state.streamerId !== conn.playerId) {
    await sendToConnection(connectionId, {
      event: 'error',
      payload: { code: 'NOT_STREAMER', message: 'Only streamer can fire' },
    });
    return;
  }

  if (state.phase !== 'playing') {
    await sendToConnection(connectionId, {
      event: 'error',
      payload: { code: 'GAME_NOT_PLAYING', message: 'Game not in progress' },
    });
    return;
  }

  // Validate turn
  if (state.currentTurn !== 'streamer') {
    await sendToConnection(connectionId, {
      event: 'error',
      payload: { code: 'NOT_YOUR_TURN', message: 'Not your turn' },
    });
    return;
  }

  // Get all viewers
  const viewers = await getAllViewers(conn.gameId);
  if (viewers.length === 0) {
    await sendToConnection(connectionId, {
      event: 'error',
      payload: { code: 'NO_VIEWERS', message: 'No viewers in game' },
    });
    return;
  }

  // Check hit/miss against each viewer and update their boards
  let hitCount = 0;
  const updatedViewers: ViewerState[] = [];
  const notifications: Promise<void>[] = [];

  for (const viewer of viewers) {
    const { hit } = checkHit(payload.x, payload.y, viewer.board.ships);
    const shot: Shot = { x: payload.x, y: payload.y, hit };
    
    // Check if this shot sinks a ship
    let sunkShip: Ship | undefined;
    if (hit) {
      hitCount++;
      const newShots = [...viewer.board.shotsReceived, shot];
      for (const ship of viewer.board.ships) {
        if (!isShipSunk(ship, viewer.board.shotsReceived) && isShipSunk(ship, newShots)) {
          sunkShip = ship;
          shot.sunk = ship.type;
          break;
        }
      }
    }

    // Update viewer board
    viewer.board.shotsReceived.push(shot);
    
    // Check if viewer is eliminated
    if (!viewer.eliminated && allShipsSunk(viewer.board.ships, viewer.board.shotsReceived)) {
      viewer.eliminated = true;
    }
    
    updatedViewers.push(viewer);

    // Queue notification to viewer
    notifications.push(
      sendToConnection(viewer.connectionId, {
        event: 'streamerFired',
        payload: {
          x: payload.x,
          y: payload.y,
          hit,
          sunk: sunkShip ? { type: sunkShip.type, cells: getShipCells(sunkShip) } : undefined,
        },
      })
    );
  }

  // Batch save all viewer updates
  await batchSaveViewers(conn.gameId, updatedViewers);

  // Send all notifications in parallel
  await Promise.all(notifications);

  // Calculate hit ratio
  const hitRatio = hitCount / viewers.length;

  // Check win condition: all viewers eliminated
  const allEliminated = updatedViewers.every(v => v.eliminated);
  if (allEliminated) {
    state.phase = 'finished';
    state.winner = 'streamer';
    await saveStreamerGame(state);

    // Notify streamer
    await sendToConnection(connectionId, {
      event: 'streamerFireResult',
      payload: { x: payload.x, y: payload.y, hitRatio },
    });
    await sendToConnection(connectionId, {
      event: 'gameOver',
      payload: { winner: 'you' },
    });

    // Notify all viewers
    for (const viewer of updatedViewers) {
      await sendToConnection(viewer.connectionId, {
        event: 'gameOver',
        payload: { winner: 'streamer' },
      });
    }
    return;
  }

  // Switch to viewers' turn and reset counter
  state.currentTurn = 'viewers';
  state.viewersFiredThisTurn = 0;
  await saveStreamerGame(state);

  // Send result to streamer
  await sendToConnection(connectionId, {
    event: 'streamerFireResult',
    payload: {
      x: payload.x,
      y: payload.y,
      hitRatio,
      viewerDamage: state.streamerBoard.cellHits,
    },
  });

  // Notify all viewers it's their turn
  for (const viewer of updatedViewers) {
    if (!viewer.eliminated) {
      await sendToConnection(viewer.connectionId, {
        event: 'turnChanged',
        payload: { yourTurn: true },
      });
    }
  }
}


export async function handleViewerFire(
  connectionId: string,
  gameId: string,
  viewerId: string,
  payload: { x: number; y: number }
): Promise<void> {
  const state = await getStreamerGame(gameId);
  if (!state) {
    await sendToConnection(connectionId, {
      event: 'error',
      payload: { code: 'GAME_NOT_FOUND', message: 'Game not found' },
    });
    return;
  }

  if (state.phase !== 'playing') {
    await sendToConnection(connectionId, {
      event: 'error',
      payload: { code: 'GAME_NOT_PLAYING', message: 'Game not in progress' },
    });
    return;
  }

  // Validate turn
  if (state.currentTurn !== 'viewers') {
    await sendToConnection(connectionId, {
      event: 'error',
      payload: { code: 'NOT_YOUR_TURN', message: 'Not your turn' },
    });
    return;
  }

  const viewer = await getViewer(gameId, viewerId);
  if (!viewer) {
    await sendToConnection(connectionId, {
      event: 'error',
      payload: { code: 'NOT_IN_GAME', message: 'Not in game' },
    });
    return;
  }

  // Check if already fired this turn
  if (viewer.hasFiredThisTurn) {
    await sendToConnection(connectionId, {
      event: 'error',
      payload: { code: 'ALREADY_FIRED_THIS_TURN', message: 'Already fired this turn' },
    });
    return;
  }

  // Check if viewer has already finished firing (hit all 17)
  const viewerHits = viewer.shotsAtStreamer.filter(s => s.hit).length;
  if (viewerHits >= 17) {
    await sendToConnection(connectionId, {
      event: 'error',
      payload: { code: 'FINISHED_FIRING', message: 'You have already hit all targets' },
    });
    return;
  }

  // Check if already fired at this cell
  if (viewer.shotsAtStreamer.some(s => s.x === payload.x && s.y === payload.y)) {
    await sendToConnection(connectionId, {
      event: 'error',
      payload: { code: 'ALREADY_FIRED', message: 'Already fired at this cell' },
    });
    return;
  }

  // Check hit against streamer's ships
  const { hit } = checkHit(payload.x, payload.y, state.streamerBoard.ships);
  const shot: Shot = { x: payload.x, y: payload.y, hit };

  // Update viewer's shots and mark as fired this turn
  viewer.shotsAtStreamer.push(shot);
  viewer.hasFiredThisTurn = true;
  await saveViewer(gameId, viewer);

  // Increment viewersFiredThisTurn counter
  await incrementStreamerLobbyCount(gameId, 'viewersFiredThisTurn', 1);

  // Notify streamer for heat map update and progress
  const connections = await getConnectionsForGame(gameId);
  for (const connId of connections) {
    const c = await getConnection(connId);
    if (c?.playerId === state.streamerId) {
      await sendToConnection(connId, {
        event: 'viewerShot',
        payload: { 
          x: payload.x, 
          y: payload.y, 
          hit,
          viewersFired: state.viewersFiredThisTurn + 1,
          activeViewerCount: state.activeViewerCount,
        },
      });
      break;
    }
  }

  // If hit, increment cell hit counter
  if (hit) {
    await incrementCellHit(gameId, payload.x, payload.y);
  }

  // Send result to viewer
  await sendToConnection(connectionId, {
    event: 'viewerFireResult',
    payload: { x: payload.x, y: payload.y, hit },
  });

  // Check if viewer just finished (hit all 17) - decrement active count
  const newHitCount = viewer.shotsAtStreamer.filter(s => s.hit).length;
  if (newHitCount >= 17) {
    await incrementStreamerLobbyCount(gameId, 'activeViewerCount', -1);
    await sendToConnection(connectionId, {
      event: 'waitingForViewers',
      payload: {},
    });
  }

  // Check win condition: streamer fleet depleted
  // Get fresh state with updated cellHits
  const freshState = await getStreamerGame(gameId);
  if (freshState) {
    const fleetRemaining = calculateFleetRemaining(freshState);
    if (fleetRemaining <= 0) {
      freshState.phase = 'finished';
      freshState.winner = 'viewers';
      await saveStreamerGame(freshState);

      // Notify all players
      const viewers = await getAllViewers(gameId);
      for (const v of viewers) {
        await sendToConnection(v.connectionId, {
          event: 'gameOver',
          payload: { winner: 'you' },
        });
      }

      // Notify streamer
      const connections = await getConnectionsForGame(gameId);
      for (const connId of connections) {
        const c = await getConnection(connId);
        if (c?.playerId === freshState.streamerId) {
          await sendToConnection(connId, {
            event: 'gameOver',
            payload: { winner: 'viewers' },
          });
          break;
        }
      }
      return;
    }

    // Check if all active viewers have fired - switch to streamer's turn
    if (freshState.viewersFiredThisTurn >= freshState.activeViewerCount) {
      freshState.currentTurn = 'streamer';
      freshState.viewersFiredThisTurn = 0;
      
      // Reset all viewers' hasFiredThisTurn
      const allViewers = await getAllViewers(gameId);
      for (const v of allViewers) {
        if (v.hasFiredThisTurn) {
          v.hasFiredThisTurn = false;
          await saveViewer(gameId, v);
        }
      }
      
      await saveStreamerGame(freshState);

      // Notify streamer it's their turn
      for (const connId of connections) {
        const c = await getConnection(connId);
        if (c?.playerId === freshState.streamerId) {
          await sendToConnection(connId, {
            event: 'turnChanged',
            payload: { yourTurn: true },
          });
          break;
        }
      }

      // Notify all viewers it's not their turn
      for (const v of allViewers) {
        if (!v.eliminated) {
          await sendToConnection(v.connectionId, {
            event: 'turnChanged',
            payload: { yourTurn: false },
          });
        }
      }
    }
  }
}

// Helper: Calculate streamer's remaining fleet
function calculateFleetRemaining(state: StreamerGameState): number {
  const shipCells = state.streamerBoard.ships.flatMap(ship => getShipCells(ship));
  let totalUndamaged = 0;
  
  for (const cell of shipCells) {
    const key = `${cell.x},${cell.y}`;
    const hitCount = state.streamerBoard.cellHits[key] || 0;
    const undamagedRatio = 1 - (hitCount / state.viewerCount);
    totalUndamaged += Math.max(0, undamagedRatio);
  }
  
  return totalUndamaged;
}


export async function handleStreamerReconnect(
  connectionId: string,
  gameId: string,
  playerId: string
): Promise<void> {
  const state = await getStreamerGame(gameId);
  if (!state) {
    await sendToConnection(connectionId, {
      event: 'error',
      payload: { code: 'GAME_NOT_FOUND', message: 'Game not found' },
    });
    return;
  }

  const isStreamer = state.streamerId === playerId;
  
  if (isStreamer) {
    // Reconnect streamer
    await saveConnection(connectionId, gameId, playerId);
    
    const viewers = await getAllViewers(gameId);
    
    await sendToConnection(connectionId, {
      event: 'reconnected',
      payload: {
        gameId,
        playerId,
        mode: 'streamer',
        role: 'streamer',
        phase: state.phase,
        myShips: state.streamerBoard.ships,
        cellHits: state.streamerBoard.cellHits,
        viewerCount: state.viewerCount,
        readyCount: state.readyCount,
        lobbyLocked: state.lobbyLocked,
        yourTurn: state.phase === 'playing' ? state.currentTurn === 'streamer' : false,
        viewersFired: state.viewersFiredThisTurn,
        activeViewerCount: state.activeViewerCount,
        winner: state.winner,
      },
    });
  } else {
    // Reconnect viewer
    const viewer = await getViewer(gameId, playerId);
    if (!viewer) {
      await sendToConnection(connectionId, {
        event: 'error',
        payload: { code: 'NOT_IN_GAME', message: 'Not in game' },
      });
      return;
    }

    // Update connection ID
    viewer.connectionId = connectionId;
    await saveViewer(gameId, viewer);
    await saveConnection(connectionId, gameId, playerId);

    const hitCount = viewer.shotsAtStreamer.filter(s => s.hit).length;

    await sendToConnection(connectionId, {
      event: 'reconnected',
      payload: {
        gameId,
        playerId,
        mode: 'streamer',
        role: 'viewer',
        phase: state.phase,
        myShips: viewer.board.ships,
        myShots: viewer.shotsAtStreamer,
        opponentShots: viewer.board.shotsReceived,
        yourTurn: state.phase === 'playing' ? state.currentTurn === 'viewers' && !viewer.hasFiredThisTurn : false,
        waitingForViewers: hitCount >= 17,
        streamerReady: state.streamerBoard.ships.length > 0,
        winner: state.winner === 'streamer' ? 'streamer' : state.winner === 'viewers' ? 'you' : null,
      },
    });
  }
}


export async function handleStreamerForfeit(connectionId: string): Promise<void> {
  const conn = await getConnection(connectionId);
  if (!conn) return;

  const state = await getStreamerGame(conn.gameId);
  if (!state || state.streamerId !== conn.playerId) return;

  state.phase = 'finished';
  state.winner = 'viewers';
  await saveStreamerGame(state);

  // Notify streamer
  await sendToConnection(connectionId, {
    event: 'gameOver',
    payload: { winner: 'viewers' },
  });

  // Notify all viewers
  const viewers = await getAllViewers(conn.gameId);
  for (const v of viewers) {
    await sendToConnection(v.connectionId, {
      event: 'gameOver',
      payload: { winner: 'you' },
    });
  }
}

export async function handleViewerForfeit(connectionId: string): Promise<void> {
  const conn = await getConnection(connectionId);
  if (!conn) return;

  const state = await getStreamerGame(conn.gameId);
  if (!state) return;

  const viewer = await getViewer(conn.gameId, conn.playerId);
  if (!viewer) return;

  state.phase = 'finished';
  state.winner = 'streamer';
  await saveStreamerGame(state);

  // Notify the forfeiting viewer
  await sendToConnection(connectionId, {
    event: 'gameOver',
    payload: { winner: 'streamer', reason: 'forfeit' },
  });

  // Notify streamer
  const streamerConns = await getConnectionsForGame(conn.gameId);
  for (const connId of streamerConns) {
    const c = await getConnection(connId);
    if (c && c.playerId === state.streamerId) {
      await sendToConnection(connId, {
        event: 'gameOver',
        payload: { winner: 'you', reason: 'viewer_forfeit' },
      });
    }
  }

  // Notify other viewers
  const viewers = await getAllViewers(conn.gameId);
  for (const v of viewers) {
    if (v.viewerId !== conn.playerId) {
      await sendToConnection(v.connectionId, {
        event: 'gameOver',
        payload: { winner: 'streamer', reason: 'viewer_forfeit' },
      });
    }
  }
}
