export type Tone = "ok" | "warn" | "bad" | "neutral" | "accent";

export const TONE_COLOR: Record<Tone, string> = {
  ok: "var(--ok)",
  warn: "var(--warn)",
  bad: "var(--danger)",
  neutral: "var(--muted)",
  accent: "var(--accent)",
};

export function toneForPct(pct: number, warnAt = 75, badAt = 90): Tone {
  if (pct >= badAt) return "bad";
  if (pct >= warnAt) return "warn";
  return "ok";
}

export function toneForStatus(status: string): Tone {
  if (status === "ok") return "ok";
  if (status === "warning") return "warn";
  if (status === "problem") return "bad";
  return "neutral";
}

export function toneForVerdict(verdict: string): Tone {
  if (verdict === "Healthy") return "ok";
  if (/full|pressure/i.test(verdict)) return "bad";
  return "warn";
}
