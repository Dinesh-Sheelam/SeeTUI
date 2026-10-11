import { useEffect, useState } from "react";
import type { ServerNote } from "../../api/types";
import { formatUptime } from "../performance/format";
import { useLiveSnapshot } from "../../state/live-snapshot";
import { useSession } from "../../state/session";
import { useToast } from "../../state/toast";

const FIELDS: (keyof ServerNote)[] = ["name", "purpose", "owner", "contact", "environment", "notes"];

export function ServerInfoWindow() {
  const { api } = useSession();
  const snapshot = useLiveSnapshot();
  const toast = useToast();
  const [note, setNote] = useState<ServerNote>({ name: "", purpose: "", owner: "", contact: "", environment: "", notes: "" });
  const [location, setLocation] = useState("");
  const [facts, setFacts] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!api) return;
    api.serverInfo().then((data) => {
      setNote(data.note);
      setLocation(data.location);
      setFacts(data.facts || {});
    }).catch((err: unknown) => toast(err instanceof Error ? err.message : "Failed"));
  }, [api, toast]);

  return (
    <form className="space-y-2 p-4" onSubmit={async (e) => {
      e.preventDefault();
      if (!api) return;
      try {
        const saved = await api.saveInfo({ ...note, use_ssh_password: true });
        setNote(saved.note);
        setLocation(saved.location);
        toast(`Saved to ${saved.location}`);
      } catch (err) {
        toast(err instanceof Error ? err.message : "Save failed");
      }
    }}>
      <p className="text-[var(--muted)]">Stored at {location || "—"}</p>
      {FIELDS.map((key) => (
        <label key={key} className="block text-[var(--muted)]">{key}
          <input className="mt-1 w-full rounded-lg border border-[var(--line)] bg-[var(--bg2)] px-2 py-1.5" value={note[key]} onChange={(e) => setNote({ ...note, [key]: e.target.value })} />
        </label>
      ))}
      <button type="submit" className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-white">Save</button>
      <hr className="border-[var(--line)]" />
      {snapshot && (
        <>
          <p><strong>os</strong><br /><span className="font-mono text-xs">{snapshot.host?.os_name || "—"}</span></p>
          <p><strong>kernel</strong><br /><span className="font-mono text-xs">{snapshot.host?.kernel || "—"}</span></p>
          <p><strong>uptime</strong><br /><span className="font-mono text-xs">{formatUptime(snapshot.host?.uptime_seconds ?? 0)}</span></p>
          <p><strong>cpu</strong><br /><span className="font-mono text-xs">{snapshot.cpu.info?.model || "—"}</span></p>
          <p><strong>mem</strong><br /><span className="font-mono text-xs">{Math.round(snapshot.memory.used_pct)}%</span></p>
          <p><strong>disks</strong><br /><span className="font-mono text-xs whitespace-pre-wrap">{snapshot.mounts.map((mount) => `${mount.mount} ${mount.used_pct}%`).join("\n") || "—"}</span></p>
        </>
      )}
      {Object.entries(facts).map(([k, v]) => (
        <p key={k}><strong>{k}</strong><br /><span className="font-mono text-xs">{v || "—"}</span></p>
      ))}
    </form>
  );
}
