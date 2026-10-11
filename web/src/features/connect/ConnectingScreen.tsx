import { useEffect, useRef, useState } from "react";
import { chmodKey, readNdjson, startConnect } from "../../api/client";
import type { ConnectEvent, SavedServer, SessionMeta } from "../../api/types";
import { missingSecret, serverBody } from "../../state/servers";

const STEP_IDS = ["start", "resolve", "ssh", "auth", "info", "sftp"] as const;
type StepId = (typeof STEP_IDS)[number];
type StepStatus = "pending" | "running" | "ok" | "error";

const LABELS: Record<StepId, (name: string) => string> = {
  start: (name) => `Connecting to ${name}`,
  resolve: () => "Resolving server",
  ssh: () => "Establishing SSH connection",
  auth: () => "Authenticating",
  info: () => "Checking server environment",
  sftp: () => "Loading filesystem",
};

function applyEvent(prev: Record<StepId, StepStatus>, event: ConnectEvent): Record<StepId, StepStatus> {
  const next = { ...prev, start: "ok" as StepStatus };
  if (event.step === "resolve") next.resolve = event.status === "ok" ? "ok" : event.status === "error" ? "error" : "running";
  if (event.step === "tcp" || event.step === "handshake") {
    if (event.status === "error") next.ssh = "error";
    else if (event.step === "handshake" && event.status === "ok") next.ssh = "ok";
    else if (next.ssh !== "ok" && next.ssh !== "error") next.ssh = "running";
  }
  if (event.step === "auth") next.auth = event.status === "ok" ? "ok" : event.status === "error" ? "error" : "running";
  if (event.step === "info") next.info = event.status === "ok" ? "ok" : event.status === "error" ? "error" : "running";
  if (event.step === "sftp") next.sftp = event.status === "ok" ? "ok" : event.status === "error" ? "error" : "running";
  return next;
}

function mark(status: StepStatus) {
  if (status === "ok") return "[ OK ]";
  if (status === "error") return "[FAIL]";
  if (status === "running") return "[ .. ]";
  return "[    ]";
}

type Props = {
  server: SavedServer;
  onReady: (info: SessionMeta, creds: ReturnType<typeof serverBody>) => void;
  onBack: () => void;
};

export function ConnectingScreen({ server, onReady, onBack }: Props) {
  const [attempt, setAttempt] = useState(0);
  const [steps, setSteps] = useState<Record<StepId, StepStatus>>(() => ({
    start: "running", resolve: "pending", ssh: "pending", auth: "pending", info: "pending", sftp: "pending",
  }));
  const [error, setError] = useState("");
  const [chmod, setChmod] = useState<{ cmd: string; path: string } | null>(null);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  useEffect(() => {
    let cancelled = false;
    setError("");
    setChmod(null);
    setSteps({ start: "running", resolve: "pending", ssh: "pending", auth: "pending", info: "pending", sftp: "pending" });

    const problem = missingSecret(server);
    if (problem) {
      setError(problem);
      return;
    }

    void (async () => {
      try {
        const body = serverBody(server);
        const res = await startConnect(body);
        if (!res.ok || !res.body) throw new Error("Connect failed");
        let ready: ConnectEvent | undefined;
        let failed = "";
        await readNdjson(res, (event) => {
          if (cancelled) return;
          setSteps((prev) => applyEvent(prev, event));
          if (event.status === "error") {
            failed = event.message || "Connect failed";
            if (event.code === "key_permissions" && event.chmod_command && event.key_path) {
              setChmod({ cmd: event.chmod_command, path: event.key_path });
            }
          }
          if (event.step === "ready" && event.session_id) ready = event;
        });
        if (cancelled) return;
        if (failed) throw new Error(failed);
        if (!ready?.session_id) throw new Error("Connection did not complete");
        const info: SessionMeta = {
          session_id: ready.session_id,
          host: ready.host || server.host,
          username: ready.username || server.username,
          home: ready.home || "/",
          uname: ready.uname || "",
          port: server.port,
          fingerprint: ready.fingerprint,
          name: server.name,
          server_id: server.id,
        };
        onReadyRef.current(info, body);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Connect failed");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [attempt, server]);

  const address = `${server.host}${server.port !== 22 ? `:${server.port}` : ""}`;

  return (
    <section className="relative z-10 grid min-h-full place-items-center px-6 text-center">
      <div className="w-full max-w-xl">
        <p className="text-[12px] font-medium tracking-[0.28em] text-[var(--muted)]">SeeTUI</p>
        <h1 className="mt-5 text-[28px] font-semibold tracking-tight">
          {error ? "Unable to connect" : `Connecting to ${server.name}`}
        </h1>
        <p className="mt-3 text-[15px]">{server.name}</p>
        <p className="font-mono text-[12px] text-[var(--muted)]">
          {address}
          <span className="px-2 opacity-40">·</span>
          {server.username}@{server.host}
        </p>
        {error ? (
          <div className="mx-auto mt-8 max-w-md">
            <p className="text-sm leading-6 text-[var(--muted)]">{error}</p>
            {chmod && (
              <div className="mt-4 text-left">
                <pre className="overflow-auto rounded-lg bg-[var(--code-bg)] p-2 font-mono text-xs text-[var(--code-text)]">{chmod.cmd}</pre>
                <button
                  type="button"
                  className="mt-2 rounded-full bg-[var(--btn)] px-4 py-2 text-[13px] font-semibold text-[var(--on-btn)]"
                  onClick={async () => {
                    try {
                      const result = await chmodKey(chmod.path);
                      setChmod({ ...chmod, cmd: result.command });
                      setError("Key permissions updated. Retry the connection.");
                    } catch (err) {
                      setError(err instanceof Error ? err.message : "Could not update key permissions.");
                    }
                  }}
                >
                  Fix key permissions
                </button>
              </div>
            )}
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <button type="button" className="rounded-full bg-[var(--btn)] px-4 py-2 text-[13px] font-semibold text-[var(--on-btn)]" onClick={() => setAttempt((n) => n + 1)}>
                Retry
              </button>
              <button type="button" className="rounded-full bg-[var(--btn-soft)] px-4 py-2 text-[13px] text-[var(--text)]" onClick={onBack}>
                Back to Servers
              </button>
            </div>
          </div>
        ) : (
          <>
            <ol className="mx-auto mt-10 w-full max-w-md space-y-2 text-left font-mono text-[13px]">
              {STEP_IDS.map((id) => {
                const status = steps[id];
                return (
                  <li key={id} className="flex items-baseline gap-3">
                    <span className={`w-14 shrink-0 text-[11px] ${status === "ok" ? "text-[var(--ok)]" : status === "error" ? "text-[var(--danger)]" : "text-[var(--muted)]"}`}>
                      {mark(status)}
                    </span>
                    <span className={status === "running" || status === "ok" ? "text-[var(--text)]" : "text-[var(--muted)]"}>
                      {LABELS[id](server.name)}
                    </span>
                  </li>
                );
              })}
            </ol>
            <p className="mt-10 text-[13px] text-[var(--muted)]">Initializing environment…</p>
          </>
        )}
      </div>
    </section>
  );
}
