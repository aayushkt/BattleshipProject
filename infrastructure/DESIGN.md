# Infrastructure Design

## API Contract

Infrastructure provides the runtime environment. Other components don't know the details—they just know the endpoints.

### What It Exposes

| Resource | Endpoint |
|----------|----------|
| WebSocket API | `wss://<api-id>.execute-api.<region>.amazonaws.com/prod` |
| Frontend | `https://<distribution>.cloudfront.net` |

### What It Expects

| Component | Artifact |
|-----------|----------|
| Client | Built static files in `client/dist/` |
| Server | Lambda handler code in `server/dist/` |

### DynamoDB Access Patterns

| Operation | Key Pattern |
|-----------|-------------|
| Get game + boards | PK = `GAME#<id>` |
| Get connection | PK = `CONN#<connId>`, SK = `META` |
| Find connections for game | GSI1: PK = `<gameId>` |
| Append move | PK = `GAME#<id>`, SK = `MOVE#<timestamp>` |
| Query player history | GSI2: PK = `<playerId>` |

---

## UNKNOWN

General tradeoffs that affect flexibility.

**Serverless (Lambda + API Gateway)**: No idle costs, no capacity planning, scales automatically. Cost is cold start latency (100-500ms) and 29-minute WebSocket idle timeout.

**DynamoDB single-table design**: All entities in one table with composite keys. Single query fetches related data. Cost is less intuitive schema, requires understanding access patterns upfront.

**S3 + CloudFront for frontend**: Cheap, fast, no servers. Cost is cache invalidation complexity on deploy. If we need SSR, would require Lambda@Edge or different hosting.

**Single CDK stack**: Simple deploy/destroy. Cost is can't deploy components independently. Would split for multiple environments.

---

## ACCOUNTS

To add user authentication:

1. **Cognito User Pool**: New resource for user management. Or integrate external IdP.
2. **API Gateway authorizer**: Validate JWT on WebSocket $connect. Reject unauthenticated connections.
3. **User profile storage**: New entity type in DynamoDB or separate table. New GSI for user lookups.

---

## STREAMING

To add spectator broadcast at scale:

1. **SNS for fan-out**: At 50+ spectators, Lambda-per-connection is expensive. Publish game events to SNS topic, separate Lambda fans out to connections.
2. **Higher connection limits**: API Gateway default is 10k concurrent connections. May need limit increase for popular streams.
3. **IoT Core consideration**: For massive scale (millions), consider AWS IoT Core instead of API Gateway WebSocket.

---

## POWERUPS

To add game abilities:

1. **Schema extension**: Add power-up inventory to game state in DynamoDB. No structural changes, just new attributes.
2. **No infrastructure changes**: Power-ups are game logic. Infrastructure doesn't care about game rules.
