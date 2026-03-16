# Infrastructure

AWS CDK stack for Battleship deployment.

## Resources

| Resource | Purpose |
|----------|---------|
| S3 Bucket | Static hosting for React app |
| CloudFront | CDN + HTTPS termination |
| API Gateway (WebSocket) | Real-time bidirectional communication |
| Lambda (x3) | $connect, $disconnect, $default handlers |
| DynamoDB | Game state and connection tracking |

## Architecture

```
CloudFront ─┬─ S3 Origin (client/dist/)
            └─ API Gateway Origin (/prod)
                    │
                    ├─ $connect    → Lambda → DynamoDB
                    ├─ $disconnect → Lambda → DynamoDB
                    └─ $default    → Lambda → DynamoDB
```

## DynamoDB Schema

Single-table design with composite keys:

| Entity | PK | SK |
|--------|----|----|
| 1v1 Game | `GAME#{gameId}` | `META` |
| Streamer Game | `GAME#{gameId}` | `STREAMER` |
| Viewer | `GAME#{gameId}` | `VIEWER#{oderId}` |
| Connection | `CONN#{connectionId}` | `META` |

GSI on `gameId` enables finding all connections for a game.

## Deployment

```bash
# From project root
./deploy.sh

# Or manually
cd infrastructure && cdk deploy
```

First deploy creates resources. Second deploy injects WebSocket URL into client.

## Outputs

- `WebSocketUrl` - `wss://<api-id>.execute-api.<region>.amazonaws.com/prod`
- `CloudFrontUrl` - Public game URL

## Teardown

```bash
cd infrastructure && cdk destroy
```

## Cost

Demo usage: <$1/month (S3, Lambda, DynamoDB all within free tier for low traffic).
