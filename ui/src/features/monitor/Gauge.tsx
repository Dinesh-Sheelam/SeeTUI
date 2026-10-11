import { TONE_COLOR, toneForPct } from "./tone";

const SWEEP = 270;

function arc(cx: number, cy: number, r: number, startDeg: number, endDeg: number) {
  const rad = (deg: number) => ((deg - 90) * Math.PI) / 180;
  const sx = cx + r * Math.cos(rad(startDeg));
  const sy = cy + r * Math.sin(rad(startDeg));
  const ex = cx + r * Math.cos(rad(endDeg));
  const ey = cy + r * Math.sin(rad(endDeg));
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M${sx},${sy} A${r},${r} 0 ${large} 1 ${ex},${ey}`;
}

export function Gauge({
  value,
  label,
  detail,
  size = 108,
}: {
  value: number | null;
  label: string;
  detail?: string;
  size?: number;
}) {
  const pct = value == null ? 0 : Math.min(Math.max(value, 0), 100);
  const stroke = Math.max(7, size * 0.075);
  const r = size / 2 - stroke;
  const c = size / 2;
  const start = -SWEEP / 2;
  const color = value == null ? "var(--muted)" : TONE_COLOR[toneForPct(pct)];

  return (
    <div className="flex flex-col items-center text-center">
      <div className="relative" style={{ width: size, height: size * 0.86 }}>
        <svg width={size} height={size} className="absolute inset-x-0 top-0">
          <path d={arc(c, c, r, start, start + SWEEP)} fill="none" stroke="var(--line)" strokeWidth={stroke} strokeLinecap="round" />
          {pct > 0 && (
            <path
              d={arc(c, c, r, start, start + (SWEEP * pct) / 100)}
              fill="none"
              stroke={color}
              strokeWidth={stroke}
              strokeLinecap="round"
              style={{ transition: "d 500ms ease-out, stroke 300ms ease" }}
            />
          )}
        </svg>
        <div className="absolute inset-x-0 flex flex-col items-center" style={{ top: size * 0.3 }}>
          <span className="font-semibold tabular-nums tracking-[-0.03em]" style={{ fontSize: size * 0.22 }}>
            {value == null ? "—" : `${Math.round(pct)}`}
            {value != null && <span className="text-[0.55em] font-medium text-[var(--muted)]">%</span>}
          </span>
        </div>
      </div>
      <span className="mt-0.5 text-[13px] font-medium">{label}</span>
      {detail && <span className="mt-0.5 max-w-[140px] truncate text-[11px] text-[var(--muted)]">{detail}</span>}
    </div>
  );
}
