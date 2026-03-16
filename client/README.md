# Client

React SPA for the Battleship game interface.

## Tech Stack

- React 18 with TypeScript
- Vite for build tooling
- CSS for styling (no framework)

## Local Development

```bash
npm install
npm run dev
```

Runs on `http://localhost:5173`.

Note: Requires `VITE_WS_URL` environment variable pointing to the WebSocket API.

## Build

```bash
npm run build
```

Output goes to `dist/`, deployed to S3.

## Structure

```
src/
├── components/
│   ├── Board.tsx        # 10x10 grid rendering
│   └── ShipPlacer.tsx   # Ship placement UI
├── hooks/
│   └── useWebSocket.ts  # WebSocket connection management
├── types.ts             # Shared types
├── App.tsx              # Main game flow
└── main.tsx             # Entry point
```
