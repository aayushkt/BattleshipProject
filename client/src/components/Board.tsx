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
  // Streamer mode heat map (defense - viewer hits on streamer)
  cellHits?: Record<string, number>;
  cellMisses?: Record<string, number>;
  viewerCount?: number;
  // Streamer attack heat map (streamer hits on viewers)
  attackHitRatios?: Record<string, number>;
}

// Linear interpolation between two hex colors
function lerpColor(color1: string, color2: string, t: number): string {
  const r1 = parseInt(color1.slice(1, 3), 16);
  const g1 = parseInt(color1.slice(3, 5), 16);
  const b1 = parseInt(color1.slice(5, 7), 16);
  const r2 = parseInt(color2.slice(1, 3), 16);
  const g2 = parseInt(color2.slice(3, 5), 16);
  const b2 = parseInt(color2.slice(5, 7), 16);
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);
  return `rgb(${r},${g},${b})`;
}

export function Board({ 
  ships = [], 
  shots, 
  sunkShips = [], 
  pendingShot, 
  isOpponent, 
  onCellClick, 
  disabled,
  cellHits,
  cellMisses,
  viewerCount,
  attackHitRatios,
}: BoardProps) {
  const shipCells = new Map<string, ShipType>();
  
  if (!isOpponent || ships.length > 0) {
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
  const isHeatMap = cellHits && viewerCount && viewerCount > 0;

  const handleClick = (x: number, y: number) => {
    if (disabled || !onCellClick) return;
    if (shotMap.has(`${x},${y}`)) return;
    onCellClick(x, y);
  };

  // Get heat map style and percentage for a cell
  const getHeatMapInfo = (x: number, y: number): { style?: React.CSSProperties; percent?: number } => {
    if (!isHeatMap) return {};
    const key = `${x},${y}`;
    const hasShip = shipCells.has(key);
    
    if (hasShip) {
      const hits = cellHits?.[key] || 0;
      if (hits === 0) return {};
      const intensity = Math.min(hits / viewerCount, 1);
      return { 
        style: { backgroundColor: lerpColor('#742a2a', '#e53e3e', intensity) },
        percent: Math.round(intensity * 100),
      };
    } else {
      const misses = cellMisses?.[key] || 0;
      if (misses === 0) return {};
      const intensity = Math.min(misses / viewerCount, 1);
      return { 
        style: { backgroundColor: lerpColor('#2a742a', '#3ee53e', intensity) },
        percent: Math.round(intensity * 100),
      };
    }
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
              const heatMap = getHeatMapInfo(x, y);
              const attackRatio = attackHitRatios?.[key];
              
              // For streamer attack board, use intensity coloring for hits
              let attackStyle: React.CSSProperties | undefined;
              if (attackRatio !== undefined && attackRatio > 0) {
                attackStyle = { backgroundColor: lerpColor('#742a2a', '#e53e3e', attackRatio) };
              }
              
              let className = 'cell';
              if (isPending) {
                className += ' pending';
              } else if (heatMap.style) {
                // Defense heat map takes precedence
              } else if (attackStyle) {
                // Attack heat map for streamer's shots
              } else if (shot) {
                className += shot.hit ? ' hit' : ' miss';
                if (isSunkCell && !attackHitRatios) className += ' sunk'; // Skip sunk styling for streamer attack
              } else if (shipType) {
                className += ' ship';
              }
              if (isOpponent && !disabled && !shot && !isPending) {
                className += ' clickable';
              }

              const cellStyle = heatMap.style || attackStyle;

              return (
                <div
                  key={x}
                  className={className}
                  style={cellStyle}
                  onClick={() => handleClick(x, y)}
                >
                  {heatMap.percent !== undefined && (
                    <span className="heat-percent">{heatMap.percent}</span>
                  )}
                  {attackRatio !== undefined && (
                    <span className="heat-percent">{Math.round(attackRatio * 100)}</span>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

type ShipType = Ship['type'];
