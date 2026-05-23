import { useCallback, useEffect, useSyncExternalStore } from "react";
import {
  DEFAULT_APPEARANCE_ACCENT_HUE,
  DEFAULT_APPEARANCE_ACCENT_INTENSITY,
  DEFAULT_APPEARANCE_MODE,
  type AppearanceMode,
} from "@t3tools/contracts/settings";
import {
  readBrowserClientSettings,
  readLegacyBrowserThemePreference,
} from "../clientPersistenceStorage";
import { resolveAppearancePalette } from "../appearancePalettes";
import { useSettings, useUpdateSettings } from "./useSettings";

type ThemeSnapshot = {
  systemDark: boolean;
};

const MEDIA_QUERY = "(prefers-color-scheme: dark)";
const DEFAULT_THEME_SNAPSHOT: ThemeSnapshot = {
  systemDark: false,
};
const THEME_COLOR_META_NAME = "theme-color";
const DYNAMIC_THEME_COLOR_SELECTOR = `meta[name="${THEME_COLOR_META_NAME}"][data-dynamic-theme-color="true"]`;

let listeners: Array<() => void> = [];
let lastSnapshot: ThemeSnapshot | null = null;
let lastDesktopTheme: AppearanceMode | null = null;

function emitChange() {
  for (const listener of listeners) listener();
}

function getSystemDark() {
  return typeof window !== "undefined" && window.matchMedia(MEDIA_QUERY).matches;
}

function clampHue(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_APPEARANCE_ACCENT_HUE;
  }

  const normalizedValue = value % 360;
  return normalizedValue < 0 ? normalizedValue + 360 : normalizedValue;
}

function clampIntensity(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_APPEARANCE_ACCENT_INTENSITY;
  }

  return Math.min(1, Math.max(0, value));
}

function ensureThemeColorMetaTag(): HTMLMetaElement {
  let element = document.querySelector<HTMLMetaElement>(DYNAMIC_THEME_COLOR_SELECTOR);
  if (element) {
    return element;
  }

  element = document.createElement("meta");
  element.name = THEME_COLOR_META_NAME;
  element.setAttribute("data-dynamic-theme-color", "true");
  document.head.append(element);
  return element;
}

function normalizeThemeColor(value: string | null | undefined): string | null {
  const normalizedValue = value?.trim().toLowerCase();
  if (
    !normalizedValue ||
    normalizedValue === "transparent" ||
    normalizedValue === "rgba(0, 0, 0, 0)" ||
    normalizedValue === "rgba(0 0 0 / 0)"
  ) {
    return null;
  }

  return value?.trim() ?? null;
}

function resolveBrowserChromeSurface(): HTMLElement {
  return (
    document.querySelector<HTMLElement>("main[data-slot='sidebar-inset']") ??
    document.querySelector<HTMLElement>("[data-slot='sidebar-inner']") ??
    document.body
  );
}

export function syncBrowserChromeTheme() {
  if (typeof document === "undefined" || typeof getComputedStyle === "undefined") return;
  const surfaceColor = normalizeThemeColor(
    getComputedStyle(resolveBrowserChromeSurface()).backgroundColor,
  );
  const fallbackColor = normalizeThemeColor(getComputedStyle(document.body).backgroundColor);
  const backgroundColor = surfaceColor ?? fallbackColor;
  if (!backgroundColor) return;

  document.documentElement.style.backgroundColor = backgroundColor;
  document.body.style.backgroundColor = backgroundColor;
  ensureThemeColorMetaTag().setAttribute("content", backgroundColor);
}

function syncDesktopTheme(theme: AppearanceMode) {
  if (typeof window === "undefined") return;
  const bridge = window.desktopBridge;
  if (!bridge || lastDesktopTheme === theme) {
    return;
  }

  lastDesktopTheme = theme;
  void bridge.setTheme(theme).catch(() => {
    if (lastDesktopTheme === theme) {
      lastDesktopTheme = null;
    }
  });
}

export function applyTheme(
  theme: AppearanceMode,
  accentHue: number,
  accentIntensity: number,
  suppressTransitions = false,
) {
  if (typeof document === "undefined" || typeof window === "undefined") return;
  if (suppressTransitions) {
    document.documentElement.classList.add("no-transitions");
  }
  const isDark = theme === "dark" || (theme === "system" && getSystemDark());
  const root = document.documentElement;
  root.classList?.toggle("dark", isDark);
  if (root.dataset) {
    root.dataset.appearanceMode = theme;
  }
  root.style?.setProperty("--accent-hue", `${clampHue(accentHue)}`);
  root.style?.setProperty("--accent-intensity", clampIntensity(accentIntensity).toFixed(3));
  const palette = resolveAppearancePalette(clampHue(accentHue));
  root.dataset.appearancePalette = palette.id;
  for (const [index, color] of palette.colors.entries()) {
    root.style?.setProperty(`--color-${index + 1}`, color);
  }
  syncBrowserChromeTheme();
  syncDesktopTheme(theme);
  if (suppressTransitions) {
    document.documentElement.getBoundingClientRect();
    requestAnimationFrame(() => {
      document.documentElement.classList.remove("no-transitions");
    });
  }
}

function readInitialAppearance() {
  const persistedSettings = readBrowserClientSettings();
  const legacyThemePreference = readLegacyBrowserThemePreference();
  return {
    appearanceMode:
      persistedSettings?.appearanceMode ?? legacyThemePreference ?? DEFAULT_APPEARANCE_MODE,
    appearanceAccentHue: persistedSettings?.appearanceAccentHue ?? DEFAULT_APPEARANCE_ACCENT_HUE,
    appearanceAccentIntensity:
      persistedSettings?.appearanceAccentIntensity ?? DEFAULT_APPEARANCE_ACCENT_INTENSITY,
  };
}

const initialAppearance = readInitialAppearance();

if (typeof document !== "undefined") {
  applyTheme(
    initialAppearance.appearanceMode,
    initialAppearance.appearanceAccentHue,
    initialAppearance.appearanceAccentIntensity,
  );
}

function getSnapshot(): ThemeSnapshot {
  const systemDark = getSystemDark();

  if (lastSnapshot && lastSnapshot.systemDark === systemDark) {
    return lastSnapshot;
  }

  lastSnapshot = { systemDark };
  return lastSnapshot;
}

function getServerSnapshot() {
  return DEFAULT_THEME_SNAPSHOT;
}

function subscribe(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  listeners.push(listener);

  const mq = window.matchMedia(MEDIA_QUERY);
  const handleChange = () => {
    emitChange();
  };
  mq.addEventListener("change", handleChange);

  return () => {
    listeners = listeners.filter((l) => l !== listener);
    mq.removeEventListener("change", handleChange);
  };
}

export function useTheme() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const { updateSettings } = useUpdateSettings();
  const theme = useSettings((settings) => settings.appearanceMode);
  const accentHue = useSettings((settings) => settings.appearanceAccentHue);
  const accentIntensity = useSettings((settings) => settings.appearanceAccentIntensity);

  const resolvedTheme: "light" | "dark" =
    theme === "system" ? (snapshot.systemDark ? "dark" : "light") : theme;

  const setTheme = useCallback(
    (next: AppearanceMode) => {
      updateSettings({ appearanceMode: next });
      applyTheme(next, accentHue, accentIntensity, true);
      emitChange();
    },
    [accentHue, accentIntensity, updateSettings],
  );

  const setAccentHue = useCallback(
    (next: number) => {
      const clampedValue = clampHue(next);
      updateSettings({ appearanceAccentHue: clampedValue });
      applyTheme(theme, clampedValue, accentIntensity, true);
    },
    [accentIntensity, theme, updateSettings],
  );

  const setAccentIntensity = useCallback(
    (next: number) => {
      const clampedValue = clampIntensity(next);
      updateSettings({ appearanceAccentIntensity: clampedValue });
      applyTheme(theme, accentHue, clampedValue, true);
    },
    [accentHue, theme, updateSettings],
  );

  useEffect(() => {
    applyTheme(theme, accentHue, accentIntensity);
  }, [accentHue, accentIntensity, theme]);

  return {
    theme,
    setTheme,
    resolvedTheme,
    accentHue,
    setAccentHue,
    accentIntensity,
    setAccentIntensity,
  } as const;
}
