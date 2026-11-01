import * as React from "react";
import { ChevronRight } from "lucide-react";
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
}: HeroProps) {
  return (
    <section
      id="hero"
      style={{ padding: "36px 40px" }}
      className="system-card paper-card relative z-10 mx-auto w-full overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--panel-solid)] text-left"
    >
      <div className="card-border-scan" aria-hidden="true" />

      <div className="relative z-10 max-w-4xl">
        {/* Eyebrow */}
        {eyebrow && (
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-500/45 bg-[var(--bg-card-subtle)] px-4 py-1.5 text-xs font-bold tracking-wider whitespace-nowrap text-[var(--accent-emerald)] uppercase shadow-xs animate-fade-in">
            <span className="card-status-dot" aria-hidden="true" />
            <span>{eyebrow}</span>
            <ChevronRight className="h-3.5 w-3.5 shrink-0" />
          </div>
        )}

        {/* Magic UI TextAnimate Headline */}
        <TextAnimate
          as="h1"
          text={title}
          by="word"
          staggerMs={32}
          className="font-display max-w-3xl py-1 text-3xl font-extrabold tracking-tight text-[var(--text-primary)] sm:text-4xl md:text-5xl"
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
        <div className="mt-7 flex flex-wrap items-center justify-start gap-4 animate-fade-up">
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
        </div>
      </div>
    </section>
  );
}
export default Hero;
