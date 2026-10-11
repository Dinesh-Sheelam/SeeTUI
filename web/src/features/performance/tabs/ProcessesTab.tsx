import { OctagonX, Power, SearchX, X } from "lucide-react";
import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { ProcessRow, Snapshot } from "../../../api/types";
import { TONE_COLOR, toneForPct } from "../../monitor/tone";
import { Button, Card, EmptyState, IconButton, KeyValue, SearchField, SortHeader } from "../../monitor/ui";
import { formatBytes, formatDuration } from "../format";

type SortKey = "name" | "pid" | "user" | "cpu" | "mem" | "threads" | "elapsed";

function processName(p: ProcessRow) {
  return p.command.split(/\s+/)[0].split("/").pop() || p.command;
}

const SORTERS: Record<SortKey, (p: ProcessRow) => number | string> = {
  name: (p) => processName(p).toLowerCase(),
  pid: (p) => p.pid,
  user: (p) => p.user ?? "",
  cpu: (p) => p.cpu,
  mem: (p) => p.mem,
  threads: (p) => p.threads ?? 0,
  elapsed: (p) => p.elapsed_seconds ?? 0,
};

export function ProcessesTab({
  data,
  onSignal,
}: {
  data: Snapshot;
  onSignal: (proc: ProcessRow, signal: "TERM" | "KILL") => void;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "cpu", dir: "desc" });
  const [selected, setSelected] = useState<ProcessRow | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  const rows = useMemo(() => {
    const q = query.toLowerCase();
    const filtered = data.processes.filter(
      (p) => !q || p.command.toLowerCase().includes(q) || String(p.pid).includes(q) || (p.user ?? "").toLowerCase().includes(q),
    );
    const pick = SORTERS[sort.key];
    return filtered.sort((a, b) => {
      const av = pick(a);
      const bv = pick(b);
      const cmp = typeof av === "string" ? av.localeCompare(String(bv)) : av - (bv as number);
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [data.processes, query, sort]);

  const live = selected ? data.processes.find((p) => p.pid === selected.pid) : undefined;
  const current = live ?? selected;

  function onSort(key: SortKey) {
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "name" || key === "user" ? "asc" : "desc" }));
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (!rows.length) return;
    const index = current ? rows.findIndex((p) => p.pid === current.pid) : -1;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = rows[Math.min(Math.max(index + (e.key === "ArrowDown" ? 1 : -1), 0), rows.length - 1)];
      setSelected(next);
      tableRef.current?.querySelector(`[data-pid="${next.pid}"]`)?.scrollIntoView({ block: "nearest" });
    } else if ((e.key === "Delete" || e.key === "Backspace") && current) {
      e.preventDefault();
      onSignal(current, e.shiftKey ? "KILL" : "TERM");
    } else if (e.key === "Escape") {
      setSelected(null);
    }
  }

  const counts = data.process_counts;

  return (
    <div className="flex h-full min-h-[420px] flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <SearchField value={query} onChange={setQuery} placeholder="Search by name, PID or user" />
        <p className="m-0 text-xs text-[var(--muted)]">
          {counts ? `${counts.total} processes · ${counts.running} running · showing top ${data.processes.length} by CPU` : `${data.processes.length} processes`}
        </p>
      </div>

      <Card flush className="flex min-h-0 flex-1 flex-col">
        {rows.length ? (
          <div
            ref={tableRef}
            tabIndex={0}
            onKeyDown={onKeyDown}
            className="mon-scroll mon-focus min-h-0 flex-1 overflow-auto rounded-[14px] outline-none"
            aria-label="Processes. Use arrow keys to select, Delete to quit."
          >
            <table className="mon-table">
              <thead>
                <tr>
                  <SortHeader label="Name" sortKey="name" current={sort.key} direction={sort.dir} onSort={onSort} />
                  <SortHeader label="PID" sortKey="pid" current={sort.key} direction={sort.dir} onSort={onSort} align="right" />
                  <SortHeader label="User" sortKey="user" current={sort.key} direction={sort.dir} onSort={onSort} />
                  <SortHeader label="CPU" sortKey="cpu" current={sort.key} direction={sort.dir} onSort={onSort} align="right" />
                  <SortHeader label="Memory" sortKey="mem" current={sort.key} direction={sort.dir} onSort={onSort} align="right" />
                  <SortHeader label="Threads" sortKey="threads" current={sort.key} direction={sort.dir} onSort={onSort} align="right" />
                  <SortHeader label="Running" sortKey="elapsed" current={sort.key} direction={sort.dir} onSort={onSort} align="right" />
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const isSelected = current?.pid === p.pid;
                  return (
                    <tr
                      key={p.pid}
                      data-pid={p.pid}
                      aria-selected={isSelected}
                      onClick={() => setSelected(isSelected ? null : p)}
                      onDoubleClick={() => onSignal(p, "TERM")}
                      className="group cursor-default"
                    >
                      <td className="max-w-[260px]">
                        <div className="truncate" title={p.command}>
                          <span className="font-medium">{processName(p)}</span>
                          <span className="ml-2 text-[var(--muted)]">{p.command.split(/\s+/).slice(1).join(" ")}</span>
                        </div>
                      </td>
                      <td className="text-right font-mono tabular-nums text-[var(--muted)]">{p.pid}</td>
                      <td className="text-[var(--muted)]">{p.user || "—"}</td>
                      <td className="text-right tabular-nums">
                        <span style={{ color: p.cpu >= 50 ? TONE_COLOR[toneForPct(p.cpu, 50, 85)] : undefined }}>{p.cpu.toFixed(1)}</span>
                      </td>
                      <td className="text-right tabular-nums">{p.rss ? formatBytes(p.rss * 1024) : `${p.mem.toFixed(1)}%`}</td>
                      <td className="text-right tabular-nums text-[var(--muted)]">{p.threads ?? "—"}</td>
                      <td className="text-right tabular-nums text-[var(--muted)]">{p.elapsed_seconds != null ? formatDuration(p.elapsed_seconds) : "—"}</td>
                      <td className="w-[64px] !py-0 text-right">
                        <span className={`inline-flex ${isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
                          <IconButton icon={Power} label="Quit (SIGTERM)" onClick={() => onSignal(p, "TERM")} />
                          <IconButton icon={OctagonX} label="Force quit (SIGKILL)" tone="bad" onClick={() => onSignal(p, "KILL")} />
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon={SearchX} title="No matching processes" hint="Only the busiest processes are sampled. Try a different search." />
        )}
      </Card>

      {current && (
        <Card className="mon-enter">
          <div className="flex flex-wrap items-start gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h3 className="m-0 text-[15px] font-semibold">{processName(current)}</h3>
                <span className="text-xs text-[var(--muted)]">PID {current.pid}</span>
                {!live && <span className="text-xs text-[var(--warn)]">· no longer in the top list</span>}
              </div>
              <code className="mt-1.5 block max-h-14 overflow-auto break-all rounded-md bg-[var(--code-bg)] px-2 py-1.5 font-mono text-[11px] text-[var(--code-text)]">
                {current.command}
              </code>
            </div>
            <div className="flex items-center gap-2">
              <Button icon={Power} onClick={() => onSignal(current, "TERM")}>Quit</Button>
              <Button icon={OctagonX} variant="danger" onClick={() => onSignal(current, "KILL")}>Force quit</Button>
              <IconButton icon={X} label="Close inspector" onClick={() => setSelected(null)} />
            </div>
          </div>
          <div className="mt-3 grid gap-x-8 @xl:grid-cols-2">
            <KeyValue
              items={[
                ["User", current.user],
                ["Parent PID", current.ppid],
                ["State", current.stat],
              ]}
            />
            <KeyValue
              items={[
                ["CPU", `${current.cpu.toFixed(1)}%`],
                ["Memory", current.rss ? `${formatBytes(current.rss * 1024)} (${current.mem.toFixed(1)}%)` : `${current.mem.toFixed(1)}%`],
                ["Running for", current.elapsed_seconds != null ? formatDuration(current.elapsed_seconds) : "—"],
              ]}
            />
          </div>
          <p className="m-0 mt-3 text-[11px] text-[var(--muted)]">
            Tip: ↑/↓ to move · Delete to quit · Shift+Delete to force quit · Esc to close
          </p>
        </Card>
      )}
    </div>
  );
}
