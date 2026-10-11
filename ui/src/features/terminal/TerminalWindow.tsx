import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { useEffect, useRef } from "react";
import { useDesktop } from "../../desktop/desktop-context";
import { useSession } from "../../state/session";
import { useToast } from "../../state/toast";
import { readTerminalTheme } from "./terminal-theme";

export function TerminalWindow() {
  const { meta } = useSession();
  const { isOpen, windows } = useDesktop();
  const toast = useToast();
  const host = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);

  useEffect(() => {
    if (!meta || !host.current || !isOpen("terminal")) return;
    const term = new Terminal({
      cursorBlink: true,
      fontFamily: 'ui-monospace, "Ubuntu Mono", Menlo, monospace',
      fontSize: 13,
      theme: readTerminalTheme(),
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host.current);
    fit.fit();
    termRef.current = term;
    const applyTheme = () => {
      term.options.theme = readTerminalTheme();
    };
    const appearance = new MutationObserver(applyTheme);
    appearance.observe(document.documentElement, { attributes: true, attributeFilter: ["data-appearance"] });
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const qs = new URLSearchParams({ cwd: meta.home || "/", cols: String(term.cols), rows: String(term.rows) });
    const socket = new WebSocket(`${proto}//${location.host}/api/sessions/${meta.session_id}/terminal?${qs}`);
    socket.binaryType = "arraybuffer";
    socket.onopen = () => {
      fit.fit();
      socket.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
    };
    socket.onmessage = (ev) => {
      if (typeof ev.data === "string") {
        try {
          const msg = JSON.parse(ev.data) as { type?: string; message?: string };
          if (msg.type === "error") toast(msg.message || "Terminal error");
        } catch {
          term.write(ev.data);
        }
        return;
      }
      term.write(new Uint8Array(ev.data as ArrayBuffer));
    };
    socket.onerror = () => toast("Terminal connection failed");
    socket.onclose = () => term.writeln("\r\n\r\n\x1b[1;31m[disconnected]\x1b[0m");
    term.onData((data) => {
      if (socket.readyState === WebSocket.OPEN) socket.send(data);
    });
    const ro = new ResizeObserver(() => {
      if (socket.readyState !== WebSocket.OPEN) return;
      fit.fit();
      socket.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
    });
    ro.observe(host.current);
    return () => {
      appearance.disconnect();
      ro.disconnect();
      socket.close();
      term.dispose();
      termRef.current = null;
    };
  }, [meta?.session_id, isOpen("terminal"), toast, windows.terminal.open, windows.terminal.minimized]);

  return <div ref={host} className="h-full min-h-[280px] bg-[var(--code-bg)] p-2" />;
}
