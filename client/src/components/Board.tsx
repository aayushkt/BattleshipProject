import { Shot, Ship, SunkShip, SHIP_LENGTHS, BOARD_SIZE } from '../types';
import './Board.css';

interface BoardProps {
  ships?: Ship[];
  shots: Shot[];
  sunkShips?: SunkShip[];
  pendingShot?: { x: number; y: number } | null;
  isOpponent: boolean;
  onCellClick?: (x: number, y: number) => void;
  disabled?: boolean;
}

export function Board({ ships = [], shots, sunkShips = [], pendingShot, isOpponent, onCellClick, disabled }: BoardProps) {
  const shipCells = new Map<string, ShipType>();
  
  if (!isOpponent) {
    for (const ship of ships) {
      const length = SHIP_LENGTHS[ship.type];
      for (let i = 0; i < length; i++) {
        const x = ship.orientation === 'horizontal' ? ship.x + i : ship.x;
        const y = ship.orientation === 'vertical' ? ship.y + i : ship.y;
        shipCells.set(`${x},${y}`, ship.type);
      }
    }
  }

  // Build set of sunk ship cells for opponent board
  const sunkCells = new Set<string>();
  for (const sunk of sunkShips) {
    for (const cell of sunk.cells) {
      sunkCells.add(`${cell.x},${cell.y}`);
    }
  }

  const shotMap = new Map(shots.map(s => [`${s.x},${s.y}`, s]));

  const handleClick = (x: number, y: number) => {
    if (disabled || !onCellClick) return;
    if (shotMap.has(`${x},${y}`)) return; // Already fired
    onCellClick(x, y);
  };

  return (
    <div className="board">
      <div className="board-grid">
        {Array.from({ length: BOARD_SIZE }, (_, y) => (
          <div key={y} className="board-row">
            {Array.from({ length: BOARD_SIZE }, (_, x) => {
              const key = `${x},${y}`;
              const shot = shotMap.get(key);
              const shipType = shipCells.get(key);
              const isSunkCell = sunkCells.has(key);
              const isPending = pendingShot?.x === x && pendingShot?.y === y;
              
              let className = 'cell';
              if (isPending) {
                className += ' pending';
              } else if (shot) {
                className += shot.hit ? ' hit' : ' miss';
                if (isSunkCell) className += ' sunk';
              } else if (shipType) {
                className += ' ship';
              }
              if (isOpponent && !disabled && !shot && !isPending) {
                className += ' clickable';
              }

              return (
                <div
                  key={x}
                  className={className}
                  onClick={() => handleClick(x, y)}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

type ShipType = Ship['type'];
