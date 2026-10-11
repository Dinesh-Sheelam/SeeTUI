export function Sparkline({
  values,
  color = "var(--accent)",
  width = 56,
  height = 18,
  max,
}: {
  values: number[];
  color?: string;
  width?: number;
  height?: number;
  max?: number;
}) {
  if (values.length < 2) return <span style={{ width, height }} className="inline-block" />;
  const top = max ?? Math.max(...values, 1);
  const points = values
    .map((v, i) => `${((i / (values.length - 1)) * width).toFixed(1)},${(height - (Math.min(v, top) / top) * (height - 2) - 1).toFixed(1)}`)
    .join(" ");
  return (
    <svg width={width} height={height} className="block shrink-0 overflow-visible" aria-hidden>
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
