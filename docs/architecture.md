# Architecture Overview

## System Context

Battleship is a turn-based game requiring:
- Real-time communication between two players
- Persistent game state that survives disconnection
- Historical record of all games and moves
- Single-player mode against AI

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         CloudFront                               │
│                    (CDN + HTTPS termination)                     │
└─────────────────────┬───────────────────────┬───────────────────┘
                      │                       │
                      ▼                       ▼
              ┌───────────────┐       ┌───────────────────┐
              │      S3       │       │   API Gateway     │
              │ (React SPA)   │       │   (WebSocket)     │
              └───────────────┘       └─────────┬─────────┘
                                                │
                                                ▼
                                      ┌───────────────────┐
                                      │     Lambda        │
                                      │ (Game Logic +     │
                                      │  Connection Mgmt) │
                                      └─────────┬─────────┘
                                                │
                                                ▼
                                      ┌───────────────────┐
                                      │    DynamoDB       │
                                      │ (Game State +     │
                                      │  History)         │
                                      └───────────────────┘
```

## Component Responsibilities

### Frontend (S3 + CloudFront)
- React SPA with game board rendering
- WebSocket connection management with reconnection logic
- Local optimistic UI updates (validated by server)
- Ship placement drag-and-drop interface

### API Gateway (WebSocket)
- Manages persistent WebSocket connections
- Routes messages to appropriate Lambda handlers
- Handles connection/disconnection lifecycle
- Provides connection IDs for targeted messaging

### Lambda Functions
- **$connect**: Validates connection, stores connection ID
- **$disconnect**: Cleans up connection records
- **$default**: Routes game actions (place ships, fire, etc.)
- All game logic is server-authoritative

### DynamoDB
- Single-table design with composite keys
- Stores: active games, player connections, move history
- Enables game state recovery on reconnection

## Data Flow: Firing a Shot

```
1. Player clicks cell (3,4)
         │
         ▼
2. Client sends: { action: "fire", x: 3, y: 4, gameId: "abc" }
         │
         ▼
3. API Gateway routes to Lambda
         │
         ▼
4. Lambda:
   a. Loads game state from DynamoDB
   b. Validates: correct player's turn, valid coordinates, not already fired
   c. Computes result: hit/miss/sunk
   d. Updates game state in DynamoDB
   e. Appends move to history
   f. Sends result to BOTH players via API Gateway
         │
         ▼
5. Both clients update UI with result
```

## Security Model

Key principles:
- Client never sees opponent's ship positions
- All game logic runs server-side
- Client actions are requests, not commands
- Server validates every action before applying

## Scaling Considerations

| Concern | Mitigation |
|---------|------------|
| Lambda cold starts | Provisioned concurrency if latency becomes issue |
| DynamoDB throughput | On-demand capacity; partition key = gameId distributes load |
| WebSocket connections | API Gateway scales automatically; 100k concurrent connections per region |
| Large boards | O(1) hit detection via coordinate lookup; board size doesn't affect perf |

## Failure Modes

| Failure | Impact | Recovery |
|---------|--------|----------|
| Player disconnects | Game paused | Reconnect resumes; timeout after 5 min forfeits |
| Lambda timeout | Action fails | Client retries; idempotent operations |
| DynamoDB throttle | Temporary slowdown | Exponential backoff in Lambda |
