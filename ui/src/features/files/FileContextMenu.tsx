import { Code, Copy, Download, Eye, FileArchive, FilePenLine, FolderOpen, Pencil, TerminalSquare, Trash2 } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import type { FileEntry } from "../../api/types";
import { FolderIcon } from "../../desktop/FolderIcon";
import { isEditableFile } from "../../lib/file-type";

type MenuAction = {
  label: string;
  icon: ReactNode;
  shortcut?: string;
  isDanger?: boolean;
  isDisabled?: boolean;
  onSelect: () => void;
};

const EDGE = 8;

export function FileContextMenu({
  x,
  y,
  targets,
  isZipping,
  onOpen,
  onOpenEditor,
  onEditOnServer,
  editorName,
  canOpenEditor,
  onOpenTerminal,
  onDownload,
  onRename,
  onZip,
  onCopyPath,
  onDelete,
  onClose,
}: {
  x: number;
  y: number;
  targets: FileEntry[];
  isZipping: boolean;
  onOpen: (entry: FileEntry) => void;
  onOpenEditor: (entry: FileEntry) => void;
  onEditOnServer: (entry: FileEntry) => void;
  editorName: string;
  canOpenEditor: boolean;
  onOpenTerminal: () => void;
  onDownload: (entry: FileEntry) => void;
  onRename: (entry: FileEntry) => void;
  onZip: (entries: FileEntry[]) => void;
  onCopyPath: (entries: FileEntry[]) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: x, top: y, origin: "top left" });
  const primary = targets[0];
  const isSingle = targets.length === 1;

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const { width, height } = menu.getBoundingClientRect();
    const flipX = x + width + EDGE > window.innerWidth;
    const flipY = y + height + EDGE > window.innerHeight;
    setPosition({
      left: Math.max(EDGE, flipX ? x - width : x),
      top: Math.max(EDGE, flipY ? y - height : y),
      origin: `${flipY ? "bottom" : "top"} ${flipX ? "right" : "left"}`,
    });
    menu.querySelector<HTMLButtonElement>("[role=menuitem]:not(:disabled)")?.focus();
  }, [x, y]);

  useEffect(() => {
    const onPointerDown = (ev: PointerEvent) => { if (!menuRef.current?.contains(ev.target as Node)) onClose(); };
    const onDismiss = () => onClose();
    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("resize", onDismiss);
    window.addEventListener("blur", onDismiss);
    document.addEventListener("scroll", onDismiss, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("resize", onDismiss);
      window.removeEventListener("blur", onDismiss);
      document.removeEventListener("scroll", onDismiss, true);
    };
  }, [onClose]);

  if (!primary) return null;

  const run = (action: () => void) => () => { onClose(); action(); };
  const openInEditor: MenuAction = {
    label: editorName ? `Open in ${editorName}` : "Open in IDE",
    icon: <Code size={15} />,
    isDisabled: !canOpenEditor,
    onSelect: run(() => onOpenEditor(primary)),
  };
  const openGroup: MenuAction[] = isSingle
    ? primary.is_dir
      ? [
          { label: "Open", icon: <FolderOpen size={15} />, shortcut: "↵", onSelect: run(() => onOpen(primary)) },
          { label: "Open in Terminal", icon: <TerminalSquare size={15} />, onSelect: run(onOpenTerminal) },
          openInEditor,
        ]
      : [
          ...(isEditableFile(primary)
            ? [{ label: "Edit", icon: <FilePenLine size={15} />, shortcut: "↵", onSelect: run(() => onEditOnServer(primary)) }]
            : []),
          { label: "Quick Look", icon: <Eye size={15} />, shortcut: "Space", onSelect: run(() => onOpen(primary)) },
          openInEditor,
          { label: "Download", icon: <Download size={15} />, onSelect: run(() => onDownload(primary)) },
        ]
    : [];
  const editGroup: MenuAction[] = [
    { label: "Rename", icon: <Pencil size={15} />, isDisabled: !isSingle, onSelect: run(() => onRename(primary)) },
    {
      label: isSingle ? "Compress to .zip" : `Compress ${targets.length} items`,
      icon: <FileArchive size={15} />,
      isDisabled: isZipping,
      onSelect: run(() => onZip(targets)),
    },
    { label: isSingle ? "Copy path" : "Copy paths", icon: <Copy size={15} />, onSelect: run(() => onCopyPath(targets)) },
  ];
  const dangerGroup: MenuAction[] = [
    { label: isSingle ? "Delete" : `Delete ${targets.length} items`, icon: <Trash2 size={15} />, shortcut: "⌘⌫", isDanger: true, onSelect: run(onDelete) },
  ];
  const groups = [openGroup, editGroup, dangerGroup].filter((group) => group.length);

  const onKeyDown = (ev: KeyboardEvent<HTMLDivElement>) => {
    if (ev.key === "Escape") { ev.preventDefault(); onClose(); return; }
    if (ev.key !== "ArrowDown" && ev.key !== "ArrowUp") return;
    ev.preventDefault();
    const items = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]:not(:disabled)") ?? [])];
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    const step = ev.key === "ArrowDown" ? 1 : -1;
    items[(index + step + items.length) % items.length]?.focus();
  };

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label={isSingle ? `Actions for ${primary.name}` : `Actions for ${targets.length} items`}
      className="context-menu-enter fixed z-[70] w-56 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-1 text-[13px] text-[var(--text)] shadow-[0_12px_32px_rgba(0,0,0,.32)] backdrop-blur-xl"
      style={{ left: position.left, top: position.top, transformOrigin: position.origin }}
      onKeyDown={onKeyDown}
      onContextMenu={(ev) => ev.preventDefault()}
    >
      <div className="flex items-center gap-2 px-2.5 pt-1.5 pb-2 text-[12px] text-[var(--muted)]">
        {primary.is_dir || !isSingle ? <FolderIcon size={14} /> : null}
        <span className="truncate font-medium">{isSingle ? primary.name : `${targets.length} items selected`}</span>
      </div>
      {groups.map((group, groupIndex) => (
        <div key={groupIndex} role="group" className="border-t border-[var(--line)] py-1">
          {group.map(({ label, icon, shortcut, isDanger, isDisabled, onSelect }) => (
            <button
              key={label}
              type="button"
              role="menuitem"
              disabled={isDisabled}
              onClick={onSelect}
              className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left outline-none disabled:opacity-40 ${
                isDanger
                  ? "text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_14%,transparent)] focus-visible:bg-[color-mix(in_srgb,var(--danger)_14%,transparent)]"
                  : "hover:bg-[var(--hover)] focus-visible:bg-[var(--hover)]"
              }`}
            >
              <span className={`shrink-0 ${isDanger ? "" : "text-[var(--muted)]"}`}>{icon}</span>
              <span className="flex-1 truncate">{label}</span>
              {shortcut && <kbd className="font-sans text-[11px] text-[var(--muted)]">{shortcut}</kbd>}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
