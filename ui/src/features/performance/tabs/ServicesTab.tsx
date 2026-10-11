import { Play, RotateCw, SearchX, Server, Square } from "lucide-react";
import { useMemo, useState } from "react";
import type { ServicesResponse, ServiceUnit } from "../../../api/types";
import type { Tone } from "../../monitor/tone";
import { Card, Dot, EmptyState, FilterChips, IconButton, SearchField, Skeleton } from "../../monitor/ui";
import { formatBytes } from "../format";

type StateFilter = "all" | "running" | "failed" | "stopped";

function unitTone(s: ServiceUnit): Tone {
  if (s.state === "failed") return "bad";
  if (s.state === "active" && s.sub_state === "running") return "ok";
  if (s.state === "active") return "accent";
  return "neutral";
}

function matches(s: ServiceUnit, filter: StateFilter) {
  if (filter === "running") return s.state === "active" && s.sub_state === "running";
  if (filter === "failed") return s.state === "failed";
  if (filter === "stopped") return s.state === "inactive";
  return true;
}

const ORDER: Record<Tone, number> = { bad: 0, ok: 1, accent: 2, warn: 3, neutral: 4 };

export function ServicesTab({
  data,
  onAction,
}: {
  data: ServicesResponse | null;
  onAction: (unit: string, action: "start" | "stop" | "restart") => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<StateFilter>("all");

  const rows = useMemo(() => {
    const q = query.toLowerCase();
    return (data?.services ?? [])
      .filter((s) => matches(s, filter))
      .filter((s) => !q || s.name.toLowerCase().includes(q) || (s.description ?? "").toLowerCase().includes(q))
      .sort((a, b) => ORDER[unitTone(a)] - ORDER[unitTone(b)] || a.name.localeCompare(b.name));
  }, [data, filter, query]);

  if (!data) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-12" />
        ))}
      </div>
    );
  }

  const counts = data.counts;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <FilterChips
          active={filter}
          onChange={setFilter}
          options={[
            { id: "all", label: "All", count: data.services.length },
            { id: "running", label: "Running", count: counts.running, tone: "ok" },
            { id: "failed", label: "Failed", count: counts.failed, tone: "bad" },
            { id: "stopped", label: "Stopped", count: counts.stopped, tone: "neutral" },
          ]}
        />
        <SearchField value={query} onChange={setQuery} placeholder="Search services" />
      </div>

      <Card flush>
        {rows.length ? (
          <ul className="m-0 list-none divide-y divide-[var(--line)] p-0">
            {rows.map((s) => {
              const tone = unitTone(s);
              const isActive = s.state === "active";
              return (
                <li key={s.name} className="group flex items-center gap-3 px-4 py-2.5 transition hover:bg-[var(--hover)]">
                  <Dot tone={tone} />
                  <div className="min-w-0 flex-1">
                    <p className="m-0 truncate text-[13px] font-medium">{s.name.replace(/\.service$/, "")}</p>
                    <p className="m-0 truncate text-[11px] text-[var(--muted)]">{s.description || s.name}</p>
                  </div>
                  <span className="hidden w-24 text-right text-[11px] text-[var(--muted)] @xl:block">
                    {s.state === "failed" ? <span className="text-[var(--danger)]">failed</span> : `${s.state} · ${s.sub_state}`}
                  </span>
                  <span className="hidden w-20 text-right text-xs tabular-nums text-[var(--muted)] @2xl:block">
                    {s.memory_bytes ? formatBytes(s.memory_bytes) : ""}
                  </span>
                  <span className="flex w-[64px] justify-end opacity-60 transition group-hover:opacity-100">
                    {isActive ? (
                      <>
                        <IconButton icon={RotateCw} label={`Restart ${s.name}`} onClick={() => onAction(s.name, "restart")} />
                        <IconButton icon={Square} label={`Stop ${s.name}`} tone="bad" onClick={() => onAction(s.name, "stop")} />
                      </>
                    ) : (
                      <IconButton icon={Play} label={`Start ${s.name}`} tone="ok" onClick={() => onAction(s.name, "start")} />
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState icon={data.services.length ? SearchX : Server} title={data.services.length ? "No matching services" : "No systemd services found"} />
        )}
      </Card>
    </div>
  );
}
