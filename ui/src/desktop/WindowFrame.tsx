import { type ReactNode, useRef } from "react";
import { APP_ICONS } from "./AppIcons";
import { persistGeo } from "./windows";
import { useDesktop } from "./desktop-context";
import { TrafficLights } from "./TrafficLights";
import type { AppId } from "./windows";

type Props = {
  id: AppId;
  title: string;
  children: ReactNode;
};

export function WindowFrame({ id, title, children }: Props) {
  const { windows, closeApp, minimizeApp, toggleMaximize, focusApp, moveApp, resizeApp } = useDesktop();
  const win = windows[id];
  const AppIcon = APP_ICONS[id];
  const drag = useRef<{ ox: number; oy: number } | null>(null);
  const resize = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  if (!win.open || win.minimized) return null;

  const onDragStart = (ev: React.PointerEvent) => {
    if ((ev.target as HTMLElement).closest("button")) return;
    if (win.maximized || window.innerWidth < 700) return;
    focusApp(id);
    drag.current = { ox: ev.clientX - win.x, oy: ev.clientY - win.y };
    const move = (e: PointerEvent) => {
      if (!drag.current) return;
      const x = Math.max(0, Math.min(window.innerWidth - 80, e.clientX - drag.current.ox));
      const y = Math.max(28, Math.min(window.innerHeight - 80, e.clientY - drag.current.oy));
      moveApp(id, x, y);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      persistGeo(id, { x: win.x, y: win.y, w: win.w, h: win.h });
      drag.current = null;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const onResizeStart = (ev: React.PointerEvent) => {
    ev.stopPropagation();
    if (win.maximized || window.innerWidth < 700) return;
    focusApp(id);
    resize.current = { x: ev.clientX, y: ev.clientY, w: win.w, h: win.h };
    const move = (e: PointerEvent) => {
      if (!resize.current) return;
      resizeApp(id, Math.max(320, resize.current.w + (e.clientX - resize.current.x)), Math.max(240, resize.current.h + (e.clientY - resize.current.y)));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      persistGeo(id, { x: win.x, y: win.y, w: win.w, h: win.h });
      resize.current = null;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const compact = window.innerWidth < 700;
  const isFullBleed = win.maximized && !compact;
  const style = isFullBleed
    ? { left: 0, top: 0, width: "100%", height: "100%", zIndex: win.z }
    : compact
      ? { left: 8, top: 4, width: "calc(100% - 16px)", height: "calc(100% - 76px)", zIndex: win.z }
      : { left: win.x, top: win.y, width: win.w, height: win.h, zIndex: win.z };
  const frame = isFullBleed
    ? "rounded-none border-t border-[var(--line)]"
    : `rounded-2xl border border-[var(--line)] shadow-[0_24px_60px_rgba(0,0,0,.38)] max-md:left-2! max-md:top-1! max-md:h-[calc(100%-76px)]! max-md:w-[calc(100%-16px)]! ${win.focused ? "ring-1 ring-[var(--focus)]" : ""}`;

  return (
    <section
      className={`absolute flex flex-col overflow-hidden bg-[var(--bg2)] text-[var(--text)] ${frame}`}
      style={style}
      onPointerDown={() => focusApp(id)}
    >
      <header
        className={`grid grid-cols-[56px_1fr_56px] items-center gap-3 border-b border-[var(--line)] px-3 py-2 select-none ${isFullBleed ? "cursor-default" : "cursor-grab"}`}
        onPointerDown={onDragStart}
        onDoubleClick={(ev) => { if (!(ev.target as HTMLElement).closest("button")) toggleMaximize(id); }}
      >
        <TrafficLights
          isFocused={win.focused}
          isMaximized={win.maximized}
          onClose={() => closeApp(id)}
          onMinimize={() => minimizeApp(id)}
          onMaximize={() => toggleMaximize(id)}
        />
        <strong className={`flex min-w-0 items-center justify-center gap-1.5 text-[13px] font-medium ${win.focused ? "" : "text-[var(--muted)]"}`}>
          <AppIcon size={16} className={win.focused ? "" : "opacity-60"} />
          <span className="truncate">{title}</span>
        </strong>
        <span aria-hidden />
      </header>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
      {!isFullBleed && <span className="absolute right-0.5 bottom-0.5 hidden h-3.5 w-3.5 cursor-nwse-resize opacity-40 md:block" onPointerDown={onResizeStart} aria-hidden />}
    </section>
  );
}
