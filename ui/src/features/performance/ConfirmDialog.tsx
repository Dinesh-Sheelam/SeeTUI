import { AlertTriangle, ShieldQuestion } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "../monitor/ui";

type ConfirmDialogProps = {
  title: string;
  message: string;
  detail?: string;
  confirmLabel?: string;
  danger?: boolean;
  askSudo?: boolean;
  onCancel: () => void;
  onConfirm: (sudoPassword: string | null) => Promise<void>;
};

export function ConfirmDialog({
  title,
  message,
  detail,
  confirmLabel = "Confirm",
  danger = false,
  askSudo = true,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  const [sudo, setSudo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const confirmRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  async function submit() {
    setBusy(true);
    setError("");
    try {
      await onConfirm(sudo.trim() || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
      setBusy(false);
    }
  }

  const Icon = danger ? AlertTriangle : ShieldQuestion;

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/35 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mon-confirm-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <form
        ref={confirmRef}
        className="mon-sheet w-full max-w-[380px] rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5 shadow-2xl backdrop-blur-2xl"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="flex gap-3">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
            style={{
              color: danger ? "var(--danger)" : "var(--accent)",
              background: `color-mix(in srgb, ${danger ? "var(--danger)" : "var(--accent)"} 15%, transparent)`,
            }}
          >
            <Icon className="h-[18px] w-[18px]" strokeWidth={2} />
          </span>
          <div className="min-w-0">
            <h3 id="mon-confirm-title" className="m-0 text-[15px] font-semibold tracking-[-0.01em]">{title}</h3>
            <p className="m-0 mt-1 text-[13px] leading-relaxed text-[var(--muted)]">{message}</p>
            {detail && (
              <code className="mt-2 block max-h-20 overflow-auto break-all rounded-md bg-[var(--code-bg)] px-2 py-1.5 font-mono text-[11px] text-[var(--code-text)]">
                {detail}
              </code>
            )}
          </div>
        </div>
        {askSudo && (
          <label className="mt-4 block">
            <span className="mb-1.5 block text-xs text-[var(--muted)]">Sudo password (optional)</span>
            <input
              type="password"
              autoComplete="off"
              className="mon-input"
              placeholder="Blank uses passwordless sudo or your SSH password"
              value={sudo}
              onChange={(e) => setSudo(e.target.value)}
            />
          </label>
        )}
        {error && <p className="m-0 mt-3 rounded-lg bg-[var(--danger)]/12 px-3 py-2 text-xs text-[var(--danger)]">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button type="submit" variant={danger ? "danger" : "primary"} busy={busy}>{confirmLabel}</Button>
        </div>
      </form>
    </div>
  );
}
