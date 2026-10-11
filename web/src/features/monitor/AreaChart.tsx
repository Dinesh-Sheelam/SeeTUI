import { useId, useState } from "react";
import { useElementWidth } from "./useElementWidth";

export type ChartSeries = { label: string; values: number[]; color: string };

const PAD_TOP = 8;
const PAD_BOTTOM = 18;

function niceMax(value: number) {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * magnitude >= value) ?? 10;
  return step * magnitude;
}

export function AreaChart({
  series,
  height = 150,
  max,
  capacity = 90,
  intervalSec = 2,
  format = (v) => v.toFixed(0),
}: {
  series: ChartSeries[];
  height?: number;
  max?: number;
  capacity?: number;
  intervalSec?: number;
  format?: (value: number) => string;
}) {
  const uid = useId().replace(/:/g, "");
  const { ref, width } = useElementWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const count = Math.max(...series.map((s) => s.values.length), 0);
  const peak = Math.max(...series.flatMap((s) => s.values), 0);
  const top = max ?? niceMax(peak * 1.15);
  const plotH = height - PAD_TOP - PAD_BOTTOM;
  const step = width / Math.max(capacity - 1, 1);

  const xAt = (i: number, len: number) => width - (len - 1 - i) * step;
  const yAt = (v: number) => PAD_TOP + plotH - (Math.min(v, top) / top) * plotH;

  const linePath = (values: number[]) =>
    values.map((v, i) => `${i === 0 ? "M" : "L"}${xAt(i, values.length).toFixed(1)},${yAt(v).toFixed(1)}`).join("");

  const areaPath = (values: number[]) => {
    if (!values.length) return "";
    const firstX = xAt(0, values.length).toFixed(1);
    const base = (PAD_TOP + plotH).toFixed(1);
    return `${linePath(values)}L${width.toFixed(1)},${base}L${firstX},${base}Z`;
  };

  function onMove(clientX: number, rectLeft: number) {
    if (!count) return;
    const fromRight = Math.round((width - (clientX - rectLeft)) / step);
    const index = count - 1 - fromRight;
    setHover(index >= 0 && index < count ? index : null);
  }

  const hoverX = hover != null ? xAt(hover, count) : 0;
  const tooltipLeft = hoverX > width - 150;

  return (
    <div
      ref={ref}
      className="relative select-none"
      style={{ height }}
      onMouseMove={(e) => onMove(e.clientX, e.currentTarget.getBoundingClientRect().left)}
      onMouseLeave={() => setHover(null)}
    >
      {width > 0 && (
        <svg width={width} height={height} className="block overflow-visible">
          <defs>
            {series.map((s, i) => (
              <linearGradient key={s.label} id={`${uid}-g${i}`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity={0.32} />
                <stop offset="100%" stopColor={s.color} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          {[0, 0.5, 1].map((k) => {
            const y = PAD_TOP + plotH * (1 - k);
            return (
              <g key={k}>
                <line x1={0} x2={width} y1={y} y2={y} stroke="var(--line)" strokeDasharray={k === 0 ? undefined : "3 4"} />
                {k > 0 && (
                  <text x={4} y={y - 4} fontSize={10} fill="var(--muted)">
                    {format(top * k)}
                  </text>
                )}
              </g>
            );
          })}
          <text x={0} y={height - 4} fontSize={10} fill="var(--muted)">
            {Math.round(((capacity - 1) * intervalSec) / 60)} min ago
          </text>
          <text x={width} y={height - 4} fontSize={10} fill="var(--muted)" textAnchor="end">
            now
          </text>
          {series.map((s, i) => (
            <g key={s.label}>
              <path d={areaPath(s.values)} fill={`url(#${uid}-g${i})`} />
              <path d={linePath(s.values)} fill="none" stroke={s.color} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
            </g>
          ))}
          {hover != null && (
            <g>
              <line x1={hoverX} x2={hoverX} y1={PAD_TOP} y2={PAD_TOP + plotH} stroke="var(--muted)" strokeOpacity={0.5} />
              {series.map((s) => {
                const offset = count - s.values.length;
                const v = s.values[hover - offset];
                if (v == null) return null;
                return <circle key={s.label} cx={hoverX} cy={yAt(v)} r={3.5} fill="var(--bg2)" stroke={s.color} strokeWidth={2} />;
              })}
            </g>
          )}
        </svg>
      )}
      {hover != null && (
        <div
          className="pointer-events-none absolute top-1 z-10 min-w-[120px] rounded-lg border border-[var(--line)] bg-[var(--panel)] px-2.5 py-2 text-xs shadow-lg backdrop-blur-xl"
          style={tooltipLeft ? { right: width - hoverX + 10 } : { left: hoverX + 10 }}
        >
          <div className="mb-1 text-[10px] text-[var(--muted)]">
            {hover === count - 1 ? "Now" : `${(count - 1 - hover) * intervalSec}s ago`}
          </div>
          {series.map((s) => {
            const v = s.values[hover - (count - s.values.length)];
            return (
              <div key={s.label} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-1.5 text-[var(--muted)]">
                  <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                  {s.label}
                </span>
                <span className="font-medium tabular-nums">{v == null ? "—" : format(v)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ChartLegend({ items }: { items: { label: string; color: string; value: string }[] }) {
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-1">
      {items.map((item) => (
        <div key={item.label} className="flex items-baseline gap-2">
          <span className="h-2 w-2 translate-y-[-1px] rounded-full" style={{ background: item.color }} />
          <span className="text-xs text-[var(--muted)]">{item.label}</span>
          <span className="text-base font-semibold tabular-nums tracking-[-0.02em]">{item.value}</span>
        </div>
      ))}
    </div>
  );
}
