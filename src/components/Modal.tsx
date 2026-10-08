import { useEffect, useRef, type ReactNode } from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";

/** Backdrop + panel shared by overlays. Panels use an 18px radius, palettes 16px. */
export function Modal({
  onClose,
  children,
  label,
  align = "center",
  width = "max-w-xl",
  radius = "rounded-2xl",
}: {
  onClose: () => void;
  children: ReactNode;
  label: string;
  align?: "center" | "top";
  width?: string;
  radius?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const panel = ref.current;
    panel?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); closeRef.current(); }
      if (e.key !== "Tab" || !panel) return;
      const focusable = [...panel.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]')].filter(el => el.getClientRects().length);
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (!first) { e.preventDefault(); panel.focus(); }
      else if (e.shiftKey && (document.activeElement === first || document.activeElement === panel)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || document.activeElement === panel)) { e.preventDefault(); first.focus(); }
    };
    panel?.addEventListener('keydown', key);
    return () => { panel?.removeEventListener("keydown", key); prev?.focus?.(); };
  }, []);
  return (
    <motion.div
      className={`fixed inset-0 z-40 flex justify-center bg-black/30 px-4 backdrop-blur-[2px] ${align === "top" ? "items-start pt-[14vh]" : "items-center"}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        initial={{ opacity: 0, y: 8, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.98 }}
        transition={{ duration: 0.17, ease: [0.2, 0.8, 0.2, 1] }}
        className={`flex max-h-[78vh] w-full flex-col overflow-hidden border border-border bg-surface shadow-float outline-none ${width} ${radius}`}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

export function ModalHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
      <h2 className="text-[14px] font-semibold">{title}</h2>
      <button type="button" aria-label="Close" onClick={onClose} className="grid size-7 place-items-center rounded-lg text-text-secondary transition-colors duration-150 hover:bg-surface-secondary">
        <X size={15} />
      </button>
    </div>
  );
}
