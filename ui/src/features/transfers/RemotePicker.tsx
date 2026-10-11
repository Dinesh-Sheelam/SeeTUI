import { ChevronRight, ChevronUp, File, FileArchive, FileCode, FileText, Home } from "lucide-react";
import { useEffect, useState } from "react";
import type { FileEntry } from "../../api/types";
import { FolderIcon } from "../../desktop/FolderIcon";
import { fmtSize, viewerKind } from "../../lib/file-type";
import { useSession } from "../../state/session";
import { useToast } from "../../state/toast";

function Icon({ entry }: { entry: FileEntry }) {
  if (entry.is_dir) return <FolderIcon size={18} />;
  const kind = viewerKind(entry);
  if (kind === "code") return <FileCode size={16} className="shrink-0 text-[var(--muted)]" />;
  if (kind === "text") return <FileText size={16} className="shrink-0 text-[var(--muted)]" />;
  if (/\.(zip|tar|gz|tgz)$/.test(entry.name)) return <FileArchive size={16} className="shrink-0 text-[var(--muted)]" />;
  return <File size={16} className="shrink-0 text-[var(--muted)]" />;
}

export function RemotePicker({ onPick }: { onPick: (entry: FileEntry) => void }) {
  const { api, meta } = useSession();
  const toast = useToast();
  const [path, setPath] = useState(meta?.home || "/");
  const [entries, setEntries] = useState<FileEntry[]>([]);

  async function load(next: string) {
    if (!api) return;
    try {
      const data = await api.files(next);
      setPath(data.path);
      setEntries(data.entries);
    } catch (err) {
      toast(err instanceof Error ? err.message : "List failed");
    }
  }

  useEffect(() => {
    void load(meta?.home || "/");
    // Initial listing only when the session is ready.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, meta?.home]);

  const parent = path === "/" ? "/" : path.replace(/\/[^/]+$/, "") || "/";
  const crumbs = path.split("/").filter(Boolean);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-[var(--line)] px-3 py-2">
        <button
          type="button"
          className="mon-focus rounded-lg p-1.5 text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--text)]"
          onClick={() => void load(parent)}
          aria-label="Parent"
        >
          <ChevronUp size={16} />
        </button>
        <nav className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto font-mono text-[11px]">
          <button
            type="button"
            className="mon-focus inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--text)]"
            onClick={() => void load("/")}
          >
            <Home size={12} />
            /
          </button>
          {crumbs.map((part, i) => {
            const acc = `/${crumbs.slice(0, i + 1).join("/")}`;
            const isLast = i === crumbs.length - 1;
            return (
              <span key={acc} className="flex items-center">
                <ChevronRight size={12} className="text-[var(--muted)] opacity-50" />
                <button
                  type="button"
                  className={`mon-focus rounded-md px-1.5 py-1 ${isLast ? "font-medium text-[var(--text)]" : "text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--text)]"}`}
                  onClick={() => void load(acc)}
                >
                  {part}
                </button>
              </span>
            );
          })}
        </nav>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {entries.length === 0 && (
          <p className="px-4 py-8 text-center text-[13px] text-[var(--muted)]">This folder is empty.</p>
        )}
        {entries.map((entry) => (
          <button
            key={entry.path}
            type="button"
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[var(--text)] hover:bg-[var(--hover)]"
            onDoubleClick={() => { if (entry.is_dir) void load(entry.path); else onPick(entry); }}
            onClick={() => { if (!entry.is_dir) onPick(entry); }}
          >
            <Icon entry={entry} />
            <span className="min-w-0 flex-1 truncate text-[13px]">{entry.name}</span>
            <span className="text-[11px] text-[var(--muted)]">{entry.is_dir ? "Folder" : fmtSize(entry.size)}</span>
            {entry.is_dir && (
              <span
                className="rounded-md border border-[var(--line)] bg-[var(--bg2)] px-2 py-0.5 text-[11px] font-medium hover:bg-[var(--hover)]"
                onClick={(ev) => { ev.stopPropagation(); onPick(entry); }}
              >
                Select
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
