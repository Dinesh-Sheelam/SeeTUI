export const APPEARANCES = ["light", "aqua", "dusk", "dark"] as const;

export type Appearance = (typeof APPEARANCES)[number];

export const APPEARANCE_LABELS: Record<Appearance, string> = {
  light: "Light",
  aqua: "Aqua",
  dusk: "Dusk",
  dark: "Dark",
};

const STORAGE_KEY = "SeeTUI.appearance";
const LEGACY_APPEARANCE_KEYS = ["seetui.appearance", "VSC.appearance"] as const;
const LEGACY_THEME_KEYS = ["VSC.theme", "vas.theme"] as const;
const LEGACY_WALLPAPER_KEYS = ["VSC.wallpaper", "vas.wallpaper"] as const;
const DEFAULT_APPEARANCE: Appearance = "dusk";

export function isAppearance(value: string | null): value is Appearance {
  return value === "light" || value === "aqua" || value === "dusk" || value === "dark";
}

/** Map the retired theme and wallpaper keys onto one appearance mode. */
export function appearanceFromLegacy(theme: string | null, wallpaper: string | null): Appearance {
  if (wallpaper === "dusk") return "dusk";
  if (theme === "aqua") return "aqua";
  if (theme === "adwaita") return "dark";
  if (theme === "hybrid") return "dusk";
  return DEFAULT_APPEARANCE;
}

function firstStored(keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = localStorage.getItem(key);
    if (value) return value;
  }
  return null;
}

function clearLegacy(): void {
  for (const key of [...LEGACY_APPEARANCE_KEYS, ...LEGACY_THEME_KEYS, ...LEGACY_WALLPAPER_KEYS]) {
    localStorage.removeItem(key);
  }
}

export function readAppearance(): Appearance {
  try {
    const stored = localStorage.getItem(STORAGE_KEY) || firstStored(LEGACY_APPEARANCE_KEYS);
    if (isAppearance(stored)) {
      localStorage.setItem(STORAGE_KEY, stored);
      clearLegacy();
      return stored;
    }
    const theme = firstStored(LEGACY_THEME_KEYS);
    const wallpaper = firstStored(LEGACY_WALLPAPER_KEYS);
    const mode = theme || wallpaper || stored ? appearanceFromLegacy(theme, wallpaper) : DEFAULT_APPEARANCE;
    clearLegacy();
    if (theme || wallpaper || stored) localStorage.setItem(STORAGE_KEY, mode);
    return mode;
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

export function applyAppearance(mode: Appearance): void {
  const root = document.documentElement;
  root.dataset.appearance = mode;
  delete root.dataset.theme;
  delete root.dataset.wallpaper;
  try {
    localStorage.setItem(STORAGE_KEY, mode);
    clearLegacy();
  } catch {
    /* storage unavailable */
  }
}

export function applyStoredAppearance(): Appearance {
  const mode = readAppearance();
  const root = document.documentElement;
  root.dataset.appearance = mode;
  delete root.dataset.theme;
  delete root.dataset.wallpaper;
  return mode;
}
