import { Cpu, Grid3x3 } from "lucide-react";
import type { Snapshot } from "../../../api/types";
import { AreaChart, ChartLegend } from "../../monitor/AreaChart";
import { TONE_COLOR, toneForPct } from "../../monitor/tone";
import { Card, KeyValue } from "../../monitor/ui";
import type { MonitorHistory } from "../monitor-types";

export function CpuTab({ data, history }: { data: Snapshot; history: MonitorHistory }) {
  const info = data.cpu.info;
  const cores = data.cpu.cores ?? [];

  return (
    <div className="space-y-4">
      <Card>
        <div className="mb-3">
          <ChartLegend
            items={[
              { label: "Total", color: "var(--accent)", value: `${data.cpu.cpu_pct.toFixed(1)}%` },
              { label: "User", color: "var(--text)", value: `${(data.cpu.user_pct ?? 0).toFixed(1)}%` },
              { label: "System", color: "var(--text)", value: `${(data.cpu.system_pct ?? 0).toFixed(1)}%` },
              { label: "I/O wait", color: "var(--warn)", value: `${(data.cpu.iowait_pct ?? 0).toFixed(1)}%` },
            ]}
          />
        </div>
        <AreaChart
          max={100}
          height={170}
          format={(v) => `${v.toFixed(0)}%`}
          series={[
            { label: "Total", values: history.cpu, color: "var(--accent)" },
            { label: "I/O wait", values: history.cpuIowait, color: "var(--warn)" },
          ]}
        />
      </Card>

      <div className="grid gap-4 @3xl:grid-cols-[1.5fr_1fr]">
        <Card title={`Cores (${cores.length})`} icon={Grid3x3}>
          {cores.length ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(66px,1fr))] gap-1.5">
              {cores.map((core) => {
                const color = TONE_COLOR[toneForPct(core.usage_pct, 70, 90)];
                return (
                  <div
                    key={core.id}
                    title={`${core.id}: ${core.usage_pct}%`}
                    className="relative overflow-hidden rounded-lg border border-[var(--line)] px-2 py-1.5"
                  >
                    <div
                      className="absolute inset-x-0 bottom-0 transition-[height] duration-500 ease-out"
                      style={{ height: `${Math.max(core.usage_pct, 2)}%`, background: `color-mix(in srgb, ${color} 28%, transparent)` }}
                    />
                    <div className="relative text-[10px] text-[var(--muted)]">{core.id.replace("cpu", "Core ")}</div>
                    <div className="relative text-sm font-semibold tabular-nums">{Math.round(core.usage_pct)}%</div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="m-0 text-sm text-[var(--muted)]">Per-core data is not available yet.</p>
          )}
        </Card>
        <Card title="Processor" icon={Cpu}>
          <p className="m-0 mb-3 text-[13px] font-medium leading-snug">{info?.model || "Unknown CPU"}</p>
          <KeyValue
            items={[
              ["Logical cores", info?.cores ?? cores.length],
              ["Current speed", info?.cur_mhz ? `${(info.cur_mhz / 1000).toFixed(2)} GHz` : "—"],
              ["Max speed", info?.max_mhz ? `${(info.max_mhz / 1000).toFixed(2)} GHz` : "—"],
              ["Temperature", info?.temp_c != null ? `${info.temp_c} °C` : "—"],
              ["Load average", `${data.load.load1.toFixed(2)} · ${(data.load.load5 ?? 0).toFixed(2)} · ${(data.load.load15 ?? 0).toFixed(2)}`],
            ]}
          />
        </Card>
      </div>
    </div>
  );
}
