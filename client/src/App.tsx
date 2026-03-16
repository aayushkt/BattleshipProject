import { useState, useEffect, useRef } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { Board } from './components/Board';
import { ShipPlacer } from './components/ShipPlacer';
import { GameState, Ship, SunkShip, initialState, GameMode, SHIP_LENGTHS } from './types';
import './App.css';

const WS_URL = import.meta.env.VITE_WS_URL || null;
const STORAGE_KEY = 'battleship_session';

function saveSession(gameId: string, playerId: string) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ gameId, playerId }));
}

function loadSession(): { gameId: string; playerId: string } | null {
  const data = sessionStorage.getItem(STORAGE_KEY);
  if (!data) return null;
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

function clearSession() {
  sessionStorage.removeItem(STORAGE_KEY);
}

// Calculate streamer's remaining fleet from cellHits
function calculateFleetRemaining(ships: Ship[], cellHits: Record<string, number>, viewerCount: number): number {
  if (viewerCount === 0) return 17;
  let total = 0;
  for (const ship of ships) {
    const length = SHIP_LENGTHS[ship.type];
    for (let i = 0; i < length; i++) {
      const x = ship.orientation === 'horizontal' ? ship.x + i : ship.x;
      const y = ship.orientation === 'vertical' ? ship.y + i : ship.y;
      const hits = cellHits[`${x},${y}`] || 0;
      total += Math.max(0, 1 - hits / viewerCount);
    }
  }
  return total;
}

export default function App() {
  const [state, setState] = useState<GameState>(initialState);
  const [joinGameId, setJoinGameId] = useState('');
  const { send, messages, clearMessages, readyState } = useWebSocket(WS_URL);
  const reconnectAttempted = useRef(false);

  // Attempt reconnect on initial connection
  useEffect(() => {
    if (readyState !== 'open' || reconnectAttempted.current) return;
    reconnectAttempted.current = true;

    const session = loadSession();
    if (session) {
      send({ action: 'reconnect', payload: session });
    }
  }, [readyState, send]);

  useEffect(() => {
    if (messages.length === 0) return;

    for (const msg of messages) {
      const { event, payload } = msg;

      switch (event) {
        case 'gameCreated':
          saveSession(payload.gameId, payload.playerId);
          setState(s => ({
            ...s,
            gameId: payload.gameId,
            playerId: payload.playerId,
            mode: payload.mode,
            role: payload.mode === 'streamer' ? 'streamer' : 'player',
            phase: payload.mode === 'streamer' ? 'lobby' : 'placing',
            opponentJoined: payload.mode === 'ai',
            opponentReady: payload.mode === 'ai',
          }));
          break;

        case 'gameJoined':
          saveSession(payload.gameId, payload.playerId);
          setState(s => ({
            ...s,
            gameId: payload.gameId,
            playerId: payload.playerId,
            mode: payload.mode || s.mode,
            role: payload.role || 'player',
            phase: 'placing',
            opponentJoined: true,
            opponentReady: payload.opponentReady || false,
            streamerReady: payload.streamerReady || false,
          }));
          break;

        case 'lobbyUpdate':
          setState(s => ({
            ...s,
            viewerCount: payload.viewerCount,
            readyCount: payload.readyCount,
          }));
          break;

        case 'lobbyLockChanged':
          setState(s => ({ ...s, lobbyLocked: payload.locked }));
          break;

        case 'kicked':
          clearSession();
          setState(s => ({
            ...s,
            phase: 'kicked',
            kickReason: payload.reason,
          }));
          break;

        case 'reconnected':
          setState(s => {
            const isStreamerMode = payload.mode === 'streamer';
            const isStreamerRole = payload.role === 'streamer';
            let phase = payload.phase;
            
            // For viewers in streamer mode during lobby, show placing/waiting
            if (isStreamerMode && !isStreamerRole && payload.phase === 'lobby') {
              phase = payload.myShips?.length > 0 ? 'waiting' : 'placing';
            }
            // For 1v1 placing phase with ships placed
            if (!isStreamerMode && payload.phase === 'placing' && payload.myShips?.length > 0) {
              phase = 'waiting';
            }
            
            return {
              ...s,
              gameId: payload.gameId,
              playerId: payload.playerId,
              mode: payload.mode,
              role: payload.role || 'player',
              phase,
              myShips: payload.myShips || [],
              myShots: payload.myShots || [],
              opponentShots: payload.opponentShots || [],
              sunkEnemyShips: payload.sunkEnemyShips || [],
              opponentJoined: payload.opponentJoined ?? true,
              opponentReady: payload.opponentReady ?? false,
              yourTurn: payload.yourTurn,
              winner: payload.winner,
              // Streamer fields
              viewerCount: payload.viewerCount ?? s.viewerCount,
              readyCount: payload.readyCount ?? s.readyCount,
              lobbyLocked: payload.lobbyLocked ?? s.lobbyLocked,
              cellHits: payload.cellHits || {},
              waitingForViewers: payload.waitingForViewers || false,
              streamerReady: payload.streamerReady ?? s.streamerReady,
            };
          });
          break;

        case 'opponentJoined':
          setState(s => ({ ...s, opponentJoined: true }));
          break;

        case 'opponentReady':
          setState(s => ({ ...s, opponentReady: true }));
          break;

        case 'shipsPlaced':
          break;

        case 'gameStarted':
          setState(s => ({
            ...s,
            phase: 'playing',
            yourTurn: payload.yourTurn,
            viewerCount: payload.viewerCount ?? s.viewerCount,
            activeViewerCount: payload.viewerCount ?? s.viewerCount,
            viewersFired: 0,
          }));
          break;

        case 'streamerFireResult':
          setState(s => {
            const key = `${payload.x},${payload.y}`;
            return {
              ...s,
              myShots: [...s.myShots, { x: payload.x, y: payload.y, hit: payload.hitRatio > 0 }],
              cellHits: payload.viewerDamage || s.cellHits,
              attackHitRatios: { ...s.attackHitRatios, [key]: payload.hitRatio },
              pendingShot: null,
              hasFiredThisTurn: true,
              yourTurn: false,
              viewersFired: 0,
            };
          });
          break;

        case 'viewerHit':
          // Streamer receives this when a viewer hits their ship
          setState(s => {
            const key = `${payload.x},${payload.y}`;
            return {
              ...s,
              cellHits: { ...s.cellHits, [key]: (s.cellHits[key] || 0) + 1 },
            };
          });
          break;

        case 'viewerShot':
          // Streamer receives this for all viewer shots (hits and misses)
          setState(s => {
            const key = `${payload.x},${payload.y}`;
            const field = payload.hit ? 'cellHits' : 'cellMisses';
            return {
              ...s,
              [field]: { ...s[field], [key]: (s[field][key] || 0) + 1 },
              viewersFired: payload.viewersFired ?? s.viewersFired,
              activeViewerCount: payload.activeViewerCount ?? s.activeViewerCount,
            };
          });
          break;

        case 'streamerFired':
          setState(s => {
            const sunkShip: SunkShip | undefined = payload.sunk;
            return {
              ...s,
              opponentShots: [...s.opponentShots, {
                x: payload.x,
                y: payload.y,
                hit: payload.hit,
                sunk: sunkShip?.type,
              }],
              sunkEnemyShips: sunkShip ? [...s.sunkEnemyShips, sunkShip] : s.sunkEnemyShips,
            };
          });
          break;

        case 'viewerFireResult':
          setState(s => ({
            ...s,
            myShots: [...s.myShots, { x: payload.x, y: payload.y, hit: payload.hit }],
            pendingShot: null,
            hasFiredThisTurn: true,
          }));
          break;

        case 'waitingForViewers':
          setState(s => ({ ...s, waitingForViewers: true }));
          break;

        case 'fireResult':
          setState(s => {
            const sunkShip: SunkShip | undefined = payload.sunk;
            if (payload.yourShot) {
              return {
                ...s,
                myShots: [...s.myShots, {
                  x: payload.x,
                  y: payload.y,
                  hit: payload.hit,
                  sunk: sunkShip?.type,
                }],
                sunkEnemyShips: sunkShip ? [...s.sunkEnemyShips, sunkShip] : s.sunkEnemyShips,
                pendingShot: null,
              };
            } else {
              return {
                ...s,
                opponentShots: [...s.opponentShots, {
                  x: payload.x,
                  y: payload.y,
                  hit: payload.hit,
                  sunk: sunkShip?.type,
                }],
              };
            }
          });
          break;

        case 'turnChange':
        case 'turnChanged':
          setState(s => ({
            ...s,
            yourTurn: payload.yourTurn,
            hasFiredThisTurn: false,
          }));
          break;

        case 'gameOver':
          setState(s => ({
            ...s,
            phase: 'finished',
            winner: payload.winner,
            winReason: payload.reason,
          }));
          break;

        case 'error':
          // If reconnect failed, clear session and show menu
          if (payload.code === 'GAME_NOT_FOUND' || payload.code === 'NOT_IN_GAME') {
            clearSession();
          }
          // If NOT_YOUR_TURN, just clear pending shot
          if (payload.code === 'NOT_YOUR_TURN') {
            setState(s => ({
              ...s,
              pendingShot: null,
              yourTurn: false,
            }));
            break;
          }
          setState(s => ({ ...s, error: payload.message, pendingShot: null }));
          setTimeout(() => setState(s => ({ ...s, error: null })), 3000);
          break;
      }
    }

    clearMessages();
  }, [messages, clearMessages]);

  const handleCreateGame = (mode: GameMode) => {
    send({ action: 'createGame', payload: { mode } });
  };

  const handleJoinGame = () => {
    if (joinGameId.trim()) {
      send({ action: 'joinGame', payload: { gameId: joinGameId.trim() } });
    }
  };

  const handlePlaceShips = (ships: Ship[]) => {
    setState(s => ({ ...s, myShips: ships, phase: s.mode === 'streamer' && s.role === 'streamer' ? 'lobby' : 'waiting' }));
    send({ action: 'placeShips', payload: { ships } });
  };

  const handleLockLobby = (lock: boolean) => {
    send({ action: lock ? 'lockLobby' : 'unlockLobby', payload: {} });
    setState(s => ({ ...s, lobbyLocked: lock }));
  };

  const handleStartGame = () => {
    send({ action: 'startGame', payload: {} });
  };

  const handleFire = (x: number, y: number) => {
    if (!state.yourTurn || state.pendingShot) return;
    setState(s => ({ ...s, pendingShot: { x, y } }));
    send({ action: 'fire', payload: { x, y } });
  };

  const handleForfeit = () => {
    if (state.mode === 'streamer') {
      if (state.role === 'viewer') {
        send({ action: 'viewerForfeit', payload: {} });
      } else {
        send({ action: 'streamerForfeit', payload: {} });
      }
    } else {
      send({ action: 'forfeit', payload: {} });
    }
    clearSession();
  };

  const handlePlayAgain = () => {
    clearSession();
    setState(initialState);
  };

  if (!WS_URL) {
    return (
      <div className="app">
        <h1>Battleship</h1>
        <div className="status error">
          WebSocket URL not configured. Set VITE_WS_URL environment variable.
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <h1>Battleship</h1>

      {readyState !== 'open' && (
        <div className="status connecting">Connecting...</div>
      )}

      {state.error && (
        <div className="status error">{state.error}</div>
      )}

      {state.phase === 'menu' && readyState === 'open' && (
        <div className="menu">
          <button onClick={() => handleCreateGame('ai')}>Play vs AI</button>
          <button onClick={() => handleCreateGame('pvp')}>Create PvP Game</button>
          <button onClick={() => handleCreateGame('streamer')}>Create Streamer Game</button>
          <div style={{ display: 'flex', gap: '10px' }}>
            <input
              type="text"
              placeholder="Game ID"
              value={joinGameId}
              onChange={e => setJoinGameId(e.target.value)}
            />
            <button onClick={handleJoinGame}>Join Game</button>
          </div>
        </div>
      )}

      {state.phase === 'lobby' && state.role === 'streamer' && (
        <div className="game">
          <div className="lobby-status">
            <div className="game-info">
              Share this Game ID: <span className="game-id">{state.gameId}</span>
            </div>
            <div className="viewer-count">
              {state.viewerCount} players joined, {state.readyCount} ready
            </div>
          </div>
          {state.myShips.length === 0 ? (
            <ShipPlacer onComplete={handlePlaceShips} />
          ) : (
            <>
              <Board ships={state.myShips} shots={[]} isOpponent={false} />
              <div className="lobby-controls">
                <button onClick={() => handleLockLobby(!state.lobbyLocked)}>
                  {state.lobbyLocked ? 'Unlock Lobby' : 'Lock Lobby'}
                </button>
                <button 
                  onClick={handleStartGame}
                  disabled={state.readyCount === 0}
                >
                  Start Game ({state.readyCount} players)
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {state.phase === 'kicked' && (
        <div className="game-over lost">
          <h2>Kicked from Game</h2>
          <p>{state.kickReason}</p>
          <button onClick={handlePlayAgain}>Back to Menu</button>
        </div>
      )}

      {state.phase === 'placing' && (
        <div className="game">
          <div className="lobby-status">
            {state.mode === 'pvp' && state.gameId && (
              <div className="game-info">
                Share this Game ID: <span className="game-id">{state.gameId}</span>
              </div>
            )}
            {!state.opponentJoined && (
              <div className="opponent-status">
                Waiting for opponent to join...
              </div>
            )}
          </div>
          <ShipPlacer onComplete={handlePlaceShips} />
        </div>
      )}

      {state.phase === 'waiting' && (
        <div className="game">
          <div className="lobby-status">
            {state.mode === 'pvp' && state.gameId && (
              <div className="game-info">
                Share this Game ID: <span className="game-id">{state.gameId}</span>
              </div>
            )}
            <div className="game-info">Ships placed!</div>
            <div className={`opponent-status ${(state.mode === 'streamer' ? state.streamerReady : state.opponentReady) ? 'ready' : ''}`}>
              {state.mode === 'streamer' && state.role === 'viewer' ? (
                state.streamerReady 
                  ? 'Waiting for streamer to start game...'
                  : 'Waiting for streamer to place ships...'
              ) : (
                <>
                  {!state.opponentJoined && 'Waiting for opponent to join...'}
                  {state.opponentJoined && !state.opponentReady && 'Waiting for opponent to place ships...'}
                  {state.opponentReady && 'Opponent is ready!'}
                </>
              )}
            </div>
          </div>
          <Board ships={state.myShips} shots={[]} isOpponent={false} />
        </div>
      )}

      {state.phase === 'playing' && (
        <div className="game">
          <div className={`game-info ${state.yourTurn && !state.hasFiredThisTurn ? 'your-turn' : 'waiting'}`}>
            <span>
              {state.waitingForViewers || (state.mode === 'streamer' && state.role === 'viewer' && state.hasFiredThisTurn)
                ? 'Waiting for other viewers to finish...'
                : state.yourTurn && !state.hasFiredThisTurn
                  ? 'Your turn - click to fire!' 
                  : state.mode === 'streamer' && state.role === 'viewer'
                    ? "Streamer's turn..."
                    : "Opponent's turn..."}
            </span>
            {state.mode === 'streamer' && state.role === 'streamer' && !state.yourTurn && (
              <span className="turn-timer">{state.viewersFired}/{state.activeViewerCount} viewers fired</span>
            )}
          </div>
          {state.mode === 'streamer' && state.role === 'streamer' && (
            <div className="viewer-count">Playing against {state.viewerCount} viewers</div>
          )}
          <div className="boards">
            <div className="board-container">
              <div className="board-header">
                <h3>Your Fleet</h3>
                {state.mode === 'streamer' && state.role === 'streamer' ? (
                  <span className="squares-remaining">
                    {calculateFleetRemaining(state.myShips, state.cellHits, state.viewerCount).toFixed(1)}/17
                  </span>
                ) : (
                  <span className="squares-remaining">
                    {17 - state.opponentShots.filter(s => s.hit).length}/17
                  </span>
                )}
              </div>
              <Board
                ships={state.myShips}
                shots={state.mode === 'streamer' && state.role === 'streamer' ? [] : state.opponentShots}
                isOpponent={false}
                cellHits={state.mode === 'streamer' && state.role === 'streamer' ? state.cellHits : undefined}
                cellMisses={state.mode === 'streamer' && state.role === 'streamer' ? state.cellMisses : undefined}
                viewerCount={state.viewerCount}
              />
            </div>
            <div className="board-container">
              <div className="board-header">
                <h3>{state.mode === 'streamer' && state.role === 'streamer' ? 'Viewers' : 'Enemy Waters'}</h3>
                <span className="squares-remaining">
                  {state.mode === 'streamer' && state.role === 'streamer'
                    ? `${(17 - Object.values(state.attackHitRatios).reduce((sum, r) => sum + r, 0)).toFixed(1)}/17`
                    : `${17 - state.myShots.filter(s => s.hit).length}/17`}
                </span>
              </div>
              <Board
                shots={state.myShots}
                sunkShips={state.sunkEnemyShips}
                pendingShot={state.pendingShot}
                isOpponent={true}
                onCellClick={handleFire}
                disabled={!state.yourTurn || !!state.pendingShot || state.waitingForViewers || state.hasFiredThisTurn}
                attackHitRatios={state.mode === 'streamer' && state.role === 'streamer' ? state.attackHitRatios : undefined}
              />
            </div>
          </div>
          <button className="forfeit-btn" onClick={handleForfeit}>
            Forfeit and exit game
          </button>
        </div>
      )}

      {state.phase === 'finished' && (
        <div className={`game-over ${state.winner === 'you' || state.winner === 'streamer' ? 'won' : 'lost'}`}>
          <h2>{state.winner === 'you' || (state.winner === 'streamer' && state.role === 'streamer') || (state.winner === 'viewers' && state.role === 'viewer') ? 'Victory!' : 'Defeat'}</h2>
          <p>
            {state.mode === 'streamer' && state.winner === 'streamer' && state.role === 'streamer' && 'You eliminated all viewers!'}
            {state.mode === 'streamer' && state.winner === 'streamer' && state.role === 'viewer' && 'The streamer eliminated all viewers.'}
            {state.mode === 'streamer' && state.winner === 'viewers' && state.role === 'viewer' && 'The viewers sank the streamer\'s fleet!'}
            {state.mode === 'streamer' && state.winner === 'viewers' && state.role === 'streamer' && 'The viewers sank your fleet!'}
            {state.mode !== 'streamer' && state.winner === 'you' && state.winReason === 'opponent_forfeit' && 'Your opponent rage quit!'}
            {state.mode !== 'streamer' && state.winner === 'you' && state.winReason !== 'opponent_forfeit' && 'You sank all enemy ships!'}
            {state.mode !== 'streamer' && state.winner === 'opponent' && state.winReason === 'forfeit' && "Mission failed, we'll get em next time."}
            {state.mode !== 'streamer' && state.winner === 'opponent' && state.winReason !== 'forfeit' && 'Your fleet was destroyed.'}
          </p>
          <button onClick={handlePlayAgain}>Play Again</button>
        </div>
      )}
    </div>
  );
}
