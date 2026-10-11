import { useEffect } from "react";
import type { CertFact } from "../../api/types";
import { useHealthReport } from "../../state/health-report";
import { useToast } from "../../state/toast";

export function CertificatesWindow() {
  const toast = useToast();
  const { report, reload } = useHealthReport();
  const check = report?.checks.find((item) => item.id === "certificates") ?? null;

  useEffect(() => {
    void reload().catch((err: unknown) => toast(err instanceof Error ? err.message : "Failed"));
  }, [reload, toast]);

  const certs = (check?.facts?.certs as CertFact[] | undefined) || [];
  const renew = (check?.facts?.renew as { auto_renew?: boolean } | undefined) || {};

  return (
    <div className="p-4">
      {!check && <p className="text-[var(--muted)]">Loading certificates…</p>}
      {check && (
        <>
          <p><span className="mr-2 rounded-full bg-[var(--hover)] px-2 py-0.5 text-xs text-[var(--text)]">{check.status}</span>{check.summary}</p>
          <p className="text-[var(--muted)]">{renew.auto_renew ? "Auto-renew is enabled" : "Auto-renew is not enabled"}</p>
          <table className="mt-3 w-full text-sm">
            <thead><tr><th className="text-left">Name</th><th>Status</th><th>Not after</th><th>Days</th></tr></thead>
            <tbody>
              {certs.length === 0 && <tr><td colSpan={4}>No TLS certificates found</td></tr>}
              {certs.map((cert) => (
                <tr key={cert.name}>
                  <td>{cert.name || "cert"}</td>
                  <td>{cert.status}</td>
                  <td>{cert.not_after || "—"}</td>
                  <td>{cert.days_remaining ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
