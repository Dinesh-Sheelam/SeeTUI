import { Database, HardDrive } from "lucide-react";
import type { Snapshot } from "../../../api/types";
import { AreaChart, ChartLegend } from "../../monitor/AreaChart";
import { toneForPct } from "../../monitor/tone";
import { Badge, Card, EmptyState, Meter } from "../../monitor/ui";
import { formatBytes, formatRate } from "../format";
import type { MonitorHistory } from "../monitor-types";

export function DiskTab({ data, history }: { data: Snapshot; history: MonitorHistory }) {
  const devices = data.disk_io ?? [];

  return (
    <div className="space-y-4">
      <Card title="Throughput">
        <div className="mb-3">
          <ChartLegend
            items={[
              { label: "Read", color: "var(--ok)", value: formatRate(history.diskRead.at(-1) ?? 0) },
              { label: "Write", color: "var(--accent)", value: formatRate(history.diskWrite.at(-1) ?? 0) },
            ]}
          />
        </div>
        <AreaChart
          format={(v) => formatRate(v)}
          series={[
            { label: "Read", values: history.diskRead, color: "var(--ok)" },
            { label: "Write", values: history.diskWrite, color: "var(--accent)" },
          ]}
        />
      </Card>

      <Card title="Volumes" icon={HardDrive}>
        {data.mounts.length ? (
          <div className="grid gap-3 @2xl:grid-cols-2">
            {data.mounts.map((m) => {
              const tone = toneForPct(m.used_pct, 80, 92);
              return (
                <div key={m.mount} className="rounded-xl border border-[var(--line)] p-3">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="m-0 truncate text-[13px] font-semibold">{m.mount}</p>
                      <p className="m-0 truncate text-[11px] text-[var(--muted)]">{m.filesystem}</p>
                    </div>
                    <span className="text-lg font-semibold tabular-nums tracking-[-0.02em]">{m.used_pct}%</span>
                  </div>
                  <Meter value={m.used_pct} tone={tone} />
                  {m.size_bytes != null && (
                    <p className="m-0 mt-2 text-[11px] text-[var(--muted)]">
                      {formatBytes(m.avail_bytes ?? 0)} free of {formatBytes(m.size_bytes)}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState icon={HardDrive} title="No volumes reported" />
        )}
      </Card>

      <Card title="Devices" icon={Database} flush>
        {devices.length ? (
          <div className="mon-scroll overflow-x-auto">
            <table className="mon-table">
              <thead>
                <tr>
                  <th>Device</th>
                  <th>Type</th>
                  <th className="!text-right">Read</th>
                  <th className="!text-right">Write</th>
                  <th className="!text-right">IOPS r / w</th>
                </tr>
              </thead>
              <tbody>
                {devices.map((d) => (
                  <tr key={d.name}>
                    <td className="font-mono font-medium">{d.name}</td>
                    <td>
                      <Badge tone={d.type === "ssd" ? "ok" : "neutral"}>{(d.type || "unknown").toUpperCase()}</Badge>
                    </td>
                    <td className="text-right tabular-nums">{formatRate(d.read_bps)}</td>
                    <td className="text-right tabular-nums">{formatRate(d.write_bps)}</td>
                    <td className="text-right tabular-nums text-[var(--muted)]">
                      {d.read_iops} / {d.write_iops}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon={Database} title="No block devices reported" />
        )}
      </Card>
    </div>
  );
}
