import { useEffect } from "react";
import { useStore } from "../store/useStore";

/** The ten colour themes. `name` is shown under each swatch; `label` (with the colours of the two-colour ones) is the full name. */
export const PRESETS = [
  { id: "pebble", name: "Pebble", label: "Pebble", color: "#2563eb" },
  { id: "ocean", name: "Ocean", label: "Ocean", color: "#0891b2" },
  { id: "forest", name: "Forest", label: "Forest", color: "#16a34a" },
  { id: "sunset", name: "Sunset", label: "Sunset", color: "#ea580c" },
  { id: "lavender", name: "Lavender", label: "Lavender", color: "#7c3aed" },
  { id: "rose", name: "Rose", label: "Rose", color: "#e11d48" },
  { id: "graphite", name: "Graphite", label: "Graphite", color: "#374151" },
  { id: "aurora", name: "Aurora", label: "Aurora (teal + violet)", color: "linear-gradient(135deg,#0d9488,#7c3aed)" },
  { id: "sunrise", name: "Sunrise", label: "Sunrise (orange + pink)", color: "linear-gradient(135deg,#f97316,#ec4899)" },
  { id: "twilight", name: "Twilight", label: "Twilight (indigo + cyan)", color: "linear-gradient(135deg,#4f46e5,#06b6d4)" },
] as const;

/** The full name of a theme, for hints: "Aurora (teal + violet)". */
export const presetLabel = (id: string): string => PRESETS.find((p) => p.id === id)?.label ?? PRESETS[0].label;

/** Light and dark mode each get their own color theme ("dual themes"). */
export function useTheme(): void {
  const theme = useStore((s) => s.theme);
  const presetLight = useStore((s) => s.presetLight);
  const presetDark = useStore((s) => s.presetDark);
  const wallpaper = useStore((s) => s.wallpaper);
  useEffect(() => { if (wallpaper) document.documentElement.dataset.wall = "on"; else delete document.documentElement.dataset.wall; }, [wallpaper]);
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
