import { useEffect, useState } from "react";
import type { FileEntry } from "../../api/types";
import { viewerKind } from "../../lib/file-type";
import { useSession } from "../../state/session";
import { useToast } from "../../state/toast";

type Props = {
  entry: FileEntry;
  downloadUrl: string;
  onClose: () => void;
  onSave: (text: string) => Promise<void>;
};

export function Viewer({ entry, downloadUrl, onClose, onSave }: Props) {
  const { api } = useSession();
  const toast = useToast();
  const kind = viewerKind(entry);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if ((kind === "code" || kind === "text") && api) {
      api.preview(entry.path).then((data) => setText(data.text)).catch((err: unknown) => toast(err instanceof Error ? err.message : "Preview failed"));
    }
  }, [api, entry.path, kind, toast]);

  return (
    <dialog open className="glass fixed inset-0 z-[75] m-auto h-[min(70vh,560px)] w-[min(720px,94vw)] rounded-2xl p-0 text-[var(--text)]">
      <header className="flex items-center justify-between border-b border-[var(--line)] px-4 py-2">
        <strong>{entry.name}</strong>
        <button type="button" className="rounded-lg border border-[var(--line)] px-3 py-1" onClick={onClose}>Close</button>
      </header>
      <div className="max-h-[calc(70vh-56px)] overflow-auto p-4">
        {kind === "image" && <img src={downloadUrl} alt={entry.name} className="mx-auto max-h-[60vh] max-w-full" />}
        {kind === "video" && <video src={downloadUrl} controls className="mx-auto max-h-[60vh] max-w-full" />}
        {kind === "audio" && <audio src={downloadUrl} controls className="w-full" />}
        {kind === "pdf" && <iframe title={entry.name} src={downloadUrl} className="h-[60vh] w-full border-0 bg-white" />}
        {(kind === "code" || kind === "text") && (
          <>
            <textarea className="mb-3 h-72 w-full rounded-lg border border-[var(--line)] bg-[var(--code-bg)] p-3 font-mono text-xs text-[var(--code-text)]" value={text} onChange={(e) => setText(e.target.value)} />
            <button type="button" disabled={busy} className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-white" onClick={async () => { setBusy(true); try { await onSave(text); } finally { setBusy(false); } }}>Save</button>
          </>
        )}
        {kind === "unknown" && <p>No preview for this file type.</p>}
      </div>
    </dialog>
  );
}
