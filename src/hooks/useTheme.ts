import { useState, useEffect } from "react";
import { useColorScheme } from "react-native";
import { palette } from "../theme";
import { getSetting, saveSetting } from "../database";

export type ThemeMode = "system" | "light" | "dark";

export function useTheme() {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>("system");
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    async function loadTheme() {
      const saved = await getSetting("theme_mode");
      if (saved) {
        setModeState(saved as ThemeMode);
      }
      setInitialized(true);
    }
    loadTheme();
  }, []);

  async function setMode(newMode: ThemeMode) {
    setModeState(newMode);
    await saveSetting("theme_mode", newMode);
  }

  const activeScheme = mode === "system" ? systemScheme || "light" : mode;

  const colors = palette[activeScheme as "light" | "dark"];

  return {
    mode,
    setMode,
    colors,
    scheme: activeScheme,
    initialized,
  };
}
