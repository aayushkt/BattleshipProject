# Cross-Cutting Design

## Component Boundaries

```
┌─────────────┐                      ┌─────────────┐                    ┌─────────────┐
│   Client    │ ←── WebSocket ────→  │   Server    │ ←── DynamoDB ───→  │  Database   │
└─────────────┘     Messages         └─────────────┘     Items          └─────────────┘
```

Each boundary has a defined contract. Components are agnostic to their callers.

### Message Format

All WebSocket communication:

```typescript
// Client to Server
{ action: string, payload: object }

// Server to Client
{ event: string, payload: object }
```

New features add new action/event types. Existing ones don't break.

---

## UNKNOWN

General tradeoffs that span components.

**Tight coupling between server and database**: Server directly calls DynamoDB, no abstraction layer. Simpler, but harder to swap databases. If we switched to PostgreSQL, `db/` layer rewrites but `game/` logic stays untouched.

**No API versioning**: Single message format, no version field. Only one client version exists. If multiple client versions exist in the wild, add `version` field; server handles multiple versions.

**No rate limiting**: No throttling on WebSocket messages. Low traffic demo, abuse unlikely. Vulnerable to spam if exposed publicly.

**Error handling pattern**: Validation errors return `{ event: 'error' }`. Server failures log to CloudWatch, return generic error. Connection drops trigger client reconnect with backoff.

---

## ACCOUNTS

Cross-cutting concerns for player identity:

1. **Auth token flow**: Client stores token, passes on WebSocket connect. Server validates at handler layer before processing any action.
2. **User ID propagation**: All game records include userId. Affects server schema and client state.
3. **Privacy**: What data is visible to opponents? Username yes, email no. Define visibility rules.

---

## STREAMING

Cross-cutting concerns for spectator mode:

1. **Message fan-out**: Server broadcasts to N connections instead of 2. Affects server and infrastructure.
2. **Participant type in protocol**: Messages need to indicate player vs spectator. Affects message format.
3. **Rate limiting**: Spectator joins could be abused. Implement at API Gateway or handler layer.

---

## POWERUPS

Cross-cutting concerns for abilities:

1. **New message types**: Both inbound (actions) and outbound (events) extend. Backward compatible—old clients ignore unknown events.
2. **Game state extension**: DynamoDB schema adds power-up inventory. Server game logic handles new action types.
3. **UI extension**: Client adds new components for power-up display and activation.
