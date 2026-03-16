import { Ship, ShipType, SHIP_LENGTHS, BOARD_SIZE, getShipCells } from './types';

const REQUIRED_SHIPS: ShipType[] = ['carrier', 'battleship', 'cruiser', 'submarine', 'destroyer'];

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export function validateShipPlacement(ships: Ship[]): ValidationResult {
  // Check all required ships present
  const types = ships.map(s => s.type);
  for (const required of REQUIRED_SHIPS) {
    if (!types.includes(required)) {
      return { valid: false, error: `Missing ship: ${required}` };
    }
  }
  if (ships.length !== REQUIRED_SHIPS.length) {
    return { valid: false, error: 'Wrong number of ships' };
  }

  // Check each ship is within bounds and collect all cells
  const allCells: Set<string> = new Set();

  for (const ship of ships) {
    const cells = getShipCells(ship);

    for (const cell of cells) {
      // Bounds check
      if (cell.x < 0 || cell.x >= BOARD_SIZE || cell.y < 0 || cell.y >= BOARD_SIZE) {
        return { valid: false, error: `Ship ${ship.type} extends outside board` };
      }

      // Overlap check
      const key = `${cell.x},${cell.y}`;
      if (allCells.has(key)) {
        return { valid: false, error: `Ships overlap at (${cell.x}, ${cell.y})` };
      }
      allCells.add(key);
    }
  }

  return { valid: true };
}

export function validateShot(x: number, y: number, previousShots: { x: number; y: number }[]): ValidationResult {
  if (x < 0 || x >= BOARD_SIZE || y < 0 || y >= BOARD_SIZE) {
    return { valid: false, error: 'Shot outside board' };
  }

  if (previousShots.some(s => s.x === x && s.y === y)) {
    return { valid: false, error: 'Already fired at this cell' };
  }

  return { valid: true };
}
