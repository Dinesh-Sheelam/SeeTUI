import { useState } from "react";
import type { ConnectBody, SavedServer, SessionMeta } from "./api/types";
import { Desktop } from "./desktop/Desktop";
import { DesktopProvider, useDesktop } from "./desktop/desktop-context";
import { ConnectingScreen } from "./features/connect/ConnectingScreen";
import { ServerHome } from "./features/connect/ServerHome";
import { RemoteEditProvider } from "./state/remote-edit";
import { SessionProvider, useSession } from "./state/session";
import { ToastProvider } from "./state/toast";

function Shell() {
  const { meta, api, setReady, clear } = useSession();
  const { closeAll } = useDesktop();
  const [pending, setPending] = useState<SavedServer | null>(null);

  async function leave() {
    try { await api?.disconnect(); } catch { /* already gone */ }
    closeAll();
    clear();
    setPending(null);
  }

  async function switchTo(server: SavedServer) {
    try { await api?.disconnect(); } catch { /* already gone */ }
    closeAll();
    clear();
    setPending(server);
  }

  function ready(info: SessionMeta, creds: ConnectBody) {
    setReady(info, creds);
    setPending(null);
  }

  if (pending) {
    return <ConnectingScreen server={pending} onReady={ready} onBack={() => setPending(null)} />;
  }
  if (!meta) return <ServerHome onConnect={setPending} />;
  return <Desktop onLeave={() => void leave()} onSwitch={(server) => void switchTo(server)} />;
}

export function App() {
  return (
    <ToastProvider>
      <SessionProvider>
        <RemoteEditProvider>
          <DesktopProvider>
            <Shell />
          </DesktopProvider>
        </RemoteEditProvider>
      </SessionProvider>
    </ToastProvider>
  );
}
