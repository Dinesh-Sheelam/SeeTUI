import { lazy, Suspense, useEffect, useState } from "react";
import { CertificatesWindow } from "../features/certs/CertificatesWindow";
import { FilesWindow } from "../features/files/FilesWindow";
import { HealthWindow } from "../features/health/HealthWindow";
import { ServerInfoWindow } from "../features/info/ServerInfoWindow";
import { PerformanceWindow } from "../features/performance/PerformanceWindow";
import { RemoteEditorWindow } from "../features/editor/RemoteEditorWindow";
import { SettingsWindow } from "../features/settings/SettingsWindow";
import { TransfersWindow } from "../features/transfers/TransfersWindow";

const TerminalWindow = lazy(async () => {
  const mod = await import("../features/terminal/TerminalWindow");
  return { default: mod.TerminalWindow };
});
import type { SavedServer } from "../api/types";
import { HealthReportProvider } from "../state/health-report";
import { LiveSnapshotProvider } from "../state/live-snapshot";
import { Dock } from "./Dock";
import { MenuBar } from "./MenuBar";
import { useDesktop } from "./desktop-context";
import { WindowFrame } from "./WindowFrame";
import { TITLES } from "./windows";

export function Desktop({ onLeave, onSwitch }: { onLeave: () => void; onSwitch: (server: SavedServer) => void }) {
  const { closeApp, focused, windows } = useDesktop();
  const [alert, setAlert] = useState("");
  const [badge, setBadge] = useState(0);
  const monitorLive = windows.perf.open && !windows.perf.minimized;

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === "w") {
        ev.preventDefault();
        if (focused) closeApp(focused);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [focused, closeApp]);

  return (
    <LiveSnapshotProvider fast={monitorLive}>
    <HealthReportProvider>
      <div className="relative h-full overflow-hidden">
      <MenuBar onLeave={onLeave} onSwitch={onSwitch} />
      {alert && <div className="relative z-40 mt-8 bg-[var(--warn)]/20 px-4 py-2 text-sm">{alert}</div>}
      <div className="absolute inset-x-0 top-8 bottom-0">
        {windows.files.open && <WindowFrame id="files" title={TITLES.files}><FilesWindow /></WindowFrame>}
        {windows.terminal.open && (
          <WindowFrame id="terminal" title={TITLES.terminal}>
            <Suspense fallback={<p className="p-4 text-[var(--muted)]">Opening terminal…</p>}>
              <TerminalWindow />
            </Suspense>
          </WindowFrame>
        )}
        {windows.health.open && <WindowFrame id="health" title={TITLES.health}><HealthWindow onAlert={setAlert} onBadge={setBadge} /></WindowFrame>}
        {windows.perf.open && <WindowFrame id="perf" title={TITLES.perf}><PerformanceWindow /></WindowFrame>}
        {windows.info.open && <WindowFrame id="info" title={TITLES.info}><ServerInfoWindow /></WindowFrame>}
        {windows.certs.open && <WindowFrame id="certs" title={TITLES.certs}><CertificatesWindow /></WindowFrame>}
        {windows.transfers.open && <WindowFrame id="transfers" title={TITLES.transfers}><TransfersWindow /></WindowFrame>}
        {windows.settings.open && <WindowFrame id="settings" title={TITLES.settings}><SettingsWindow onLogout={onLeave} /></WindowFrame>}
      </div>
      <RemoteEditorWindow />
      <Dock healthCount={badge} />
      </div>
    </HealthReportProvider>
    </LiveSnapshotProvider>
  );
}
