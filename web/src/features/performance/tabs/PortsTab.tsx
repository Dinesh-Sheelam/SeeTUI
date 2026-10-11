import { Globe, Lock, OctagonX, Plug, Power, RefreshCw, SearchX, ShieldCheck, Zap } from "lucide-react";
import { useMemo, useState } from "react";
import type { ListeningPort, PortsResponse } from "../../../api/types";
import { Badge, Button, Card, EmptyState, IconButton, SearchField, Skeleton } from "../../monitor/ui";

const PUBLIC_HOSTS = new Set(["0.0.0.0", "*", "::", "", "[::]"]);

function isPublic(p: ListeningPort) {
  return PUBLIC_HOSTS.has(p.host);
}

export function PortsTab({
  data,
  loading,
  onKill,
  onRefresh,
}: {
  data: PortsResponse | null;
  loading: boolean;
  onKill: (port: ListeningPort, signal: "TERM" | "KILL") => void;
  onRefresh: () => void;
}) {
  const [query, setQuery] = useState("");
  const [target, setTarget] = useState("");
  const [lookupMiss, setLookupMiss] = useState<string | null>(null);
  const sshPort = data?.ssh_port ?? 22;

  const listeners = useMemo(() => {
    const list = [...(data?.listeners ?? [])].sort((a, b) => a.port - b.port);
    if (!query) return list;
    const q = query.toLowerCase();
    return list.filter((p) => String(p.port).includes(q) || p.address.toLowerCase().includes(q) || p.pids.some((x) => x.name.toLowerCase().includes(q) || String(x.pid).includes(q)));
  }, [data, query]);

  const groups = [
    { id: "public", title: "Open to the network", hint: "Bound to all interfaces", icon: Globe, rows: listeners.filter(isPublic) },
    { id: "local", title: "Local only", hint: "Bound to a specific address", icon: ShieldCheck, rows: listeners.filter((p) => !isPublic(p)) },
  ].filter((g) => g.rows.length);

  function freePort() {
    const port = Number(target);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      setLookupMiss("Enter a port between 1 and 65535");
      return;
    }
    const match = (data?.listeners ?? []).find((p) => p.port === port && p.pids.length) ?? (data?.listeners ?? []).find((p) => p.port === port);
    if (!match) {
      setLookupMiss(`Nothing is listening on port ${port}`);
      return;
    }
    setLookupMiss(null);
    onKill(match, "TERM");
  }

  const hiddenOwners = (data?.listeners ?? []).some((p) => !p.pids.length);

  return (
    <div className="space-y-4">
      <Card>
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            freePort();
          }}
        >
          <div className="min-w-[200px] flex-1">
            <p className="m-0 flex items-center gap-2 text-[13px] font-semibold">
              <Zap className="h-4 w-4 text-[var(--accent)]" /> Free up a port
            </p>
            <p className="m-0 mt-0.5 text-xs text-[var(--muted)]">Stops whatever is listening on it, e.g. a stuck dev server on 3000.</p>
          </div>
          <input
            className="mon-input !w-28 font-mono"
            inputMode="numeric"
            placeholder="3000"
            value={target}
            onChange={(e) => {
              setTarget(e.target.value.replace(/\D/g, "").slice(0, 5));
              setLookupMiss(null);
            }}
            aria-label="Port number"
          />
          <Button type="submit" variant="primary" icon={Power} disabled={!target || !data}>
            Free port
          </Button>
        </form>
        {lookupMiss && <p className="m-0 mt-2 text-xs text-[var(--warn)]">{lookupMiss}</p>}
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <SearchField value={query} onChange={setQuery} placeholder="Filter by port, process or PID" />
        <Button size="sm" icon={RefreshCw} busy={loading} onClick={onRefresh}>
          Refresh
        </Button>
      </div>

      {!data ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      ) : groups.length ? (
        groups.map((group) => (
          <Card key={group.id} flush title={group.title} icon={group.icon} actions={<span className="text-[11px] text-[var(--muted)]">{group.hint}</span>}>
            <ul className="m-0 list-none divide-y divide-[var(--line)] border-t border-[var(--line)] p-0">
              {group.rows.map((p) => {
                const isSsh = p.port === sshPort && p.proto === "tcp";
                const owner = p.pids[0];
                return (
                  <li key={`${p.proto}-${p.address}`} className="group flex items-center gap-4 px-4 py-2.5 transition hover:bg-[var(--hover)]">
                    <span className="w-16 font-mono text-lg font-semibold tabular-nums tracking-[-0.02em]">{p.port}</span>
                    <Badge tone={p.proto === "tcp" ? "accent" : "neutral"}>{p.proto.toUpperCase()}</Badge>
                    <div className="min-w-0 flex-1">
                      <p className="m-0 flex items-center gap-2 truncate text-[13px] font-medium">
                        {owner ? owner.name : <span className="text-[var(--muted)]">Unknown process</span>}
                        {owner && <span className="text-xs font-normal text-[var(--muted)]">PID {owner.pid}</span>}
                        {p.pids.length > 1 && <span className="text-xs font-normal text-[var(--muted)]">+{p.pids.length - 1} more</span>}
                        {isSsh && (
                          <Badge tone="warn">
                            <Lock className="h-3 w-3" /> Your SSH session
                          </Badge>
                        )}
                      </p>
                      <p className="m-0 truncate font-mono text-[11px] text-[var(--muted)]">{p.address}</p>
                    </div>
                    <span className="flex opacity-60 transition group-hover:opacity-100">
                      <IconButton icon={Power} label={`Free port ${p.port} (SIGTERM)`} disabled={!owner} onClick={() => onKill(p, "TERM")} />
                      <IconButton icon={OctagonX} label={`Force free port ${p.port} (SIGKILL)`} tone="bad" disabled={!owner} onClick={() => onKill(p, "KILL")} />
                    </span>
                  </li>
                );
              })}
            </ul>
          </Card>
        ))
      ) : (
        <Card>
          <EmptyState icon={data.listeners.length ? SearchX : Plug} title={data.listeners.length ? "No matching ports" : "No listening ports"} />
        </Card>
      )}

      {hiddenOwners && (
        <p className="m-0 text-[11px] text-[var(--muted)]">
          Some owners are hidden because the SSH user can't see other users' processes. Passwordless sudo on the server reveals them.
        </p>
      )}
    </div>
  );
}
