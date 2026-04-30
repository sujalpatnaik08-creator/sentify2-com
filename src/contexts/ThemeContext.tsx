import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { getAutoTheme, setAutoTheme as persistAutoTheme, themeForHour } from "@/lib/user-prefs";

export type Theme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
  autoTheme: boolean;
  setAutoTheme: (on: boolean) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = "sentify:theme";

const getInitialTheme = (): Theme => {
  if (typeof window === "undefined") return "dark";
  try {
    if (getAutoTheme()) return themeForHour(new Date().getHours());
    const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
    if (stored === "light" || stored === "dark") return stored;
  } catch { /* ignore */ }
  return "dark";
};

const applyTheme = (t: Theme) => {
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(t);
  root.style.colorScheme = t;
};

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme);
  const [autoTheme, setAutoThemeState] = useState<boolean>(() => {
    try { return getAutoTheme(); } catch { return false; }
  });
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    applyTheme(theme);
    if (!autoTheme) {
      try { localStorage.setItem(STORAGE_KEY, theme); } catch { /* ignore */ }
    }
  }, [theme, autoTheme]);

  // Auto-theme schedule: re-evaluate every minute. 6AM→light, 6PM→dark.
  useEffect(() => {
    if (intervalRef.current) { window.clearInterval(intervalRef.current); intervalRef.current = null; }
    if (!autoTheme) return;
    const apply = () => {
      const next = themeForHour(new Date().getHours());
      setThemeState((prev) => (prev === next ? prev : next));
    };
    apply();
    intervalRef.current = window.setInterval(apply, 60_000);
    return () => {
      if (intervalRef.current) { window.clearInterval(intervalRef.current); intervalRef.current = null; }
    };
  }, [autoTheme]);

  const setTheme = useCallback((t: Theme) => {
    if (autoTheme) setAutoTheme(false);
    setThemeState(t);
  }, [autoTheme]);

  const toggleTheme = useCallback(() => {
    if (autoTheme) setAutoTheme(false);
    setThemeState((t) => (t === "dark" ? "light" : "dark"));
  }, [autoTheme]);

  const setAutoTheme = useCallback((on: boolean) => {
    persistAutoTheme(on);
    setAutoThemeState(on);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme, autoTheme, setAutoTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
};
