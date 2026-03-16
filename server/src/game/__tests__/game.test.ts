import { describe, it, expect } from 'vitest';
import { validateShipPlacement, validateShot } from '../validation';
import { createGame, placeShips, fire } from '../rules';
import { generateAIShips, getAIShot } from '../ai';
import { Ship } from '../types';

const validShips: Ship[] = [
  { type: 'carrier', x: 0, y: 0, orientation: 'horizontal' },
  { type: 'battleship', x: 0, y: 1, orientation: 'horizontal' },
  { type: 'cruiser', x: 0, y: 2, orientation: 'horizontal' },
  { type: 'submarine', x: 0, y: 3, orientation: 'horizontal' },
  { type: 'destroyer', x: 0, y: 4, orientation: 'horizontal' },
];

describe('validation', () => {
  it('accepts valid ship placement', () => {
    const result = validateShipPlacement(validShips);
    expect(result.valid).toBe(true);
  });

  it('rejects overlapping ships', () => {
    const overlapping: Ship[] = [
      { type: 'carrier', x: 0, y: 0, orientation: 'horizontal' },
      { type: 'battleship', x: 2, y: 0, orientation: 'horizontal' }, // overlaps carrier
      { type: 'cruiser', x: 0, y: 2, orientation: 'horizontal' },
      { type: 'submarine', x: 0, y: 3, orientation: 'horizontal' },
      { type: 'destroyer', x: 0, y: 4, orientation: 'horizontal' },
    ];
    const result = validateShipPlacement(overlapping);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('overlap');
  });

  it('rejects ships outside board', () => {
    const outside: Ship[] = [
      { type: 'carrier', x: 8, y: 0, orientation: 'horizontal' }, // extends to x=12
      { type: 'battleship', x: 0, y: 1, orientation: 'horizontal' },
      { type: 'cruiser', x: 0, y: 2, orientation: 'horizontal' },
      { type: 'submarine', x: 0, y: 3, orientation: 'horizontal' },
      { type: 'destroyer', x: 0, y: 4, orientation: 'horizontal' },
    ];
    const result = validateShipPlacement(outside);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('outside');
  });

  it('rejects duplicate shots', () => {
    const result = validateShot(5, 5, [{ x: 5, y: 5 }]);
    expect(result.valid).toBe(false);
  });
});

describe('game rules', () => {
  it('creates a game', () => {
    const state = createGame('game1', 'player1', 'pvp');
    expect(state.gameId).toBe('game1');
    expect(state.phase).toBe('placing');
    expect(state.player1.id).toBe('player1');
  });

  it('transitions to playing when both place ships', () => {
    let state = createGame('game1', 'player1', 'ai');
    state = placeShips(state, 'player1', validShips);
    expect(state.player1.ready).toBe(true);
    expect(state.phase).toBe('placing'); // AI not ready yet

    state = placeShips(state, 'AI', validShips);
    expect(state.phase).toBe('playing');
  });

  it('detects hit and sunk', () => {
    let state = createGame('game1', 'player1', 'ai');
    state = placeShips(state, 'player1', validShips);
    
    // AI has destroyer at 0,4 (length 2)
    const aiShips: Ship[] = [
      { type: 'carrier', x: 5, y: 5, orientation: 'horizontal' },
      { type: 'battleship', x: 5, y: 6, orientation: 'horizontal' },
      { type: 'cruiser', x: 5, y: 7, orientation: 'horizontal' },
      { type: 'submarine', x: 5, y: 8, orientation: 'horizontal' },
      { type: 'destroyer', x: 0, y: 9, orientation: 'horizontal' },
    ];
    state = placeShips(state, 'AI', aiShips);

    // Fire at destroyer
    let result = fire(state, 'player1', 0, 9);
    expect(result.hit).toBe(true);
    expect(result.sunk).toBeUndefined();

    state = result.state;
    state = { ...state, currentTurn: 'player1' }; // Skip AI turn for test

    result = fire(state, 'player1', 1, 9);
    expect(result.hit).toBe(true);
    expect(result.sunk).toEqual({
      type: 'destroyer',
      cells: [{ x: 0, y: 9 }, { x: 1, y: 9 }],
    });
  });
});

describe('AI', () => {
  it('generates valid ship placement', () => {
    const ships = generateAIShips();
    const result = validateShipPlacement(ships);
    expect(result.valid).toBe(true);
  });

  it('returns valid shot coordinates', () => {
    const shot = getAIShot([]);
    expect(shot.x).toBeGreaterThanOrEqual(0);
    expect(shot.x).toBeLessThan(10);
    expect(shot.y).toBeGreaterThanOrEqual(0);
    expect(shot.y).toBeLessThan(10);
  });

  it('targets adjacent cells after hit', () => {
    const shots = [{ x: 5, y: 5, hit: true }];
    const next = getAIShot(shots);
    
    // Should be adjacent to (5,5)
    const isAdjacent = 
      (next.x === 4 && next.y === 5) ||
      (next.x === 6 && next.y === 5) ||
      (next.x === 5 && next.y === 4) ||
      (next.x === 5 && next.y === 6);
    
    expect(isAdjacent).toBe(true);
  });
});
