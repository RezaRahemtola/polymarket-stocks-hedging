"use client";

import { useMemo, useState } from "react";

interface Position {
  title: string;
  image: string;
  value: number;
  outcome: string;
}

interface Props {
  positions: Position[];
}

const COLORS = [
  "#22c55e",
  "#3b82f6",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
  "#ec4899",
  "#84cc16",
  "#f97316",
  "#6366f1",
];

export default function PositionsPieChart({ positions }: Props) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const total = useMemo(
    () => positions.reduce((sum, p) => sum + p.value, 0),
    [positions],
  );

  const segments = useMemo(() => {
    let currentAngle = 0;
    return positions.map((p, i) => {
      const percentage = total > 0 ? (p.value / total) * 100 : 0;
      const angle = (percentage / 100) * 360;
      const startAngle = currentAngle;
      currentAngle += angle;
      return {
        ...p,
        percentage,
        startAngle,
        endAngle: currentAngle,
        color: COLORS[i % COLORS.length],
      };
    });
  }, [positions, total]);

  if (positions.length === 0) return null;

  const size = 200;
  const center = size / 2;
  const radius = 80;
  const imageRadius = 50;

  const polarToCartesian = (angle: number, r: number) => {
    const rad = ((angle - 90) * Math.PI) / 180;
    return {
      x: center + r * Math.cos(rad),
      y: center + r * Math.sin(rad),
    };
  };

  const createArcPath = (startAngle: number, endAngle: number) => {
    const start = polarToCartesian(startAngle, radius);
    const end = polarToCartesian(endAngle, radius);
    const largeArc = endAngle - startAngle > 180 ? 1 : 0;
    return `M ${center} ${center} L ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y} Z`;
  };

  return (
    <div className="flex items-center gap-6">
      <div className="relative">
        <svg width={size} height={size}>
          {segments.map((seg, i) => (
            <path
              key={i}
              d={createArcPath(seg.startAngle, seg.endAngle)}
              fill={seg.color}
              opacity={hoveredIndex === null || hoveredIndex === i ? 1 : 0.3}
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex(null)}
              className="cursor-pointer transition-opacity"
            />
          ))}
          {/* Center circle for donut effect */}
          <circle
            cx={center}
            cy={center}
            r={imageRadius}
            fill="hsl(var(--background))"
          />
          {/* Center image when hovering */}
          {hoveredIndex !== null && segments[hoveredIndex]?.image && (
            <image
              href={segments[hoveredIndex].image}
              x={center - 30}
              y={center - 30}
              width={60}
              height={60}
              clipPath="circle(30px)"
              className="rounded-full"
            />
          )}
        </svg>

        {/* Tooltip */}
        {hoveredIndex !== null && (
          <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 bg-popover border border-border rounded-lg p-2 shadow-lg z-10 whitespace-nowrap">
            <p className="text-sm font-medium">
              {segments[hoveredIndex].title}
            </p>
            <p className="text-xs text-muted-foreground">
              {segments[hoveredIndex].outcome}
            </p>
            <p className="text-sm font-mono text-primary">
              ${segments[hoveredIndex].value.toFixed(2)}
            </p>
          </div>
        )}
      </div>

      {/* Legend with images */}
      <div className="flex flex-wrap gap-2 max-w-xs">
        {segments.map((seg, i) => (
          <div
            key={i}
            className={`flex items-center gap-2 p-1.5 rounded cursor-pointer transition-opacity ${
              hoveredIndex === null || hoveredIndex === i
                ? "opacity-100"
                : "opacity-30"
            }`}
            onMouseEnter={() => setHoveredIndex(i)}
            onMouseLeave={() => setHoveredIndex(null)}
          >
            {seg.image ? (
              <img
                src={seg.image}
                alt=""
                className="w-6 h-6 rounded object-cover"
              />
            ) : (
              <div
                className="w-6 h-6 rounded"
                style={{ backgroundColor: seg.color }}
              />
            )}
            <span className="text-xs font-mono">${seg.value.toFixed(0)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
