import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import type { HealthReport } from "../api/types";
import { useSession } from "./session";

type HealthReportCtx = {
  report: HealthReport | null;
  reload: (force?: boolean) => Promise<HealthReport | undefined>;
};

const Ctx = createContext<HealthReportCtx | null>(null);

export function HealthReportProvider({ children }: { children: ReactNode }) {
  const { api } = useSession();
  const [report, setReport] = useState<HealthReport | null>(null);
  const [trackedApi, setTrackedApi] = useState(api);
  const reportRef = useRef(report);
  const flight = useRef<Promise<HealthReport | undefined> | null>(null);
  reportRef.current = report;

  if (api !== trackedApi) {
    setTrackedApi(api);
    setReport(null);
    reportRef.current = null;
    flight.current = null;
  }

  const reload = useCallback(async (force = false) => {
    if (!api) return undefined;
    if (!force && reportRef.current) return reportRef.current;
    if (flight.current) return flight.current;
    const pending = api.health()
      .then((data) => {
        reportRef.current = data;
        setReport(data);
        return data;
      })
      .finally(() => {
        flight.current = null;
      });
    flight.current = pending;
    return pending;
  }, [api]);

  return <Ctx.Provider value={{ report, reload }}>{children}</Ctx.Provider>;
}

export function useHealthReport() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useHealthReport requires HealthReportProvider");
  return ctx;
}
