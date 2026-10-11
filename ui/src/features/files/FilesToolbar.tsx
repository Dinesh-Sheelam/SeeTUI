import {
  ChevronDown, ChevronLeft, ChevronRight, Copy, FilePlus, FolderPlus, HardDrive, Home, LayoutGrid, List,
  PanelLeft, Plus, Search, X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { FolderIcon } from "../../desktop/FolderIcon";

type Crumb = { label: string; path: string };

const MAX_CRUMBS = 4;

const iconButton =
  "grid h-8 w-8 place-items-center rounded-lg text-[var(--text)] transition-colors hover:bg-[var(--hover)] disabled:pointer-events-none disabled:opacity-35";
const softSurface = "bg-[var(--btn-soft)]";

function buildCrumbs(path: string, homePath: string): { root: Crumb & { isHome: boolean }; crumbs: Crumb[] } {
  const isHome = Boolean(homePath) && homePath !== "/" && (path === homePath || path.startsWith(`${homePath}/`));
  const base = isHome ? homePath : "/";
  const rest = path.slice(base.length).split("/").filter(Boolean);
  const crumbs = rest.map((label, i) => ({ label, path: `${base === "/" ? "" : base}/${rest.slice(0, i + 1).join("/")}` }));
  return { root: { label: isHome ? "Home" : "/", path: base, isHome }, crumbs };
}

function PathBar({
  path,
  homePath,
  isEditing,
  onEdit,
  onNavigate,
  onCopy,
}: {
  path: string;
  homePath: string;
  isEditing: boolean;
  onEdit: (isEditing: boolean) => void;
  onNavigate: (path: string) => void;
  onCopy: () => void;
}) {
  const [draft, setDraft] = useState(path);

  useEffect(() => { if (isEditing) setDraft(path); }, [isEditing, path]);

  if (isEditing) {
    return (
      <form
        className={`flex h-8 min-w-0 flex-1 basis-56 items-center gap-2 rounded-lg px-2.5 ring-2 ring-[var(--focus)] ${softSurface}`}
        onSubmit={(ev) => { ev.preventDefault(); onEdit(false); if (draft.trim() && draft.trim() !== path) onNavigate(draft.trim()); }}
      >
        <FolderIcon size={14} />
        <input
          autoFocus
          aria-label="Go to path"
          spellCheck={false}
          className="min-w-0 flex-1 bg-transparent font-mono text-[13px] text-[var(--text)] outline-none"
          value={draft}
          onFocus={(ev) => ev.currentTarget.select()}
          onChange={(ev) => setDraft(ev.target.value)}
          onKeyDown={(ev) => { if (ev.key === "Escape") { ev.preventDefault(); onEdit(false); } }}
          onBlur={() => onEdit(false)}
        />
        <kbd className="text-[11px] text-[var(--muted)]">↵</kbd>
      </form>
    );
  }

  const { root, crumbs } = buildCrumbs(path, homePath);
  const isCollapsed = crumbs.length > MAX_CRUMBS;
  const shown = isCollapsed ? [crumbs[0], ...crumbs.slice(-2)] : crumbs;
  const crumbClass = "max-w-40 truncate rounded-md px-1.5 py-0.5 text-[var(--muted)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--text)]";
  const separator = <ChevronRight size={12} className="shrink-0 text-[var(--muted)] opacity-60" aria-hidden />;

  return (
    <div
      className={`group/path flex h-8 min-w-0 flex-1 basis-56 cursor-text items-center gap-0.5 rounded-lg px-1.5 text-[13px] ${softSurface}`}
      onClick={(ev) => { if (ev.target === ev.currentTarget) onEdit(true); }}
      title="Click empty space or press ⌘L to type a path"
    >
      <nav aria-label="Path" className="flex min-w-0 items-center gap-0.5">
        <button
          type="button"
          className={`flex shrink-0 items-center gap-1.5 ${crumbs.length ? crumbClass : "rounded-md px-1.5 py-0.5 font-medium text-[var(--text)]"}`}
          onClick={() => onNavigate(root.path)}
          aria-current={crumbs.length ? undefined : "page"}
        >
          {root.isHome ? <Home size={14} /> : <HardDrive size={14} />}
          {root.isHome ? root.label : <span className={crumbs.length ? "sr-only" : ""}>Root</span>}
        </button>
        {shown.map((crumb, i) => {
          const isLast = i === shown.length - 1;
          return (
            <span key={crumb.path} className="flex min-w-0 items-center gap-0.5">
              {separator}
              {isCollapsed && i === 1 && (
                <>
                  <button type="button" className={crumbClass} onClick={() => onEdit(true)} aria-label="Show full path">…</button>
                  {separator}
                </>
              )}
              {isLast ? (
                <span aria-current="page" className="flex min-w-0 items-center gap-1.5 px-1.5 font-medium text-[var(--text)]">
                  <FolderIcon size={14} />
                  <span className="truncate">{crumb.label}</span>
                </span>
              ) : (
                <button type="button" className={crumbClass} onClick={() => onNavigate(crumb.path)}>{crumb.label}</button>
              )}
            </span>
          );
        })}
      </nav>
      <span className="flex-1 self-stretch" onClick={() => onEdit(true)} aria-hidden />
      <button
        type="button"
        className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-[var(--muted)] opacity-0 transition-opacity group-hover/path:opacity-100 hover:bg-[var(--hover)] hover:text-[var(--text)] focus-visible:opacity-100"
        onClick={onCopy}
        aria-label="Copy path"
        title="Copy path"
      >
        <Copy size={13} />
      </button>
    </div>
  );
}

function NewMenu({ onNewFolder, onNewFile }: { onNewFolder: () => void; onNewFile: () => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const onDown = (ev: PointerEvent) => { if (!rootRef.current?.contains(ev.target as Node)) setIsOpen(false); };
    const onKey = (ev: KeyboardEvent) => { if (ev.key === "Escape") setIsOpen(false); };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [isOpen]);

  const item = "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] hover:bg-[var(--hover)]";
  const pick = (action: () => void) => { setIsOpen(false); action(); };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        className="flex h-8 items-center gap-1 rounded-lg bg-[var(--btn)] pr-2 pl-2.5 text-[13px] font-medium text-[var(--on-btn)] transition-[filter] hover:brightness-110 active:brightness-95"
        onClick={() => setIsOpen((v) => !v)}
      >
        <Plus size={14} strokeWidth={2.25} /> New <ChevronDown size={12} className="opacity-70" />
      </button>
      {isOpen && (
        <menu role="menu" className="absolute top-9 right-0 z-30 m-0 w-44 rounded-xl border border-[var(--line)] bg-[var(--bg2)] p-1 shadow-xl">
          <button type="button" role="menuitem" className={item} onClick={() => pick(onNewFolder)}><FolderPlus size={15} /> New folder</button>
          <button type="button" role="menuitem" className={item} onClick={() => pick(onNewFile)}><FilePlus size={15} /> New file</button>
        </menu>
      )}
    </div>
  );
}

export function FilesToolbar({
  path,
  homePath,
  canGoBack,
  canGoForward,
  onBack,
  onForward,
  onNavigate,
  isEditingPath,
  onEditPath,
  onCopyPath,
  filter,
  onFilter,
  filterRef,
  isGrid,
  onGrid,
  onNewFolder,
  onNewFile,
  onToggleSidebar,
}: {
  path: string;
  homePath: string;
  canGoBack: boolean;
  canGoForward: boolean;
  onBack: () => void;
  onForward: () => void;
  onNavigate: (path: string) => void;
  isEditingPath: boolean;
  onEditPath: (isEditing: boolean) => void;
  onCopyPath: () => void;
  filter: string;
  onFilter: (value: string) => void;
  filterRef: RefObject<HTMLInputElement | null>;
  isGrid: boolean;
  onGrid: (isGrid: boolean) => void;
  onNewFolder: () => void;
  onNewFile: () => void;
  onToggleSidebar: () => void;
}) {
  const viewOption = (isActive: boolean) =>
    `grid h-7 w-8 place-items-center rounded-md transition-colors ${isActive ? "bg-[var(--bg2)] text-[var(--text)] shadow-sm" : "text-[var(--muted)] hover:text-[var(--text)]"}`;

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-[var(--line)] px-2.5 py-2">
      <button type="button" className={`${iconButton} md:hidden`} onClick={onToggleSidebar} aria-label="Locations"><PanelLeft size={16} /></button>
      <div className="flex items-center">
        <button type="button" className={iconButton} disabled={!canGoBack} onClick={onBack} aria-label="Back" title="Back (⌘[)"><ChevronLeft size={18} /></button>
        <button type="button" className={iconButton} disabled={!canGoForward} onClick={onForward} aria-label="Forward" title="Forward (⌘])"><ChevronRight size={18} /></button>
      </div>
      <PathBar path={path} homePath={homePath} isEditing={isEditingPath} onEdit={onEditPath} onNavigate={onNavigate} onCopy={onCopyPath} />
      <label className={`flex h-8 w-44 items-center gap-1.5 xl:w-60 rounded-lg px-2.5 transition-shadow focus-within:ring-2 focus-within:ring-[var(--focus)] max-sm:w-full max-sm:order-last ${softSurface}`}>
        <Search size={14} className="shrink-0 text-[var(--muted)]" />
        <input
          ref={filterRef}
          aria-label="Filter items"
          className="min-w-0 flex-1 bg-transparent text-[13px] text-[var(--text)] outline-none placeholder:text-[var(--muted)]"
          placeholder="Filter"
          value={filter}
          onChange={(ev) => onFilter(ev.target.value)}
          onKeyDown={(ev) => { if (ev.key === "Escape") { onFilter(""); ev.currentTarget.blur(); } }}
        />
        {filter ? (
          <button type="button" className="grid h-5 w-5 place-items-center rounded-full text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--text)]" onClick={() => onFilter("")} aria-label="Clear filter"><X size={12} /></button>
        ) : (
          <kbd className="rounded border border-[var(--line)] px-1 font-sans text-[10px] leading-4 text-[var(--muted)]">/</kbd>
        )}
      </label>
      <div role="radiogroup" aria-label="View" className={`flex h-8 items-center rounded-lg p-0.5 ${softSurface}`}>
        <button type="button" role="radio" aria-checked={!isGrid} aria-label="List view" title="List" className={viewOption(!isGrid)} onClick={() => onGrid(false)}><List size={15} /></button>
        <button type="button" role="radio" aria-checked={isGrid} aria-label="Grid view" title="Grid" className={viewOption(isGrid)} onClick={() => onGrid(true)}><LayoutGrid size={15} /></button>
      </div>
      <NewMenu onNewFolder={onNewFolder} onNewFile={onNewFile} />
    </div>
  );
}
