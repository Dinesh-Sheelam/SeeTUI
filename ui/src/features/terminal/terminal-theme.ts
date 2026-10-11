import type { ITheme } from "@xterm/xterm";

/**
 * Terminal colors taken from the active appearance.
 *
 * --code-text  ordinary output, login lines, typed commands, prompt `:` and `$`
 * --ok         username@host, success, executable files
 * --blue       working directory and directories
 * --danger     errors, failed commands, `[disconnected]`
 * --warn       warnings
 * --accent     symlinks, cursor, selection
 * --folder     images and other special files
 * --muted      secondary text
 * --code-bg    terminal background
 */
export function readTerminalTheme(): ITheme {
  const background = token("--code-bg", "#140f18");
  const foreground = token("--code-text", "#f7f2eb");
  const text = token("--text", foreground);
  const muted = token("--muted", "#c8b8c0");
  const danger = token("--danger", "#ffb4a8");
  const ok = token("--ok", "#8ee0b0");
  const warn = token("--warn", "#ffd089");
  const blue = token("--blue", "#ffb07a");
  const accent = token("--accent", "#c2410c");
  const folder = token("--folder", "#f0c27a");
  const light = document.documentElement.dataset.appearance === "light" || document.documentElement.dataset.appearance === "aqua";

  return {
    background,
    foreground,
    cursor: accent,
    cursorAccent: background,
    selectionBackground: accent,
    selectionForeground: token("--on-btn", background),
    selectionInactiveBackground: accent,

    black: light ? text : token("--bg", "#1a1520"),
    red: danger,
    green: ok,
    yellow: warn,
    blue,
    magenta: folder,
    cyan: accent,
    white: light ? token("--bg2", "#ffffff") : text,

    brightBlack: muted,
    brightRed: danger,
    brightGreen: ok,
    brightYellow: warn,
    brightBlue: blue,
    brightMagenta: folder,
    brightCyan: accent,
    brightWhite: text,
  };
}

function token(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}
