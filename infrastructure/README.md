# Infrastructure

AWS CDK stack for Battleship deployment.

## Prerequisites

1. **AWS Account** — Sign up at https://aws.amazon.com if needed

2. **AWS CLI** — Install from https://aws.amazon.com/cli/
   ```bash
   aws --version  # Verify installed
   ```

3. **Configure credentials**:
   ```bash
   aws configure
   # Enter: Access Key ID, Secret Access Key, Region (e.g., us-east-1)
   ```

4. **Node.js 18+**

5. **CDK CLI**:
   ```bash
   npm install -g aws-cdk
   ```

6. **Bootstrap CDK** (one-time per account/region):
   ```bash
   cdk bootstrap
   ```

## Resources Created

| Resource | Purpose |
|----------|---------|
| S3 Bucket | Static hosting for React app |
| CloudFront Distribution | CDN + HTTPS |
| API Gateway (WebSocket) | Real-time communication |
| Lambda Functions (x3) | connect, disconnect, message handlers |
| DynamoDB Table | Game state + history |

## Prerequisites

- AWS CLI configured with credentials
- Node.js 18+
- CDK CLI: `npm install -g aws-cdk`
- CDK bootstrapped: `cdk bootstrap`

## Deployment

From project root:

```bash
./deploy.sh
```

Or manually:

```bash
# Build server
cd server && npm run build

# Build client (first deploy won't have WS_URL)
cd ../client && npm run build

# Deploy
cd ../infrastructure && cdk deploy
```

Note: First deploy requires a second deploy to inject the WebSocket URL into the client.

## Outputs

After deployment:
- `WebSocketUrl` - Endpoint for client WebSocket connection
- `CloudFrontUrl` - Public URL for the game

## Cost Estimate

Demo/low-traffic:
- S3: ~$0.01/month
- CloudFront: Free tier
- API Gateway: $1/million messages
- Lambda: Free tier
- DynamoDB: ~$0.25/million requests

Total: Under $1/month for demo usage.

## Teardown

```bash
cd infrastructure && cdk destroy
```
