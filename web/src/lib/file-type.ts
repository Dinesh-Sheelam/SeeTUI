import type { FileEntry } from "../api/types";

const IMAGE_EXT = new Set(["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "avif", "ico"]);
const VIDEO_EXT = new Set(["mp4", "webm", "ogv", "mov", "m4v"]);
const AUDIO_EXT = new Set(["mp3", "wav", "m4a", "aac", "flac", "oga", "ogg"]);
const CODE_EXT = new Set([
  "js", "jsx", "ts", "tsx", "py", "go", "rs", "java", "cpp", "c", "h", "css", "html", "sql",
  "sh", "bash", "rb", "php", "yaml", "yml", "json", "toml", "md", "vue", "svelte",
]);
const TEXT_EXT = new Set(["txt", "log", "csv", "ini", "conf", "cfg", "env", "service", "properties"]);
const TEXT_NAMES = new Set([
  "passwd", "hosts", "fstab", "crontab", "os-release", "authorized_keys",
  "sshd_config", "ssh_config", "group", "shadow", "sudoers", "hostname",
]);

export type ViewerKind = "folder" | "image" | "video" | "audio" | "pdf" | "code" | "text" | "unknown";

export function fileExtension(name: string) {
  const base = name.split("/").pop() || name;
  const i = base.lastIndexOf(".");
  return i > 0 ? base.slice(i + 1).toLowerCase() : "";
}

export function viewerKind(entry: FileEntry): ViewerKind {
  if (entry.is_dir) return "folder";
  const base = (entry.name || "").toLowerCase();
  const ext = fileExtension(entry.name);
  if (TEXT_NAMES.has(base)) return "text";
  if (IMAGE_EXT.has(ext)) return "image";
  if (VIDEO_EXT.has(ext)) return "video";
  if (AUDIO_EXT.has(ext)) return "audio";
  if (ext === "pdf") return "pdf";
  if (CODE_EXT.has(ext)) return "code";
  if (TEXT_EXT.has(ext)) return "text";
  if (entry.kind === "text" || entry.kind === "script") return "code";
  return "unknown";
}

export function isEditableFile(entry: FileEntry): boolean {
  if (entry.is_dir) return false;
  const kind = viewerKind(entry);
  if (kind === "text" || kind === "code") return true;
  if (kind !== "unknown" || fileExtension(entry.name)) return false;
  return entry.size <= 512 * 1024;
}

export function fmtSize(n: number) {
  if (!n) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < 3) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export function fmtDate(ts: number) {
  if (!ts) return "—";
  return new Date(ts * 1000).toLocaleString();
}

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
const monthDayFormat = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
const fullDateFormat = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" });

/** Compact, single-line modified date: "Today, 12:26 AM", "Aug 14, 4:50 PM", "Mar 31, 2024". */
export function fmtModified(ts: number, now = new Date()) {
  if (!ts) return "—";
  const date = new Date(ts * 1000);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dayMs = 86_400_000;
  if (date.getTime() >= startOfToday) return `Today, ${timeFormat.format(date)}`;
  if (date.getTime() >= startOfToday - dayMs) return `Yesterday, ${timeFormat.format(date)}`;
  if (date.getFullYear() === now.getFullYear()) return `${monthDayFormat.format(date)}, ${timeFormat.format(date)}`;
  return fullDateFormat.format(date);
}

const KIND_SUFFIX: Partial<Record<ViewerKind, string>> = {
  image: "image",
  video: "video",
  audio: "audio",
  code: "source",
  text: "text",
};

export function kindLabel(entry: FileEntry) {
  if (entry.is_dir) return entry.is_symlink ? "Folder alias" : "Folder";
  if (entry.is_symlink) return "Alias";
  const kind = viewerKind(entry);
  const ext = fileExtension(entry.name).toUpperCase();
  if (kind === "pdf") return "PDF document";
  const suffix = KIND_SUFFIX[kind];
  if (suffix) return ext ? `${ext} ${suffix}` : kind === "code" ? "Script" : "Plain text";
  return ext ? `${ext} file` : "Document";
}

export function joinPath(base: string, name: string) {
  if (base === "/") return `/${name}`;
  return `${base.replace(/\/$/, "")}/${name}`;
}
