import Link from "next/link";
import type { ReactNode } from "react";

export function KpiCard({
  label,
  value,
  hint,
  accent = "bg-slate-100",
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  accent?: string;
  icon: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl text-lg ${accent}`}>{icon}</span>
        <span className="text-xs text-slate-400">{label}</span>
      </div>
      <div className="mt-2 text-2xl font-bold text-slate-800">{value}</div>
      {hint && <div className="text-xs text-slate-400">{hint}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: "default" | "good" | "bad" | "warn";
}) {
  const toneClass = {
    default: "text-slate-900",
    good: "text-line-600",
    bad: "text-rose-600",
    warn: "text-amber-600",
  }[tone];
  return (
    <div className="card">
      <div className="text-sm text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${toneClass}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-400">{hint}</div>}
    </div>
  );
}

export function SectionCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="card">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-800">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
}

const BADGE_TONES: Record<string, string> = {
  // project / connection
  DRAFT: "bg-slate-100 text-slate-600",
  SETUP: "bg-amber-100 text-amber-700",
  LIVE: "bg-line-500/10 text-line-600",
  PAUSED: "bg-slate-200 text-slate-600",
  CONNECTED: "bg-line-500/10 text-line-600",
  NOT_CONNECTED: "bg-slate-100 text-slate-500",
  ERROR: "bg-rose-100 text-rose-700",
  // lead status
  NEW: "bg-sky-100 text-sky-700",
  CONTACTED: "bg-indigo-100 text-indigo-700",
  QUALIFIED: "bg-violet-100 text-violet-700",
  QUOTED: "bg-amber-100 text-amber-700",
  WON: "bg-line-500/10 text-line-600",
  PAID: "bg-emerald-100 text-emerald-700",
  LOST: "bg-slate-200 text-slate-500",
  // conversion / event
  PENDING: "bg-amber-100 text-amber-700",
  SENT: "bg-line-500/10 text-line-600",
  FAILED: "bg-rose-100 text-rose-700",
  SKIPPED: "bg-slate-100 text-slate-500",
  QUEUED: "bg-sky-100 text-sky-700",
  NOT_READY: "bg-slate-100 text-slate-400",
  PASS: "bg-line-500/10 text-line-600",
  FAIL: "bg-rose-100 text-rose-700",
  // channel groups
  "Paid Search": "bg-blue-100 text-blue-700",
  "Paid Social": "bg-fuchsia-100 text-fuchsia-700",
  "Paid Other": "bg-indigo-100 text-indigo-700",
  "AI Assistant": "bg-emerald-100 text-emerald-700",
  "Organic Search": "bg-teal-100 text-teal-700",
  "Organic Social": "bg-cyan-100 text-cyan-700",
  Email: "bg-amber-100 text-amber-700",
  Referral: "bg-violet-100 text-violet-700",
  Direct: "bg-slate-100 text-slate-600",
};

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const tone = BADGE_TONES[status] ?? "bg-slate-100 text-slate-600";
  return <span className={`badge ${tone}`}>{label ?? status}</span>;
}

export function MockBadge({ mock }: { mock: boolean }) {
  return mock ? (
    <span className="badge bg-amber-100 text-amber-700">Mock mode</span>
  ) : (
    <span className="badge bg-line-500/10 text-line-600">Real</span>
  );
}

export function EmptyRow({ colSpan, text }: { colSpan: number; text: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-3 py-8 text-center text-sm text-slate-400">
        {text}
      </td>
    </tr>
  );
}

export function LinkButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="btn-ghost">
      {children}
    </Link>
  );
}

export function Progress({ percent }: { percent: number }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
      <div
        className="h-full rounded-full bg-brand-500 transition-all"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}
