# Client

React SPA for the Battleship game interface.

## Structure

```
src/
├── components/
│   ├── Board.tsx        10x10 grid with heat map support
│   └── ShipPlacer.tsx   Drag-and-drop ship placement
├── hooks/
│   └── useWebSocket.ts  Connection management with reconnect
├── types.ts             Game state types
├── App.tsx              Main game flow and state machine
└── App.css              Styling
```

## Game State Machine

`App.tsx` manages phases via `state.phase`:

```
menu → placing → waiting → playing → finished
                    ↑          ↓
                    └──────────┘ (reconnect)
```

- **menu**: Mode selection (AI, PvP, Streamer, Join)
- **placing**: Ship placement UI
- **waiting**: Waiting for opponent to place ships
- **playing**: Active game with turn-based firing
- **finished**: Game over screen

## WebSocket Events

The client handles these server events:

| Event | Action |
|-------|--------|
| `gameCreated` | Store gameId, transition to placing |
| `gameJoined` | Store gameId, show opponent joined |
| `shipsPlaced` | Transition to waiting |
| `gameStarted` | Transition to playing |
| `fireResult` | Update own board (opponent's shot) |
| `opponentFireResult` | Update opponent board (own shot) |
| `turnChanged` | Update whose turn it is |
| `gameOver` | Show winner, transition to finished |

## Streamer Mode UI

Additional state for streamer mode:

- `cellHits` / `cellMisses` - Defense heat map (viewer shots at streamer)
- `attackHitRatios` - Attack heat map (streamer shots at viewers)
- `viewerCount` - Total viewers for percentage calculation
- Heat map colors: red gradient for hits, green for misses

## Development

```bash
npm install
npm run dev     # http://localhost:5173
npm run build   # Outputs to dist/
```

Requires `VITE_WS_URL` environment variable (set by deploy script).
