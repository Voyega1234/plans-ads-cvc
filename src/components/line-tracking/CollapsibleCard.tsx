"use client";

import { useState } from "react";
import type { ReactNode } from "react";

/**
 * Card whose body collapses to save space. The header (title + status badges)
 * stays visible; click it to expand/edit. Server-rendered `header`/`children`
 * are passed in as props.
 */
export function CollapsibleCard({
  header,
  children,
  defaultOpen = false,
}: {
  header: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-start justify-between gap-2 text-left"
        aria-expanded={open}
      >
        <div className="min-w-0 flex-1">{header}</div>
        <span className="mt-1 shrink-0 text-slate-400">{open ? "▲" : "▼"}</span>
      </button>
      {open && <div className="mt-3 border-t border-slate-100 pt-3">{children}</div>}
    </div>
  );
}
