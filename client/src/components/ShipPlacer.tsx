import { useState } from 'react';
import { Ship, ShipType, SHIP_LENGTHS, BOARD_SIZE, Orientation } from '../types';
import './ShipPlacer.css';

interface ShipPlacerProps {
  onComplete: (ships: Ship[]) => void;
}

const SHIP_ORDER: ShipType[] = ['carrier', 'battleship', 'cruiser', 'submarine', 'destroyer'];

export function ShipPlacer({ onComplete }: ShipPlacerProps) {
  const [ships, setShips] = useState<Ship[]>([]);
  const [currentShipIndex, setCurrentShipIndex] = useState(0);
  const [orientation, setOrientation] = useState<Orientation>('horizontal');
  const [hoverCell, setHoverCell] = useState<{ x: number; y: number } | null>(null);

  const currentShipType = SHIP_ORDER[currentShipIndex];
  const currentShipLength = currentShipType ? SHIP_LENGTHS[currentShipType] : 0;

  const getShipCells = (ship: Ship): { x: number; y: number }[] => {
    const length = SHIP_LENGTHS[ship.type];
    const cells: { x: number; y: number }[] = [];
    for (let i = 0; i < length; i++) {
      cells.push({
        x: ship.orientation === 'horizontal' ? ship.x + i : ship.x,
        y: ship.orientation === 'vertical' ? ship.y + i : ship.y,
      });
    }
    return cells;
  };

  const occupiedCells = new Set(
    ships.flatMap(s => getShipCells(s).map(c => `${c.x},${c.y}`))
  );

  const isValidPlacement = (x: number, y: number): boolean => {
    if (!currentShipType) return false;
    
    const endX = orientation === 'horizontal' ? x + currentShipLength - 1 : x;
    const endY = orientation === 'vertical' ? y + currentShipLength - 1 : y;
    
    if (endX >= BOARD_SIZE || endY >= BOARD_SIZE) return false;

    for (let i = 0; i < currentShipLength; i++) {
      const cx = orientation === 'horizontal' ? x + i : x;
      const cy = orientation === 'vertical' ? y + i : y;
      if (occupiedCells.has(`${cx},${cy}`)) return false;
    }

    return true;
  };

  const handleCellClick = (x: number, y: number) => {
    if (!currentShipType || !isValidPlacement(x, y)) return;

    const newShip: Ship = { type: currentShipType, x, y, orientation };
    const newShips = [...ships, newShip];
    setShips(newShips);

    if (currentShipIndex + 1 >= SHIP_ORDER.length) {
      onComplete(newShips);
    } else {
      setCurrentShipIndex(currentShipIndex + 1);
    }
  };

  const getPreviewCells = (): Set<string> => {
    if (!hoverCell || !currentShipType || !isValidPlacement(hoverCell.x, hoverCell.y)) {
      return new Set();
    }
    const cells = new Set<string>();
    for (let i = 0; i < currentShipLength; i++) {
      const x = orientation === 'horizontal' ? hoverCell.x + i : hoverCell.x;
      const y = orientation === 'vertical' ? hoverCell.y + i : hoverCell.y;
      cells.add(`${x},${y}`);
    }
    return cells;
  };

  const previewCells = getPreviewCells();

  return (
    <div className="ship-placer">
      <div className="placer-info">
        {currentShipType ? (
          <>
            <p>Place your {currentShipType} ({currentShipLength} cells)</p>
            <button onClick={() => setOrientation(o => o === 'horizontal' ? 'vertical' : 'horizontal')}>
              Rotate (currently {orientation})
            </button>
          </>
        ) : (
          <p>All ships placed!</p>
        )}
      </div>
      
      <div className="placer-board">
        {Array.from({ length: BOARD_SIZE }, (_, y) => (
          <div key={y} className="board-row">
            {Array.from({ length: BOARD_SIZE }, (_, x) => {
              const key = `${x},${y}`;
              const isOccupied = occupiedCells.has(key);
              const isPreview = previewCells.has(key);
              const isValid = hoverCell && isValidPlacement(hoverCell.x, hoverCell.y);
              
              let className = 'cell';
              if (isOccupied) className += ' ship';
              if (isPreview) className += isValid ? ' preview-valid' : ' preview-invalid';
              if (!isOccupied && currentShipType) className += ' clickable';

              return (
                <div
                  key={x}
                  className={className}
                  onClick={() => handleCellClick(x, y)}
                  onMouseEnter={() => setHoverCell({ x, y })}
                  onMouseLeave={() => setHoverCell(null)}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
