// Theme-Provider: hell/dunkel/system + dynamische Akzentfarbe.

import { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";

type Theme = "system" | "hell" | "dunkel";

interface ThemeState {
  theme: Theme;
  akzent: string;
  setTheme: (t: Theme) => void;
  setAkzent: (hex: string) => void;
}

const Ctx = createContext<ThemeState | null>(null);
const STORAGE = "mcc_theme_v2";

function applyAkzent(hex: string) {
  // Konvertiert Hex grob zu oklch — bei Tailwind v4 reicht --primary als CSS-Var-Setzung.
  // Wir setzen direkt die Hex-basierten Custom-Property-Overrides.
  const root = document.documentElement;
  root.style.setProperty("--primary", hex);
  root.style.setProperty("--ring", hex);
  root.style.setProperty("--sidebar-primary", hex);
  root.style.setProperty("--sidebar-ring", hex);
  // Akzent leicht abgeschwächt
  root.style.setProperty("--accent", hex + "22");
}

function applyTheme(t: Theme) {
  const root = document.documentElement;
  const useDark = t === "dunkel" || (t === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  root.classList.toggle("dark", useDark);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("hell");
  const [akzent, setAkzentState] = useState<string>("#1E3A5F");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE);
      if (raw) {
        const v = JSON.parse(raw) as { theme?: Theme; akzent?: string };
        if (v.theme) setThemeState(v.theme);
        if (v.akzent) setAkzentState(v.akzent);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    applyTheme(theme);
    applyAkzent(akzent);
    try {
      localStorage.setItem(STORAGE, JSON.stringify({ theme, akzent }));
    } catch {
      /* ignore */
    }
  }, [theme, akzent]);

  useEffect(() => {
    if (theme !== "system") return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const h = () => applyTheme("system");
    mql.addEventListener("change", h);
    return () => mql.removeEventListener("change", h);
  }, [theme]);

  const setTheme = useCallback((t: Theme) => setThemeState(t), []);
  const setAkzent = useCallback((hex: string) => setAkzentState(hex), []);

  const value = useMemo(() => ({ theme, akzent, setTheme, setAkzent }), [theme, akzent, setTheme, setAkzent]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useTheme muss innerhalb <ThemeProvider> verwendet werden");
  return v;
}
