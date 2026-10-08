import { useState } from "react";
import { Globe } from "lucide-react";
import { hostOf } from "../lib/url";

/** Favicon with a graceful fallback; never calls a third-party favicon service. */
export function Favicon({ src, url, size = 16 }: { src: string; url: string; size?: number }) {
  const [failed, setFailed] = useState<string | null>(null);
  if (!src || failed === src) {
    const letter = hostOf(url).charAt(0).toUpperCase();
    return letter ? (
      <span
        className="grid shrink-0 place-items-center rounded-[4px] bg-surface-secondary text-[9px] font-semibold text-text-secondary"
        style={{ width: size, height: size }}
        aria-hidden
      >
        {letter}
      </span>
    ) : (
      <Globe size={size} className="shrink-0 text-text-secondary" aria-hidden />
    );
  }
  return <img src={src} width={size} height={size} alt="" className="shrink-0 rounded-[3px]" onError={() => setFailed(src)} draggable={false} />;
}
