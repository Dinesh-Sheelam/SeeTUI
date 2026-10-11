import type { CheckStatus, HealthCheck, HealthFix, HealthReport, Snapshot } from "../../api/types";

const RANK: Record<CheckStatus, number> = { ok: 0, unknown: 1, warning: 2, problem: 3 };

function worse(current: CheckStatus, next: CheckStatus): CheckStatus {
  return RANK[next] > RANK[current] ? next : current;
}

function pctStatus(pct: number): CheckStatus {
  if (pct >= 90) return "problem";
  if (pct >= 80) return "warning";
  return "ok";
}

function monitoringFromSnapshot(check: HealthCheck, snapshot: Snapshot): HealthCheck {
  const failed = (check.facts?.failed as string[] | undefined) || [];
  const external = (check.facts?.uptime_external as { status?: CheckStatus; summary?: string } | undefined) || {};
  const cores = Math.max(snapshot.cpu.info?.cores || 1, 1);
  const load1 = snapshot.load.load1;
  const ratio = load1 / cores;
  const memPct = Math.round(snapshot.memory.used_pct);
  const swapTotal = snapshot.memory.swap_total_kb ?? 0;
  const swapUsed = snapshot.memory.swap_used_kb ?? 0;

  let status: CheckStatus = "ok";
  const details: string[] = [];
  let diskHot = false;
  for (const mount of snapshot.mounts || []) {
    const mountStatus = pctStatus(mount.used_pct);
    if (mountStatus !== "ok") diskHot = true;
    details.push(`${mount.mount}: ${mount.used_pct}% used`);
    status = worse(status, mountStatus);
  }

  let memoryStatus = pctStatus(memPct);
  if (swapTotal > 0 && swapUsed > swapTotal * 0.5) memoryStatus = "problem";
  details.push(`Memory: ${memPct}% used`);
  status = worse(status, memoryStatus);

  const loadStatus: CheckStatus = ratio >= 2 ? "problem" : ratio >= 1 ? "warning" : "ok";
  details.push(`Load: ${load1} on ${cores} CPUs`);
  status = worse(status, loadStatus);

  if (failed.length) {
    details.push(`Failed units: ${failed.join(", ")}`);
    status = "problem";
  } else {
    details.push("No failed systemd units");
  }
  if (external.summary) {
    details.push(`External uptime: ${external.summary}`);
    if (external.status) status = worse(status, external.status);
  }

  const summaryBits: string[] = [];
  const hottest = [...(snapshot.mounts || [])].sort((a, b) => b.used_pct - a.used_pct)[0];
  if (hottest && pctStatus(hottest.used_pct) !== "ok") summaryBits.push(`${hottest.mount} at ${hottest.used_pct}%`);
  if (failed.length) summaryBits.push(`${failed.length} failed service(s)`);
  if (memoryStatus !== "ok") summaryBits.push(`RAM ${memPct}%`);
  const summary = summaryBits.join("; ") || "Disk, memory, load, and services look healthy";

  const fixes: HealthFix[] = (check.fixes || []).filter((fix) => fix.id !== "clear_space");
  if (failed.length && !fixes.some((fix) => fix.id === "restart_service")) {
    fixes.push({ id: "restart_service", label: "Restart failed service", inputs: ["unit"] });
  }
  if (diskHot) fixes.push({ id: "clear_space", label: "Clear apt cache and journals" });

  return {
    ...check,
    status,
    summary,
    details,
    fixes,
    facts: {
      ...check.facts,
      mounts: snapshot.mounts,
      memory: snapshot.memory,
      load: { load1, nproc: cores, ratio },
    },
  };
}

/** Disk, memory, and load on the health card follow the shared snapshot. */
export function withLiveMetrics(report: HealthReport, snapshot: Snapshot | null): HealthReport {
  if (!snapshot) return report;
  const checks = report.checks
    .filter((check) => check.id !== "performance")
    .map((check) => (check.id === "monitoring" ? monitoringFromSnapshot(check, snapshot) : check));
  return {
    ...report,
    checks,
    passing: checks.filter((check) => check.status === "ok").length,
    critical: checks.filter((check) => check.status === "problem").length,
    warning: checks.filter((check) => check.status === "warning").length,
    total: checks.length,
  };
}
