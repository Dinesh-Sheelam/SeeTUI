import { FileArchive, Pencil, Trash2, X } from "lucide-react";

const actionBase =
  "flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] transition-colors disabled:pointer-events-none disabled:opacity-40";
const action = `${actionBase} text-[var(--text)] hover:bg-[var(--hover)]`;
const dangerAction = `${actionBase} text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_14%,transparent)]`;

export function SelectionBar({
  count,
  isZipping,
  onRename,
  onZip,
  onDelete,
  onClear,
}: {
  count: number;
  isZipping: boolean;
  onRename: () => void;
  onZip: () => void;
  onDelete: () => void;
  onClear: () => void;
}) {
  if (!count) return null;
  return (
    <div
      role="toolbar"
      aria-label="Selection actions"
      className="selection-bar-enter absolute bottom-11 left-1/2 z-10 flex -translate-x-1/2 items-center gap-0.5 rounded-full border border-[var(--line)] bg-[var(--bg2)] p-1 shadow-[0_10px_30px_rgba(0,0,0,.28)]"
    >
      <span className="px-3 text-[13px] font-medium whitespace-nowrap tabular-nums">{count} selected</span>
      <span className="mx-0.5 h-5 w-px bg-[var(--line)]" aria-hidden />
      <button type="button" className={action} disabled={count !== 1} onClick={onRename} title={count === 1 ? "Rename" : "Select one item to rename"}>
        <Pencil size={14} /> <span className="max-sm:hidden">Rename</span>
      </button>
      <button type="button" className={action} disabled={isZipping} onClick={onZip} title="Compress to .zip">
        <FileArchive size={14} /> <span className="max-sm:hidden">{isZipping ? "Zipping…" : "Zip"}</span>
      </button>
      <button type="button" className={dangerAction} onClick={onDelete} title="Delete (⌘⌫)">
        <Trash2 size={14} /> <span className="max-sm:hidden">Delete</span>
      </button>
      <span className="mx-0.5 h-5 w-px bg-[var(--line)]" aria-hidden />
      <button type="button" className="grid h-8 w-8 place-items-center rounded-full text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--text)]" onClick={onClear} aria-label="Clear selection" title="Clear selection (Esc)">
        <X size={15} />
      </button>
    </div>
  );
}
