import { useState, useEffect } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { Board } from './components/Board';
import { ShipPlacer } from './components/ShipPlacer';
import { GameState, Ship, SunkShip, initialState } from './types';
import './App.css';

const WS_URL = import.meta.env.VITE_WS_URL || null;

export default function App() {
  const [state, setState] = useState<GameState>(initialState);
  const [joinGameId, setJoinGameId] = useState('');
  const { send, messages, clearMessages, readyState } = useWebSocket(WS_URL);

  useEffect(() => {
    if (messages.length === 0) return;

    for (const msg of messages) {
      const { event, payload } = msg;

      switch (event) {
        case 'gameCreated':
          setState(s => ({
            ...s,
            gameId: payload.gameId,
            playerId: payload.playerId,
            mode: payload.mode,
            phase: 'placing',
          }));
          break;

        case 'gameJoined':
          setState(s => ({
            ...s,
            gameId: payload.gameId,
            playerId: payload.playerId,
            phase: 'placing',
          }));
          break;

        case 'opponentJoined':
          break;

        case 'shipsPlaced':
          break;

        case 'gameStarted':
          setState(s => ({
            ...s,
            phase: 'playing',
            yourTurn: payload.yourTurn,
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
          setState(s => ({ ...s, yourTurn: payload.yourTurn }));
          break;

        case 'gameOver':
          setState(s => ({
            ...s,
            phase: 'finished',
            winner: payload.winner,
          }));
          break;

        case 'error':
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
    setState(s => ({ ...s, myShips: ships }));
    send({ action: 'placeShips', payload: { ships } });
  };

  const handleFire = (x: number, y: number) => {
    if (!state.yourTurn || state.pendingShot) return;
    setState(s => ({ ...s, pendingShot: { x, y } }));
    send({ action: 'fire', payload: { x, y } });
  };

  const handlePlayAgain = () => {
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
          {state.mode === 'pvp' && state.gameId && (
            <div className="game-info">
              Share this Game ID: <span className="game-id">{state.gameId}</span>
            </div>
          )}
          <ShipPlacer onComplete={handlePlaceShips} />
        </div>
      )}

      {state.phase === 'playing' && (
        <div className="game">
          <div className={`game-info ${state.yourTurn ? 'your-turn' : 'waiting'}`}>
            {state.yourTurn ? 'Your turn - click to fire!' : "Opponent's turn..."}
          </div>
          <div className="boards">
            <div className="board-container">
              <h3>Your Fleet</h3>
              <Board
                ships={state.myShips}
                shots={state.opponentShots}
                isOpponent={false}
              />
            </div>
            <div className="board-container">
              <h3>Enemy Waters</h3>
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
        </div>
      )}

      {state.phase === 'finished' && (
        <div className={`game-over ${state.winner === 'you' ? 'won' : 'lost'}`}>
          <h2>{state.winner === 'you' ? 'Victory!' : 'Defeat'}</h2>
          <p>{state.winner === 'you' ? 'You sank all enemy ships!' : 'Your fleet was destroyed.'}</p>
          <button onClick={handlePlayAgain}>Play Again</button>
        </div>
      )}
    </div>
  );
}
