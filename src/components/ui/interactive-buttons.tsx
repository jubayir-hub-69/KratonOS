import React, { useEffect, useRef, useState } from "react";
import { ArrowRight, Sparkles } from "lucide-react";

// ============================================================================
// 1. KultiveretMenuButton (.btn-kult-btn)
// ============================================================================

export function KultiveretMenuButton({
  isOpen,
  onToggle,
  openLabel = "COLLAPSE MENU",
  closeLabel = "EXPAND",
  hideLabel = false,
  className = "",
}: {
  isOpen: boolean;
  onToggle: () => void;
  openLabel?: string;
  closeLabel?: string;
  hideLabel?: boolean;
  className?: string;
}) {
  const currentLabel = isOpen ? closeLabel : openLabel;
  return (
    <button
      type="button"
      onClick={onToggle}
      title={isOpen ? "Expand Sidebar Navigation" : "Collapse Sidebar Navigation"}
      aria-label="Toggle Sidebar Navigation"
      className={`btn-kult-btn shrink-0 whitespace-nowrap ${isOpen ? "is-open" : ""} ${className}`}
    >
      <span className="btn-kult-icon shrink-0" aria-hidden="true">
        <span className="btn-kult-open">
          <span />
          <span />
        </span>
        <span className="btn-kult-close">
          <span />
          <span />
        </span>
      </span>
      {!hideLabel && (
        <span className="btn-kult-label-wrap whitespace-nowrap">
          <span className="btn-kult-text whitespace-nowrap">{currentLabel}</span>
          <span className="btn-kult-text--dup whitespace-nowrap" aria-hidden="true">
            {currentLabel}
          </span>
        </span>
      )}
    </button>
  );
}

// ============================================================================
// 2. HulySolarButton (.btn-huly-root / .btn-huly-btn)
// ============================================================================

export function HulySolarButton({
  label,
  onClick,
  disabled = false,
  icon,
  className = "",
}: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  icon?: React.ReactNode;
  className?: string;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = rootRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const relX = Math.max(0, Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width)));
    const pct = `${(relX * 100).toFixed(1)}%`;
    const leftOp = (1 - relX * 0.7).toFixed(2);
    const rightOp = (0.3 + relX * 0.7).toFixed(2);
    el.style.setProperty("--flare-x", pct);
    el.style.setProperty("--glow-left-op", leftOp);
    el.style.setProperty("--glow-right-op", rightOp);
  };

  return (
    <div
      ref={rootRef}
      onMouseMove={handleMouseMove}
      className={`btn-huly-root shrink-0 whitespace-nowrap ${className}`}
    >
      <div className="btn-huly-blur-ring" aria-hidden="true" />
      <div className="btn-huly-light-ring" aria-hidden="true" />
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="btn-huly-btn w-full shrink-0 whitespace-nowrap"
      >
        {icon ?? <Sparkles className="h-3.5 w-3.5 shrink-0 text-[#00EC97]" />}
        <span className="whitespace-nowrap">{label}</span>
      </button>
    </div>
  );
}

// ============================================================================
// 3. HoldConfirmButton (.btn-hold-wrap / .btn-hold-btn)
// ============================================================================

const PARTICLE_VECTORS = Array.from({ length: 14 }, (_, idx) => {
  const angle = (idx / 14) * Math.PI * 2;
  const dist = 24 + (idx % 3) * 10;
  return {
    tx: `${Math.round(Math.cos(angle) * dist)}px`,
    ty: `${Math.round(Math.sin(angle) * dist)}px`,
  };
});

export function HoldConfirmButton({
  label,
  doneLabel = "CONFIRMED",
  onConfirm,
  disabled = false,
  holdDurationMs = 900,
  testId,
  className = "",
}: {
  label: string;
  doneLabel?: string;
  onConfirm: () => void | Promise<void>;
  disabled?: boolean;
  holdDurationMs?: number;
  testId?: string;
  className?: string;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const [progress, setProgress] = useState(0);
  const [draining, setDraining] = useState(false);
  const [done, setDone] = useState(false);
  const [bursting, setBursting] = useState(false);

  const clearRaf = () => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  };

  const triggerSuccess = () => {
    clearRaf();
    setProgress(100);
    setDraining(false);
    setDone(true);
    setBursting(true);
    void onConfirm();
    setTimeout(() => {
      setBursting(false);
    }, 600);
    setTimeout(() => {
      setDone(false);
      setProgress(0);
    }, 1800);
  };

  const startHold = () => {
    if (disabled || done) return;
    clearRaf();
    setDraining(false);
    startTimeRef.current = performance.now();

    const step = (now: number) => {
      const elapsed = now - (startTimeRef.current ?? now);
      const pct = Math.min(100, (elapsed / holdDurationMs) * 100);
      setProgress(pct);
      if (pct >= 100) {
        triggerSuccess();
      } else {
        rafRef.current = requestAnimationFrame(step);
      }
    };

    rafRef.current = requestAnimationFrame(step);
  };

  const cancelHold = () => {
    if (done) return;
    clearRaf();
    if (progress > 0 && progress < 100) {
      setDraining(true);
      setProgress(0);
    }
  };

  useEffect(() => () => clearRaf(), []);

  return (
    <div
      ref={wrapRef}
      style={{ ["--hold" as string]: `${progress.toFixed(1)}%` }}
      className={`btn-hold-wrap shrink-0 whitespace-nowrap ${
        draining ? "is-draining" : ""
      } ${done ? "is-done" : ""} ${bursting ? "is-bursting" : ""} ${className}`}
    >
      <button
        type="button"
        data-testid={testId}
        disabled={disabled}
        onPointerDown={startHold}
        onPointerUp={cancelHold}
        onPointerLeave={cancelHold}
        onPointerCancel={cancelHold}
        onKeyDown={(e) => {
          if (e.key === " " || e.key === "Enter") {
            startHold();
          }
        }}
        onKeyUp={(e) => {
          if (e.key === " " || e.key === "Enter") {
            cancelHold();
          }
        }}
        onDoubleClick={() => {
          if (!disabled && !done) triggerSuccess();
        }}
        className="btn-hold-btn w-full shrink-0 whitespace-nowrap"
      >
        <span className="btn-hold-fill" aria-hidden="true" />
        <span className="btn-hold-content whitespace-nowrap">
          {done ? (
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="btn-hold-draw shrink-0 text-[var(--accent-emerald)]"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : null}
          <span className="whitespace-nowrap">{done ? doneLabel : label}</span>
        </span>
      </button>

      <div className="btn-hold-particles" aria-hidden="true">
        {PARTICLE_VECTORS.map((vec, i) => (
          <span
            key={i}
            className="btn-hold-particle"
            style={{
              ["--tx" as string]: vec.tx,
              ["--ty" as string]: vec.ty,
            }}
          />
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// 4. RunCompilerButton (.btn-run-compiler)
// ============================================================================

export function RunCompilerButton({
  label,
  running = false,
  onClick,
  disabled = false,
}: {
  label: string;
  running?: boolean;
  onClick: () => void | Promise<void>;
  disabled?: boolean;
}) {
  const [litBoxes, setLitBoxes] = useState(0);
  const [statusLabel, setStatusLabel] = useState(label);

  useEffect(() => {
    if (running) {
      setStatusLabel(`EXEC :: ${label}`);
      setLitBoxes(1);
      const timer = setInterval(() => {
        setLitBoxes((prev) => (prev < 6 ? prev + 1 : 1));
      }, 150);
      return () => clearInterval(timer);
    } else {
      setLitBoxes(6);
      setStatusLabel(label);
    }
  }, [running, label]);

  return (
    <button
      type="button"
      disabled={disabled || running}
      onClick={() => void onClick()}
      className="btn-run-compiler shrink-0 whitespace-nowrap"
    >
      <span className="truncate whitespace-nowrap">
        &gt; {running ? statusLabel : label}
        <span className="btn-run-compiler__caret is--blinking" aria-hidden="true" />
      </span>

      <span className="btn-run-compiler__bars shrink-0" aria-hidden="true">
        {[0, 1, 2, 3, 4, 5].map((idx) => (
          <span
            key={idx}
            style={{ ["--i" as string]: idx }}
            className={`btn-run-compiler__box ${idx < litBoxes ? "is-lit" : ""}`}
          />
        ))}
      </span>
    </button>
  );
}

// ============================================================================
// 5. UnseenEnterButton (.btn-unseen-enter)
// ============================================================================

export function UnseenEnterButton({
  label,
  onClick,
  href,
  disabled = false,
  className = "",
}: {
  label: string;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
  className?: string;
}) {
  const inner = (
    <>
      <span className="ue-fill" aria-hidden="true" />
      <span className="ue-label-wrap whitespace-nowrap">
        <span className="ue-label whitespace-nowrap">{label}</span>
        <span className="ue-label--clone whitespace-nowrap" aria-hidden="true">
          {label}
        </span>
      </span>
      <ArrowRight className="ue-arrow h-3.5 w-3.5 shrink-0" />
    </>
  );

  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className={`btn-unseen-enter shrink-0 whitespace-nowrap ${className}`}
      >
        {inner}
      </a>
    );
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`btn-unseen-enter shrink-0 whitespace-nowrap ${className}`}
    >
      {inner}
    </button>
  );
}
