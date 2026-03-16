import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import { GameState } from '../game/types';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.TABLE_NAME || 'Battleship';

// Game operations
export async function getGame(gameId: string): Promise<GameState | null> {
  const result = await docClient.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { PK: `GAME#${gameId}`, SK: 'META' },
  }));
  return result.Item?.data as GameState | null;
}

export async function saveGame(state: GameState): Promise<void> {
  await docClient.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: {
      PK: `GAME#${state.gameId}`,
      SK: 'META',
      data: state,
      GSI1PK: state.gameId,
      updatedAt: Date.now(),
    },
  }));
}

// Connection operations
export async function saveConnection(connectionId: string, gameId: string, playerId: string): Promise<void> {
  await docClient.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: {
      PK: `CONN#${connectionId}`,
      SK: 'META',
      gameId,
      playerId,
      GSI1PK: gameId,
      GSI1SK: connectionId,
    },
  }));
}

export async function getConnection(connectionId: string): Promise<{ gameId: string; playerId: string } | null> {
  const result = await docClient.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { PK: `CONN#${connectionId}`, SK: 'META' },
  }));
  if (!result.Item) return null;
  return { gameId: result.Item.gameId, playerId: result.Item.playerId };
}

export async function deleteConnection(connectionId: string): Promise<void> {
  await docClient.send(new DeleteCommand({
    TableName: TABLE_NAME,
    Key: { PK: `CONN#${connectionId}`, SK: 'META' },
  }));
}

export async function getConnectionsForGame(gameId: string): Promise<string[]> {
  const result = await docClient.send(new QueryCommand({
    TableName: TABLE_NAME,
    IndexName: 'GSI1',
    KeyConditionExpression: 'GSI1PK = :gameId',
    ExpressionAttributeValues: { ':gameId': gameId },
  }));
  return (result.Items || [])
    .filter(item => item.GSI1SK) // Only connection items have GSI1SK
    .map(item => item.GSI1SK as string);
}

// Move history
export async function saveMove(gameId: string, playerId: string, x: number, y: number, hit: boolean, sunk?: string): Promise<void> {
  await docClient.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: {
      PK: `GAME#${gameId}`,
      SK: `MOVE#${Date.now()}`,
      playerId,
      x,
      y,
      hit,
      sunk,
    },
  }));
}
