# Battleship

Multiplayer Battleship game built on AWS serverless infrastructure. Supports 1v1 (PvP or AI) and streamer mode (1 vs many viewers).

## Components

```
├── client/         React SPA (Vite + TypeScript)
├── server/         Lambda handlers + game logic
├── infrastructure/ AWS CDK stack
└── deploy.sh       Build and deploy script
```

## Game Modes

- **AI**: Single player vs server-side AI
- **PvP**: Two players via shared game ID
- **Streamer**: One streamer vs up to 500 viewers with heat map visualization

## Quick Start

```bash
# Deploy everything
./deploy.sh

# Local client development
cd client && npm install && npm run dev
```

## Architecture

```
CloudFront ─┬─ S3 (React SPA)
            └─ API Gateway (WebSocket) ─ Lambda ─ DynamoDB
```

All game logic is server-authoritative. Clients send actions, server validates and broadcasts results.

## Live

https://d5rqyvhtzgfip.cloudfront.net
