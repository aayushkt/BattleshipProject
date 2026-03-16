import { Ship, Shot, BOARD_SIZE, SHIP_LENGTHS, ShipType, Orientation } from './types';

interface Coordinate {
  x: number;
  y: number;
}

// Generate AI ship placement
export function generateAIShips(): Ship[] {
  const ships: Ship[] = [];
  const occupied: Set<string> = new Set();
  const types: ShipType[] = ['carrier', 'battleship', 'cruiser', 'submarine', 'destroyer'];

  for (const type of types) {
    let placed = false;
    let attempts = 0;

    while (!placed && attempts < 100) {
      attempts++;
      const orientation: Orientation = Math.random() < 0.5 ? 'horizontal' : 'vertical';
      const length = SHIP_LENGTHS[type];

      const maxX = orientation === 'horizontal' ? BOARD_SIZE - length : BOARD_SIZE - 1;
      const maxY = orientation === 'vertical' ? BOARD_SIZE - length : BOARD_SIZE - 1;

      const x = Math.floor(Math.random() * (maxX + 1));
      const y = Math.floor(Math.random() * (maxY + 1));

      const cells: Coordinate[] = [];
      for (let i = 0; i < length; i++) {
        cells.push({
          x: orientation === 'horizontal' ? x + i : x,
          y: orientation === 'vertical' ? y + i : y,
        });
      }

      const overlaps = cells.some(c => occupied.has(`${c.x},${c.y}`));
      if (!overlaps) {
        cells.forEach(c => occupied.add(`${c.x},${c.y}`));
        ships.push({ type, x, y, orientation });
        placed = true;
      }
    }
  }

  return ships;
}

// AI shot selection using Hunt/Target with parity
export function getAIShot(shotsFired: Shot[]): Coordinate {
  const fired: Set<string> = new Set(shotsFired.map(s => `${s.x},${s.y}`));
  const unsunkHits = shotsFired.filter(s => s.hit && !s.sunk);

  if (unsunkHits.length > 0) {
    return targetMode(unsunkHits, fired);
  }
  return huntMode(fired);
}

function huntMode(fired: Set<string>): Coordinate {
  // Parity: only fire at checkerboard pattern
  const candidates: Coordinate[] = [];

  for (let x = 0; x < BOARD_SIZE; x++) {
    for (let y = 0; y < BOARD_SIZE; y++) {
      if ((x + y) % 2 === 0 && !fired.has(`${x},${y}`)) {
        candidates.push({ x, y });
      }
    }
  }

  // If checkerboard exhausted, try remaining cells
  if (candidates.length === 0) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      for (let y = 0; y < BOARD_SIZE; y++) {
        if (!fired.has(`${x},${y}`)) {
          candidates.push({ x, y });
        }
      }
    }
  }

  // Slight center bias
  candidates.sort((a, b) => {
    const distA = Math.abs(a.x - 4.5) + Math.abs(a.y - 4.5);
    const distB = Math.abs(b.x - 4.5) + Math.abs(b.y - 4.5);
    return distA - distB + (Math.random() - 0.5) * 4; // Add randomness
  });

  return candidates[0];
}

function targetMode(hits: Shot[], fired: Set<string>): Coordinate {
  // Detect orientation if multiple hits
  if (hits.length >= 2) {
    const horizontal = hits.every(h => h.y === hits[0].y);
    const vertical = hits.every(h => h.x === hits[0].x);

    if (horizontal) {
      const xs = hits.map(h => h.x).sort((a, b) => a - b);
      const candidates = [
        { x: xs[0] - 1, y: hits[0].y },
        { x: xs[xs.length - 1] + 1, y: hits[0].y },
      ].filter(c => isValid(c, fired));
      if (candidates.length > 0) return candidates[Math.floor(Math.random() * candidates.length)];
    }

    if (vertical) {
      const ys = hits.map(h => h.y).sort((a, b) => a - b);
      const candidates = [
        { x: hits[0].x, y: ys[0] - 1 },
        { x: hits[0].x, y: ys[ys.length - 1] + 1 },
      ].filter(c => isValid(c, fired));
      if (candidates.length > 0) return candidates[Math.floor(Math.random() * candidates.length)];
    }
  }

  // Try adjacent to any hit
  for (const hit of hits) {
    const adjacent = [
      { x: hit.x - 1, y: hit.y },
      { x: hit.x + 1, y: hit.y },
      { x: hit.x, y: hit.y - 1 },
      { x: hit.x, y: hit.y + 1 },
    ].filter(c => isValid(c, fired));

    if (adjacent.length > 0) {
      return adjacent[Math.floor(Math.random() * adjacent.length)];
    }
  }

  // Fallback to hunt mode
  return huntMode(fired);
}

function isValid(c: Coordinate, fired: Set<string>): boolean {
  return c.x >= 0 && c.x < BOARD_SIZE && c.y >= 0 && c.y < BOARD_SIZE && !fired.has(`${c.x},${c.y}`);
}
