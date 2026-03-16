#!/bin/bash
set -e

echo "Building server..."
cd server
npm run build

echo "Building client..."
cd ../client

# Get WebSocket URL if stack exists
WS_URL=$(aws cloudformation describe-stacks --stack-name BattleshipStack --query 'Stacks[0].Outputs[?OutputKey==`WebSocketUrl`].OutputValue' --output text 2>/dev/null || echo "")

if [ -n "$WS_URL" ]; then
  echo "Using existing WebSocket URL: $WS_URL"
  VITE_WS_URL=$WS_URL npm run build
else
  echo "No existing stack found. Building client without WS_URL (will need to redeploy after first deploy)"
  npm run build
fi

echo "Deploying infrastructure..."
cd ../infrastructure
npm run deploy

echo ""
echo "Deployment complete!"
echo ""

# Get outputs
aws cloudformation describe-stacks --stack-name BattleshipStack --query 'Stacks[0].Outputs' --output table
