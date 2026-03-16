# Streamer Mode Design Document

## Overview

Streamer mode pits one streamer against up to 500 viewers. The streamer fires simultaneously at all viewers, while viewers collectively chip away at the streamer's fleet. Turns alternate on fixed 45-second intervals.

## Game Flow

### Lobby Phase
1. Streamer creates game with mode `streamer`
2. Streamer places ships while viewers join via game ID
3. Streamer sees: "X players joined, Y ready"
4. Streamer controls:
   - **Lock/Unlock lobby**: Control whether new viewers can join
   - **Start game**: Requires ≥1 ready viewer; kicks unready viewers
5. Kicked viewers see: "You did not finish placing your ships before the game started!"

### Playing Phase
1. Fixed 45-second turn intervals (no server turn-change messages)
2. All clients calculate current turn: `turnIndex = floor((now - turnStartedAt) / 45000) % 2`
   - `turnIndex === 0`: Streamer's turn
   - `turnIndex === 1`: Viewers' turn
3. **Streamer fires**: One coordinate checked against all viewer boards
4. **Viewers fire**: Each fires independently at streamer; results aggregated

### Win Conditions
- **Viewers win**: Streamer's fleet remaining ≤ 0
- **Streamer wins**: All viewers eliminated (all 17 cells hit on each)

## Damage Model

### Streamer → Viewers
- Streamer fires at (x, y) → server checks all viewer boards
- Each viewer receives normal hit/miss result
- Streamer sees: hit ratio = (viewers hit) / (total viewers)
- Display: intensity interpolates from dark red (`#742a2a`) to bright red (`#e53e3e`)

### Viewers → Streamer
- Server tracks `cellHits: { "x,y": count }` — how many viewers fired at each cell
- Streamer's fleet remaining = sum of `(1 - cellHits[cell]/viewerCount)` for all 17 ship cells
- Display intensity = `cellHits[cell] / viewerCount`
  - Ship cell: dark red → bright red
  - Empty cell: dark green (`#2a742a`) → bright green (`#3ee53e`)
- Cells with 0 fires show normal (ship indicator or empty)

### Viewer "Finished Firing"
- Once a viewer has hit all 17 streamer ship cells, they stop firing
- They continue receiving streamer's shots and watching
- Server tracks `shotsAtStreamer` per viewer to validate this

## Data Model

### Streamer State (`PK: GAME#xxx, SK: STREAMER`)
```typescript
{
  streamerId: string,
  phase: 'lobby' | 'playing' | 'finished',
  lobbyLocked: boolean,
  viewerCount: number,
  readyCount: number,          // Lobby phase only
  streamerBoard: {
    ships: Ship[],
    cellHits: Record<string, number>  // "x,y" → count
  },
  turnStartedAt: number,
  winner: 'streamer' | 'viewers' | null
}
```

### Viewer State (`PK: GAME#xxx, SK: VIEWER#playerId`)
```typescript
{
  oderId: string,
  oderId: string,
  ready: boolean,
  eliminated: boolean,
  board: {
    ships: Ship[],
    shotsReceived: Shot[]
  },
  shotsAtStreamer: Shot[],
  connectionId: string
}
```

### Connection (`PK: CONN#xxx, SK: META`)
```typescript
{
  gameId: string,
  oderId: string,
  role: 'streamer' | 'viewer'
}
```

## API Messages

### Lobby
| Direction | Event | Payload |
|-----------|-------|---------|
| Streamer → Server | `createGame` | `{ mode: 'streamer' }` |
| Viewer → Server | `joinGame` | `{ gameId }` |
| Either → Server | `placeShips` | `{ ships }` |
| Streamer → Server | `lockLobby` | `{}` |
| Streamer → Server | `unlockLobby` | `{}` |
| Streamer → Server | `startGame` | `{}` |
| Server → Streamer | `lobbyUpdate` | `{ viewerCount, readyCount }` |
| Server → Viewer | `kicked` | `{ reason: 'not_ready' }` |

### Playing
| Direction | Event | Payload |
|-----------|-------|---------|
| Streamer → Server | `fire` | `{ x, y }` |
| Server → Streamer | `streamerFireResult` | `{ x, y, hitRatio, viewerDamage: { cellHits } }` |
| Server → Viewers | `streamerFired` | `{ x, y, hit, sunk }` |
| Viewer → Server | `fire` | `{ x, y }` |
| Server → Viewer | `viewerFireResult` | `{ x, y, hit }` |
| Server → Either | `gameOver` | `{ winner }` |

## Timer Design

- `turnStartedAt` set once when game starts
- No `turnChange` messages — clients self-calculate from local clock
- Server validates fires against same formula
- On reconnect, server sends `turnStartedAt` for resync
- Clock drift acceptable (server is source of truth for validation)

## Performance

### 500 Viewer Fire (Streamer's Turn)
1. BatchGetItem: 5 calls × 100 viewers = ~500ms
2. Compute hit/miss per viewer: negligible
3. BatchWriteItem updates: ~500ms
4. WebSocket fan-out (Promise.all): ~2-3s
5. **Total: ~4-5s**, well under 30s Lambda timeout

### Viewer Fire
- Single atomic increment on `cellHits`
- Single viewer record update
- No fan-out needed

### Lobby Updates
- Debounce to streamer every 2-3 seconds
- Atomic increments for `viewerCount`/`readyCount`

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Viewer eliminated (17 cells hit) | Continues playing, can still fire |
| Viewer finished firing (hit all 17 on streamer) | Stops firing, watches game |
| Turn timeout | Turn skips (same as 1v1) |
| Streamer disconnects | Game continues, streamer turns skipped |
| Viewer disconnects | Can reconnect; missed turns skipped |
| Mid-game join attempt | Rejected: "Game already in progress" |
| Streamer fleet exactly 0 | Game ends, viewers win |

## Implementation Status: COMPLETE

### Phase 1: Data Model & Lobby 
- Added `streamer` mode and `lobby` phase
- Created `StreamerGameState` and `ViewerState` types
- DB functions: `getStreamerGame`, `saveStreamerGame`, `getViewer`, `saveViewer`, `getAllViewers`, `batchGetViewers`, `batchSaveViewers`, `incrementCellHit`
- Handlers: `handleCreateStreamerGame`, `handleViewerJoin`, `handleStreamerPlaceShips`, `handleViewerPlaceShips`, `handleLockLobby`, `handleStartStreamerGame`
- Debounced lobby updates to streamer

### Phase 2: Streamer Fire 
- `handleStreamerFire`: validates turn, batch gets all viewers, computes hits, batch saves, fans out notifications
- Returns `hitRatio` and `viewerDamage` (cellHits) to streamer
- Checks win condition: all viewers eliminated

### Phase 3: Viewer Fire 
- `handleViewerFire`: validates turn, checks not finished firing
- Atomic increment `cellHits` on hit
- Sends `waitingForViewers` when viewer hits all 17
- Checks win condition: streamer fleet ≤ 0

### Phase 4: Client UI 
- Menu: "Create Streamer Game" button
- Lobby UI: viewer count, ready count, lock/start buttons
- Heat map board with intensity colors (red for hits, green for misses)
- Fleet remaining calculation from cellHits
- Waiting for viewers state
- Kicked screen
- Updated game over for streamer/viewers winners

### Phase 5: Reconnect & Polish 
- `handleStreamerReconnect`: restores streamer or viewer state
- Client handles streamer reconnect payload with all fields
- Timer works correctly for streamer mode (turnIndex 0 = streamer, 1 = viewers)
