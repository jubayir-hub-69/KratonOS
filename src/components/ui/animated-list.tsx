import React from "react";
import {
  Activity,
  AlertTriangle,
  ArrowLeftRight,
  CheckCircle2,
  Cpu,
  ExternalLink,
  FileSpreadsheet,
  ShieldCheck,
  Users,
} from "lucide-react";

export type VerificationBadgeType =
  | "LIVE ON-CHAIN TX"
  | "LIVE RPC & TEE VERIFIED"
  | "DRY-RUN QUOTE PREVIEW";

export interface TelemetryFeedItem {
  id: string;
  title: string;
  description: string;
  timeAgo: string;
  category: "swap" | "tee" | "shield" | "payroll" | "market" | "loop";
  tone: "emerald" | "cyan" | "amber" | "red";
  verificationBadge?: VerificationBadgeType;
  txUrl?: string;
}

const TONE_STYLES: Record<
  TelemetryFeedItem["tone"],
  { bg: string; border: string; iconColor: string }
> = {
  emerald: {
    bg: "rgba(0, 201, 167, 0.16)",
    border: "rgba(34, 197, 94, 0.45)",
    iconColor: "#22c55e",
  },
  cyan: {
    bg: "rgba(34, 211, 238, 0.16)",
    border: "rgba(34, 211, 238, 0.45)",
    iconColor: "#22d3ee",
  },
  amber: {
    bg: "rgba(255, 184, 0, 0.16)",
    border: "rgba(255, 184, 0, 0.45)",
    iconColor: "#f59e0b",
  },
  red: {
    bg: "rgba(248, 113, 113, 0.16)",
    border: "rgba(248, 113, 113, 0.45)",
    iconColor: "#f87171",
  },
};

function renderCategoryIcon(
  category: TelemetryFeedItem["category"],
  color: string
) {
  const props = { className: "h-4 w-4 shrink-0", style: { color } };
  switch (category) {
    case "swap":
      return <ArrowLeftRight {...props} />;
    case "tee":
      return <Cpu {...props} />;
    case "shield":
      return <ShieldCheck {...props} />;
    case "payroll":
      return <FileSpreadsheet {...props} />;
    case "market":
      return <Users {...props} />;
    case "loop":
    default:
      return <Activity {...props} />;
  }
}

export function AnimatedListItem({ item }: { item: TelemetryFeedItem }) {
  const palette = TONE_STYLES[item.tone];
  const badgeKind: VerificationBadgeType =
    item.verificationBadge ??
    (item.category === "swap" ? "DRY-RUN QUOTE PREVIEW" : "LIVE RPC & TEE VERIFIED");
  const isLiveTx = badgeKind === "LIVE ON-CHAIN TX";
  const isLiveRpcOrTee = badgeKind === "LIVE RPC & TEE VERIFIED";

  return (
    <div
      className="animate-feed-in group relative flex items-start gap-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card-subtle)] p-3.5 sm:p-4 transition-all duration-200 hover:scale-[1.005] [box-shadow:0_0_0_1px_rgba(0,0,0,.04),0_2px_4px_rgba(0,0,0,.05),0_12px_24px_rgba(0,0,0,.05)] dark:[box-shadow:0_-20px_80px_-20px_#22c55e1a_inset]"
    >
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border"
        style={{
          backgroundColor: palette.bg,
          borderColor: palette.border,
        }}
      >
        {renderCategoryIcon(item.category, palette.iconColor)}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-1.5">
          <span className="min-w-0 break-words font-display text-xs font-bold text-[var(--text-primary)]">
            {item.title}
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            {isLiveTx && item.txUrl ? (
              <a
                href={item.txUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded border border-emerald-500/45 bg-emerald-500/15 px-1.5 py-0.5 font-mono text-[10px] font-extrabold text-[var(--accent-emerald)] hover:bg-emerald-500/25"
              >
                <span>[LIVE ON-CHAIN TX ↗]</span>
                <ExternalLink className="h-2.5 w-2.5 shrink-0" />
              </a>
            ) : isLiveRpcOrTee ? (
              <span className="inline-flex items-center rounded border border-emerald-500/40 bg-emerald-500/12 px-1.5 py-0.5 font-mono text-[10px] font-bold text-[var(--accent-emerald)]">
                [LIVE RPC &amp; TEE VERIFIED]
              </span>
            ) : (
              <span className="inline-flex items-center rounded border border-sky-500/40 bg-sky-500/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-[var(--accent-cyan)]">
                [DRY-RUN QUOTE PREVIEW]
              </span>
            )}
            <span className="shrink-0 font-mono text-[10px] text-[var(--text-muted)]">
              {item.timeAgo}
            </span>
          </div>
        </div>
        <p className="mt-1 break-words font-mono text-xs leading-relaxed text-[var(--text-secondary)]">
          {item.description}
        </p>
      </div>

      {item.tone === "emerald" || item.tone === "cyan" ? (
        <CheckCircle2 className="mt-0.5 hidden h-3.5 w-3.5 shrink-0 text-[var(--accent-emerald)] opacity-80 sm:block" />
      ) : (
        <AlertTriangle className="mt-0.5 hidden h-3.5 w-3.5 shrink-0 text-amber-500 opacity-80 sm:block" />
      )}
    </div>
  );
}

export function AnimatedList({
  items,
  maxVisible = 4,
  className = "",
}: {
  items: TelemetryFeedItem[];
  maxVisible?: number;
  className?: string;
}) {
  const visible = items.slice(0, maxVisible);
  return (
    <div className={`relative flex flex-col gap-3.5 overflow-hidden ${className}`}>
      {visible.map((item) => (
        <AnimatedListItem key={item.id} item={item} />
      ))}
    </div>
  );
}
export default AnimatedList;
