import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { testConnect } from "../../api/client";
import type { AuthMethod, SavedServer } from "../../api/types";
import { SERVERS_EVENT, loadServers, missingSecret, removeServer, serverBody, upsertServer } from "../../state/servers";
import { useToast } from "../../state/toast";

type Probe =
  | { state: "offline" }
  | { state: "checking" }
  | { state: "online"; detail: string }
  | { state: "failed"; detail: string };

function probeOf(probes: Record<string, Probe>, id: string): Probe {
  return probes[id] ?? { state: "offline" };
}

function probeDotClass(state: Probe["state"]): string {
  if (state === "online") return "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]";
  if (state === "checking") return "animate-pulse bg-amber-400";
  if (state === "failed") return "bg-red-400";
  return "bg-zinc-400";
}

function probeToneClass(state: Probe["state"]): string {
  if (state === "online") return "text-[var(--ok)]";
  if (state === "failed") return "text-[var(--danger)]";
  return "text-[var(--muted)]";
}

function probeLabel(probe: Probe): string {
  if (probe.state === "online") return probe.detail ? `Online · ${probe.detail}` : "Online";
  if (probe.state === "checking") return "Checking…";
  if (probe.state === "failed") return probe.detail ? `Offline · ${probe.detail}` : "Offline";
  return "Offline";
}

type Draft = {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  auth_method: AuthMethod;
  key_path: string;
  password: string;
  passphrase: string;
  key_content: string;
  pemName: string;
};

function blankDraft(): Draft {
  return {
    id: crypto.randomUUID(),
    name: "",
    host: "",
    port: 22,
    username: "",
    auth_method: "password",
    key_path: "",
    password: "",
    passphrase: "",
    key_content: "",
    pemName: "",
  };
}

function fromServer(server: SavedServer): Draft {
  return {
    id: server.id,
    name: server.name,
    host: server.host,
    port: server.port,
    username: server.username,
    auth_method: server.auth_method,
    key_path: server.key_path || "",
    password: "",
    passphrase: "",
    key_content: "",
    pemName: server.key_content ? "Saved PEM" : "",
  };
}

function toServer(draft: Draft, previous?: SavedServer): SavedServer {
  return {
    id: draft.id,
    name: draft.name.trim() || `${draft.username.trim()}@${draft.host.trim()}`,
    host: draft.host.trim(),
    port: draft.port || 22,
    username: draft.username.trim(),
    auth_method: draft.auth_method,
    key_path: draft.key_path.trim(),
    password: draft.password || previous?.password || "",
    passphrase: draft.passphrase || previous?.passphrase || "",
    key_content: draft.key_content || previous?.key_content || "",
  };
}

export function ServerHome({ onConnect }: { onConnect: (server: SavedServer) => void }) {
  const toast = useToast();
  const [servers, setServers] = useState(loadServers);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<SavedServer | null>(null);
  const [formError, setFormError] = useState("");
  const [probes, setProbes] = useState<Record<string, Probe>>({});

  useEffect(() => {
    const sync = () => setServers(loadServers());
    window.addEventListener(SERVERS_EVENT, sync);
    return () => window.removeEventListener(SERVERS_EVENT, sync);
  }, []);

  function openNew() {
    setFormError("");
    setEditingId(null);
    setDraft(blankDraft());
  }

  function openEdit(server: SavedServer) {
    setFormError("");
    setEditingId(server.id);
    setDraft(fromServer(server));
  }

  async function saveDraft(connectAfter: boolean) {
    if (!draft) return;
    const previous = servers.find((item) => item.id === draft.id);
    const server = toServer(draft, previous);
    const problem = missingSecret(server);
    if (problem) {
      setFormError(problem);
      return;
    }
    setServers(upsertServer(server));
    setProbes((current) => {
      const next = { ...current };
      delete next[server.id];
      return next;
    });
    setDraft(null);
    setEditingId(null);
    if (connectAfter) onConnect(server);
  }

  async function onTest(server: SavedServer) {
    const problem = missingSecret(server);
    if (problem) {
      setProbes((current) => ({ ...current, [server.id]: { state: "failed", detail: problem } }));
      openEdit(server);
      return;
    }
    setProbes((current) => ({ ...current, [server.id]: { state: "checking" } }));
    try {
      const result = await testConnect(serverBody(server));
      setProbes((current) => ({
        ...current,
        [server.id]: { state: "online", detail: result.uname || "" },
      }));
    } catch (err) {
      setProbes((current) => ({
        ...current,
        [server.id]: { state: "failed", detail: err instanceof Error ? err.message : "Connection failed" },
      }));
    }
  }

  function connect(server: SavedServer) {
    const problem = missingSecret(server);
    if (problem) {
      toast(problem);
      openEdit(server);
      return;
    }
    onConnect(server);
  }

  const empty = servers.length === 0;

  return (
    <section className="relative z-10 min-h-full overflow-auto">
      <main className="mx-auto flex min-h-full w-full max-w-[920px] flex-col justify-center px-6 py-10 sm:px-10">
        <header className="max-w-xl">
          <p className="text-[12px] font-medium tracking-[0.28em] text-[var(--muted)]">SeeTUI</p>
          <h1 className="mt-2 text-[32px] font-semibold tracking-tight">{empty ? "Welcome to SeeTUI" : "Your Servers"}</h1>
          <p className="mt-2 text-[15px] leading-6 text-[var(--muted)]">
            {empty
              ? "Add your first Linux server over SSH. Manage files, a terminal, and live metrics from one desktop."
              : "Select a machine to open its desktop. Switch servers anytime from the top bar."}
          </p>
        </header>
        <section aria-label="Available servers" className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {servers.map((server) => {
            const probe = probeOf(probes, server.id);
            const isChecking = probe.state === "checking";
            return (
              <article key={server.id} className="glass rounded-[22px] p-5 shadow-[0_18px_50px_rgba(0,0,0,0.28)]">
                <div className="relative min-h-[118px]">
                  <span className={`absolute top-0 right-0 size-2 rounded-full ${probeDotClass(probe.state)}`} aria-hidden />
                  <p className="pr-6 text-[17px] font-semibold">{server.name}</p>
                  <p className="mt-3 font-mono text-[12px] text-[var(--muted)]">{server.host}{server.port !== 22 ? `:${server.port}` : ""}</p>
                  <p className="mt-1 font-mono text-[12px] text-[var(--muted)]">{server.username}@{server.host}</p>
                  <p className={`mt-5 flex items-start gap-2 text-[13px] ${probeToneClass(probe.state)}`} aria-live="polite">
                    <span className={`mt-1.5 size-1.5 shrink-0 rounded-full ${probeDotClass(probe.state)}`} />
                    {probeLabel(probe)}
                  </p>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" className="rounded-full bg-[var(--btn)] px-3 py-1.5 text-[12px] font-semibold text-[var(--on-btn)]" onClick={() => connect(server)}>Connect</button>
                  <button type="button" disabled={isChecking} className="rounded-full bg-[var(--btn-soft)] px-3 py-1.5 text-[12px] text-[var(--text)]" onClick={() => void onTest(server)}>
                    {isChecking ? "Testing…" : "Test Connection"}
                  </button>
                  <button type="button" className="rounded-full px-3 py-1.5 text-[12px] text-[var(--text)] hover:bg-[var(--hover)]" onClick={() => openEdit(server)}>Edit</button>
                  <button type="button" className="rounded-full px-3 py-1.5 text-[12px] text-[var(--danger)] hover:bg-[var(--danger)]/10" onClick={() => setDeleting(server)}>Delete</button>
                </div>
              </article>
            );
          })}
          <button
            type="button"
            onClick={openNew}
            className="flex min-h-[154px] flex-col items-center justify-center gap-3 rounded-[22px] border border-dashed border-[var(--line)] bg-[var(--panel)] text-[var(--muted)] hover:border-[var(--text)] hover:text-[var(--text)]"
          >
            <span className="flex size-10 items-center justify-center rounded-full bg-[var(--hover)]"><Plus size={18} /></span>
            <span className="text-[14px] font-medium">{empty ? "Add your first server" : "Add Server"}</span>
          </button>
        </section>
      </main>
      {draft && (
        <ServerForm
          draft={draft}
          editing={Boolean(editingId)}
          error={formError}
          onChange={setDraft}
          onClose={() => setDraft(null)}
          onSave={(connectAfter) => void saveDraft(connectAfter)}
        />
      )}
      {deleting && (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-black/55 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) setDeleting(null); }}>
          <div role="dialog" aria-modal="true" className="glass w-full max-w-[400px] rounded-[22px] p-5">
            <h2 className="text-[16px] font-semibold">Delete “{deleting.name}”?</h2>
            <p className="mt-2 text-[13px] leading-6 text-[var(--muted)]">This removes the saved server from this computer. The remote machine is left as it is.</p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="rounded-full px-4 py-2 text-[13px]" onClick={() => setDeleting(null)}>Cancel</button>
              <button
                type="button"
                className="rounded-full bg-red-400 px-4 py-2 text-[13px] font-semibold text-zinc-950"
                onClick={() => {
                  setServers(removeServer(deleting.id));
                  setProbes((current) => {
                    const next = { ...current };
                    delete next[deleting.id];
                    return next;
                  });
                  setDeleting(null);
                }}
              >
                Delete Server
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function ServerForm({
  draft,
  editing,
  error,
  onChange,
  onClose,
  onSave,
}: {
  draft: Draft;
  editing: boolean;
  error: string;
  onChange: (draft: Draft) => void;
  onClose: () => void;
  onSave: (connectAfter: boolean) => void;
}) {
  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-black/55 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <form
        className="glass w-full max-w-md rounded-[22px] p-5"
        onSubmit={(event) => { event.preventDefault(); onSave(true); }}
      >
        <h2 className="text-[16px] font-semibold">{editing ? "Edit server" : "Add server"}</h2>
        <div className="mt-4 space-y-3">
          <label className="block text-[13px] text-[var(--muted)]">Name
            <input className="mt-1 w-full rounded-lg border border-[var(--line)] bg-[var(--bg2)] px-2.5 py-2 text-[var(--text)]" value={draft.name} onChange={(e) => onChange({ ...draft, name: e.target.value })} placeholder="cognisee" />
          </label>
          <div className="flex gap-2">
            <label className="block flex-1 text-[13px] text-[var(--muted)]">Host
              <input className="mt-1 w-full rounded-lg border border-[var(--line)] bg-[var(--bg2)] px-2.5 py-2 text-[var(--text)]" value={draft.host} onChange={(e) => onChange({ ...draft, host: e.target.value })} required placeholder="192.168.1.129" />
            </label>
            <label className="block w-24 text-[13px] text-[var(--muted)]">Port
              <input className="mt-1 w-full rounded-lg border border-[var(--line)] bg-[var(--bg2)] px-2.5 py-2 text-[var(--text)]" type="number" min={1} max={65535} value={draft.port} onChange={(e) => onChange({ ...draft, port: Number(e.target.value) })} />
            </label>
          </div>
          <label className="block text-[13px] text-[var(--muted)]">Username
            <input className="mt-1 w-full rounded-lg border border-[var(--line)] bg-[var(--bg2)] px-2.5 py-2 text-[var(--text)]" value={draft.username} onChange={(e) => onChange({ ...draft, username: e.target.value })} required placeholder="ubuntu" />
          </label>
          <div className="flex rounded-xl bg-[var(--hover)] p-1">
            {(["password", "key_path", "key_content"] as AuthMethod[]).map((method) => (
              <button key={method} type="button" className={`flex-1 rounded-lg py-1.5 text-[12px] ${draft.auth_method === method ? "bg-[var(--bg2)] text-[var(--text)] shadow-sm" : "text-[var(--muted)]"}`} onClick={() => onChange({ ...draft, auth_method: method })}>
                {method === "password" ? "Password" : method === "key_path" ? "PEM path" : "Pick PEM"}
              </button>
            ))}
          </div>
          {draft.auth_method !== "key_content" && (
            <label className="block text-[13px] text-[var(--muted)]">Password
              <input className="mt-1 w-full rounded-lg border border-[var(--line)] bg-[var(--bg2)] px-2.5 py-2 text-[var(--text)]" type="password" value={draft.password} onChange={(e) => onChange({ ...draft, password: e.target.value })} placeholder={editing ? "Leave blank to keep the saved password" : ""} autoComplete="new-password" />
            </label>
          )}
          {draft.auth_method === "key_path" && (
            <label className="block text-[13px] text-[var(--muted)]">Key path
              <input className="mt-1 w-full rounded-lg border border-[var(--line)] bg-[var(--bg2)] px-2.5 py-2 text-[var(--text)]" value={draft.key_path} onChange={(e) => onChange({ ...draft, key_path: e.target.value })} placeholder="~/.ssh/id_ed25519" />
            </label>
          )}
          {draft.auth_method === "key_content" && (
            <label className="block text-[13px] text-[var(--muted)]">PEM file {draft.pemName ? `· ${draft.pemName}` : ""}
              <input className="mt-1 w-full text-[13px]" type="file" accept=".pem,.key,*" onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                onChange({ ...draft, key_content: await file.text(), pemName: file.name });
              }} />
            </label>
          )}
          {draft.auth_method !== "password" && (
            <label className="block text-[13px] text-[var(--muted)]">Passphrase
              <input className="mt-1 w-full rounded-lg border border-[var(--line)] bg-[var(--bg2)] px-2.5 py-2 text-[var(--text)]" type="password" value={draft.passphrase} onChange={(e) => onChange({ ...draft, passphrase: e.target.value })} placeholder={editing ? "Leave blank to keep the saved passphrase" : ""} autoComplete="new-password" />
            </label>
          )}
        </div>
        {error && <p className="mt-3 text-[12px] text-[var(--danger)]">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="rounded-full px-4 py-2 text-[13px] text-[var(--text)]" onClick={onClose}>Cancel</button>
          <button type="button" className="rounded-full bg-[var(--btn-soft)] px-4 py-2 text-[13px] text-[var(--text)]" onClick={() => onSave(false)}>Save</button>
          <button type="submit" className="rounded-full bg-[var(--btn)] px-4 py-2 text-[13px] font-semibold text-[var(--on-btn)]">
            {editing ? "Save and connect" : "Add and connect"}
          </button>
        </div>
      </form>
    </div>
  );
}
