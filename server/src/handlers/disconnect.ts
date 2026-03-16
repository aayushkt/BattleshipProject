import { APIGatewayProxyWebsocketHandlerV2 } from 'aws-lambda';
import { deleteConnection } from '../db';

export const handler: APIGatewayProxyWebsocketHandlerV2 = async (event) => {
  const connectionId = event.requestContext.connectionId!;
  console.log('Disconnect:', connectionId);
  
  await deleteConnection(connectionId);
  
  return { statusCode: 200, body: 'Disconnected' };
};
