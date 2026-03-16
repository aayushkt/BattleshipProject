# Server Design

## API Contract

The server is a black box that processes game actions. It doesn't know or care who's calling it.

### Inbound Messages (Client to Server)

```typescript
{ action: 'createGame', payload: { mode: 'ai' | 'pvp' } }
{ action: 'joinGame', payload: { gameId: string } }
{ action: 'placeShips', payload: { ships: Ship[] } }
{ action: 'fire', payload: { x: number, y: number } }
{ action: 'getState', payload: { gameId: string } }
```

### Outbound Messages (Server to Client)

```typescript
{ event: 'gameCreated', payload: { gameId, mode } }
{ event: 'gameStarted', payload: { opponentId } }
{ event: 'shipsPlaced', payload: { success } }
{ event: 'fireResult', payload: { x, y, hit, sunk? } }
{ event: 'turnChange', payload: { yourTurn } }
{ event: 'gameOver', payload: { winner, reason } }
{ event: 'state', payload: GameState }
{ event: 'error', payload: { code, message } }
```

---

## UNKNOWN

General tradeoffs that affect flexibility.

**Server-authoritative architecture**: All game logic runs server-side. Client never computes state. Cost is round-trip latency (~100ms), but eliminates cheating and desync.

**Pure game logic layer**: The `game/` folder has zero AWS dependencies. Handlers call game logic, game logic returns results. Testable without mocks, portable if infrastructure changes.

**Idempotent actions**: Duplicate requests return the same result. Network retries don't corrupt state.

**AI runs server-side**: Shot selection happens in Lambda. Keeps AI logic hidden, prevents client manipulation.

---

## ACCOUNTS

To add player identity and auth:

1. **Auth validation on $connect**: Handler validates JWT before allowing connection. Game logic unchanged.
2. **userId in game records**: Currently we use connectionId. Would store userId alongside it, persist userId in game history.
3. **Stats tracking**: New queries for wins/losses per user. Requires GSI on userId.

---

## STREAMING

To add spectators watching live:

1. **Broadcast to N connections**: Currently sends to 2 players. Would loop through all spectator connections or use SNS fan-out.
2. **Participant types**: Game state needs to distinguish players vs spectators. Spectators receive events but can't send actions.
3. **Rate limiting**: Spectator joins could be abused. Add throttling at handler layer.

---

## POWERUPS

To add abilities like radar, double-shot, shield:

1. **New action types**: Extend inbound message enum with `{ action: 'radar', payload: { x, y } }` etc.
2. **New event types**: Outbound messages for power-up effects.
3. **Per-player inventory**: Game state tracks available powers and cooldowns.
4. **AI adaptation**: AI needs to understand and potentially use powers. Isolated in `game/ai.ts`.
5. **Validation per power type**: Each power has different rules. Composable validation functions.
