import type { ReactNode, SyntheticEvent } from "react";

type Light = {
  label: string;
  fill: string;
  edge: string;
  glyph: string;
  icon: ReactNode;
  onClick: () => void;
};

const CLOSE = <path d="M4 4l4 4M8 4 4 8" strokeWidth="1.3" strokeLinecap="round" />;
const MINIMIZE = <path d="M3.5 6h5" strokeWidth="1.3" strokeLinecap="round" />;
const ENTER_FULL = <path d="M3.5 8.5V5l3.5 3.5ZM8.5 3.5V7L5 3.5Z" stroke="none" fill="currentColor" />;
const EXIT_FULL = <path d="M5.6 6.4v2.8L2.8 6.4ZM6.4 5.6V2.8l2.8 2.8Z" stroke="none" fill="currentColor" />;

const stop = (ev: SyntheticEvent) => ev.stopPropagation();

export function TrafficLights({
  isFocused,
  isMaximized,
  onClose,
  onMinimize,
  onMaximize,
}: {
  isFocused: boolean;
  isMaximized: boolean;
  onClose: () => void;
  onMinimize: () => void;
  onMaximize: () => void;
}) {
  const lights: Light[] = [
    { label: "Close", fill: "#ff5f57", edge: "#e0443e", glyph: "#4d0000", icon: CLOSE, onClick: onClose },
    { label: "Minimize", fill: "#febc2e", edge: "#dea123", glyph: "#985712", icon: MINIMIZE, onClick: onMinimize },
    {
      label: isMaximized ? "Restore" : "Maximize",
      fill: "#28c840",
      edge: "#1aab29",
      glyph: "#0b650d",
      icon: isMaximized ? EXIT_FULL : ENTER_FULL,
      onClick: onMaximize,
    },
  ];

  return (
    <div className="group/lights flex items-center gap-2" onPointerDown={stop}>
      {lights.map(({ label, fill, edge, glyph, icon, onClick }) => (
        <button
          key={label}
          type="button"
          aria-label={label}
          title={label}
          onPointerDown={stop}
          onClick={(ev) => { ev.stopPropagation(); onClick(); }}
          className={`relative grid h-3 w-3 place-items-center rounded-full transition-[background-color,box-shadow,filter] duration-150 outline-none before:absolute before:-inset-1 before:content-[''] focus-visible:ring-2 focus-visible:ring-[var(--focus)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--bg2)] active:brightness-75 ${
            isFocused ? "" : "bg-[color-mix(in_srgb,var(--text)_22%,transparent)]! shadow-none! group-hover/lights:bg-[var(--light-fill)]! group-hover/lights:shadow-[inset_0_0_0_0.5px_var(--light-edge)]!"
          }`}
          style={{
            background: fill,
            boxShadow: `inset 0 0 0 0.5px ${edge}`,
            ["--light-fill" as string]: fill,
            ["--light-edge" as string]: edge,
          }}
        >
          <svg
            viewBox="0 0 12 12"
            width="12"
            height="12"
            aria-hidden="true"
            fill="none"
            stroke="currentColor"
            className="opacity-0 transition-opacity duration-100 group-hover/lights:opacity-100 group-focus-within/lights:opacity-100"
            style={{ color: glyph }}
          >
            {icon}
          </svg>
        </button>
      ))}
    </div>
  );
}
