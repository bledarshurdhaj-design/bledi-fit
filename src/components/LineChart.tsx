"use client";

interface Point { x: string; y: number; }

/** Grafik i thjeshtë SVG për peshën – pa librari të jashtme. */
export default function LineChart({ points, target, height = 190 }: { points: Point[]; target?: number; height?: number }) {
  if (points.length < 2) {
    return <div className="muted small center" style={{ padding: 24 }}>Grafiku shfaqet pas të paktën 2 peshimeve.</div>;
  }
  const W = 340, H = height, pl = 36, pr = 10, pt = 12, pb = 24;
  const ys = points.map((p) => p.y).concat(target !== undefined ? [target] : []);
  let min = Math.min(...ys), max = Math.max(...ys);
  if (max - min < 2) { min -= 1; max += 1; }
  min = Math.floor(min); max = Math.ceil(max);
  const sx = (i: number) => pl + (i / (points.length - 1)) * (W - pl - pr);
  const sy = (v: number) => pt + (1 - (v - min) / (max - min)) * (H - pt - pb);
  const path = points.map((p, i) => `${i ? "L" : "M"}${sx(i).toFixed(1)},${sy(p.y).toFixed(1)}`).join(" ");
  const ticks = [min, (min + max) / 2, max];
  const fmt = (d: string) => d.slice(8, 10) + "." + d.slice(5, 7);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Grafiku i peshës">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={pl} x2={W - pr} y1={sy(t)} y2={sy(t)} stroke="#24447f" strokeWidth="1" />
          <text x={pl - 6} y={sy(t) + 4} fill="#a9bbdf" fontSize="11" textAnchor="end">{t.toFixed(0)}</text>
        </g>
      ))}
      {target !== undefined && (
        <g>
          <line x1={pl} x2={W - pr} y1={sy(target)} y2={sy(target)} stroke="#22c55e" strokeDasharray="5 4" strokeWidth="1.5" />
          <text x={W - pr} y={sy(target) - 4} fill="#86efac" fontSize="11" textAnchor="end">Objektivi {target} kg</text>
        </g>
      )}
      <path d={path} fill="none" stroke="#5aa2ff" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => <circle key={i} cx={sx(i)} cy={sy(p.y)} r="3" fill="#fff" />)}
      <text x={pl} y={H - 6} fill="#a9bbdf" fontSize="11">{fmt(points[0].x)}</text>
      <text x={W - pr} y={H - 6} fill="#a9bbdf" fontSize="11" textAnchor="end">{fmt(points[points.length - 1].x)}</text>
    </svg>
  );
}
