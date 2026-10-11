import { useEffect, useRef, useState } from "react";
import { sessionApi } from "../../api/client";
import type { RemoteEditOpenResponse } from "../../api/types";
import { useRemoteEdit } from "../../state/remote-edit";
import { useSession } from "../../state/session";
import { useToast } from "../../state/toast";

function fileName(path: string): string {
  const name = path.split("/").filter(Boolean).pop();
  return name || path;
}

export function RemoteEditorWindow() {
  const { launch, closeRemoteEdit } = useRemoteEdit();
  const { meta } = useSession();
  const toast = useToast();
  const sessionId = meta?.session_id;
  const [state, setState] = useState<RemoteEditOpenResponse | null>(null);
  const [text, setText] = useState("");
  const [baseline, setBaseline] = useState("");
  const [busy, setBusy] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const textRef = useRef(text);
  const stateRef = useRef(state);
  const busyRef = useRef(busy);
  const baselineRef = useRef(baseline);
  const actionsRef = useRef({
    save: (_closeAfter: boolean) => Promise.resolve(),
    requestClose: () => {},
    dismissConfirm: () => {},
    isConfirming: false,
  });
  textRef.current = text;
  stateRef.current = state;
  baselineRef.current = baseline;

  useEffect(() => {
    if (!launch || !sessionId) return;
    let cancelled = false;
    setState(null);
    setText("");
    setBaseline("");
    setSavedAt(null);
    setConfirmClose(false);
    setBusy(true);
    sessionApi(sessionId)
      .remoteEditOpen(launch.path)
      .then((opened) => {
        if (cancelled) return;
        setState(opened);
        setText(opened.text);
        setBaseline(opened.text);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        toast(error instanceof Error ? error.message : "Could not open file");
        closeRemoteEdit();
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [launch, sessionId, toast, closeRemoteEdit]);

  useEffect(() => {
    if (state) areaRef.current?.focus();
  }, [state]);

  const isDirty = Boolean(state) && text !== baseline;

  async function save(closeAfter: boolean) {
    const current = stateRef.current;
    if (!sessionId || !current || busyRef.current) return;
    const content = textRef.current;
    busyRef.current = true;
    setBusy(true);
    setConfirmClose(false);
    try {
      await sessionApi(sessionId).remoteEditSave({
        edit_id: current.edit_id,
        content,
        exit_after: closeAfter,
      });
      baselineRef.current = content;
      setBaseline(content);
      setSavedAt(Date.now());
      if (closeAfter) closeRemoteEdit();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Save failed");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  function requestClose() {
    if (busyRef.current) return;
    if (stateRef.current && textRef.current !== baselineRef.current) {
      setConfirmClose(true);
      return;
    }
    void exitWithoutSaving();
  }

  actionsRef.current.save = save;
  actionsRef.current.requestClose = requestClose;
  actionsRef.current.dismissConfirm = () => setConfirmClose(false);
  actionsRef.current.isConfirming = confirmClose;

  useEffect(() => {
    if (!launch) return;
    const onKey = (event: KeyboardEvent) => {
      const command = event.metaKey || event.ctrlKey;
      if (command && event.key.toLowerCase() === "s") {
        event.preventDefault();
        event.stopPropagation();
        void actionsRef.current.save(false);
        return;
      }
      if (command && event.key.toLowerCase() === "w") {
        event.preventDefault();
        event.stopPropagation();
        actionsRef.current.requestClose();
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (actionsRef.current.isConfirming) {
          actionsRef.current.dismissConfirm();
          return;
        }
        actionsRef.current.requestClose();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [launch]);

  async function validate() {
    if (!sessionId || !state || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const result = await sessionApi(sessionId).remoteEditValidate(state.edit_id);
      toast(result.detail);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Check failed");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function reload() {
    if (!sessionId || !state || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const result = await sessionApi(sessionId).remoteEditReload(state.edit_id);
      toast(result.detail);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Reload failed");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function restore() {
    if (!sessionId || !state || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const result = await sessionApi(sessionId).remoteEditRestore(state.edit_id);
      baselineRef.current = result.text;
      setText(result.text);
      setBaseline(result.text);
      setSavedAt(Date.now());
      setConfirmClose(false);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Restore failed");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function exitWithoutSaving() {
    if (!sessionId || !state) {
      closeRemoteEdit();
      return;
    }
    try {
      await sessionApi(sessionId).remoteEditExit(state.edit_id);
    } catch {
      /* session may already be gone */
    }
    closeRemoteEdit();
  }

  if (!launch) return null;

  const path = state?.path ?? launch.path;
  const status = !state
    ? "Reading from the server…"
    : isDirty
      ? "Unsaved changes"
      : savedAt
        ? "Saved on the server"
        : "Opened from the server";

  return (
    <dialog open className="glass fixed inset-0 z-[85] m-auto flex h-[min(86vh,780px)] w-[min(960px,96vw)] flex-col overflow-hidden rounded-2xl p-0 text-[var(--text)]">
      <header className="flex items-center gap-3 border-b border-[var(--line)] px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-sm font-semibold">{fileName(path)}</h2>
            {isDirty && <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--accent)]" title="Unsaved changes" />}
          </div>
          <p className="truncate font-mono text-[11px] text-[var(--muted)]">{path}</p>
        </div>
        {state?.uses_sudo && (
          <span className="hidden rounded-full border border-[var(--line)] px-2 py-0.5 text-[11px] text-[var(--muted)] sm:inline">
            Saved with sudo
          </span>
        )}
        <button
          type="button"
          disabled={busy || !state || !isDirty}
          className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
          onClick={() => void save(false)}
        >
          Save
        </button>
        <button
          type="button"
          aria-label="Close"
          disabled={busy}
          className="rounded-lg border border-[var(--line)] px-2.5 py-1.5 text-xs"
          onClick={requestClose}
        >
          Close
        </button>
      </header>
      <textarea
        ref={areaRef}
        spellCheck={false}
        aria-label={fileName(path)}
        className="min-h-0 flex-1 resize-none bg-[var(--code-bg)] p-4 font-mono text-[13px] leading-relaxed text-[var(--code-text)] outline-none"
        value={text}
        disabled={!state || busy}
        onChange={(event) => setText(event.target.value)}
      />
      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--line)] px-4 py-2 text-[11px] text-[var(--muted)]">
        <span>{status}{busy && state ? "…" : ""}</span>
        <div className="flex flex-wrap gap-1.5">
          {state?.can_validate && (
            <button type="button" disabled={busy} className="rounded-lg border border-[var(--line)] px-2 py-1" onClick={() => void validate()}>
              Check config
            </button>
          )}
          {state?.can_reload && (
            <button type="button" disabled={busy} className="rounded-lg border border-[var(--line)] px-2 py-1" onClick={() => void reload()}>
              Reload service
            </button>
          )}
          <button type="button" disabled={busy || !state} className="rounded-lg border border-[var(--line)] px-2 py-1" onClick={() => void restore()}>
            Restore backup
          </button>
        </div>
      </footer>
      {confirmClose && (
        <div className="absolute inset-x-0 bottom-10 mx-auto flex w-[min(440px,92%)] items-center justify-between gap-3 rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-xs shadow-lg">
          <span>This file has unsaved changes.</span>
          <span className="flex shrink-0 gap-1.5">
            <button type="button" className="rounded-lg border border-[var(--line)] px-2 py-1" onClick={() => setConfirmClose(false)}>
              Keep editing
            </button>
            <button type="button" className="rounded-lg border border-[var(--line)] px-2 py-1" onClick={() => void exitWithoutSaving()}>
              Discard
            </button>
            <button type="button" className="rounded-lg bg-[var(--accent)] px-2 py-1 text-white" onClick={() => void save(true)}>
              Save
            </button>
          </span>
        </div>
      )}
    </dialog>
  );
}
