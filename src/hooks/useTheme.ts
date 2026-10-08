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
  { id: "aurora", label: "Aurora (teal + violet)", color: "linear-gradient(135deg,#0d9488,#7c3aed)" },
  { id: "sunrise", label: "Sunrise (orange + pink)", color: "linear-gradient(135deg,#f97316,#ec4899)" },
  { id: "twilight", label: "Twilight (indigo + cyan)", color: "linear-gradient(135deg,#4f46e5,#06b6d4)" },
] as const;

/** Light and dark mode each get their own color theme ("dual themes"). */
export function useTheme(): void {
  const theme = useStore((s) => s.theme);
  const presetLight = useStore((s) => s.presetLight);
  const presetDark = useStore((s) => s.presetDark);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = theme === "dark" || (theme === "system" && mq.matches);
      document.documentElement.classList.toggle("dark", dark);
      const preset = dark ? presetDark : presetLight;
      if (preset === "pebble") delete document.documentElement.dataset.preset;
      else document.documentElement.dataset.preset = preset;
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme, presetLight, presetDark]);
}
