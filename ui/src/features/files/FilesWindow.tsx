import { ArrowDown, ArrowUp, File, FileArchive, FileAudio, FileCode, FileImage, FileText, FileVideo, Home } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent } from "react";
import type { FileEntry } from "../../api/types";
import { useDesktop } from "../../desktop/desktop-context";
import { FolderIcon } from "../../desktop/FolderIcon";
import { downloadFile } from "../../lib/download";
import { fmtDate, fmtModified, fmtSize, isEditableFile, joinPath, kindLabel, viewerKind } from "../../lib/file-type";
import { editorLabel, loadPreferredEditor, subscribePreferredEditor } from "../../state/editor";
import { useRemoteEdit } from "../../state/remote-edit";
import { useSession } from "../../state/session";
import { useToast } from "../../state/toast";
import { Viewer } from "../viewers/Viewer";
import { FileContextMenu } from "./FileContextMenu";
import { FilesToolbar } from "./FilesToolbar";
import { SelectionBar } from "./SelectionBar";

const locations = ["/", "/tmp", "/var/log", "/etc"];

function locationIsCurrent(location: string, current: string): boolean {
  if (location === "/") return current === "/";
  return current === location || current.startsWith(`${location}/`);
}

function sidebarItemClass(isActive: boolean): string {
  return `flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left transition-colors ${
    isActive
      ? "bg-[var(--sel)] font-medium text-[var(--text)]"
      : "text-[var(--text)] hover:bg-[var(--hover)]"
  }`;
}

type NavMotion = "forward" | "back" | "none";
type SortKey = "name" | "mtime" | "size" | "kind";

const nameCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

const LIST_COLUMNS =
  "grid grid-cols-[minmax(0,1fr)_72px] gap-4 px-4 @xl:grid-cols-[minmax(0,1fr)_150px_72px] @2xl:grid-cols-[minmax(0,1fr)_96px_150px_72px] @3xl:grid-cols-[minmax(0,1fr)_96px_150px_72px_120px] @4xl:grid-cols-[minmax(0,2.4fr)_minmax(104px,0.7fr)_minmax(160px,1fr)_minmax(80px,0.5fr)_minmax(130px,0.9fr)] @4xl:gap-6 @4xl:px-6";

const COLUMNS: { key: SortKey | null; label: string; className: string }[] = [
  { key: "name", label: "Name", className: "" },
  { key: null, label: "Permissions", className: "hidden @2xl:flex" },
  { key: "mtime", label: "Modified", className: "hidden @xl:flex" },
  { key: "size", label: "Size", className: "justify-end" },
  { key: "kind", label: "Kind", className: "hidden @3xl:flex" },
];
type RenameDraft = { path: string; draft: string };

const doubleClickMs = 450;

function inferMotion(from: string, to: string): NavMotion {
  const current = from.replace(/\/$/, "") || "/";
  const next = to.replace(/\/$/, "") || "/";
  if (next === current) return "none";
  const currentPrefix = current === "/" ? "/" : `${current}/`;
  const nextPrefix = next === "/" ? "/" : `${next}/`;
  if (next.startsWith(currentPrefix)) return "forward";
  if (current.startsWith(nextPrefix)) return "back";
  return "forward";
}

function isSafeName(name: string): boolean {
  return Boolean(name) && name !== "." && name !== ".." && !name.includes("/") && !name.includes("\\");
}

export function FilesWindow() {
  const { api, meta } = useSession();
  const { focused, openApp } = useDesktop();
  const toast = useToast();
  const { openRemoteEdit } = useRemoteEdit();
  const [preferredEditor, setPreferredEditor] = useState(loadPreferredEditor);
  const [path, setPath] = useState(meta?.home || "/");
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const [grid, setGrid] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
  const [prompt, setPrompt] = useState(false);
  const [viewer, setViewer] = useState<FileEntry | null>(null);
  const [ctx, setCtx] = useState<{ x: number; y: number; path: string } | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const [sideOpen, setSideOpen] = useState(false);
  const [listing, setListing] = useState(false);
  const [motion, setMotion] = useState<NavMotion>("none");
  const [opening, setOpening] = useState<string | null>(null);
  const [zipping, setZipping] = useState(false);
  const [renaming, setRenaming] = useState<RenameDraft | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; isAscending: boolean }>({ key: "name", isAscending: true });
  const pathRef = useRef(path);
  const requestRef = useRef(0);
  const lastClickRef = useRef<{ path: string; at: number } | null>(null);
  const renamingRef = useRef<RenameDraft | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLInputElement>(null);
  pathRef.current = path;

  function EntryIcon({ entry, size = 16 }: { entry: FileEntry; size?: number }) {
    const kind = viewerKind(entry);
    const cls = "shrink-0 text-[var(--muted)]";
    if (entry.is_dir) return <FolderIcon size={size + 2} />;
    if (kind === "image") return <FileImage size={16} className={cls} />;
    if (kind === "video") return <FileVideo size={16} className={cls} />;
    if (kind === "audio") return <FileAudio size={16} className={cls} />;
    if (kind === "pdf") return <FileText size={16} className={cls} />;
    if (kind === "code") return <FileCode size={16} className={cls} />;
    if (kind === "text") return <FileText size={16} className={cls} />;
    if (/\.(zip|tar|gz|tgz)$/.test(entry.name)) return <FileArchive size={16} className={cls} />;
    return <File size={16} className={cls} />;
  }

  const openPath = useCallback(async (next: string, push = true, motionOverride?: NavMotion) => {
    if (!api) return;
    const request = ++requestRef.current;
    setListing(true);
    try {
      const data = await api.files(next);
      if (request !== requestRef.current) return;
      const nextMotion = motionOverride ?? inferMotion(pathRef.current, data.path);
      setMotion(nextMotion);
      pathRef.current = data.path;
      setPath(data.path);
      setEntries(data.entries);
      setSelected(new Set());
      renamingRef.current = null;
      setRenaming(null);
      if (push) {
        setHistory((prev) => {
          const cut = prev.slice(0, histIdx + 1);
          return [...cut, data.path];
        });
        setHistIdx((i) => i + 1);
      }
    } catch (err) {
      if (request !== requestRef.current) return;
      toast(err instanceof Error ? err.message : "List failed");
    } finally {
      if (request === requestRef.current) {
        setListing(false);
        setOpening(null);
      }
    }
  }, [api, histIdx, toast]);

  useEffect(() => { if (meta) void openPath(meta.home || "/", true, "none"); }, [meta?.session_id]);
  useEffect(() => { scrollerRef.current?.scrollTo({ top: 0 }); }, [path]);
  useEffect(() => subscribePreferredEditor(() => setPreferredEditor(loadPreferredEditor())), []);

  const visible = useMemo(() => {
    const q = filter.toLowerCase();
    const direction = sort.isAscending ? 1 : -1;
    const value = (entry: FileEntry): string | number => {
      if (sort.key === "mtime") return entry.mtime;
      if (sort.key === "size") return entry.is_dir ? -1 : entry.size;
      if (sort.key === "kind") return kindLabel(entry);
      return entry.name;
    };
    return entries
      .filter((e) => !q || e.name.toLowerCase().includes(q))
      .sort((a, b) => {
        if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
        const left = value(a);
        const right = value(b);
        const order = typeof left === "number" && typeof right === "number"
          ? left - right
          : nameCollator.compare(String(left), String(right));
        return (order || nameCollator.compare(a.name, b.name)) * direction;
      });
  }, [entries, filter, sort]);

  function toggleSort(key: SortKey) {
    setSort((current) => current.key === key ? { key, isAscending: !current.isAscending } : { key, isAscending: key === "name" || key === "kind" });
  }

  const closeContextMenu = useCallback(() => setCtx(null), []);

  function openContextMenu(event: MouseEvent, entry: FileEntry) {
    event.preventDefault();
    if (!selected.has(entry.path)) setSelected(new Set([entry.path]));
    setCtx({ x: event.clientX, y: event.clientY, path: entry.path });
  }

  async function downloadEntry(entry: FileEntry) {
    if (!api) return;
    const result = await downloadFile(api.downloadUrl(entry.path), entry.name);
    if (result === "cancelled") toast("Save cancelled");
  }

  async function copyPaths(items: FileEntry[]) {
    try {
      await navigator.clipboard.writeText(items.map((item) => item.path).join("\n"));
      toast(items.length === 1 ? "Path copied" : `${items.length} paths copied`);
    } catch {
      toast("Clipboard unavailable");
    }
  }

  const selectedItems = entries.filter((e) => selected.has(e.path));
  const canGoBack = histIdx > 0;
  const canGoForward = histIdx < history.length - 1;

  function goBack() {
    if (!canGoBack) return;
    setHistIdx(histIdx - 1);
    void openPath(history[histIdx - 1], false, "back");
  }

  function goForward() {
    if (!canGoForward) return;
    setHistIdx(histIdx + 1);
    void openPath(history[histIdx + 1], false, "forward");
  }

  function goUp() {
    if (path === "/") return;
    void openPath(path.replace(/\/[^/]+$/, "") || "/", true, "back");
  }

  async function copyPath() {
    try {
      await navigator.clipboard.writeText(path);
      toast("Path copied");
    } catch {
      toast("Clipboard unavailable");
    }
  }

  async function openInEditor(entry: FileEntry) {
    if (!api || !preferredEditor) {
      toast("Choose an editor in the menu bar first");
      return;
    }
    try {
      const result = await api.openEditor({
        editor: preferredEditor,
        path: entry.path,
        kind: entry.is_dir ? "dir" : "file",
      });
      toast(result.message);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not open the editor");
    }
  }

  function activate(entry: FileEntry) {
    if (renamingRef.current) return;
    if (entry.is_dir) {
      setOpening(entry.path);
      void openPath(entry.path, true, "forward");
      return;
    }
    if (isEditableFile(entry)) {
      openRemoteEdit(entry.path);
      return;
    }
    setViewer(entry);
  }

  function onEntryClick(event: MouseEvent, entry: FileEntry) {
    event.stopPropagation();
    setCtx(null);
    if (renamingRef.current?.path === entry.path) return;
    const now = Date.now();
    const previous = lastClickRef.current;
    const isDouble = Boolean(previous && previous.path === entry.path && now - previous.at < doubleClickMs);
    lastClickRef.current = isDouble ? null : { path: entry.path, at: now };
    if (isDouble || event.detail > 1) {
      event.preventDefault();
      activate(entry);
      return;
    }
    setSelected(event.metaKey || event.ctrlKey ? new Set([...selected, entry.path]) : new Set([entry.path]));
  }

  function blockWordSelection(event: MouseEvent) {
    if ((event.target as HTMLElement).closest("input, textarea")) return;
    if (event.detail > 1) event.preventDefault();
  }

  function startRename(entry: FileEntry) {
    const next = { path: entry.path, draft: entry.name };
    renamingRef.current = next;
    setRenaming(next);
    setCtx(null);
    setSelected(new Set([entry.path]));
  }

  function cancelRename() {
    renamingRef.current = null;
    setRenaming(null);
  }

  async function commitRename() {
    const current = renamingRef.current;
    if (!api || !current) return;
    renamingRef.current = null;
    setRenaming(null);
    const item = entries.find((entry) => entry.path === current.path);
    if (!item) return;
    const name = current.draft.trim();
    if (!name || name === item.name) return;
    if (!isSafeName(name)) {
      toast("Use a name without slashes");
      return;
    }
    try {
      await api.rename(item.path, joinPath(path, name));
      toast("Renamed");
      void openPath(path, false, "none");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Rename failed");
    }
  }

  function renameField(entry: FileEntry) {
    if (renaming?.path !== entry.path) return <span className="truncate">{entry.name}</span>;
    return (
      <input
        autoFocus
        aria-label={`Rename ${entry.name}`}
        spellCheck={false}
        className="min-w-0 flex-1 select-text rounded border border-[var(--blue)] bg-[var(--bg)] px-1.5 py-0.5 text-sm text-[var(--text)] outline-none"
        value={renaming.draft}
        onFocus={(event) => event.currentTarget.select()}
        onChange={(event) => {
          const next = { path: entry.path, draft: event.target.value };
          renamingRef.current = next;
          setRenaming(next);
        }}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            void commitRename();
          } else if (event.key === "Escape") {
            event.preventDefault();
            cancelRename();
          }
        }}
        onBlur={() => void commitRename()}
      />
    );
  }

  async function newFolder() {
    if (!api) return;
    const dest = joinPath(path, "untitled-folder");
    try {
      await api.mkdir(dest);
      toast("Folder created");
      void openPath(path, false);
    } catch (err) { toast(err instanceof Error ? err.message : "Failed"); }
  }

  async function newFile() {
    if (!api) return;
    const dest = joinPath(path, "untitled.txt");
    try {
      await api.createFile(dest);
      toast("File created");
      void openPath(path, false);
    } catch (err) { toast(err instanceof Error ? err.message : "Failed"); }
  }

  async function doDelete() {
    if (!api) return;
    setConfirmDel(false);
    try {
      for (const item of selectedItems) await api.remove(item.path, item.is_dir);
      toast("Deleted");
      void openPath(path, false);
    } catch (err) { toast(err instanceof Error ? err.message : "Delete failed"); }
  }

  async function zipItems(items: FileEntry[]) {
    if (!api || !items.length || zipping) return;
    const archiveName = items.length === 1 ? items[0].name : "archive";
    setZipping(true);
    setCtx(null);
    toast(items.length === 1 ? `Zipping ${items[0].name}…` : "Zipping selection…");
    try {
      try {
        await api.archive({ paths: items.map((entry) => entry.path), format: "zip", archive_name: archiveName });
      } catch (err) {
        const message = err instanceof Error ? err.message : "";
        if (!message.includes("zip is not installed")) throw err;
        toast("zip is not installed on the server. Using tar.gz instead.");
        await api.archive({ paths: items.map((entry) => entry.path), format: "tar.gz", archive_name: archiveName });
      }
      toast("Archive created");
      void openPath(path, false, "none");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Zip failed");
    } finally {
      setZipping(false);
    }
  }

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (focused !== "files") return;
      const cmd = ev.metaKey || ev.ctrlKey;
      const inField = Boolean((ev.target as HTMLElement).matches?.("input, textarea"));
      if (cmd && (ev.key === "k" || ev.key === "l")) { ev.preventDefault(); setPrompt(true); return; }
      if (inField) return;
      if (ev.key === "/") { ev.preventDefault(); filterRef.current?.focus(); return; }
      if (ev.key === "Escape" && selectedItems.length) { setSelected(new Set()); return; }
      if (cmd && ev.key === "[") { ev.preventDefault(); goBack(); return; }
      if (cmd && ev.key === "]") { ev.preventDefault(); goForward(); return; }
      if (cmd && ev.key === "ArrowUp") { ev.preventDefault(); goUp(); return; }
      if (cmd && ev.key === "Backspace" && selectedItems.length) { ev.preventDefault(); setConfirmDel(true); return; }
      if (ev.key === "Enter" && selectedItems.length === 1) { ev.preventDefault(); activate(selectedItems[0]); return; }
      if (ev.key === " ") { ev.preventDefault(); if (selectedItems[0] && !selectedItems[0].is_dir) setViewer(selectedItems[0]); }
      if (cmd && ev.key === "a") { ev.preventDefault(); setSelected(new Set(visible.map((e) => e.path))); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  const homePath = meta?.home ?? "";
  const activeLocation = locations
    .filter((location) => locationIsCurrent(location, path))
    .sort((a, b) => b.length - a.length)[0];
  const homeActive = Boolean(homePath) && !activeLocation && (path === homePath || path.startsWith(`${homePath}/`));

  return (
    <div className="flex h-full min-h-0">
      <aside className={`w-44 shrink-0 xl:w-52 overflow-auto border-r border-[var(--line)] p-2 text-sm max-md:absolute max-md:inset-y-0 max-md:left-0 max-md:z-10 max-md:bg-[var(--bg2)] ${sideOpen ? "" : "max-md:hidden"}`}>
        <p className="px-2 text-[11px] tracking-wide text-[var(--muted)] uppercase">Favorites</p>
        <button type="button" aria-current={homeActive ? "page" : undefined} className={sidebarItemClass(homeActive)} onClick={() => { setSideOpen(false); void openPath("~"); }}><Home size={14} /> Home</button>
        <p className="mt-2 px-2 text-[11px] tracking-wide text-[var(--muted)] uppercase">Locations</p>
        {locations.map((location) => {
          const isActive = activeLocation === location;
          return (
            <button key={location} type="button" aria-current={isActive ? "page" : undefined} className={sidebarItemClass(isActive)} onClick={() => { setSideOpen(false); void openPath(location); }}>
              <FolderIcon size={16} /> {location}
            </button>
          );
        })}
      </aside>
      <div className="relative flex min-w-0 flex-1 flex-col">
        <FilesToolbar
          path={path}
          homePath={homePath}
          canGoBack={canGoBack}
          canGoForward={canGoForward}
          onBack={goBack}
          onForward={goForward}
          onNavigate={(next) => void openPath(next)}
          isEditingPath={prompt}
          onEditPath={setPrompt}
          onCopyPath={() => void copyPath()}
          filter={filter}
          onFilter={setFilter}
          filterRef={filterRef}
          isGrid={grid}
          onGrid={setGrid}
          onNewFolder={() => void newFolder()}
          onNewFile={() => void newFile()}
          onToggleSidebar={() => setSideOpen((v) => !v)}
        />
        {listing && (
          <div className="h-0.5 overflow-hidden bg-[var(--line)]" aria-hidden>
            <div className="folder-progress h-full w-1/3 bg-[var(--blue)]" />
          </div>
        )}
        <div
          ref={scrollerRef}
          className={`min-h-0 flex-1 overflow-auto select-none transition-opacity duration-150 ${listing ? "opacity-60" : "opacity-100"}`}
          aria-busy={listing}
          onClick={() => setCtx(null)}
        >
          <div key={path} className={`${motion === "forward" ? "folder-enter-forward" : motion === "back" ? "folder-enter-back" : ""} ${selectedItems.length ? "pb-16" : ""}`}>
          {grid ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-2 p-3">
              {visible.map((entry) => (
                <div key={entry.path} title={`${entry.name}\n${kindLabel(entry)} · ${fmtModified(entry.mtime)}`} className={`flex cursor-pointer flex-col items-center gap-1 rounded-xl p-2 text-center text-xs transition-colors duration-150 ${opening === entry.path || selected.has(entry.path) ? "bg-[var(--sel)]" : "hover:bg-[color-mix(in_srgb,var(--text)_10%,transparent)]"}`} onMouseDown={blockWordSelection} onClick={(event) => onEntryClick(event, entry)} onContextMenu={(event) => openContextMenu(event, entry)}>
                  <EntryIcon entry={entry} size={36} />
                  <span className="w-full min-w-0">{renameField(entry)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div role="table" aria-label="Files" className="@container text-[13px]">
              <div role="row" className={`${LIST_COLUMNS} sticky top-0 z-[1] border-b border-[var(--line)] bg-[var(--bg2)] py-1.5 text-[11px] @4xl:py-2 font-medium tracking-wide text-[var(--muted)] uppercase`}>
                {COLUMNS.map(({ key, label, className }) => {
                  const isActive = key !== null && sort.key === key;
                  const ariaSort = isActive ? (sort.isAscending ? "ascending" : "descending") : undefined;
                  if (!key) return <span key={label} role="columnheader" className={`items-center ${className}`}>{label}</span>;
                  return (
                    <button
                      key={label}
                      type="button"
                      role="columnheader"
                      aria-sort={ariaSort}
                      className={`flex items-center gap-1 uppercase transition-colors hover:text-[var(--text)] ${isActive ? "text-[var(--text)]" : ""} ${className}`}
                      onClick={() => toggleSort(key)}
                    >
                      {label}
                      {isActive && (sort.isAscending ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
                    </button>
                  );
                })}
              </div>
              {visible.map((entry, index) => {
                const isSelected = opening === entry.path || selected.has(entry.path);
                const rowTone = isSelected
                  ? "bg-[var(--sel)]"
                  : `${index % 2 ? "bg-[color-mix(in_srgb,var(--text)_3%,transparent)]" : ""} hover:bg-[color-mix(in_srgb,var(--text)_9%,transparent)]`;
                return (
                  <div
                    key={entry.path}
                    role="row"
                    aria-selected={isSelected}
                    className={`${LIST_COLUMNS} h-8 items-center @4xl:h-9 @4xl:text-[13.5px] transition-colors duration-150 ${entry.is_dir || isEditableFile(entry) ? "cursor-pointer" : "cursor-default"} ${rowTone}`}
                    onMouseDown={blockWordSelection}
                    onClick={(event) => onEntryClick(event, entry)}
                    onContextMenu={(event) => openContextMenu(event, entry)}
                  >
                    <span role="cell" className="flex min-w-0 items-center gap-2.5">
                      <EntryIcon entry={entry} />
                      {renameField(entry)}
                    </span>
                    <span role="cell" className="hidden font-mono text-[12px] text-[var(--muted)] @2xl:block">{entry.permissions}</span>
                    <span role="cell" className="hidden truncate whitespace-nowrap text-[var(--muted)] @xl:block" title={fmtDate(entry.mtime)}>{fmtModified(entry.mtime)}</span>
                    <span role="cell" className={`text-right tabular-nums ${entry.is_dir ? "text-[var(--muted)]" : ""}`}>{entry.is_dir ? "—" : fmtSize(entry.size)}</span>
                    <span role="cell" className="hidden truncate text-[var(--muted)] @3xl:block">{kindLabel(entry)}</span>
                  </div>
                );
              })}
            </div>
          )}
          </div>
        </div>
        <SelectionBar
          count={selectedItems.length}
          isZipping={zipping}
          onRename={() => { if (selectedItems.length === 1) startRename(selectedItems[0]); }}
          onZip={() => void zipItems(selectedItems)}
          onDelete={() => setConfirmDel(true)}
          onClear={() => setSelected(new Set())}
        />
        <footer className="flex justify-between border-t border-[var(--line)] px-3 py-1.5 font-mono text-[11px] text-[var(--muted)]">
          <span>{visible.length} items</span>
          <span>{meta ? `${meta.username}@${meta.host}` : ""}</span>
        </footer>
      </div>
      {ctx && (
        <FileContextMenu
          x={ctx.x}
          y={ctx.y}
          targets={selected.has(ctx.path) && selectedItems.length > 1 ? selectedItems : entries.filter((e) => e.path === ctx.path)}
          isZipping={zipping}
          onOpen={(entry) => {
            if (entry.is_dir) {
              activate(entry);
              return;
            }
            setViewer(entry);
          }}
          onOpenEditor={(entry) => {
            const clicked = entries.find((item) => item.path === ctx.path) ?? entry;
            void openInEditor(clicked);
          }}
          onEditOnServer={(entry) => {
            const clicked = entries.find((item) => item.path === ctx.path) ?? entry;
            if (clicked.is_dir) {
              toast("Choose a file to edit on the server");
              return;
            }
            openRemoteEdit(clicked.path);
          }}
          editorName={preferredEditor ? editorLabel(preferredEditor) : ""}
          canOpenEditor={Boolean(api && preferredEditor)}
          onOpenTerminal={() => openApp("terminal")}
          onDownload={downloadEntry}
          onRename={startRename}
          onZip={(items) => void zipItems(items)}
          onCopyPath={(items) => void copyPaths(items)}
          onDelete={() => setConfirmDel(true)}
          onClose={closeContextMenu}
        />
      )}
      {confirmDel && (
        <div className="glass absolute inset-x-20 top-24 z-20 rounded-2xl p-4 shadow-xl">
          <h3 className="mt-0">Delete items</h3>
          <p>Delete {selectedItems.length} item(s)? This cannot be undone.</p>
          <div className="flex justify-end gap-2">
            <button className="rounded-lg border border-[var(--line)] px-3 py-1.5" onClick={() => setConfirmDel(false)}>Cancel</button>
            <button className="rounded-lg bg-[var(--bad)] px-3 py-1.5 text-white" onClick={() => void doDelete()}>Delete</button>
          </div>
        </div>
      )}
      {viewer && api && <Viewer entry={viewer} downloadUrl={api.downloadUrl(viewer.path)} onClose={() => setViewer(null)} onSave={async (text) => { await api.writeFile(viewer.path, text); toast("Saved"); }} />}
    </div>
  );
}
