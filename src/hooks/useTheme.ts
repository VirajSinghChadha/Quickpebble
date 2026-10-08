import { useEffect } from "react";
import { useStore } from "../store/useStore";

export const PRESETS = [
  { id: "pebble", label: "Pebble", color: "#2563eb" },
  { id: "ocean", label: "Ocean", color: "#0891b2" },
  { id: "forest", label: "Forest", color: "#16a34a" },
  { id: "sunset", label: "Sunset", color: "#ea580c" },
  { id: "lavender", label: "Lavender", color: "#7c3aed" },
  { id: "rose", label: "Rose", color: "#e11d48" },
  { id: "graphite", label: "Graphite", color: "#374151" },
] as const;

export function useTheme(): void {
  const theme = useStore((s) => s.theme);
  const preset = useStore((s) => s.themePreset);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => document.documentElement.classList.toggle("dark", theme === "dark" || (theme === "system" && mq.matches));
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme]);
  useEffect(() => {
    if (preset === "pebble") delete document.documentElement.dataset.preset;
    else document.documentElement.dataset.preset = preset;
  }, [preset]);
}
