import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Snapshot } from "../api/types";
import { useSession } from "./session";

const Ctx = createContext<Snapshot | null | undefined>(undefined);

/** One snapshot poll for the menu bar, health strip, and performance monitor. */
export function LiveSnapshotProvider({ fast, children }: { fast: boolean; children: ReactNode }) {
  const { api } = useSession();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [trackedApi, setTrackedApi] = useState(api);
  if (api !== trackedApi) {
    setTrackedApi(api);
    setSnapshot(null);
  }

  useEffect(() => {
    if (!api) return;
    let cancelled = false;
    let inFlight = false;
    const tick = async () => {
      if (document.hidden || inFlight) return;
      inFlight = true;
      try {
        const data = await api.snapshot();
        if (!cancelled) setSnapshot(data);
      } catch {
        /* keep the last sample so every surface stays on the same reading */
      } finally {
        inFlight = false;
      }
    };
    void tick();
    const id = setInterval(() => void tick(), fast ? 2000 : 10000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [api, fast]);

  return <Ctx.Provider value={snapshot}>{children}</Ctx.Provider>;
}

export function useLiveSnapshot() {
  const snapshot = useContext(Ctx);
  if (snapshot === undefined) throw new Error("useLiveSnapshot requires LiveSnapshotProvider");
  return snapshot;
}
