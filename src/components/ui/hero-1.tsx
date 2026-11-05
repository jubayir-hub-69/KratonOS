import * as React from "react";
import { BookOpen, ChevronRight } from "lucide-react";
import {
  HulySolarButton,
  UnseenEnterButton,
} from "@/components/ui/interactive-buttons";
import { TextAnimate } from "@/components/ui/text-animate";

interface HeroProps {
  eyebrow?: string;
  title: string;
  subtitle: string;
  ctaLabel?: string;
  onCtaClick?: () => void;
  secondaryCtaLabel?: string;
  onSecondaryCtaClick?: () => void;
  secondaryDisabled?: boolean;
  walkthroughCtaLabel?: string;
  onWalkthroughCtaClick?: () => void;
}

export function Hero({
  eyebrow = "SOVEREIGN AGENT TREASURY // POC-4 PROTOCOL",
  title,
  subtitle,
  ctaLabel = "Open Cross-Chain Swap dApp",
  onCtaClick,
  secondaryCtaLabel = "EXECUTE 5-STAGE AUTONOMOUS LOOP",
  onSecondaryCtaClick,
  secondaryDisabled = false,
  walkthroughCtaLabel,
  onWalkthroughCtaClick,
}: HeroProps) {
  return (
    <section
      id="hero"
      className="system-card paper-card relative z-10 mx-auto w-full overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--panel-solid)] p-5 text-left sm:p-8 lg:px-10 lg:py-9"
    >
      <div className="card-border-scan" aria-hidden="true" />

      <div className="relative z-10 max-w-4xl min-w-0">
        {/* Eyebrow */}
        {eyebrow && (
          <div className="mb-4 inline-flex max-w-full flex-wrap items-center gap-2 rounded-full border border-emerald-500/45 bg-[var(--bg-card-subtle)] px-3 py-1 text-[10px] font-bold tracking-wider text-[var(--accent-emerald)] uppercase shadow-xs animate-fade-in sm:px-4 sm:py-1.5 sm:text-xs sm:whitespace-nowrap">
            <span className="card-status-dot" aria-hidden="true" />
            <span className="break-words">{eyebrow}</span>
            <ChevronRight className="h-3.5 w-3.5 shrink-0" />
          </div>
        )}

        {/* Magic UI TextAnimate Headline */}
        <TextAnimate
          as="h1"
          text={title}
          by="word"
          staggerMs={32}
          className="font-display max-w-3xl py-1 text-2xl font-extrabold tracking-tight text-[var(--text-primary)] sm:text-4xl lg:text-[2.65rem] lg:leading-[1.14]"
        />

        {/* Magic UI TextAnimate Subtitle */}
        <TextAnimate
          as="p"
          text={subtitle}
          by="line"
          staggerMs={90}
          className="mt-3 max-w-2xl text-sm font-medium leading-relaxed text-[var(--text-secondary)] sm:text-base"
        />

        {/* Left-Aligned Signature Interactive CTA Buttons */}
        <div className="mt-6 flex flex-wrap items-center justify-start gap-3 sm:mt-7 sm:gap-3.5 animate-fade-up">
          {secondaryCtaLabel && onSecondaryCtaClick && (
            <HulySolarButton
              label={secondaryCtaLabel}
              onClick={onSecondaryCtaClick}
              disabled={secondaryDisabled}
            />
          )}
          {ctaLabel && onCtaClick && (
            <UnseenEnterButton label={ctaLabel} onClick={onCtaClick} />
          )}
          {walkthroughCtaLabel && onWalkthroughCtaClick && (
            <button
              type="button"
              onClick={onWalkthroughCtaClick}
              className="inline-flex min-h-[2.4rem] max-w-full items-center gap-2 rounded-full border border-emerald-500/45 bg-emerald-500/12 px-4 py-2 font-mono text-xs font-extrabold tracking-wide text-[var(--accent-emerald)] transition-colors hover:bg-emerald-500/22 cursor-pointer"
            >
              <BookOpen className="h-3.5 w-3.5 shrink-0" />
              <span>{walkthroughCtaLabel}</span>
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
export default Hero;
