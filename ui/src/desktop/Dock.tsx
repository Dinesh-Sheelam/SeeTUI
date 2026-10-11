import { useEffect, useState } from "react";
import { isMobile } from "./windows";
import type { AppId } from "./windows";
import { APP_ICONS } from "./AppIcons";
import { useDesktop } from "./desktop-context";

const ITEMS: { id: AppId; label: string }[] = [
  { id: "files", label: "Files" },
  { id: "terminal", label: "Terminal" },
  { id: "health", label: "Health" },
  { id: "perf", label: "Performance" },
  { id: "info", label: "Server Info" },
  { id: "certs", label: "Certificates" },
  { id: "transfers", label: "Transfers" },
  { id: "settings", label: "Settings" },
];

export function Dock({ healthCount }: { healthCount: number }) {
  const { windows, openApp } = useDesktop();
  const [isRevealed, setIsRevealed] = useState(false);
  const shouldAutoHide = !isMobile() && Object.values(windows).some((win) => win.open && !win.minimized && win.maximized);
  const isHidden = shouldAutoHide && !isRevealed;

  useEffect(() => { if (!shouldAutoHide) setIsRevealed(false); }, [shouldAutoHide]);

  return (
    <>
    {shouldAutoHide && <div className="fixed inset-x-0 bottom-0 z-50 h-1.5" onMouseEnter={() => setIsRevealed(true)} aria-hidden />}
    <nav
      className={`glass fixed bottom-3 left-1/2 z-50 flex max-w-[calc(100%-16px)] -translate-x-1/2 flex-wrap items-end justify-center gap-1 rounded-2xl px-2 py-2 shadow-lg transition-[translate,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] sm:gap-2 sm:px-3 ${isHidden ? "pointer-events-none translate-y-[calc(100%+16px)] opacity-0" : ""}`}
      onMouseLeave={() => setIsRevealed(false)}
      aria-hidden={isHidden}
    >
      {ITEMS.map(({ id, label }) => {
        const item = windows[id];
        const Icon = APP_ICONS[id];
        return (
          <button
            key={id}
            type="button"
            title={label}
            onClick={() => openApp(id)}
            className={`group relative grid h-10 w-10 place-items-center rounded-xl bg-[var(--bg2)] text-[var(--text)] transition-transform hover:-translate-y-2 hover:scale-110 sm:h-12 sm:w-12 ${item.focused ? "ring-1 ring-[var(--accent)]" : ""}`}
          >
            <Icon className="h-7 w-7 sm:h-8 sm:w-8" />
            <span className="pointer-events-none absolute -top-7 hidden rounded-md bg-[var(--bg2)] px-2 py-0.5 text-[11px] group-hover:block">{label}</span>
            {item.open && <span className="absolute -bottom-1.5 h-1 w-1 rounded-full bg-[var(--text)]" />}
            {id === "health" && healthCount > 0 && (
              <span className="absolute top-1 right-1 min-w-3.5 rounded-full bg-[var(--bad)] px-1 text-[9px] text-white">{healthCount}</span>
            )}
          </button>
        );
      })}
    </nav>
    </>
  );
}
