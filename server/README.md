# Server

Lambda functions and game logic for Battleship.

## Structure

```
src/
├── handlers/       Lambda entry points ($connect, $disconnect, $default)
├── game/           Core game logic (pure functions, no AWS deps)
│   ├── types.ts    Game state types
│   ├── rules.ts    Ship placement, shot resolution, win conditions
│   ├── ai.ts       AI shot selection (hunt/target algorithm)
│   └── index.ts    Exports
└── db/             DynamoDB operations
```

## Handler Routing

`message.ts` routes WebSocket messages by `action` field:

| Action | Handler | Description |
|--------|---------|-------------|
| `createGame` | `handleCreateGame` | Start AI/PvP game |
| `createStreamerGame` | `handleCreateStreamerGame` | Start streamer lobby |
| `joinGame` | `handleJoinGame` / `handleViewerJoin` | Join existing game |
| `placeShips` | `handlePlaceShips` / streamer variants | Submit ship placement |
| `fire` | `handleFire` / streamer variants | Fire at coordinate |
| `startGame` | `handleStartStreamerGame` | Streamer starts match |
| `viewerForfeit` | `handleViewerForfeit` | Viewer leaves mid-game |

## Game Logic

The `game/` folder contains pure functions with no AWS dependencies:

- `validateShipPlacement()` - Checks ships fit on board, don't overlap
- `processShot()` - Returns hit/miss/sunk result
- `checkWinCondition()` - Determines if game is over
- `getAIShot()` - Hunt/target AI algorithm

This separation allows unit testing without mocks and keeps business logic portable.

## Streamer Mode

Streamer mode uses different state structures:

- `StreamerGameState` - Tracks all viewers, cell hit counts, turn state
- `ViewerState` - Individual viewer's board and firing status
- Heat map: `cellHits[coord]` / `viewerCount` = intensity (0-1)

Turn flow is server-driven: all viewers must fire before turn switches to streamer.

## Build

```bash
npm install
npm run build   # Outputs to dist/
```
