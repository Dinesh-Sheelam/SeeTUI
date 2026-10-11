import type { EditorId } from "../api/types";

export const EDITOR_IDS = ["code", "cursor", "antigravity", "kiro", "windsurf"] as const;

export const EDITOR_LABELS: Record<EditorId, string> = {
  code: "VS Code",
  cursor: "Cursor",
  antigravity: "Antigravity",
  kiro: "Kiro",
  windsurf: "Windsurf",
};

const STORAGE_KEY = "SeeTUI.editor";
const LEGACY_STORAGE_KEYS = ["seetui.editor", "VSC.editor"] as const;
const EVENT = "SeeTUI-editor";

export function isEditorId(value: string | null): value is EditorId {
  return EDITOR_IDS.includes(value as EditorId);
}

export function loadPreferredEditor(): EditorId | null {
  try {
    const raw =
      [STORAGE_KEY, ...LEGACY_STORAGE_KEYS].map((key) => localStorage.getItem(key)).find((value) => value) ?? null;
    return isEditorId(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function savePreferredEditor(id: EditorId): void {
  localStorage.setItem(STORAGE_KEY, id);
  for (const key of LEGACY_STORAGE_KEYS) localStorage.removeItem(key);
  window.dispatchEvent(new Event(EVENT));
}

export function editorLabel(id: EditorId): string {
  return EDITOR_LABELS[id];
}

export function subscribePreferredEditor(onChange: () => void): () => void {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}
