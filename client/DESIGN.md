# Client Design

## API Contract

The client sends messages to the server and renders responses.

### What It Sends

```typescript
{ action: 'createGame', payload: { mode: 'ai' | 'pvp' } }
{ action: 'joinGame', payload: { gameId: string } }
{ action: 'placeShips', payload: { ships: Ship[] } }
{ action: 'fire', payload: { x: number, y: number } }
```

### What It Receives

| Event | Response |
|-------|----------|
| `gameCreated` | Store gameId, transition to placing phase |
| `gameJoined` | Store gameId, transition to placing phase |
| `shipsPlaced` | Wait for gameStarted |
| `gameStarted` | Transition to playing phase |
| `fireResult` | Update appropriate board |
| `turnChange` | Enable/disable firing |
| `gameOver` | Show result screen |
| `error` | Display error message |

---

## UNKNOWN

General tradeoffs.

**Local React state**: No Redux or global state. Server is source of truth; client state is a cache. Simple for current scope.

**No optimistic updates**: UI waits for server confirmation. Can't predict hit/miss, and server is authoritative.

**CSS Grid for board**: Simple, accessible (cells are focusable). Less flexible for complex animations.

**Reconnection via exponential backoff**: 1s, 2s, 4s... up to 30s. On reconnect, would need to request state snapshot (not yet implemented in UI).

---

## ACCOUNTS

To add player identity:

1. **Auth flow UI**: Login/register components.
2. **Token storage**: localStorage or cookie.
3. **Include token in WebSocket URL**: Query param or subprotocol.

---

## STREAMING

To add spectator mode:

1. **Read-only view**: Spectators see boards but can't act.
2. **Viewer count**: Display number watching.
3. **Different component variant**: Spectator vs player view.

---

## POWERUPS

To add abilities:

1. **Inventory display**: Show available powers.
2. **New action buttons**: Radar, double-shot, shield.
3. **Visual effects**: May push toward Canvas for complex effects.
