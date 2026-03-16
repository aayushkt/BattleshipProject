import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';

let apiClient: ApiGatewayManagementApiClient | null = null;

export function initApiClient(endpoint: string): void {
  apiClient = new ApiGatewayManagementApiClient({ endpoint });
}

export async function sendToConnection(connectionId: string, data: object): Promise<void> {
  if (!apiClient) throw new Error('API client not initialized');
  
  try {
    await apiClient.send(new PostToConnectionCommand({
      ConnectionId: connectionId,
      Data: Buffer.from(JSON.stringify(data)),
    }));
  } catch (err: any) {
    if (err.statusCode === 410) {
      console.log('Stale connection:', connectionId);
    } else {
      throw err;
    }
  }
}

export async function broadcast(connectionIds: string[], data: object): Promise<void> {
  await Promise.all(connectionIds.map(id => sendToConnection(id, data)));
}
