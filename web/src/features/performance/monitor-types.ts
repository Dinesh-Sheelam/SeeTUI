import type { Snapshot } from "../../api/types";

export type MonitorTab = "overview" | "cpu" | "memory" | "disk" | "network" | "processes" | "services" | "ports";

export type MonitorHistory = {
  cpu: number[];
  cpuIowait: number[];
  ram: number[];
  diskRead: number[];
  diskWrite: number[];
  netRx: number[];
  netTx: number[];
};

export const HISTORY_CAPACITY = 90;

export function emptyHistory(): MonitorHistory {
  return { cpu: [], cpuIowait: [], ram: [], diskRead: [], diskWrite: [], netRx: [], netTx: [] };
}

function push(values: number[], value: number) {
  const next = values.length >= HISTORY_CAPACITY ? values.slice(1) : values.slice();
  next.push(value);
  return next;
}

export function appendSnapshot(history: MonitorHistory, snap: Snapshot): MonitorHistory {
  const sum = <T,>(rows: T[] | undefined, pick: (row: T) => number) => (rows || []).reduce((n, row) => n + pick(row), 0);
  return {
    cpu: push(history.cpu, snap.cpu.cpu_pct),
    cpuIowait: push(history.cpuIowait, snap.cpu.iowait_pct ?? 0),
    ram: push(history.ram, snap.memory.used_pct),
    diskRead: push(history.diskRead, sum(snap.disk_io, (d) => d.read_bps)),
    diskWrite: push(history.diskWrite, sum(snap.disk_io, (d) => d.write_bps)),
    netRx: push(history.netRx, sum(snap.net_ifaces, (i) => i.rx_bps)),
    netTx: push(history.netTx, sum(snap.net_ifaces, (i) => i.tx_bps)),
  };
}

export function rootMount(snap: Snapshot) {
  return snap.mounts?.find((m) => m.mount === "/") ?? snap.mounts?.[0];
}
