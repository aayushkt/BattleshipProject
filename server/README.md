# Server

Lambda functions and game logic for Battleship.

## Responsibilities

- WebSocket connection management
- Game state management (create, join, play)
- Ship placement validation
- Shot resolution (hit/miss/sunk)
- AI opponent logic
- Move history recording

## Structure

```
server/
├── src/
│   ├── handlers/          # Lambda entry points
│   │   ├── connect.ts     # $connect route
│   │   ├── disconnect.ts  # $disconnect route
│   │   └── message.ts     # $default route (game actions)
│   ├── game/              # Core game logic (pure functions)
│   │   ├── state.ts       # Game state types and operations
│   │   ├── validation.ts  # Ship placement and move validation
│   │   ├── ai.ts          # AI shot selection
│   │   └── rules.ts       # Win conditions, turn logic
│   └── db/                # DynamoDB operations
│       └── client.ts
└── package.json
```

## Local Development

```bash
npm install
npm run test        # Unit tests
npm run test:watch  # Watch mode
```

## API (WebSocket Messages)

### Client to Server

| Action | Payload | Description |
|--------|---------|-------------|
| `createGame` | `{ mode: 'ai' \| 'pvp' }` | Start new game |
| `joinGame` | `{ gameId }` | Join existing game |
| `placeShips` | `{ ships: Ship[] }` | Submit ship placement |
| `fire` | `{ x, y }` | Fire at coordinate |

### Server to Client

| Event | Payload | Description |
|-------|---------|-------------|
| `gameCreated` | `{ gameId }` | Game ready, waiting for opponent |
| `gameStarted` | `{ opponentReady }` | Both players joined |
| `shipsPlaced` | `{ success }` | Placement confirmed |
| `fireResult` | `{ x, y, hit, sunk?, shipType? }` | Shot outcome |
| `turnChange` | `{ yourTurn }` | Turn notification |
| `gameOver` | `{ winner, reason }` | Game ended |
| `error` | `{ code, message }` | Validation failure |
