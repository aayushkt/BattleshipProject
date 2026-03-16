import { APIGatewayProxyWebsocketHandlerV2 } from 'aws-lambda';

export const handler: APIGatewayProxyWebsocketHandlerV2 = async (event) => {
  const connectionId = event.requestContext.connectionId;
  console.log('Connect:', connectionId);
  
  // Connection is stored when player creates/joins a game, not on connect
  return { statusCode: 200, body: 'Connected' };
};
