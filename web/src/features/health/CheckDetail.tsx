import { ArrowUpRight, ShieldCheck } from "lucide-react";
import type { CertFact, CheckStatus, HealthCheck, HealthFix, MountRow } from "../../api/types";
import { TONE_COLOR, toneForPct, toneForStatus } from "../monitor/tone";
import { Badge, Button, Card, EmptyState, Meter } from "../monitor/ui";
import { checkIcon, STATUS_META } from "./check-meta";

export function CheckDetail({
  check,
  onFix,
  onOpenMonitor,
}: {
  check: HealthCheck;
  onFix: (fix: HealthFix) => void;
  onOpenMonitor: () => void;
}) {
  const Icon = checkIcon(check.id);
  const meta = STATUS_META[check.status];
  const mounts = (check.facts?.mounts as MountRow[] | undefined) || [];
  const certs = (check.facts?.certs as CertFact[] | undefined) || [];
  const details = check.details || [];
  const showMounts = check.id === "monitoring" && mounts.length > 0;
  const showCerts = check.id === "certificates" && certs.length > 0;

  return (
    <div className="mon-enter space-y-4">
      <div className="flex flex-wrap items-start gap-4">
        <span
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl"
          style={{ color: TONE_COLOR[meta.tone], background: `color-mix(in srgb, ${TONE_COLOR[meta.tone]} 16%, transparent)` }}
        >
          <Icon className="h-6 w-6" strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="m-0 text-[20px] font-semibold tracking-[-0.03em]">{check.title}</h2>
            <Badge tone={meta.tone}>{meta.label}</Badge>
          </div>
          <p className="m-0 mt-1.5 max-w-xl text-[14px] leading-relaxed text-[var(--muted)]">{check.summary}</p>
        </div>
      </div>

      {showMounts && (
        <Card title="Disks and memory">
          <ul className="m-0 list-none space-y-3 p-0">
            {mounts.map((m) => (
              <li key={m.mount}>
                <div className="mb-1 flex justify-between text-[13px]">
                  <span className="font-medium">{m.mount}</span>
                  <span className="tabular-nums text-[var(--muted)]">{m.used_pct}%</span>
                </div>
                <Meter value={m.used_pct} tone={toneForPct(m.used_pct)} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      {showCerts && (
        <Card title="Certificates">
          <ul className="m-0 list-none divide-y divide-[var(--line)] p-0">
            {certs.map((cert, i) => (
              <li key={`${cert.name}-${i}`} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                <span className="min-w-0 truncate text-[13px]">{cert.name || "Certificate"}</span>
                <span className="shrink-0 text-xs tabular-nums" style={{ color: TONE_COLOR[toneForStatus(cert.status)] }}>
                  {cert.days_remaining != null ? `${cert.days_remaining} days` : "—"}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {details.length > 0 && (
        <Card title="Findings">
          <ul className="m-0 list-none space-y-2 p-0">
            {details.map((line) => (
              <li key={line} className="flex gap-2.5 text-[13px] leading-relaxed">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--muted)]" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {(check.fixes?.length ?? 0) > 0 && (
        <Card title="Actions">
          <div className="flex flex-wrap gap-2">
            {check.fixes!.map((fix) => (
              <Button key={fix.id} variant={check.status === "problem" ? "primary" : "secondary"} onClick={() => onFix(fix)}>
                {fix.label}
              </Button>
            ))}
            {check.id === "monitoring" || check.id === "listening_ports" || check.id === "performance" ? (
              <Button variant="ghost" icon={ArrowUpRight} onClick={onOpenMonitor}>
                Open monitor
              </Button>
            ) : null}
          </div>
        </Card>
      )}

      {(check.fixes?.length ?? 0) === 0 && details.length === 0 && !showMounts && !showCerts && (
        <EmptyState icon={ShieldCheck} title="Nothing to review" hint="This check is quiet. Re-check later or open the live monitor." />
      )}
    </div>
  );
}

export function statusRank(status: CheckStatus) {
  return STATUS_META[status].rank;
}
