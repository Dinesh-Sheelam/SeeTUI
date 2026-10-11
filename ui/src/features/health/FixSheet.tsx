import { Wrench } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge, Button } from "../monitor/ui";
import { TONE_COLOR } from "../monitor/tone";
import { humanizeInput, riskTone } from "./check-meta";

type FixSheetProps = {
  title: string;
  body: string;
  risk: string;
  commands: string[];
  inputs: Record<string, string>;
  inputKeys: string[];
  onCancel: () => void;
  onRun: (inputs: Record<string, string>, sudo: string | null) => Promise<void>;
};

export function FixSheet({ title, body, risk, commands, inputs, inputKeys, onCancel, onRun }: FixSheetProps) {
  const [values, setValues] = useState(inputs);
  const [sudo, setSudo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const tone = riskTone(risk);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  const missing = inputKeys.filter((key) => !values[key]?.trim());

  async function submit() {
    if (missing.length) {
      setError(`Fill in ${humanizeInput(missing[0])}`);
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onRun(values, sudo.trim() || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fix failed");
      setBusy(false);
    }
  }

  return (
    <div
      className="absolute inset-0 z-50 flex items-end justify-center bg-black/40 p-4 backdrop-blur-[2px] sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="hl-fix-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <form
        className="mon-sheet flex max-h-[min(560px,92%)] w-full max-w-[440px] flex-col overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--panel)] shadow-2xl"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <header className="flex items-start gap-3 border-b border-[var(--line)] px-5 py-4">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
            style={{ color: TONE_COLOR[tone], background: `color-mix(in srgb, ${TONE_COLOR[tone]} 16%, transparent)` }}
          >
            <Wrench className="h-[18px] w-[18px]" strokeWidth={2} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 id="hl-fix-title" className="m-0 text-[15px] font-semibold tracking-[-0.01em]">{title}</h3>
              {risk && <Badge tone={tone}>{risk}</Badge>}
            </div>
            <p className="m-0 mt-1 text-[13px] leading-relaxed text-[var(--muted)]">{body}</p>
          </div>
        </header>

        <div className="mon-scroll min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {inputKeys.map((key) => (
            <label key={key} className="block">
              <span className="mb-1.5 block text-xs text-[var(--muted)]">{humanizeInput(key)}</span>
              <input
                className="mon-input"
                value={values[key] ?? ""}
                onChange={(e) => setValues((prev) => ({ ...prev, [key]: e.target.value }))}
                autoComplete="off"
              />
            </label>
          ))}
          <label className="block">
            <span className="mb-1.5 block text-xs text-[var(--muted)]">Sudo password (optional)</span>
            <input
              type="password"
              className="mon-input"
              placeholder="Blank uses passwordless sudo or your SSH password"
              value={sudo}
              onChange={(e) => setSudo(e.target.value)}
              autoComplete="off"
            />
          </label>
          {commands.length > 0 && (
            <pre className="m-0 max-h-36 overflow-auto rounded-xl bg-[var(--code-bg)] p-3 font-mono text-[11px] leading-relaxed text-[var(--code-text)]">
              {commands.join("\n")}
            </pre>
          )}
          {error && <p className="m-0 rounded-lg bg-[var(--danger)]/12 px-3 py-2 text-xs text-[var(--danger)]">{error}</p>}
        </div>

        <footer className="flex justify-end gap-2 border-t border-[var(--line)] px-5 py-3">
          <Button variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button type="submit" variant={tone === "bad" ? "danger" : "primary"} busy={busy}>Run fix</Button>
        </footer>
      </form>
    </div>
  );
}
