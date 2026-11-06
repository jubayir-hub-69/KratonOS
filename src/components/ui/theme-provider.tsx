import * as React from "react";

export type ThemeMode = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

interface ThemeProviderState {
  mode: ThemeMode;
  resolvedTheme: ResolvedTheme;
  setMode: (mode: ThemeMode) => void;
}

const ThemeProviderContext = React.createContext<ThemeProviderState>({
  mode: "system",
  resolvedTheme: "dark",
  setMode: () => null,
});

export function ThemeProvider({
  children,
  defaultMode = "system",
  storageKey = "kratonos-ui-theme-session",
}: {
  children: React.ReactNode;
  defaultMode?: ThemeMode;
  storageKey?: string;
}) {
  const [mode, setModeState] = React.useState<ThemeMode>(() => {
    if (typeof window === "undefined") return defaultMode;
    try {
      const saved = window.sessionStorage.getItem(storageKey) as ThemeMode | null;
      return saved === "light" || saved === "dark" || saved === "system" ? saved : defaultMode;
    } catch {
      return defaultMode;
    }
  });

  const [resolvedTheme, setResolvedTheme] = React.useState<ResolvedTheme>(() => {
    if (typeof window === "undefined") return "dark";
    const systemDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ?? true;
    if (mode === "system") return systemDark ? "dark" : "light";
    return mode;
  });

  React.useEffect(() => {
    const root = window.document.documentElement;
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const applyTheme = () => {
      const systemDark = mediaQuery.matches;
      const effective: ResolvedTheme =
        mode === "system" ? (systemDark ? "dark" : "light") : mode;

      root.classList.remove("light", "dark");
      root.classList.add(effective);
      root.setAttribute("data-theme", effective);
      setResolvedTheme(effective);
    };

    applyTheme();
    mediaQuery.addEventListener("change", applyTheme);
    return () => mediaQuery.removeEventListener("change", applyTheme);
  }, [mode]);

  const setMode = React.useCallback(
    (nextMode: ThemeMode) => {
      if (typeof window !== "undefined") {
        try {
          window.sessionStorage.setItem(storageKey, nextMode);
        } catch {
          // Ignore storage write errors in restricted browsing modes
        }
      }
      setModeState(nextMode);
    },
    [storageKey]
  );

  return (
    <ThemeProviderContext.Provider value={{ mode, resolvedTheme, setMode }}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export function useTheme(): ThemeProviderState {
  return React.useContext(ThemeProviderContext);
}

