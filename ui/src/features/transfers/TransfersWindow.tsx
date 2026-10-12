import { ArrowDownToLine, ArrowUpFromLine, FolderArchive, HardDrive } from "lucide-react";
import { useRef, useState } from "react";
import type { FileEntry, TransferJob } from "../../api/types";
import { downloadFile } from "../../lib/download";
import { Badge, Button, Card, EmptyState, Meter } from "../monitor/ui";
import type { Tone } from "../monitor/tone";
import { useSession } from "../../state/session";
import { useToast } from "../../state/toast";
import { RemotePicker } from "./RemotePicker";

type Mode = "idle" | "send" | "zip";

const JOB_TONE: Record<TransferJob["status"], Tone> = {
  active: "accent",
  uploaded: "ok",
  downloaded: "ok",
  cancelled: "neutral",
  failed: "bad",
};

const JOB_LABEL: Record<TransferJob["status"], string> = {
  active: "In progress",
  uploaded: "Received",
  downloaded: "Sent",
  cancelled: "Cancelled",
  failed: "Failed",
};

export function TransfersWindow() {
  const { api, meta } = useSession();
  const toast = useToast();
  const localPick = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<Mode>("idle");
  const [folder, setFolder] = useState<FileEntry | null>(null);
  const [jobs, setJobs] = useState<TransferJob[]>([]);

  function record(name: string, pct: number, status: TransferJob["status"]) {
    setJobs((prev) => {
      const active = prev.find((job) => job.name === name && job.status === "active");
      if (active && status === "active") return prev.map((job) => (job.id === active.id ? { ...job, pct } : job));
      if (active) {
        return [{ ...active, pct, status, at: new Date().toLocaleTimeString() }, ...prev.filter((job) => job.id !== active.id)].slice(0, 24);
      }
      return [{ id: crypto.randomUUID(), name, pct, status, at: new Date().toLocaleTimeString() }, ...prev].slice(0, 24);
    });
  }

  async function download(path: string, name: string) {
    if (!api) return;
    const result = await downloadFile(api.downloadUrl(path), name);
    if (result === "cancelled") {
      toast("Save cancelled");
      return;
    }
    record(name, 100, "downloaded");
    toast(result === "saved" ? `Saved ${name}` : `Sending ${name} to this computer`);
    setMode("idle");
    setFolder(null);
  }

  function sendEntry(entry: FileEntry) {
    if (entry.is_dir) {
      setFolder(entry);
      setMode("zip");
      return;
    }
    download(entry.path, entry.name);
  }

  async function zipAndSend() {
    if (!api || !folder) return;
    try {
      let result: { path: string };
      try {
        result = await api.archive({ paths: [folder.path], format: "zip", archive_name: folder.name });
      } catch (err) {
        const message = err instanceof Error ? err.message : "";
        if (!message.includes("zip is not installed")) throw err;
        toast("zip is not installed on the server. Using tar.gz instead.");
        result = await api.archive({ paths: [folder.path], format: "tar.gz", archive_name: folder.name });
      }
      const name = result.path.split("/").pop() || `${folder.name}.zip`;
      download(result.path, name);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Zip failed");
    }
  }

  async function receiveLocal(list: FileList | null) {
    if (!api || !list?.length) return;
    const destDir = meta?.home || "/tmp";
    setMode("idle");
    for (const file of [...list]) {
      const remote = `${destDir.replace(/\/$/, "")}/${file.name}`;
      record(file.name, 0, "active");
      try {
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("PUT", api.uploadUrl(remote));
          xhr.upload.onprogress = (ev) => {
            if (ev.lengthComputable) record(file.name, Math.round((ev.loaded / ev.total) * 100), "active");
          };
          xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(xhr.statusText)));
          xhr.onerror = () => reject(new Error("upload failed"));
          xhr.send(file);
        });
        record(file.name, 100, "uploaded");
        toast(`Received ${file.name} on the server`);
      } catch (err) {
        record(file.name, 0, "failed");
        toast(err instanceof Error ? err.message : "Receive failed");
      }
    }
  }

  const dest = meta?.home || "your home folder";
  const hostLabel = meta ? `${meta.username}@${meta.host}` : "the server";

  return (
    <div className="flex h-full min-h-0 flex-col bg-[color-mix(in_srgb,var(--bg)_70%,var(--bg2))]">
      <header className="border-b border-[var(--line)] px-5 py-4">
        <h2 className="m-0 text-[17px] font-semibold tracking-[-0.02em]">Transfers</h2>
        <p className="m-0 mt-1 text-[12px] text-[var(--muted)]">
          Move files between this computer and <span className="font-mono text-[var(--text)]">{hostLabel}</span>.
        </p>
      </header>

      <div className="mon-scroll min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            className={`mon-focus rounded-2xl border p-4 text-left transition ${
              mode === "send" || mode === "zip"
                ? "border-[var(--accent)] bg-[var(--sel)]"
                : "border-[var(--line)] bg-[var(--bg2)] hover:border-[var(--accent)]/50 hover:bg-[var(--hover)]"
            }`}
            onClick={() => { setFolder(null); setMode("send"); }}
          >
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--accent)]/15 text-[var(--accent)]">
              <ArrowUpFromLine size={18} />
            </span>
            <span className="mt-3 block text-[15px] font-semibold">Send</span>
            <span className="mt-1 block text-[12px] leading-5 text-[var(--muted)]">
              Pick a file on the server and download it here.
            </span>
          </button>
          <button
            type="button"
            className="mon-focus rounded-2xl border border-[var(--line)] bg-[var(--bg2)] p-4 text-left transition hover:border-[var(--accent)]/50 hover:bg-[var(--hover)]"
            onClick={() => { setFolder(null); setMode("idle"); localPick.current?.click(); }}
          >
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--ok)]/15 text-[var(--ok)]">
              <ArrowDownToLine size={18} />
            </span>
            <span className="mt-3 block text-[15px] font-semibold">Receive</span>
            <span className="mt-1 block text-[12px] leading-5 text-[var(--muted)]">
              Upload from this computer into <span className="font-mono">{dest}</span>.
            </span>
          </button>
          <input
            ref={localPick}
            type="file"
            multiple
            hidden
            onChange={(ev) => { void receiveLocal(ev.target.files); ev.target.value = ""; }}
          />
        </div>

        {mode === "send" && (
          <Card title="Choose a server file" flush className="min-h-[280px]">
            <p className="m-0 border-b border-[var(--line)] px-4 pb-3 text-[12px] text-[var(--muted)]">
              Open folders with a double-click. Selecting a folder asks you to zip it first.
            </p>
            <div className="flex min-h-[240px] flex-col">
              <RemotePicker onPick={sendEntry} />
            </div>
          </Card>
        )}

        {mode === "zip" && folder && (
          <Card>
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--warn)]/15 text-[var(--warn)]">
                <FolderArchive size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="m-0 text-[14px] font-semibold">{folder.name}</p>
                <p className="m-0 mt-1 text-[12px] leading-5 text-[var(--muted)]">
                  This is a folder. Zip it on the server before sending it to this computer.
                </p>
                <div className="mt-3 flex justify-end gap-2">
                  <Button onClick={() => { setFolder(null); setMode("send"); }}>Cancel</Button>
                  <Button variant="primary" onClick={() => void zipAndSend()}>Zip and send</Button>
                </div>
              </div>
            </div>
          </Card>
        )}

        <Card title="Activity" icon={HardDrive} flush>
          {jobs.length === 0 ? (
            <EmptyState
              icon={HardDrive}
              title="No transfers yet"
              hint="Send a server file here, or receive a file from this computer."
            />
          ) : (
            <ul className="m-0 divide-y divide-[var(--line)] p-0">
              {jobs.map((job) => (
                <li key={job.id} className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--hover)] text-[var(--muted)]">
                      {job.status === "uploaded" ? <ArrowDownToLine size={15} /> : <ArrowUpFromLine size={15} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="m-0 min-w-0 truncate text-[13px] font-medium">{job.name}</p>
                        <Badge tone={JOB_TONE[job.status]}>
                          {job.status === "active" ? `${job.pct}%` : JOB_LABEL[job.status]}
                        </Badge>
                      </div>
                      <p className="m-0 mt-0.5 text-[11px] text-[var(--muted)]">{job.at}</p>
                    </div>
                  </div>
                  {job.status === "active" && (
                    <div className="mt-2 pl-11">
                      <Meter value={job.pct} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
