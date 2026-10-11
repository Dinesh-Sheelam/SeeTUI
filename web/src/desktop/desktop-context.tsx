import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { APP_IDS, emptyWindows, isMobile, loadGeo, persistGeo, type AppId, type WinState } from "./windows";

type DesktopCtx = {
  windows: Record<AppId, WinState>;
  focused: AppId | null;
  openApp: (id: AppId) => void;
  closeApp: (id: AppId) => void;
  minimizeApp: (id: AppId) => void;
  toggleMaximize: (id: AppId) => void;
  focusApp: (id: AppId) => void;
  moveApp: (id: AppId, x: number, y: number) => void;
  resizeApp: (id: AppId, w: number, h: number) => void;
  closeAll: () => void;
  isOpen: (id: AppId) => boolean;
};

const Ctx = createContext<DesktopCtx | null>(null);

function clampGeo(geo: { x: number; y: number; w: number; h: number }) {
  const maxW = Math.max(320, window.innerWidth - 16);
  const maxH = Math.max(240, window.innerHeight - 108);
  return {
    x: Math.max(0, Math.min(geo.x, Math.max(0, window.innerWidth - 80))),
    y: Math.max(28, Math.min(geo.y, Math.max(28, window.innerHeight - 80))),
    w: Math.min(geo.w, maxW),
    h: Math.min(geo.h, maxH),
  };
}

function markFocused(prev: Record<AppId, WinState>, id: AppId, patch: Partial<WinState>): Record<AppId, WinState> {
  const nextZ = Math.max(...APP_IDS.map((key) => prev[key].z), 30) + 1;
  const next = { ...prev };
  for (const key of APP_IDS) {
    if (next[key].focused) next[key] = { ...next[key], focused: false };
  }
  next[id] = { ...next[id], ...patch, z: nextZ, focused: true };
  return next;
}

function clearFocus(prev: Record<AppId, WinState>): Record<AppId, WinState> {
  const next = { ...prev };
  for (const key of APP_IDS) {
    if (next[key].focused) next[key] = { ...next[key], focused: false };
  }
  return next;
}

function focusFront(prev: Record<AppId, WinState>): Record<AppId, WinState> {
  let best: AppId | null = null;
  let bestZ = -1;
  for (const key of APP_IDS) {
    const item = prev[key];
    if (!item.open || item.minimized || item.z < bestZ) continue;
    best = key;
    bestZ = item.z;
  }
  if (!best) return clearFocus(prev);
  return markFocused(prev, best, {});
}

export function DesktopProvider({ children }: { children: ReactNode }) {
  const [windows, setWindows] = useState(emptyWindows);
  const focused = useMemo(() => APP_IDS.find((id) => windows[id].focused) ?? null, [windows]);

  const focusApp = useCallback((id: AppId) => {
    setWindows((prev) => markFocused(prev, id, {}));
  }, []);

  const openApp = useCallback((id: AppId) => {
    setWindows((prev) => {
      const item = prev[id];
      if (item.open && item.minimized) return markFocused(prev, id, { minimized: false });
      if (item.open) return markFocused(prev, id, {});
      const geo = clampGeo(loadGeo(id));
      return markFocused(prev, id, { ...geo, open: true, minimized: false, maximized: isMobile() });
    });
  }, []);

  const closeApp = useCallback((id: AppId) => {
    setWindows((prev) => {
      const item = prev[id];
      if (item.open && !item.maximized) persistGeo(id, item);
      const closed = { ...prev, [id]: { ...item, open: false, minimized: false, focused: false } };
      return item.focused ? focusFront(closed) : closed;
    });
  }, []);

  const minimizeApp = useCallback((id: AppId) => {
    setWindows((prev) => {
      const item = prev[id];
      if (item.open && !item.maximized) persistGeo(id, item);
      const hidden = { ...prev, [id]: { ...item, minimized: true, focused: false } };
      return item.focused ? focusFront(hidden) : hidden;
    });
  }, []);

  const toggleMaximize = useCallback((id: AppId) => {
    if (isMobile()) return;
    setWindows((prev) => {
      const item = prev[id];
      if (item.maximized) return { ...prev, [id]: { ...item, maximized: false, ...loadGeo(id) } };
      persistGeo(id, item);
      return { ...prev, [id]: { ...item, maximized: true } };
    });
    focusApp(id);
  }, [focusApp]);

  const moveApp = useCallback((id: AppId, x: number, y: number) => {
    setWindows((prev) => ({ ...prev, [id]: { ...prev[id], x, y } }));
  }, []);

  const resizeApp = useCallback((id: AppId, w: number, h: number) => {
    setWindows((prev) => ({ ...prev, [id]: { ...prev[id], w, h } }));
  }, []);

  const closeAll = useCallback(() => {
    setWindows(emptyWindows());
  }, []);

  const isOpen = useCallback((id: AppId) => {
    const item = windows[id];
    return item.open && !item.minimized;
  }, [windows]);

  const value = useMemo(
    () => ({ windows, focused, openApp, closeApp, minimizeApp, toggleMaximize, focusApp, moveApp, resizeApp, closeAll, isOpen }),
    [windows, focused, openApp, closeApp, minimizeApp, toggleMaximize, focusApp, moveApp, resizeApp, closeAll, isOpen],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDesktop() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useDesktop requires DesktopProvider");
  return ctx;
}
