import {
  Activity,
  Cpu,
  HardDrive,
  LayoutGrid,
  ListTree,
  MemoryStick,
  Network,
  Pause,
  Play,
  Plug,
  Server,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { ListeningPort, PortsResponse, ProcessRow, ServicesResponse, Snapshot } from "../../api/types";
import { useDesktop } from "../../desktop/desktop-context";
import { useLiveSnapshot } from "../../state/live-snapshot";
import { useSession } from "../../state/session";
import { useToast } from "../../state/toast";
import { Sparkline } from "../monitor/Sparkline";
import { TONE_COLOR, toneForVerdict } from "../monitor/tone";
import { Badge, Button, Dot, Skeleton } from "../monitor/ui";
import { ConfirmDialog } from "./ConfirmDialog";
import { formatRate } from "./format";
import { appendSnapshot, emptyHistory, rootMount, type MonitorHistory, type MonitorTab } from "./monitor-types";
import { subscribePerfTab, takePendingTab } from "./nav";
import { CpuTab } from "./tabs/CpuTab";
import { DiskTab } from "./tabs/DiskTab";
import { MemoryTab } from "./tabs/MemoryTab";
import { NetworkTab } from "./tabs/NetworkTab";
import { OverviewTab } from "./tabs/OverviewTab";
import { PortsTab } from "./tabs/PortsTab";
import { ProcessesTab } from "./tabs/ProcessesTab";
import { attachServiceMetrics } from "./service-metrics";
import { ServicesTab } from "./tabs/ServicesTab";

type PendingConfirm = {
  title: string;
  message: string;
  detail?: string;
  danger?: boolean;
  confirmLabel: string;
  run: (sudo: string | null) => Promise<void>;
};

type NavItem = {
  id: MonitorTab;
  label: string;
  icon: LucideIcon;
  value?: string;
  spark?: number[];
  sparkMax?: number;
  color?: string;
  badge?: number;
};

const SECTION_TITLES: Record<MonitorTab, string> = {
  overview: "Overview",
  cpu: "CPU",
  memory: "Memory",
  disk: "Disk",
  network: "Network",
  processes: "Processes",
  services: "Services",
  ports: "Ports",
};

export function PerformanceWindow() {
  const { api } = useSession();
  const live = useLiveSnapshot();
  const { isOpen } = useDesktop();
  const toast = useToast();
  const [tab, setTab] = useState<MonitorTab>(() => takePendingTab() ?? "overview");
  const [services, setServices] = useState<ServicesResponse | null>(null);
  const [ports, setPorts] = useState<PortsResponse | null>(null);
  const [portsLoading, setPortsLoading] = useState(false);
  const [confirm, setConfirm] = useState<PendingConfirm | null>(null);
  const [paused, setPaused] = useState<{ snapshot: Snapshot; history: MonitorHistory } | null>(null);
  const historyRef = useRef<MonitorHistory>(emptyHistory());
  const seenRef = useRef<Snapshot | null>(null);
  const updatedAtRef = useRef(0);

  if (live && seenRef.current !== live) {
    seenRef.current = live;
    historyRef.current = appendSnapshot(historyRef.current, live);
    updatedAtRef.current = Date.now();
  }

  const data = paused?.snapshot ?? live;
  const history = paused?.history ?? historyRef.current;
  const servicesView = useMemo(
    () => attachServiceMetrics(services, data?.processes || []),
    [services, data],
  );

  const loadServices = useCallback(async () => {
    if (!api) return;
    setServices(await api.services());
  }, [api]);

  const loadPorts = useCallback(async () => {
    if (!api) return;
    setPortsLoading(true);
    try {
      setPorts(await api.ports());
    } finally {
      setPortsLoading(false);
    }
  }, [api]);

  useEffect(() => subscribePerfTab(setTab), []);

  useEffect(() => {
    if (!api || !isOpen("perf")) return;
    void loadServices().catch(() => {});
    void loadPorts().catch(() => {});
  }, [api, isOpen, loadServices, loadPorts]);

  useEffect(() => {
    if (!api || !isOpen("perf") || tab !== "services" || paused) return;
    const id = setInterval(() => {
      if (!document.hidden) void loadServices().catch(() => {});
    }, 5000);
    return () => clearInterval(id);
  }, [api, isOpen, tab, paused, loadServices]);

  useEffect(() => {
    if (!api || !isOpen("perf") || tab !== "ports") return;
    void loadPorts().catch((err: unknown) => toast(err instanceof Error ? err.message : "Could not list ports"));
  }, [api, isOpen, tab, loadPorts, toast]);

  const onProcessSignal = useCallback(
    (proc: ProcessRow, signal: "TERM" | "KILL") => {
      if (!api) return;
      setConfirm({
        title: signal === "KILL" ? `Force quit PID ${proc.pid}?` : `Quit PID ${proc.pid}?`,
        message:
          signal === "KILL"
            ? "The process is stopped immediately (SIGKILL). Unsaved work in it is lost."
            : "Asks the process to shut down cleanly (SIGTERM).",
        detail: proc.command,
        danger: signal === "KILL",
        confirmLabel: signal === "KILL" ? "Force quit" : "Quit",
        run: async (sudo) => {
          await api.signalProcess(proc.pid, signal, sudo);
          toast(`${signal === "KILL" ? "Force quit" : "Quit"} sent to ${proc.pid}`);
        },
      });
    },
    [api, toast],
  );

  const onServiceAction = useCallback(
    (unit: string, action: "start" | "stop" | "restart") => {
      if (!api) return;
      const verb = action[0].toUpperCase() + action.slice(1);
      setConfirm({
        title: `${verb} ${unit.replace(/\.service$/, "")}?`,
        message: `Runs systemctl ${action} on the server.`,
        detail: `systemctl ${action} ${unit}`,
        danger: action === "stop",
        confirmLabel: verb,
        run: async (sudo) => {
          await api.unitAction(unit, action, sudo);
          toast(`${unit} — ${action} requested`);
          await loadServices();
        },
      });
    },
    [api, loadServices, toast],
  );

  const onPortKill = useCallback(
    (port: ListeningPort, signal: "TERM" | "KILL") => {
      if (!api) return;
      const isSsh = port.port === (ports?.ssh_port ?? 22) && port.proto === "tcp";
      const owner = port.pids.map((p) => `${p.name} (${p.pid})`).join(", ") || "unknown process";
      setConfirm({
        title: isSsh ? `Stop your SSH server on :${port.port}?` : `Free port ${port.port}?`,
        message: isSsh
          ? "This port carries your current connection. Stopping it will likely disconnect you and may lock you out."
          : `Sends ${signal === "KILL" ? "SIGKILL" : "SIGTERM"} to ${owner} listening on ${port.proto.toUpperCase()} ${port.port}.`,
        danger: true,
        confirmLabel: isSsh ? "Stop anyway" : signal === "KILL" ? "Force free" : "Free port",
        run: async (sudo) => {
          await api.killPort({ port: port.port, proto: port.proto as "tcp" | "udp", signal, force: isSsh, sudo_password: sudo });
          toast(`Port ${port.port} freed`);
          await loadPorts();
        },
      });
    },
    [api, loadPorts, ports?.ssh_port, toast],
  );

  if (!data) return <LoadingState />;

  const root = rootMount(data);
  const failed = services?.counts.failed ?? 0;
  const nav: NavItem[] = [
    { id: "overview", label: "Overview", icon: LayoutGrid },
    { id: "cpu", label: "CPU", icon: Cpu, value: `${Math.round(data.cpu.cpu_pct)}%`, spark: history.cpu, sparkMax: 100, color: "var(--accent)" },
    { id: "memory", label: "Memory", icon: MemoryStick, value: `${Math.round(data.memory.used_pct)}%`, spark: history.ram, sparkMax: 100, color: "var(--blue)" },
    { id: "disk", label: "Disk", icon: HardDrive, value: root ? `${root.used_pct}%` : "—", spark: history.diskWrite, color: "var(--ok)" },
    {
      id: "network",
      label: "Network",
      icon: Network,
      value: formatRate((history.netRx.at(-1) ?? 0) + (history.netTx.at(-1) ?? 0)),
      spark: history.netRx.map((rx, i) => rx + (history.netTx[i] ?? 0)),
      color: "var(--warn)",
    },
    { id: "processes", label: "Processes", icon: ListTree, value: String(data.process_counts?.total ?? data.processes.length) },
    { id: "services", label: "Services", icon: Server, value: services ? String(services.counts.running) : "—", badge: failed || undefined },
    { id: "ports", label: "Ports", icon: Plug, value: String(ports?.listeners.length ?? data.net?.listen_ports?.length ?? 0) },
  ];

  const verdictTone = toneForVerdict(data.verdict);

  return (
    <div className="mon-root flex text-[var(--text)]" style={{ "--mon-glow": TONE_COLOR[verdictTone] } as CSSProperties}>
      <nav className="mon-sidebar mon-scroll flex w-[196px] shrink-0 flex-col overflow-y-auto px-2.5 py-3 @max-[620px]:w-[54px] @max-[620px]:px-1.5" aria-label="Monitor sections">
        <div className="mb-3 flex items-center gap-2.5 px-2 @max-[620px]:justify-center @max-[620px]:px-0">
          <span
            className="grid h-8 w-8 shrink-0 place-items-center rounded-xl"
            style={{ background: `color-mix(in srgb, ${TONE_COLOR[verdictTone]} 18%, transparent)`, color: TONE_COLOR[verdictTone] }}
          >
            <Activity className="h-4 w-4" />
          </span>
          <div className="min-w-0 @max-[620px]:hidden">
            <p className="m-0 truncate text-[13px] font-semibold tracking-[-0.01em]">{data.host?.hostname || "Server"}</p>
            <p className="m-0 truncate text-[11px] text-[var(--muted)]">{data.host?.os_name || "Linux"}</p>
          </div>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-0.5">
        {nav.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-current={tab === item.id ? "page" : undefined}
            title={item.label}
            onClick={() => setTab(item.id)}
            className="mon-nav-item mon-focus @max-[620px]:justify-center @max-[620px]:px-0"
          >
            <item.icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
            <span className="min-w-0 flex-1 @max-[620px]:hidden">
              <span className="flex items-center justify-between gap-2">
                <span className="truncate text-[13px] font-medium">{item.label}</span>
                {item.badge ? (
                  <Badge tone="bad">{item.badge}</Badge>
                ) : (
                  item.value && <span className="text-[11px] tabular-nums text-[var(--muted)]">{item.value}</span>
                )}
              </span>
              {item.spark && item.spark.length > 1 && (
                <span className="mt-1 block opacity-80">
                  <Sparkline values={item.spark} max={item.sparkMax} color={item.color} width={140} height={14} />
                </span>
              )}
            </span>
          </button>
        ))}
        </div>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-[var(--line)] px-5 py-3">
          <h2 className="m-0 mr-auto text-[17px] font-semibold tracking-[-0.02em]">{SECTION_TITLES[tab]}</h2>
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
            style={{ color: TONE_COLOR[verdictTone], background: `color-mix(in srgb, ${TONE_COLOR[verdictTone]} 13%, transparent)` }}
          >
            <Dot tone={verdictTone} />
            {data.verdict}
          </span>
          <LiveIndicator paused={paused != null} updatedAt={updatedAtRef.current} />
          <Button
            size="sm"
            variant={paused ? "primary" : "secondary"}
            icon={paused ? Play : Pause}
            onClick={() => setPaused(paused ? null : { snapshot: data, history })}
          >
            {paused ? "Resume" : "Pause"}
          </Button>
        </header>

        <main key={tab} className="mon-scroll mon-enter min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {tab === "overview" && <OverviewTab data={data} history={history} onNavigate={setTab} />}
          {tab === "cpu" && <CpuTab data={data} history={history} />}
          {tab === "memory" && <MemoryTab data={data} history={history} />}
          {tab === "disk" && <DiskTab data={data} history={history} />}
          {tab === "network" && <NetworkTab data={data} history={history} />}
          {tab === "processes" && <ProcessesTab data={data} onSignal={onProcessSignal} />}
          {tab === "services" && <ServicesTab data={servicesView} onAction={onServiceAction} />}
          {tab === "ports" && (
            <PortsTab data={ports} loading={portsLoading} onKill={onPortKill} onRefresh={() => void loadPorts().catch(() => toast("Could not list ports"))} />
          )}
        </main>
      </div>

      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          message={confirm.message}
          detail={confirm.detail}
          danger={confirm.danger}
          confirmLabel={confirm.confirmLabel}
          onCancel={() => setConfirm(null)}
          onConfirm={async (sudo) => {
            await confirm.run(sudo);
            setConfirm(null);
          }}
        />
      )}
    </div>
  );
}

function LiveIndicator({ paused, updatedAt }: { paused: boolean; updatedAt: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const age = Math.max(0, Math.round((now - updatedAt) / 1000));
  const stale = age > 8;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-[var(--muted)]">
      <Dot tone={paused ? "neutral" : stale ? "warn" : "ok"} pulse={!paused && !stale} />
      {paused ? "Paused" : age <= 2 ? "Live" : `${age}s ago`}
    </span>
  );
}

function LoadingState() {
  return (
    <div className="mon-root flex">
      <div className="mon-sidebar w-[196px] shrink-0 space-y-2 p-3 @max-[620px]:w-[54px]">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-9" />
        ))}
      </div>
      <div className="flex-1 space-y-4 p-5">
        <Skeleton className="h-6 w-40" />
        <div className="grid grid-cols-4 gap-3">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-48" />
      </div>
    </div>
  );
}
