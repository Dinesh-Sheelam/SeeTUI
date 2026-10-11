import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { sessionApi } from "../api/client";
import type { ConnectBody, SessionMeta } from "../api/types";

type SessionCtx = {
  meta: SessionMeta | null;
  creds: ConnectBody | null;
  api: ReturnType<typeof sessionApi> | null;
  setReady: (info: SessionMeta, creds: ConnectBody) => void;
  clear: () => void;
};

const Ctx = createContext<SessionCtx | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [meta, setMeta] = useState<SessionMeta | null>(null);
  const [creds, setCreds] = useState<ConnectBody | null>(null);
  const value = useMemo<SessionCtx>(() => ({
    meta,
    creds,
    api: meta ? sessionApi(meta.session_id) : null,
    setReady: (info, next) => {
      setMeta(info);
      setCreds(next);
    },
    clear: () => {
      setMeta(null);
      setCreds(null);
    },
  }), [meta, creds]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSession requires SessionProvider");
  return ctx;
}
