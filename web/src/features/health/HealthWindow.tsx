import { useEffect, useMemo, useState, type CSSProperties, type KeyboardEvent } from "react";
import { RefreshCw } from "lucide-react";
import { readNdjson } from "../../api/client";
import type { CheckStatus, HealthCheck, HealthFix } from "../../api/types";
import { useDesktop } from "../../desktop/desktop-context";
import { useHealthReport } from "../../state/health-report";
import { useLiveSnapshot } from "../../state/live-snapshot";
import { useSession } from "../../state/session";
import { useToast } from "../../state/toast";
import { TONE_COLOR, toneForPct } from "../monitor/tone";
import { Button, Dot, FilterChips, Skeleton, Toggle } from "../monitor/ui";
import { formatUptime } from "../performance/format";
import { requestPerfTab } from "../performance/nav";
import { rootMount, type MonitorTab } from "../performance/monitor-types";
import { CheckDetail, statusRank } from "./CheckDetail";
import { checkIcon, STATUS_META } from "./check-meta";
import { FixSheet } from "./FixSheet";
import { withLiveMetrics } from "./live-metrics";

type Filter = "all" | CheckStatus;

type Preview = {
  id: string;
  title: string;
  body: string;
  risk: string;
  commands: string[];
  inputs: Record<string, string>;
  inputKeys: string[];
};

export function HealthWindow({ onAlert, onBadge }: { onAlert: (text: string) => void; onBadge: (n: number) => void }) {
  const { api, meta } = useSession();
  const { openApp } = useDesktop();
  const toast = useToast();
  const { report, reload } = useHealthReport();
  const live = useLiveSnapshot();
  const [watch, setWatch] = useState(false);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);

  const shown = useMemo(() => (report ? withLiveMetrics(report, live) : null), [report, live]);
  const checks = shown?.checks ?? [];
  const sorted = useMemo(() => [...checks].sort((a, b) => statusRank(a.status) - statusRank(b.status) || a.title.localeCompare(b.title)), [checks]);
  const visible = filter === "all" ? sorted : sorted.filter((c) => c.status === filter);
  const selected = visible.find((c) => c.id === selectedId) ?? visible[0] ?? null;

  useEffect(() => {
    void reload().catch((err: unknown) => toast(err instanceof Error ? err.message : "Health failed"));
  }, [reload, toast]);

  useEffect(() => {
    if (!shown) return;
    onBadge(shown.critical || shown.warning || 0);
    const hot = shown.checks.filter((c) =>
      (c.id === "certificates" && ((c.facts?.certs as { days_remaining?: number }[]) || []).some((x) => (x.days_remaining ?? 99) < 21))
      || (c.id === "monitoring" && ((c.facts?.mounts as { used_pct: number }[]) || []).some((m) => m.used_pct >= 90))
      || (c.id === "firewall" && c.status === "problem"),
    );
    onAlert(hot.map((c) => c.summary).join(" · "));
  }, [shown, onAlert, onBadge]);

  useEffect(() => {
    if (!watch) return;
    const id = setInterval(() => void reload(true).catch(() => {}), 120000);
    return () => clearInterval(id);
  }, [watch, reload]);

  useEffect(() => {
    if (!visible.length) return;
    if (!selectedId || !visible.some((c) => c.id === selectedId)) setSelectedId(visible[0].id);
  }, [visible, selectedId]);

  async function recheck() {
    setBusy(true);
    try {
      await reload(true);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Health failed");
    } finally {
      setBusy(false);
    }
  }

  function openMonitor(tab: MonitorTab = "overview") {
    requestPerfTab(tab);
    openApp("perf");
  }

  async function startFix(fix: HealthFix, check: HealthCheck) {
    if (fix.id === "add_owner_note") {
      openApp("info");
      return;
    }
    if (!api) return;
    const inputKeys = fix.inputs || [];
    const inputs: Record<string, string> = {};
    try {
      const data = inputKeys.length
        ? { title: fix.label, description: check.summary, risk: "", commands: [] as string[] }
        : await api.previewFix(fix.id, inputs);
      if (!inputKeys.length) {
        setPreview({
          id: fix.id,
          title: data.title,
          body: data.description,
          risk: data.risk,
          commands: data.commands,
          inputs,
          inputKeys,
        });
        return;
      }
      setPreview({
        id: fix.id,
        title: fix.label,
        body: check.summary,
        risk: "",
        commands: [],
        inputs,
        inputKeys,
      });
    } catch (err) {
      toast(err instanceof Error ? err.message : "Preview failed");
    }
  }

  async function runFix(inputs: Record<string, string>, sudo: string | null) {
    if (!preview || !meta || !api) return;
    let commands = preview.commands;
    if (preview.inputKeys.length) {
      const data = await api.previewFix(preview.id, inputs);
      commands = data.commands;
    }
    const res = await fetch(`/api/sessions/${meta.session_id}/health/fixes/${preview.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inputs, sudo_password: sudo, use_ssh_password: !sudo }),
    });
    if (!res.ok) throw new Error(await res.text() || "Fix failed");
    await readNdjson(res, () => {});
    setPreview(null);
    toast("Fix finished — re-checking");
    await reload(true);
    void commands;
  }

  function onListKey(e: KeyboardEvent<HTMLDivElement>) {
    if (!visible.length) return;
    const index = selected ? visible.findIndex((c) => c.id === selected.id) : 0;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = visible[Math.min(Math.max(index + (e.key === "ArrowDown" ? 1 : -1), 0), visible.length - 1)];
      setSelectedId(next.id);
    }
  }

  if (!shown) return <HealthSkeleton />;

  const passing = shown.passing;
  const total = shown.total;
  const overallTone = shown.critical ? "bad" : shown.warning ? "warn" : "ok";
  const root = live ? rootMount(live) : undefined;

  return (
    <div className="mon-root flex text-[var(--text)]" style={{ "--mon-glow": TONE_COLOR[overallTone] } as CSSProperties}>
      <nav className="mon-sidebar mon-scroll flex w-[240px] shrink-0 flex-col @max-[720px]:w-[72px]" aria-label="Health checks">
        <div className="border-b border-[var(--line)] px-3 py-3 @max-[720px]:px-2">
          <div className="flex items-center gap-3 @max-[720px]:justify-center">
            <ScoreMark value={passing} total={total} tone={overallTone} />
            <div className="min-w-0 @max-[720px]:hidden">
              <p className="m-0 text-[13px] font-semibold tracking-[-0.01em]">{passing} of {total} passing</p>
              <p className="m-0 text-[11px] text-[var(--muted)]">
                {shown.critical ? `${shown.critical} critical` : shown.warning ? `${shown.warning} warnings` : "All quiet"}
              </p>
            </div>
          </div>
          <div className="mt-3 @max-[720px]:hidden">
            <FilterChips
              active={filter}
              onChange={setFilter}
              options={[
                { id: "all", label: "All", count: checks.length },
                { id: "problem", label: "Critical", count: shown.critical, tone: "bad" },
                { id: "warning", label: "Warn", count: shown.warning ?? 0, tone: "warn" },
                { id: "ok", label: "OK", count: passing, tone: "ok" },
              ]}
            />
          </div>
        </div>
        <div className="mon-scroll min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2" tabIndex={0} onKeyDown={onListKey} role="listbox" aria-label="Checks">
          {visible.map((check) => (
            <CheckRow key={check.id} check={check} active={selected?.id === check.id} onSelect={() => setSelectedId(check.id)} />
          ))}
        </div>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-[var(--line)] px-5 py-3">
          <div className="mr-auto min-w-0">
            <h2 className="m-0 text-[17px] font-semibold tracking-[-0.02em]">Health</h2>
            <p className="m-0 truncate text-[12px] text-[var(--muted)]">{live?.host?.hostname || meta?.host || "Connected host"}</p>
          </div>
          {live && (
            <div className="flex flex-wrap items-center gap-1.5">
              <VitalChip label="CPU" value={`${Math.round(live.cpu.cpu_pct)}%`} tone={toneForPct(live.cpu.cpu_pct)} onClick={() => openMonitor("cpu")} />
              <VitalChip label="RAM" value={`${Math.round(live.memory.used_pct)}%`} tone={toneForPct(live.memory.used_pct)} onClick={() => openMonitor("memory")} />
              <VitalChip label="Disk" value={root ? `${root.used_pct}%` : "—"} tone={root ? toneForPct(root.used_pct) : "neutral"} onClick={() => openMonitor("disk")} />
              <VitalChip label="Up" value={formatUptime(live.host?.uptime_seconds ?? 0)} onClick={() => openMonitor("overview")} />
            </div>
          )}
          <Toggle checked={watch} onChange={setWatch} label="Watch" />
          <Button size="sm" variant="primary" icon={RefreshCw} busy={busy} onClick={() => void recheck()}>
            Re-check
          </Button>
        </header>

        <main className="mon-scroll min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {selected ? (
            <CheckDetail
              check={selected}
              onFix={(fix) => void startFix(fix, selected)}
              onOpenMonitor={() => openMonitor(selected.id === "listening_ports" ? "ports" : "overview")}
            />
          ) : (
            <p className="m-0 text-sm text-[var(--muted)]">No checks in this filter.</p>
          )}
        </main>
      </div>

      {preview && (
        <FixSheet
          title={preview.title}
          body={preview.body}
          risk={preview.risk}
          commands={preview.commands}
          inputs={preview.inputs}
          inputKeys={preview.inputKeys}
          onCancel={() => setPreview(null)}
          onRun={runFix}
        />
      )}
    </div>
  );
}

function CheckRow({
  check,
  active,
  onSelect,
}: {
  check: HealthCheck;
  active: boolean;
  onSelect: () => void;
}) {
  const Icon = checkIcon(check.id);
  const meta = STATUS_META[check.status];
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      onClick={onSelect}
      className={`hl-row mon-focus ${active ? "is-active" : ""}`}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--hover)] @max-[720px]:h-7 @max-[720px]:w-7">
        <Icon className="h-4 w-4" strokeWidth={1.75} style={{ color: TONE_COLOR[meta.tone] }} />
      </span>
      <span className="min-w-0 flex-1 text-left @max-[720px]:hidden">
        <span className="flex items-center justify-between gap-2">
          <span className="truncate text-[13px] font-medium">{check.title}</span>
          <Dot tone={meta.tone} />
        </span>
        <span className="mt-0.5 block truncate text-[11px] text-[var(--muted)]">{check.summary}</span>
      </span>
    </button>
  );
}

function VitalChip({
  label,
  value,
  tone,
  onClick,
}: {
  label: string;
  value: string;
  tone?: "ok" | "warn" | "bad" | "neutral" | "accent";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={`Open ${label} in Performance`}
      className="mon-focus hidden items-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--btn-soft)] px-2.5 py-1 text-[11px] sm:inline-flex"
    >
      <span className="text-[var(--muted)]">{label}</span>
      <span className="font-medium tabular-nums" style={tone ? { color: TONE_COLOR[tone] } : undefined}>{value}</span>
    </button>
  );
}

function ScoreMark({ value, total, tone }: { value: number; total: number; tone: "ok" | "warn" | "bad" }) {
  const deg = total ? (value / total) * 360 : 0;
  return (
    <div
      className="grid h-11 w-11 place-items-center rounded-full"
      style={{ background: `conic-gradient(${TONE_COLOR[tone]} ${deg}deg, var(--line) ${deg}deg)` }}
      aria-label={`${value} of ${total} checks passing`}
    >
      <span className="grid h-8 w-8 place-items-center rounded-full bg-[var(--bg2)] text-[11px] font-semibold tabular-nums">
        {value}
      </span>
    </div>
  );
}

function HealthSkeleton() {
  return (
    <div className="mon-root flex">
      <div className="mon-sidebar w-[240px] space-y-2 p-3">
        <Skeleton className="h-14" />
        {Array.from({ length: 7 }, (_, i) => (
          <Skeleton key={i} className="h-12" />
        ))}
      </div>
      <div className="flex-1 space-y-4 p-5">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24" />
        <Skeleton className="h-40" />
      </div>
    </div>
  );
}
