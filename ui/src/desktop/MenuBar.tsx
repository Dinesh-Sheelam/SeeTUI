import { ArrowLeftRight, ChevronDown, LogOut, Server } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { SavedServer } from "../api/types";
import { useLiveSnapshot } from "../state/live-snapshot";
import { SERVERS_EVENT, loadServers } from "../state/servers";
import { useSession } from "../state/session";

export function MenuBar({
  onLeave,
  onSwitch,
}: {
  onLeave: () => void;
  onSwitch: (server: SavedServer) => void;
}) {
  const { meta } = useSession();
  const snapshot = useLiveSnapshot();
  const mount = snapshot?.mounts?.find((row) => row.mount === "/") ?? snapshot?.mounts?.[0];
  const cpu = snapshot ? `CPU ${Math.round(snapshot.cpu.cpu_pct)}%` : "CPU —";
  const ram = snapshot ? `RAM ${Math.round(snapshot.memory.used_pct)}%` : "RAM —";
  const disk = mount ? `Disk ${mount.used_pct}%` : "Disk —";
  const [clock, setClock] = useState("");
  const [open, setOpen] = useState(false);
  const [servers, setServers] = useState(loadServers);
  const menuRef = useRef<HTMLDivElement>(null);
  const name = meta?.name || (meta ? `${meta.username}@${meta.host}` : "Server");
  const others = servers.filter((item) => item.id !== meta?.server_id);

  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }));
    tick();
    const id = setInterval(tick, 15000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const sync = () => setServers(loadServers());
    window.addEventListener(SERVERS_EVENT, sync);
    return () => window.removeEventListener(SERVERS_EVENT, sync);
  }, []);

  useEffect(() => {
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
  }, []);

  return (
    <header className="glass fixed inset-x-0 top-0 z-[60] flex h-8 items-center justify-between gap-3 px-3 text-xs">
      <strong className="shrink-0 tracking-tight">SeeTUI</strong>
      <div className="flex min-w-0 items-center justify-end gap-3">
        <div className="relative flex min-w-0 items-center gap-1.5" ref={menuRef}>
          <span className="size-1.5 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]" aria-hidden />
          <button
            type="button"
            className="inline-flex max-w-[180px] items-center gap-1 rounded-full px-1.5 py-0.5 text-[var(--text)] hover:bg-[var(--hover)]"
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          >
            <span className="truncate font-medium">{name}</span>
            <ChevronDown size={12} className="opacity-70" />
          </button>
          <span className="text-[var(--muted)]">Online</span>
          {open && (
            <div role="menu" aria-label="Server menu" className="absolute top-[calc(100%+8px)] right-0 z-[80] w-[240px] overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--bg2)] py-1 text-left text-[var(--text)] shadow-[0_18px_50px_rgba(0,0,0,0.28)]">
              <p className="px-3 py-1.5 text-[10px] font-semibold tracking-[0.16em] text-[var(--muted)] uppercase">Current server</p>
              <div className="flex items-center gap-2 px-3 py-1.5 text-[12px]">
                <Server size={14} className="opacity-70" />
                <span className="truncate font-medium">{name}</span>
              </div>
              {others.length > 0 && (
                <>
                  <div className="my-1 h-px bg-[var(--line)]" />
                  <p className="px-3 py-1.5 text-[10px] font-semibold tracking-[0.16em] text-[var(--muted)] uppercase">Switch to</p>
                  {others.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      role="menuitem"
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] text-[var(--text)] hover:bg-[var(--hover)]"
                      onClick={() => { setOpen(false); onSwitch(item); }}
                    >
                      <ArrowLeftRight size={14} className="opacity-70" />
                      <span className="truncate">{item.name}</span>
                    </button>
                  ))}
                </>
              )}
              <div className="my-1 h-px bg-[var(--line)]" />
              <button type="button" role="menuitem" className="flex w-full items-center gap-2 px-3 py-2 text-[12px] text-[var(--text)] hover:bg-[var(--hover)]" onClick={() => { setOpen(false); onLeave(); }}>
                <Server size={14} className="opacity-80" />
                All servers
              </button>
              <button type="button" role="menuitem" className="flex w-full items-center gap-2 px-3 py-2 text-[12px] text-[var(--text)] hover:bg-[var(--hover)]" onClick={() => { setOpen(false); onLeave(); }}>
                <LogOut size={14} className="opacity-80" />
                Leave server
              </button>
            </div>
          )}
        </div>
        <div className="hidden gap-3 font-medium sm:flex">
          <span>{cpu}</span>
          <span>{ram}</span>
          <span>{disk}</span>
        </div>
        <time className="w-12 shrink-0 text-right font-mono">{clock}</time>
      </div>
    </header>
  );
}
