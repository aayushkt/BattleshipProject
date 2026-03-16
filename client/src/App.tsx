import { useState, useEffect, useRef } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { Board } from './components/Board';
import { ShipPlacer } from './components/ShipPlacer';
import { GameState, Ship, SunkShip, initialState, TURN_DURATION_MS } from './types';
import './App.css';

const WS_URL = import.meta.env.VITE_WS_URL || null;
const STORAGE_KEY = 'battleship_session';

function saveSession(gameId: string, playerId: string) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ gameId, playerId }));
}

function loadSession(): { gameId: string; playerId: string } | null {
  const data = localStorage.getItem(STORAGE_KEY);
  if (!data) return null;
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

function clearSession() {
  localStorage.removeItem(STORAGE_KEY);
}

export default function App() {
  const [state, setState] = useState<GameState>(initialState);
  const [joinGameId, setJoinGameId] = useState('');
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const { send, messages, clearMessages, readyState } = useWebSocket(WS_URL);
  const reconnectAttempted = useRef(false);

  // Timer effect - runs every 100ms when game is playing
  useEffect(() => {
    if (state.phase !== 'playing' || !state.turnStartedAt) return;

    const interval = setInterval(() => {
      const elapsed = Date.now() - state.turnStartedAt!;
      const turnIndex = Math.floor(elapsed / TURN_DURATION_MS) % 2;
      const remaining = TURN_DURATION_MS - (elapsed % TURN_DURATION_MS);
      
      setTimeRemaining(remaining);
      
      // turnIndex 0 = whoever had turn at start, turnIndex 1 = the other player
      const shouldBeYourTurn = turnIndex === 0 ? state.yourTurnAtStart : !state.yourTurnAtStart;
      if (shouldBeYourTurn !== state.yourTurn) {
        setState(s => ({ ...s, yourTurn: shouldBeYourTurn }));
      }
    }, 100);

    return () => clearInterval(interval);
  }, [state.phase, state.turnStartedAt, state.yourTurn, state.yourTurnAtStart]);

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
            phase: 'placing',
            // AI mode: opponent is already joined and ready
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
            phase: 'placing',
            opponentJoined: true, // if we're joining, opponent (creator) exists
            opponentReady: payload.opponentReady || false,
          }));
          break;

        case 'reconnected':
          setState(s => ({
            ...s,
            gameId: payload.gameId,
            playerId: payload.playerId,
            mode: payload.mode,
            phase: payload.phase === 'placing' && payload.myShips.length > 0 ? 'waiting' : payload.phase,
            myShips: payload.myShips,
            myShots: payload.myShots,
            opponentShots: payload.opponentShots,
            sunkEnemyShips: payload.sunkEnemyShips || [],
            opponentJoined: payload.opponentJoined ?? true,
            opponentReady: payload.opponentReady ?? false,
            yourTurn: payload.yourTurn,
            turnStartedAt: payload.turnStartedAt || null,
            yourTurnAtStart: payload.yourTurn,
            winner: payload.winner,
          }));
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
            turnStartedAt: Date.now(),
            yourTurnAtStart: payload.yourTurn,
          }));
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
          setState(s => ({
            ...s,
            yourTurn: payload.yourTurn,
            turnStartedAt: Date.now(),
            yourTurnAtStart: payload.yourTurn,
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
          // If NOT_YOUR_TURN, resync timer and clear pending shot without error message
          if (payload.code === 'NOT_YOUR_TURN' && payload.remainingMs !== undefined) {
            const yourTurnNow = false;
            setState(s => ({
              ...s,
              pendingShot: null,
              yourTurn: yourTurnNow,
              turnStartedAt: Date.now() - (TURN_DURATION_MS - payload.remainingMs),
              yourTurnAtStart: yourTurnNow,
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

  const handleCreateGame = (mode: 'ai' | 'pvp') => {
    send({ action: 'createGame', payload: { mode } });
  };

  const handleJoinGame = () => {
    if (joinGameId.trim()) {
      send({ action: 'joinGame', payload: { gameId: joinGameId.trim() } });
    }
  };

  const handlePlaceShips = (ships: Ship[]) => {
    setState(s => ({ ...s, myShips: ships, phase: 'waiting' }));
    send({ action: 'placeShips', payload: { ships } });
  };

  const handleFire = (x: number, y: number) => {
    if (!state.yourTurn || state.pendingShot) return;
    setState(s => ({ ...s, pendingShot: { x, y } }));
    send({ action: 'fire', payload: { x, y } });
  };

  const handleForfeit = () => {
    send({ action: 'forfeit', payload: {} });
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

      {state.phase === 'placing' && (
        <div className="game">
          <div className="lobby-status">
            {state.mode === 'pvp' && state.gameId && (
              <div className="game-info">
                Share this Game ID: <span className="game-id">{state.gameId}</span>
              </div>
            )}
            <div className={`opponent-status ${state.opponentReady ? 'ready' : ''}`}>
              {!state.opponentJoined && 'Waiting for opponent to join...'}
              {state.opponentJoined && !state.opponentReady && 'Waiting for opponent to place ships...'}
              {state.opponentReady && 'Opponent is ready!'}
            </div>
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
            <div className={`opponent-status ${state.opponentReady ? 'ready' : ''}`}>
              {!state.opponentJoined && 'Waiting for opponent to join...'}
              {state.opponentJoined && !state.opponentReady && 'Waiting for opponent to place ships...'}
              {state.opponentReady && 'Opponent is ready!'}
            </div>
          </div>
          <Board ships={state.myShips} shots={[]} isOpponent={false} />
        </div>
      )}

      {state.phase === 'playing' && (
        <div className="game">
          <div className={`game-info ${state.yourTurn ? 'your-turn' : 'waiting'}`}>
            <span>{state.yourTurn ? 'Your turn - click to fire!' : "Opponent's turn..."}</span>
            {timeRemaining !== null && (
              <span className="turn-timer">{Math.ceil(timeRemaining / 1000)}s</span>
            )}
          </div>
          <div className="boards">
            <div className="board-container">
              <div className="board-header">
                <h3>Your Fleet</h3>
                <span className="squares-remaining">
                  {17 - state.opponentShots.filter(s => s.hit).length}/17
                </span>
              </div>
              <Board
                ships={state.myShips}
                shots={state.opponentShots}
                isOpponent={false}
              />
            </div>
            <div className="board-container">
              <div className="board-header">
                <h3>Enemy Waters</h3>
                <span className="squares-remaining">
                  {17 - state.myShots.filter(s => s.hit).length}/17
                </span>
              </div>
              <Board
                shots={state.myShots}
                sunkShips={state.sunkEnemyShips}
                pendingShot={state.pendingShot}
                isOpponent={true}
                onCellClick={handleFire}
                disabled={!state.yourTurn || !!state.pendingShot}
              />
            </div>
          </div>
          <button className="forfeit-btn" onClick={handleForfeit}>
            Forfeit and exit game
          </button>
        </div>
      )}

      {state.phase === 'finished' && (
        <div className={`game-over ${state.winner === 'you' ? 'won' : 'lost'}`}>
          <h2>{state.winner === 'you' ? 'Victory!' : 'Defeat'}</h2>
          <p>
            {state.winner === 'you' && state.winReason === 'opponent_forfeit' && 'Your opponent rage quit!'}
            {state.winner === 'you' && state.winReason !== 'opponent_forfeit' && 'You sank all enemy ships!'}
            {state.winner === 'opponent' && state.winReason === 'forfeit' && "Mission failed, we'll get em next time."}
            {state.winner === 'opponent' && state.winReason !== 'forfeit' && 'Your fleet was destroyed.'}
          </p>
          <button onClick={handlePlayAgain}>Play Again</button>
        </div>
      )}
    </div>
  );
}
