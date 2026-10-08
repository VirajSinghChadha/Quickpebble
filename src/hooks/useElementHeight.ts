import { useEffect, useRef, useState } from "react";

/** Height of an element, kept up to date as the window is resized. Starts from a sensible guess. */
export function useElementHeight<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T | null>(null);
  const [h, setH] = useState(() => Math.max(300, (typeof window === "undefined" ? 800 : window.innerHeight) - 190));
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setH(Math.round(el.clientHeight));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure); // belt and braces: some embedded views don't notify observers
    const poll = window.setInterval(measure, 1000); // setting the same value again does not re-render
    return () => { ro.disconnect(); window.removeEventListener("resize", measure); window.clearInterval(poll); };
  }, []);
  return [ref, h];
}
