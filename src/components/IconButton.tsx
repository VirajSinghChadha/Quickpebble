import type { ButtonHTMLAttributes, ReactNode } from "react";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  active?: boolean;
  children: ReactNode;
}

/** 32px icon button, 8px radius, 150ms transitions (Pebble UI small button). */
export function IconButton({ label, active, children, className = "", ...rest }: Props) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...rest}
      className={`grid size-8 shrink-0 place-items-center rounded-lg text-text-secondary transition-colors duration-150 ease-pebble
        hover:bg-surface-secondary hover:text-text-primary disabled:pointer-events-none disabled:opacity-40
        ${active ? "bg-surface-secondary text-primary" : ""} ${className}`}
    >
      {children}
    </button>
  );
}
