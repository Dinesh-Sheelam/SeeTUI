import { Cable, Route, Waypoints } from "lucide-react";
import { useMemo, useState } from "react";
import type { Snapshot } from "../../../api/types";
import { AreaChart, ChartLegend } from "../../monitor/AreaChart";
import { Card, EmptyState, FilterChips, KeyValue, SearchField } from "../../monitor/ui";
import { formatBytes, formatRate } from "../format";
import type { MonitorHistory } from "../monitor-types";

type StateFilter = "all" | "ESTAB" | "LISTEN" | "TIME-WAIT" | "other";

export function NetworkTab({ data, history }: { data: Snapshot; history: MonitorHistory }) {
  const [query, setQuery] = useState("");
  const [stateFilter, setStateFilter] = useState<StateFilter>("all");
  const connections = data.connections ?? [];

  const counts = useMemo(() => {
    const c = { ESTAB: 0, LISTEN: 0, "TIME-WAIT": 0, other: 0 };
    for (const row of connections) {
      if (row.state in c) c[row.state as keyof typeof c] += 1;
      else c.other += 1;
    }
    return c;
  }, [connections]);

  const rows = connections.filter((c) => {
    const known = ["ESTAB", "LISTEN", "TIME-WAIT"].includes(c.state);
    if (stateFilter === "other" ? known : stateFilter !== "all" && c.state !== stateFilter) return false;
    if (!query) return true;
    const q = query.toLowerCase();
    return c.remote.toLowerCase().includes(q) || (c.local ?? "").toLowerCase().includes(q) || c.process.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-4">
      <Card title="Traffic">
        <div className="mb-3">
          <ChartLegend
            items={[
              { label: "Download", color: "var(--blue)", value: formatRate(history.netRx.at(-1) ?? 0) },
              { label: "Upload", color: "var(--accent)", value: formatRate(history.netTx.at(-1) ?? 0) },
            ]}
          />
        </div>
        <AreaChart
          format={(v) => formatRate(v)}
          series={[
            { label: "Download", values: history.netRx, color: "var(--blue)" },
            { label: "Upload", values: history.netTx, color: "var(--accent)" },
          ]}
        />
      </Card>

      <div className="grid gap-4 @3xl:grid-cols-[1.5fr_1fr]">
        <Card title="Interfaces" icon={Cable}>
          <div className="space-y-2">
            {(data.net_ifaces ?? []).map((n) => (
              <div key={n.name} className="grid grid-cols-[1fr_auto_auto] items-center gap-x-4 rounded-xl border border-[var(--line)] px-3 py-2">
                <div className="min-w-0">
                  <p className="m-0 font-mono text-[13px] font-semibold">{n.name}</p>
                  <p className="m-0 truncate text-[11px] text-[var(--muted)]">{n.ipv4 || "No IPv4"}</p>
                </div>
                <div className="text-right">
                  <p className="m-0 text-xs font-medium tabular-nums">↓ {formatRate(n.rx_bps)}</p>
                  <p className="m-0 text-[11px] text-[var(--muted)] tabular-nums">{formatBytes(n.rx_bytes)} total</p>
                </div>
                <div className="text-right">
                  <p className="m-0 text-xs font-medium tabular-nums">↑ {formatRate(n.tx_bps)}</p>
                  <p className="m-0 text-[11px] text-[var(--muted)] tabular-nums">{formatBytes(n.tx_bytes)} total</p>
                </div>
              </div>
            ))}
            {!data.net_ifaces?.length && <p className="m-0 text-sm text-[var(--muted)]">No interfaces reported.</p>}
          </div>
        </Card>
        <Card title="Routing" icon={Route}>
          <KeyValue
            items={[
              ["Gateway", data.net?.gateway || data.host?.gateway || "—"],
              ["DNS", (data.net?.dns ?? data.host?.dns ?? []).join(", ") || "—"],
              ["Listening ports", data.net?.listen_ports?.length ?? 0],
              ["Established", counts.ESTAB],
            ]}
          />
        </Card>
      </div>

      <Card title="Connections" icon={Waypoints} flush>
        <div className="flex flex-wrap items-center gap-2 px-4 pb-3">
          <FilterChips
            active={stateFilter}
            onChange={setStateFilter}
            options={[
              { id: "all", label: "All", count: connections.length },
              { id: "ESTAB", label: "Established", count: counts.ESTAB },
              { id: "LISTEN", label: "Listening", count: counts.LISTEN },
              { id: "TIME-WAIT", label: "Time wait", count: counts["TIME-WAIT"] },
              { id: "other", label: "Other", count: counts.other },
            ]}
          />
          <SearchField value={query} onChange={setQuery} placeholder="Filter by address or process" />
        </div>
        {rows.length ? (
          <div className="mon-scroll max-h-[340px] overflow-auto border-t border-[var(--line)]">
            <table className="mon-table">
              <thead>
                <tr>
                  <th>State</th>
                  <th>Local</th>
                  <th>Remote</th>
                  <th>Process</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 150).map((c, i) => (
                  <tr key={`${c.local}-${c.remote}-${i}`}>
                    <td className="text-[var(--muted)]">{c.state}</td>
                    <td className="font-mono">{c.local}</td>
                    <td className="font-mono">{c.remote}</td>
                    <td>{c.process || <span className="text-[var(--muted)]">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon={Waypoints} title="No matching connections" />
        )}
      </Card>
    </div>
  );
}
