import { Loader2, Search, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { TONE_COLOR, type Tone } from "./tone";

export function Card({
  title,
  icon: Icon,
  actions,
  children,
  className = "",
  flush = false,
}: {
  title?: ReactNode;
  icon?: LucideIcon;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  flush?: boolean;
}) {
  return (
    <section className={`mon-card ${flush ? "overflow-hidden" : "p-4"} ${className}`}>
      {(title || actions) && (
        <header className={`flex items-center justify-between gap-3 ${flush ? "px-4 pt-3.5 pb-3" : "mb-3"}`}>
          {title && (
            <h3 className="m-0 flex items-center gap-2 text-[13px] font-semibold tracking-[-0.01em]">
              {Icon && <Icon className="h-4 w-4 text-[var(--muted)]" strokeWidth={1.75} />}
              {title}
            </h3>
          )}
          {actions && <div className="flex items-center gap-1.5">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const BUTTON_STYLES: Record<ButtonVariant, string> = {
  primary: "bg-[var(--accent)] text-white hover:brightness-110 border-transparent",
  secondary: "bg-[var(--btn-soft)] text-[var(--text)] hover:bg-[var(--hover)] border-[var(--line)]",
  ghost: "bg-transparent text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--text)] border-transparent",
  danger: "bg-[var(--danger)]/12 text-[var(--danger)] hover:bg-[var(--danger)]/20 border-[var(--danger)]/30",
};

export function Button({
  children,
  icon: Icon,
  variant = "secondary",
  size = "md",
  busy = false,
  disabled,
  onClick,
  title,
  type = "button",
}: {
  children?: ReactNode;
  icon?: LucideIcon;
  variant?: ButtonVariant;
  size?: "sm" | "md";
  busy?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  title?: string;
  type?: "button" | "submit";
}) {
  const sizing = size === "sm" ? "h-7 px-2.5 text-xs gap-1.5" : "h-8 px-3 text-[13px] gap-2";
  return (
    <button
      type={type}
      title={title}
      disabled={disabled || busy}
      onClick={onClick}
      className={`mon-focus inline-flex shrink-0 items-center justify-center rounded-lg border font-medium transition disabled:cursor-not-allowed disabled:opacity-45 ${sizing} ${BUTTON_STYLES[variant]}`}
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : Icon && <Icon className="h-3.5 w-3.5" strokeWidth={2} />}
      {children}
    </button>
  );
}

export function IconButton({
  icon: Icon,
  label,
  onClick,
  tone,
  disabled,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  tone?: Tone;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="mon-focus inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--muted)] transition hover:bg-[var(--hover)] disabled:opacity-35"
      style={tone ? { color: TONE_COLOR[tone] } : undefined}
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={2} />
    </button>
  );
}

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  const color = TONE_COLOR[tone];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium leading-4"
      style={{ color, background: `color-mix(in srgb, ${color} 14%, transparent)` }}
    >
      {children}
    </span>
  );
}

export function Dot({ tone, pulse = false }: { tone: Tone; pulse?: boolean }) {
  return (
    <span
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${pulse ? "mon-pulse" : ""}`}
      style={{ background: TONE_COLOR[tone] }}
    />
  );
}

export function SearchField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="relative block min-w-[160px] flex-1">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--muted)]" />
      <input className="mon-input !pl-8" placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

export type ChipOption<T extends string> = { id: T; label: string; count?: number; tone?: Tone };

export function FilterChips<T extends string>({
  options,
  active,
  onChange,
}: {
  options: ChipOption<T>[];
  active: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup">
      {options.map((opt) => {
        const isActive = opt.id === active;
        return (
          <button
            key={opt.id}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => onChange(opt.id)}
            className={`mon-focus inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition ${
              isActive
                ? "border-transparent bg-[var(--text)] text-[var(--bg)]"
                : "border-[var(--line)] text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--text)]"
            }`}
          >
            {opt.tone && <Dot tone={opt.tone} />}
            {opt.label}
            {opt.count != null && <span className={isActive ? "opacity-70" : "opacity-60"}>{opt.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="mon-focus inline-flex items-center gap-2 rounded-lg px-1 text-[13px] text-[var(--muted)] hover:text-[var(--text)]"
    >
      <span
        className="relative h-[18px] w-8 rounded-full transition-colors"
        style={{ background: checked ? "var(--ok)" : "var(--line)" }}
      >
        <span
          className="absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white shadow transition-transform"
          style={{ transform: `translateX(${checked ? 16 : 2}px)` }}
        />
      </span>
      {label}
    </button>
  );
}

export function KeyValue({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[13px]">
      {items.map(([key, value]) => (
        <div key={key} className="contents">
          <dt className="text-[var(--muted)]">{key}</dt>
          <dd className="m-0 min-w-0 truncate text-right font-medium">{value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Meter({ value, tone, height = 6 }: { value: number; tone?: Tone; height?: number }) {
  const pct = Math.min(Math.max(value, 0), 100);
  return (
    <div className="w-full overflow-hidden rounded-full bg-[var(--line)]" style={{ height }}>
      <div
        className="h-full rounded-full transition-[width] duration-500 ease-out"
        style={{ width: `${pct}%`, background: TONE_COLOR[tone ?? "accent"] }}
      />
    </div>
  );
}

export function EmptyState({ icon: Icon, title, hint }: { icon: LucideIcon; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--hover)]">
        <Icon className="h-5 w-5 text-[var(--muted)]" strokeWidth={1.75} />
      </span>
      <p className="m-0 text-sm font-medium">{title}</p>
      {hint && <p className="m-0 max-w-xs text-xs text-[var(--muted)]">{hint}</p>}
    </div>
  );
}

export function Skeleton({ className }: { className: string }) {
  return <div className={`mon-skeleton ${className}`} />;
}

export function SortHeader<K extends string>({
  label,
  sortKey,
  current,
  direction,
  onSort,
  align = "left",
}: {
  label: string;
  sortKey: K;
  current: K;
  direction: "asc" | "desc";
  onSort: (key: K) => void;
  align?: "left" | "right";
}) {
  const active = current === sortKey;
  return (
    <th className={align === "right" ? "!text-right" : undefined} aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`mon-focus inline-flex items-center gap-1 rounded ${active ? "text-[var(--text)]" : "hover:text-[var(--text)]"}`}
      >
        {label}
        <span className={`text-[9px] ${active ? "opacity-100" : "opacity-0"}`}>{direction === "asc" ? "▲" : "▼"}</span>
      </button>
    </th>
  );
}
