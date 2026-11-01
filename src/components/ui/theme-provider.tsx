import * as React from "react";

export type ThemeMode = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

interface ThemeProviderState {
  mode: ThemeMode;
  resolvedTheme: ResolvedTheme;
  setMode: (mode: ThemeMode) => void;
}

const ThemeProviderContext = React.createContext<ThemeProviderState>({
  mode: "dark",
  resolvedTheme: "dark",
  setMode: () => null,
});

export function ThemeProvider({
  children,
  defaultMode = "dark",
  storageKey = "kratonos-ui-theme",
}: {
  children: React.ReactNode;
  defaultMode?: ThemeMode;
  storageKey?: string;
}) {
  const [mode, setModeState] = React.useState<ThemeMode>(() => {
    if (typeof window === "undefined") return defaultMode;
    const saved = window.localStorage.getItem(storageKey) as ThemeMode | null;
    return saved === "light" || saved === "dark" || saved === "system" ? saved : defaultMode;
  });

  const [resolvedTheme, setResolvedTheme] = React.useState<ResolvedTheme>("dark");

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
        window.localStorage.setItem(storageKey, nextMode);
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

