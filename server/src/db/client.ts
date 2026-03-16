import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  DeleteCommand,
  UpdateCommand,
  BatchGetCommand,
  BatchWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { GameState, StreamerGameState, ViewerState } from '../game/types';

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

// Streamer mode operations
export async function getStreamerGame(gameId: string): Promise<StreamerGameState | null> {
  const result = await docClient.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { PK: `GAME#${gameId}`, SK: 'STREAMER' },
  }));
  return result.Item?.data as StreamerGameState | null;
}

export async function saveStreamerGame(state: StreamerGameState): Promise<void> {
  await docClient.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: {
      PK: `GAME#${state.gameId}`,
      SK: 'STREAMER',
      data: state,
      GSI1PK: state.gameId,
      updatedAt: Date.now(),
    },
  }));
}

export async function getViewer(gameId: string, viewerId: string): Promise<ViewerState | null> {
  const result = await docClient.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { PK: `GAME#${gameId}`, SK: `VIEWER#${viewerId}` },
  }));
  return result.Item?.data as ViewerState | null;
}

export async function saveViewer(gameId: string, viewer: ViewerState): Promise<void> {
  await docClient.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: {
      PK: `GAME#${gameId}`,
      SK: `VIEWER#${viewer.viewerId}`,
      data: viewer,
      GSI1PK: gameId,
      GSI1SK: `VIEWER#${viewer.viewerId}`,
      updatedAt: Date.now(),
    },
  }));
}

export async function deleteViewer(gameId: string, viewerId: string): Promise<void> {
  await docClient.send(new DeleteCommand({
    TableName: TABLE_NAME,
    Key: { PK: `GAME#${gameId}`, SK: `VIEWER#${viewerId}` },
  }));
}

export async function getAllViewers(gameId: string): Promise<ViewerState[]> {
  const result = await docClient.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
    ExpressionAttributeValues: { ':pk': `GAME#${gameId}`, ':sk': 'VIEWER#' },
  }));
  return (result.Items || []).map(item => item.data as ViewerState);
}

export async function incrementStreamerLobbyCount(
  gameId: string,
  field: 'viewerCount' | 'readyCount' | 'viewersFiredThisTurn' | 'activeViewerCount',
  delta: number
): Promise<void> {
  await docClient.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { PK: `GAME#${gameId}`, SK: 'STREAMER' },
    UpdateExpression: `ADD #data.#field :delta`,
    ExpressionAttributeNames: { '#data': 'data', '#field': field },
    ExpressionAttributeValues: { ':delta': delta },
  }));
}

export async function incrementCellHit(gameId: string, x: number, y: number): Promise<void> {
  const key = `${x},${y}`;
  await docClient.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { PK: `GAME#${gameId}`, SK: 'STREAMER' },
    UpdateExpression: `ADD #data.#board.#hits.#cell :one`,
    ExpressionAttributeNames: {
      '#data': 'data',
      '#board': 'streamerBoard',
      '#hits': 'cellHits',
      '#cell': key,
    },
    ExpressionAttributeValues: { ':one': 1 },
  }));
}

export async function batchGetViewers(gameId: string, viewerIds: string[]): Promise<ViewerState[]> {
  if (viewerIds.length === 0) return [];
  
  const results: ViewerState[] = [];
  // BatchGet max 100 items per call
  for (let i = 0; i < viewerIds.length; i += 100) {
    const batch = viewerIds.slice(i, i + 100);
    const keys = batch.map(id => ({ PK: `GAME#${gameId}`, SK: `VIEWER#${id}` }));
    
    const response = await docClient.send(new BatchGetCommand({
      RequestItems: { [TABLE_NAME]: { Keys: keys } },
    }));
    
    const items = response.Responses?.[TABLE_NAME] || [];
    results.push(...items.map(item => item.data as ViewerState));
  }
  return results;
}

export async function batchSaveViewers(gameId: string, viewers: ViewerState[]): Promise<void> {
  if (viewers.length === 0) return;
  
  // BatchWrite max 25 items per call
  for (let i = 0; i < viewers.length; i += 25) {
    const batch = viewers.slice(i, i + 25);
    const requests = batch.map(viewer => ({
      PutRequest: {
        Item: {
          PK: `GAME#${gameId}`,
          SK: `VIEWER#${viewer.viewerId}`,
          data: viewer,
          GSI1PK: gameId,
          GSI1SK: `VIEWER#${viewer.viewerId}`,
          updatedAt: Date.now(),
        },
      },
    }));
    
    await docClient.send(new BatchWriteCommand({
      RequestItems: { [TABLE_NAME]: requests },
    }));
  }
}
