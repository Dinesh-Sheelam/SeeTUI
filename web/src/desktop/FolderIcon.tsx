import { useId } from "react";

const BACK = "M10 10h13.5a4 4 0 0 1 3.2 1.6L29.5 15H54a4 4 0 0 1 4 4v29a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4V14a4 4 0 0 1 4-4Z";
const FRONT = "M6 24a4 4 0 0 1 4-4h44a4 4 0 0 1 4 4v24a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4Z";

/** Colours come from `--folder-*` tokens in styles/folder-icons.css, so the icon follows `data-appearance`. */
export function FolderIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const frontId = `folder-front-${uid}`;
  const glossId = `folder-gloss-${uid}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
      className={`folder-icon shrink-0 ${className}`}
    >
      <defs>
        <linearGradient id={frontId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: "var(--folder-front-top)" }} />
          <stop offset="1" style={{ stopColor: "var(--folder-front-bottom)" }} />
        </linearGradient>
        <linearGradient id={glossId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.9" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={BACK} style={{ fill: "var(--folder-back)", stroke: "var(--folder-edge)" }} strokeWidth="1" />
      <rect x="11" y="17" width="42" height="20" rx="2" style={{ fill: "var(--folder-paper)" }} />
      <path d={FRONT} fill={`url(#${frontId})`} style={{ stroke: "var(--folder-edge)" }} strokeWidth="1" />
      <path d="M6.5 24a3.5 3.5 0 0 1 3.5-3.5h44a3.5 3.5 0 0 1 3.5 3.5v10h-51Z" fill={`url(#${glossId})`} style={{ opacity: "var(--folder-gloss)" }} />
      <path d="M10 21.5h44" strokeWidth="1.25" strokeLinecap="round" style={{ stroke: "var(--folder-shine)" }} />
    </svg>
  );
}
