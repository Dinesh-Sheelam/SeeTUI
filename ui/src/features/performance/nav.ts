import type { MonitorTab } from "./monitor-types";

let pending: MonitorTab | null = null;
const listeners = new Set<(tab: MonitorTab) => void>();

export function requestPerfTab(tab: MonitorTab) {
  pending = tab;
  listeners.forEach((fn) => fn(tab));
}

export function takePendingTab(): MonitorTab | null {
  const tab = pending;
  pending = null;
  return tab;
}

export function subscribePerfTab(fn: (tab: MonitorTab) => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
