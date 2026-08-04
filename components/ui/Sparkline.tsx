import React from "react";

interface SparklineProps {
  values?: number[];
  tone?: "blue" | "green" | "orange" | "teal" | "red" | "yellow";
  className?: string;
}

const strokes: Record<string, string> = {
  blue: "#8a2e2e",
  green: "#047857",
  orange: "#d97706",
  teal: "#0d9488",
  red: "#B91C1C",
  yellow: "#CA8A04",
};

export default function Sparkline({ values, tone = "green", className = "" }: SparklineProps) {
  const pts = values && values.length ? values : [3, 4, 4, 5, 5, 6, 6];
  const max = Math.max(...pts, 1);
  const w = 56;
  const h = 22;

  const coords = pts
    .map((v, i) => {
      const x = (i / (pts.length - 1 || 1)) * w;
      const y = h - (v / max) * (h - 4) - 2;
      return `${x},${y}`;
    })
    .join(" ");

  const stroke = strokes[tone] || strokes.green;

  return (
    <svg 
      className={`dash-sparkline dash-sparkline--${tone} ${className}`.trim()} 
      viewBox={`0 0 ${w} ${h}`} 
      preserveAspectRatio="none"
    >
      <polyline 
        points={coords} 
        fill="none" 
        stroke={stroke} 
        strokeWidth="2.5" 
        strokeLinecap="round" 
        strokeLinejoin="round"
      />
    </svg>
  );
}
