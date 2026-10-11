import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

export type RemoteEditLaunch = {
  path: string;
};

type RemoteEditCtx = {
  launch: RemoteEditLaunch | null;
  openRemoteEdit: (path: string) => void;
  closeRemoteEdit: () => void;
};

const Ctx = createContext<RemoteEditCtx | null>(null);

export function RemoteEditProvider({ children }: { children: ReactNode }) {
  const [launch, setLaunch] = useState<RemoteEditLaunch | null>(null);
  const value = useMemo<RemoteEditCtx>(
    () => ({
      launch,
      openRemoteEdit: (path) => setLaunch({ path }),
      closeRemoteEdit: () => setLaunch(null),
    }),
    [launch],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useRemoteEdit() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useRemoteEdit requires RemoteEditProvider");
  return ctx;
}
