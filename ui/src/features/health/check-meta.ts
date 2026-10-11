import {
  Activity,
  CircleHelp,
  Gauge,
  Globe,
  Lock,
  Package,
  Plug,
  ShieldCheck,
  SlidersHorizontal,
  StickyNote,
  type LucideIcon,
} from "lucide-react";
import type { CheckStatus } from "../../api/types";
import type { Tone } from "../monitor/tone";

export const CHECK_ICONS: Record<string, LucideIcon> = {
  certificates: Lock,
  monitoring: Activity,
  quotas: SlidersHorizontal,
  web: Globe,
  listening_ports: Plug,
  performance: Gauge,
  firewall: ShieldCheck,
  packages: Package,
  owner_note: StickyNote,
};

export function checkIcon(id: string): LucideIcon {
  return CHECK_ICONS[id] ?? CircleHelp;
}

export const STATUS_META: Record<CheckStatus, { label: string; tone: Tone; rank: number }> = {
  problem: { label: "Critical", tone: "bad", rank: 0 },
  warning: { label: "Warning", tone: "warn", rank: 1 },
  unknown: { label: "Unknown", tone: "neutral", rank: 2 },
  ok: { label: "Passing", tone: "ok", rank: 3 },
};

export function humanizeInput(key: string) {
  const text = key.replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function riskTone(risk: string): Tone {
  const r = risk.toLowerCase();
  if (/high|danger|lock|disconnect/.test(r)) return "bad";
  if (/medium|moderate|restart|downtime/.test(r)) return "warn";
  return "ok";
}
