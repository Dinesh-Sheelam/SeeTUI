import { Check, ChevronDown, LogOut, Server } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { sessionApi } from "../../api/client";
import type { EditorAvailability, EditorId, EditorOption, SavedServer } from "../../api/types";
import { APPEARANCE_LABELS, APPEARANCES, applyAppearance, readAppearance, type Appearance } from "../../appearance";
import { useDesktop } from "../../desktop/desktop-context";
import { Button } from "../monitor/ui";
import { loadPreferredEditor, savePreferredEditor, subscribePreferredEditor } from "../../state/editor";
import { IdeIcon } from "./IdeIcons";
import { SERVERS_EVENT, loadServers, removeServer } from "../../state/servers";
import { useSession } from "../../state/session";
import { useToast } from "../../state/toast";

const FALLBACK_EDITORS: EditorOption[] = [
  { id: "antigravity", label: "Antigravity", available: false },
  { id: "cursor", label: "Cursor", available: false },
  { id: "kiro", label: "Kiro", available: false },
  { id: "code", label: "VS Code", available: false },
  { id: "windsurf", label: "Windsurf", available: false },
];

const APPEARANCE_PREVIEW: Record<Appearance, { from: string; to: string }> = {
  light: { from: "#f5f7fa", to: "#d7dee8" },
  aqua: { from: "#d7e7f7", to: "#f8eee4" },
  dusk: { from: "#5a2d4a", to: "#1a1520" },
  dark: { from: "#1c1f27", to: "#101114" },
};

function byEditorLabel(a: EditorOption, b: EditorOption): number {
  return a.label.localeCompare(b.label);
}

function IdePicker() {
  const { meta } = useSession();
  const { windows } = useDesktop();
  const toast = useToast();
  const [status, setStatus] = useState<EditorAvailability | null>(null);
  const [preferred, setPreferred] = useState<EditorId | null>(loadPreferredEditor);
  const [hint, setHint] = useState("");
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const sessionId = meta?.session_id;
  const isExpanded = windows.settings.maximized;
  const reported = status?.editors ?? FALLBACK_EDITORS;
  const editors = [...reported].sort(byEditorLabel);
  const selected = reported.find((editor) => editor.id === preferred) ?? reported.find((editor) => editor.available);

  useEffect(() => subscribePreferredEditor(() => setPreferred(loadPreferredEditor())), []);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    setStatus(null);
    setHint("");
    sessionApi(sessionId)
      .editorStatus()
      .then((next) => {
        if (!cancelled) setStatus(next);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "Could not check for an editor";
        setStatus({ available: false, editors: FALLBACK_EDITORS });
        setHint(message);
        toast(message);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, toast]);

  useEffect(() => {
    if (!status) return;
    if (preferred && status.editors.some((editor) => editor.id === preferred)) return;
    const first = status.editors.find((editor) => editor.available);
    if (first) savePreferredEditor(first.id);
  }, [preferred, status]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (isExpanded) setOpen(false);
  }, [isExpanded]);

  function onSelect(id: EditorId) {
    savePreferredEditor(id);
    setPreferred(id);
    setOpen(false);
  }

  const note = !sessionId
    ? "Connect to a server to choose an editor"
    : !status
      ? "Checking this computer…"
      : hint;
  const currentId = preferred ?? selected?.id;
  const current = editors.find((editor) => editor.id === currentId);
  const closedLabel = !status ? "Checking…" : current?.label ?? "Select your IDE";

  return (
    <section>
      <h3 className="mb-2 text-[11px] font-medium tracking-wide text-[var(--muted)]">Editor</h3>
      {(!sessionId || !status) && note ? <p className="mb-2 text-[12px] text-[var(--muted)]">{note}</p> : null}
      {isExpanded ? (
        <div role="listbox" aria-label="Select your IDE" className="overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--bg2)]">
          {editors.map((editor, index) => {
            const isSelected = editor.id === currentId;
            const isDisabled = !sessionId || !status || !editor.available;
            return (
              <button
                key={editor.id}
                type="button"
                role="option"
                aria-selected={isSelected}
                disabled={isDisabled}
                className={`mon-focus flex w-full items-center gap-2.5 px-3 py-2 text-left transition disabled:cursor-not-allowed disabled:opacity-45 ${
                  index > 0 ? "border-t border-[var(--line)]" : ""
                } ${isSelected ? "bg-[var(--sel)]" : "hover:bg-[var(--hover)]"}`}
                onClick={() => onSelect(editor.id)}
              >
                <IdeIcon id={editor.id} size={22} />
                <span className="min-w-0 flex-1 truncate text-[13px]">{editor.label}</span>
                {!editor.available && status ? (
                  <span className="shrink-0 text-[10px] text-[var(--muted)]">Not installed</span>
                ) : null}
                <Check size={14} className={isSelected ? "shrink-0 text-[var(--accent)]" : "shrink-0 opacity-0"} />
              </button>
            );
          })}
        </div>
      ) : (
        <div ref={menuRef} className="relative">
          <button
            type="button"
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-label={`Select your IDE, ${closedLabel}`}
            disabled={!sessionId}
            onClick={() => setOpen((value) => !value)}
            className="mon-focus flex w-full items-center justify-between gap-2 rounded-xl border border-[var(--line)] bg-[var(--bg2)] px-3 py-2 text-left text-[13px] hover:border-[var(--accent)]/45 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="flex min-w-0 items-center gap-2.5">
              {status && current ? <IdeIcon id={current.id} size={22} /> : null}
              <span className="truncate">{closedLabel}</span>
            </span>
            <ChevronDown size={14} className={`shrink-0 opacity-70 ${open ? "rotate-180" : ""}`} />
          </button>
          {open && (
            <div
              role="listbox"
              aria-label="Select your IDE"
              className="absolute top-[calc(100%+6px)] right-0 left-0 z-[80] overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--bg2)] py-1 shadow-[0_18px_50px_rgba(0,0,0,0.28)]"
            >
              {editors.map((editor) => {
                const isSelected = editor.id === currentId;
                return (
                  <button
                    key={editor.id}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    disabled={!status || !editor.available}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-[13px] hover:bg-[var(--hover)] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent"
                    onClick={() => onSelect(editor.id)}
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <Check size={14} className={isSelected ? "shrink-0 text-[var(--accent)]" : "shrink-0 opacity-0"} />
                      <IdeIcon id={editor.id} size={22} />
                      <span className="truncate">{editor.label}</span>
                    </span>
                    {!editor.available && status ? (
                      <span className="shrink-0 text-[10px] text-[var(--muted)]">Not installed</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export function SettingsWindow({ onLogout }: { onLogout: () => void }) {
  const { meta } = useSession();
  const [appearance, setAppearance] = useState<Appearance>(readAppearance);
  const [servers, setServers] = useState<SavedServer[]>(loadServers);

  useEffect(() => {
    const sync = () => setServers(loadServers());
    window.addEventListener(SERVERS_EVENT, sync);
    return () => window.removeEventListener(SERVERS_EVENT, sync);
  }, []);

  function chooseAppearance(mode: Appearance) {
    setAppearance(mode);
    applyAppearance(mode);
  }

  const connected = meta ? `${meta.username}@${meta.host}${meta.port !== 22 ? `:${meta.port}` : ""}` : "";

  return (
    <div className="mon-scroll flex h-full min-h-0 justify-center overflow-y-auto bg-[color-mix(in_srgb,var(--bg)_55%,var(--bg2))]">
      <div className="@container flex w-full max-w-[460px] flex-col px-4 py-4">
        <div className="space-y-5">
          <IdePicker />

          <section>
            <h3 className="mb-2 text-[11px] font-medium tracking-wide text-[var(--muted)]">Appearance</h3>
            <div role="radiogroup" aria-label="Appearance" className="grid grid-cols-2 gap-2 rounded-xl border border-[var(--line)] bg-[var(--bg2)] p-2 @min-[420px]:grid-cols-4">
              {APPEARANCES.map((mode) => {
                const preview = APPEARANCE_PREVIEW[mode];
                const isActive = appearance === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    role="radio"
                    aria-checked={isActive}
                    className={`mon-focus overflow-hidden rounded-lg border text-left transition ${
                      isActive ? "border-[var(--accent)] bg-[var(--sel)]" : "border-transparent hover:bg-[var(--hover)]"
                    }`}
                    onClick={() => chooseAppearance(mode)}
                  >
                    <span
                      className="relative block h-10 overflow-hidden"
                      style={{ background: `linear-gradient(145deg, ${preview.from}, ${preview.to})` }}
                      aria-hidden
                    >
                      <span className="absolute inset-x-1.5 top-1.5 bottom-1 rounded bg-black/20 ring-1 ring-white/15">
                        <span className="flex gap-0.5 px-1 py-0.5">
                          <span className="h-1 w-1 rounded-full bg-[#ff5f57]" />
                          <span className="h-1 w-1 rounded-full bg-[#febc2e]" />
                          <span className="h-1 w-1 rounded-full bg-[#28c840]" />
                        </span>
                      </span>
                    </span>
                    <span className="block truncate px-2 py-1.5 text-center text-[12px] font-medium">
                      {APPEARANCE_LABELS[mode]}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-[11px] font-medium tracking-wide text-[var(--muted)]">Saved servers</h3>
            {servers.length === 0 ? (
              <p className="m-0 rounded-xl border border-dashed border-[var(--line)] px-3 py-3 text-[12px] text-[var(--muted)]">
                No saved servers yet.
              </p>
            ) : (
              <ul className="m-0 overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--bg2)] p-0">
                {servers.map((server, index) => (
                  <li
                    key={server.id}
                    className={`flex items-center gap-2.5 px-3 py-2 ${index > 0 ? "border-t border-[var(--line)]" : ""}`}
                  >
                    <span className="grid h-7 w-7 place-items-center rounded-md bg-[var(--hover)] text-[var(--muted)]">
                      <Server size={14} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px]">{server.name}</span>
                      <span className="block truncate font-mono text-[10px] text-[var(--muted)]">
                        {server.username}@{server.host}{server.port !== 22 ? `:${server.port}` : ""}
                      </span>
                    </span>
                    <Button size="sm" variant="ghost" onClick={() => setServers(removeServer(server.id))}>
                      Delete
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <footer className="mt-5 flex items-center justify-between gap-3 border-t border-[var(--line)] pt-3">
          <div className="min-w-0">
            <p className="m-0 text-[11px] text-[var(--muted)]">Session</p>
            <p className="m-0 truncate font-mono text-[12px]">{connected || "Not connected"}</p>
          </div>
          <Button size="sm" variant="danger" icon={LogOut} onClick={onLogout}>
            Logout
          </Button>
        </footer>
      </div>
    </div>
  );
}
