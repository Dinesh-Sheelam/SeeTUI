export const APP_IDS = ["files", "terminal", "health", "perf", "info", "certs", "transfers", "settings"] as const;
export type AppId = (typeof APP_IDS)[number];

export type WinState = {
  open: boolean;
  minimized: boolean;
  maximized: boolean;
  focused: boolean;
  z: number;
  x: number;
  y: number;
  w: number;
  h: number;
};

export const DEFAULTS: Record<AppId, { x: number; y: number; w: number; h: number }> = {
  files: { x: 36, y: 40, w: 1000, h: 620 },
  terminal: { x: 80, y: 70, w: 760, h: 460 },
  health: { x: 72, y: 48, w: 980, h: 640 },
  perf: { x: 56, y: 40, w: 1040, h: 680 },
  info: { x: 220, y: 90, w: 480, h: 520 },
  certs: { x: 180, y: 80, w: 560, h: 480 },
  transfers: { x: 140, y: 56, w: 780, h: 620 },
  settings: { x: 260, y: 72, w: 500, h: 580 },
};

export const TITLES: Record<AppId, string> = {
  files: "Files",
  terminal: "Terminal",
  health: "Health",
  perf: "Performance",
  info: "Server Info",
  certs: "Certificates",
  transfers: "Transfers",
  settings: "Settings",
};

export function isMobile() {
  return window.innerWidth < 700;
}

export function loadGeo(id: AppId) {
  try {
    const stored = JSON.parse(
      localStorage.getItem(`SeeTUI.win.${id}`) ||
        localStorage.getItem(`seetui.win.${id}`) ||
        localStorage.getItem(`VSC.win.${id}`) ||
        "null",
    ) as WinState | null;
    if (stored && Number.isFinite(stored.x) && Number.isFinite(stored.w)) {
      return { x: stored.x, y: stored.y, w: stored.w, h: stored.h };
    }
  } catch {
    /* ignore */
  }
  return DEFAULTS[id];
}

export function persistGeo(id: AppId, geo: { x: number; y: number; w: number; h: number }) {
  localStorage.setItem(`SeeTUI.win.${id}`, JSON.stringify(geo));
  localStorage.removeItem(`seetui.win.${id}`);
  localStorage.removeItem(`VSC.win.${id}`);
}

export function emptyWindows(): Record<AppId, WinState> {
  return Object.fromEntries(
    APP_IDS.map((id) => [id, { open: false, minimized: false, maximized: false, focused: false, z: 20, ...DEFAULTS[id] }]),
  ) as Record<AppId, WinState>;
}
