import { ArrowRight, Info, ListTree } from "lucide-react";
import type { Snapshot } from "../../../api/types";
import { AreaChart, ChartLegend } from "../../monitor/AreaChart";
import { Gauge } from "../../monitor/Gauge";
import { toneForPct } from "../../monitor/tone";
import { Card, KeyValue, Meter } from "../../monitor/ui";
import { formatBytes, formatUptime } from "../format";
import { rootMount, type MonitorHistory, type MonitorTab } from "../monitor-types";

export function OverviewTab({
  data,
  history,
  onNavigate,
}: {
  data: Snapshot;
  history: MonitorHistory;
  onNavigate: (tab: MonitorTab) => void;
}) {
  const root = rootMount(data);
  const swapTotal = data.memory.swap_total_kb ?? 0;
  const swapPct = swapTotal ? ((data.memory.swap_used_kb ?? 0) / swapTotal) * 100 : null;
  const memTotal = (data.memory.total_kb ?? 0) * 1024;
  const memUsed = (data.memory.used_kb ?? 0) * 1024;
  const top = [...data.processes].sort((a, b) => b.cpu - a.cpu).slice(0, 5);
  const topCpu = Math.max(...top.map((p) => p.cpu), 1);
  const cores = data.cpu.info?.cores ?? data.cpu.cores?.length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3 px-0.5">
        <div>
          <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">This host</p>
          <h3 className="m-0 mt-1 text-[22px] font-semibold tracking-[-0.03em]">{data.host?.hostname || "Server"}</h3>
          <p className="m-0 mt-1 text-[13px] text-[var(--muted)]">
            {data.host?.os_name || "Linux"}
            {data.host?.uptime_seconds != null ? ` · up ${formatUptime(data.host.uptime_seconds)}` : ""}
          </p>
        </div>
        <p className="m-0 text-[13px] text-[var(--muted)]">
          Load {data.load.load1.toFixed(2)} · {data.process_counts?.running ?? 0} running
        </p>
      </div>
      <Card>
        <div className="grid grid-cols-2 gap-y-4 @xl:grid-cols-4">
          <GaugeLink onClick={() => onNavigate("cpu")}>
            <Gauge value={data.cpu.cpu_pct} label="CPU" detail={`${cores ?? "?"} cores · load ${data.load.load1.toFixed(2)}`} />
          </GaugeLink>
          <GaugeLink onClick={() => onNavigate("memory")}>
            <Gauge value={data.memory.used_pct} label="Memory" detail={memTotal ? `${formatBytes(memUsed)} of ${formatBytes(memTotal)}` : undefined} />
          </GaugeLink>
          <GaugeLink onClick={() => onNavigate("disk")}>
            <Gauge value={root?.used_pct ?? null} label="Disk" detail={root ? `${root.mount}${root.avail_bytes != null ? ` · ${formatBytes(root.avail_bytes)} free` : ""}` : undefined} />
          </GaugeLink>
          <GaugeLink onClick={() => onNavigate("memory")}>
            <Gauge value={swapPct} label="Swap" detail={swapTotal ? formatBytes(swapTotal * 1024) : "Not configured"} />
          </GaugeLink>
        </div>
      </Card>

      <Card title="Utilization">
        <div className="mb-3">
          <ChartLegend
            items={[
              { label: "CPU", color: "var(--accent)", value: `${Math.round(data.cpu.cpu_pct)}%` },
              { label: "Memory", color: "var(--blue)", value: `${Math.round(data.memory.used_pct)}%` },
            ]}
          />
        </div>
        <AreaChart
          max={100}
          format={(v) => `${Math.round(v)}%`}
          series={[
            { label: "CPU", values: history.cpu, color: "var(--accent)" },
            { label: "Memory", values: history.ram, color: "var(--blue)" },
          ]}
        />
      </Card>

      <div className="grid gap-4 @3xl:grid-cols-[1.4fr_1fr]">
        <Card
          title="Top processes"
          icon={ListTree}
          actions={
            <button type="button" className="mon-focus inline-flex items-center gap-1 rounded text-xs text-[var(--muted)] hover:text-[var(--text)]" onClick={() => onNavigate("processes")}>
              All processes <ArrowRight className="h-3 w-3" />
            </button>
          }
        >
          <ul className="m-0 list-none space-y-3 p-0">
            {top.map((p) => (
              <li key={p.pid} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1">
                <span className="min-w-0 truncate text-[13px]" title={p.command}>
                  <span className="font-medium">{p.command.split(/\s+/)[0].split("/").pop()}</span>
                  <span className="ml-2 text-xs text-[var(--muted)]">PID {p.pid}</span>
                </span>
                <span className="text-xs font-medium tabular-nums">{p.cpu.toFixed(1)}%</span>
                <div className="col-span-2">
                  <Meter value={(p.cpu / topCpu) * 100} tone={toneForPct(p.cpu)} height={4} />
                </div>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="System" icon={Info}>
          <KeyValue
            items={[
              ["Hostname", data.host?.hostname],
              ["OS", data.host?.os_name],
              ["Kernel", data.host?.kernel],
              ["Architecture", data.host?.arch],
              ["Virtualization", data.host?.virtualization && data.host.virtualization !== "none" ? data.host.virtualization : "Bare metal"],
              ["Uptime", formatUptime(data.host?.uptime_seconds ?? 0)],
              ["Load (1/5/15)", `${data.load.load1.toFixed(2)} / ${(data.load.load5 ?? 0).toFixed(2)} / ${(data.load.load15 ?? 0).toFixed(2)}`],
            ]}
          />
        </Card>
      </div>
    </div>
  );
}

function GaugeLink({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="mon-focus rounded-xl py-1 transition hover:bg-[var(--hover)]">
      {children}
    </button>
  );
}
