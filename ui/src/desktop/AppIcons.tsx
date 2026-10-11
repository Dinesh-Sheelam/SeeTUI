import { useId } from "react";
import type { ReactNode } from "react";
import { FolderIcon } from "./FolderIcon";
import type { AppId } from "./windows";

type IconProps = { size?: number; className?: string };

function useGradientIds(...names: string[]): Record<string, string> {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  return Object.fromEntries(names.map((name) => [name, `app-${name}-${uid}`]));
}

function Svg({ size = 32, className = "", children }: IconProps & { children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className={`app-icon shrink-0 ${className}`}>
      {children}
    </svg>
  );
}

function Vertical({ id, from, to }: { id: string; from: string; to: string }) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor={from} />
      <stop offset="1" stopColor={to} />
    </linearGradient>
  );
}

function Gloss({ id }: { id: string }) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor="#fff" stopOpacity="0.45" />
      <stop offset="1" stopColor="#fff" stopOpacity="0" />
    </linearGradient>
  );
}

export function TerminalIcon(props: IconProps) {
  const ids = useGradientIds("body", "screen");
  return (
    <Svg {...props}>
      <defs>
        <Vertical id={ids.body} from="#eef1f5" to="#b5bec9" />
        <Vertical id={ids.screen} from="#2c313a" to="#12151a" />
      </defs>
      <rect x="6" y="10" width="52" height="44" rx="8" fill={`url(#${ids.body})`} stroke="rgba(0,0,0,0.35)" />
      <circle cx="13" cy="14.5" r="1.7" fill="#ff5f57" />
      <circle cx="18.5" cy="14.5" r="1.7" fill="#febc2e" />
      <circle cx="24" cy="14.5" r="1.7" fill="#28c840" />
      <rect x="10" y="19" width="44" height="31" rx="4" fill={`url(#${ids.screen})`} />
      <path d="M17 28l6 5-6 5" fill="none" stroke="#4ade80" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M27 39h10" stroke="#e5e7eb" strokeWidth="3" strokeLinecap="round" />
    </Svg>
  );
}

export function HealthIcon(props: IconProps) {
  const ids = useGradientIds("heart", "gloss");
  const heart = "M32 54C12 40 6 30 6 21c0-8 6-13 13-13 6 0 10 3 13 8 3-5 7-8 13-8 7 0 13 5 13 13 0 9-6 19-26 33Z";
  return (
    <Svg {...props}>
      <defs>
        <Vertical id={ids.heart} from="#ff8a94" to="#e11d48" />
        <Gloss id={ids.gloss} />
      </defs>
      <path d={heart} fill={`url(#${ids.heart})`} stroke="rgba(120,0,30,0.45)" />
      <path d="M10 22c0-6 4-10 9-10 5 0 9 3 13 9 4-6 8-9 13-9 5 0 9 4 9 10Z" fill={`url(#${ids.gloss})`} />
      <path d="M11 31h12l4-8 6 16 4-8h16" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function PerformanceIcon(props: IconProps) {
  const ids = useGradientIds("dial");
  return (
    <Svg {...props}>
      <defs>
        <Vertical id={ids.dial} from="#3b414e" to="#181b22" />
      </defs>
      <circle cx="32" cy="34" r="24" fill={`url(#${ids.dial})`} stroke="#c9d1db" strokeWidth="2" />
      <g fill="none" strokeWidth="5">
        <path d="M17.28 42.5A17 17 0 0 1 21.07 20.98" stroke="#34d399" />
        <path d="M21.07 20.98A17 17 0 0 1 37.81 18.02" stroke="#facc15" />
        <path d="M37.81 18.02A17 17 0 0 1 46.72 42.5" stroke="#f87171" />
      </g>
      <path d="M32 34l7-12" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
      <circle cx="32" cy="34" r="3.5" fill="#e5e7eb" />
    </Svg>
  );
}

export function InfoIcon(props: IconProps) {
  const ids = useGradientIds("disc", "gloss");
  return (
    <Svg {...props}>
      <defs>
        <Vertical id={ids.disc} from="#6cb2ff" to="#1d4ed8" />
        <Gloss id={ids.gloss} />
      </defs>
      <circle cx="32" cy="32" r="25" fill={`url(#${ids.disc})`} stroke="rgba(10,40,120,0.45)" />
      <ellipse cx="32" cy="20" rx="19" ry="12" fill={`url(#${ids.gloss})`} />
      <circle cx="32" cy="20" r="3.5" fill="#fff" />
      <rect x="28.5" y="27" width="7" height="19" rx="3.5" fill="#fff" />
    </Svg>
  );
}

export function CertificatesIcon(props: IconProps) {
  const ids = useGradientIds("shield");
  return (
    <Svg {...props}>
      <defs>
        <Vertical id={ids.shield} from="#4ade9a" to="#047857" />
      </defs>
      <path d="M32 6l22 8v16c0 14-10 23-22 28-12-5-22-14-22-28V14Z" fill={`url(#${ids.shield})`} stroke="rgba(0,60,30,0.45)" />
      <path d="M32 9.5 13.5 16.2V30c0 12 8 20 18.5 24.7Z" fill="#fff" opacity="0.14" />
      <path d="M22 32l7 7 13-14" fill="none" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function TransfersIcon(props: IconProps) {
  const ids = useGradientIds("disc", "gloss");
  return (
    <Svg {...props}>
      <defs>
        <Vertical id={ids.disc} from="#b69cff" to="#6d28d9" />
        <Gloss id={ids.gloss} />
      </defs>
      <circle cx="32" cy="32" r="25" fill={`url(#${ids.disc})`} stroke="rgba(60,20,120,0.45)" />
      <ellipse cx="32" cy="20" rx="19" ry="12" fill={`url(#${ids.gloss})`} />
      <g fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M25 44V20m-7 7 7-7 7 7" />
        <path d="M39 20v24m-7-7 7 7 7-7" />
      </g>
    </Svg>
  );
}

export function SettingsIcon(props: IconProps) {
  const ids = useGradientIds("metal", "hub");
  return (
    <Svg {...props}>
      <defs>
        <Vertical id={ids.metal} from="#dfe3e8" to="#7b8491" />
        <Vertical id={ids.hub} from="#3f4651" to="#5f6875" />
      </defs>
      <circle cx="32" cy="32" r="22" fill="none" stroke={`url(#${ids.metal})`} strokeWidth="9" strokeDasharray="8.64 8.64" />
      <circle cx="32" cy="32" r="19" fill={`url(#${ids.metal})`} stroke="rgba(0,0,0,0.3)" />
      <circle cx="32" cy="32" r="8" fill={`url(#${ids.hub})`} stroke="rgba(255,255,255,0.5)" />
    </Svg>
  );
}

export const APP_ICONS: Record<AppId, (props: IconProps) => ReactNode> = {
  files: FolderIcon,
  terminal: TerminalIcon,
  health: HealthIcon,
  perf: PerformanceIcon,
  info: InfoIcon,
  certs: CertificatesIcon,
  transfers: TransfersIcon,
  settings: SettingsIcon,
};
