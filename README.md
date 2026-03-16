# Battleship

A full-featured, multiplayer Battleship game with AI opponent support, built on AWS serverless infrastructure.

## Features

- **Single-player vs AI** — Intelligent AI that hunts ships strategically
- **Real-time Multiplayer** — Two players, separate browsers, live updates
- **Persistent State** — Refresh mid-game without losing progress
- **Game History** — All moves stored for replay/analysis

## Project Structure

```
battleship/
├── client/              # React frontend
│   ├── README.md        # Setup, running locally
│   └── DESIGN.md        # Frontend architecture decisions
├── server/              # Lambda handlers + game logic
│   ├── README.md        # API reference, local testing
│   └── DESIGN.md        # Server architecture decisions
├── infrastructure/      # AWS CDK
│   ├── README.md        # Deployment instructions
│   └── DESIGN.md        # Infrastructure decisions
├── docs/
│   ├── architecture.md  # System overview
│   └── DESIGN.md        # Cross-cutting concerns
├── SPIKE.md             # Project spike explanation
└── README.md            # You are here
```

## Documentation Philosophy

Each component has two docs:
- **README.md** — What it does, how to use it
- **DESIGN.md** — Why it's built this way, future considerations

See [SPIKE.md](SPIKE.md) for the reasoning behind this structure.

## Quick Start

```bash
# Frontend
cd client && npm install && npm run dev

# Deploy infrastructure
cd infrastructure && cdk deploy
```

## Live Demo

[Play Battleship](https://battleship.example.com) — link updated after deployment
