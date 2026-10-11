import { Layers, ListTree } from "lucide-react";
import type { Snapshot } from "../../../api/types";
import { AreaChart } from "../../monitor/AreaChart";
import { Gauge } from "../../monitor/Gauge";
import { Card, KeyValue } from "../../monitor/ui";
import { formatBytes } from "../format";
import type { MonitorHistory } from "../monitor-types";

export function MemoryTab({ data, history }: { data: Snapshot; history: MonitorHistory }) {
  const mem = data.memory;
  const kb = (v?: number) => (v ?? 0) * 1024;
  const total = kb(mem.total_kb);
  const apps = Math.min(kb(mem.used_kb), total);
  const cache = Math.min(kb(mem.cached_kb) + kb(mem.buffers_kb), total - apps);
  const free = Math.max(total - apps - cache, 0);
  const segments = [
    { label: "In use", bytes: apps, color: "var(--accent)" },
    { label: "Cache", bytes: cache, color: "var(--blue)" },
    { label: "Free", bytes: free, color: "var(--line)" },
  ];
  const topMem = [...data.processes].sort((a, b) => b.mem - a.mem).slice(0, 6);

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center gap-6">
          <Gauge value={mem.used_pct} label="In use" size={120} />
          <div className="min-w-[220px] flex-1">
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-2xl font-semibold tabular-nums tracking-[-0.03em]">{formatBytes(apps)}</span>
              <span className="text-xs text-[var(--muted)]">of {formatBytes(total)}</span>
            </div>
            <div className="flex h-3 gap-[2px] overflow-hidden rounded-full">
              {segments
                .filter((s) => s.bytes > 0 && total > 0)
                .map((s) => (
                  <div key={s.label} title={`${s.label}: ${formatBytes(s.bytes)}`} style={{ width: `${(s.bytes / total) * 100}%`, background: s.color }} />
                ))}
            </div>
            <div className="mt-3 grid grid-cols-3 gap-3">
              {segments.map((s) => (
                <div key={s.label} className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: s.color }} />
                  <span className="text-xs text-[var(--muted)]">{s.label}</span>
                  <span className="ml-auto text-xs font-medium tabular-nums">{formatBytes(s.bytes)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <Card title="Memory pressure">
        <AreaChart max={100} format={(v) => `${Math.round(v)}%`} series={[{ label: "Used", values: history.ram, color: "var(--blue)" }]} />
      </Card>

      <div className="grid gap-4 @3xl:grid-cols-2">
        <Card title="Details" icon={Layers}>
          <KeyValue
            items={[
              ["Available", formatBytes(kb(mem.available_kb))],
              ["Swap used", `${formatBytes(kb(mem.swap_used_kb))} of ${formatBytes(kb(mem.swap_total_kb))}`],
              ["Page faults", (mem.pgfault ?? 0).toLocaleString()],
              ["Major faults", (mem.pgmajfault ?? 0).toLocaleString()],
            ]}
          />
        </Card>
        <Card title="Largest processes" icon={ListTree}>
          <ul className="m-0 list-none space-y-2 p-0">
            {topMem.map((p) => (
              <li key={p.pid} className="flex items-center gap-3 text-[13px]">
                <span className="min-w-0 flex-1 truncate" title={p.command}>{p.command.split(/\s+/)[0].split("/").pop()}</span>
                <span className="text-xs text-[var(--muted)] tabular-nums">{p.rss ? formatBytes(p.rss * 1024) : ""}</span>
                <span className="w-12 text-right text-xs font-medium tabular-nums">{p.mem.toFixed(1)}%</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
