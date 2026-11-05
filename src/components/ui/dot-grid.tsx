import React from "react";

export const DotGrid: React.FC<{
  spacing?: number;
  children?: React.ReactNode;
  className?: string;
}> = ({ spacing = 26, children, className = "" }) => {
  return (
    <div
      className={`relative min-h-screen w-full bg-[var(--bg-canvas)] text-[var(--text-primary)] transition-colors duration-300 ${className}`}
    >
      {/* Low-opacity isolated dot matrix layer (z-0, never bleeds through z-10 solid cards) */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 opacity-25"
        style={{
          backgroundImage: "radial-gradient(circle, var(--dot-color) 1px, transparent 1px)",
          backgroundSize: `${spacing}px ${spacing}px`,
        }}
      />

      {/* Subtle SVG Orbital Stage (.orbital-bg) */}
      <div className="orbital-bg" aria-hidden="true">
        <svg
          viewBox="0 0 1200 800"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="h-full w-full"
        >
          <circle
            cx="600"
            cy="400"
            r="280"
            stroke="var(--accent-emerald)"
            strokeWidth="1"
            strokeDasharray="6 10"
          />
          <circle
            cx="600"
            cy="400"
            r="440"
            stroke="var(--accent-cyan)"
            strokeWidth="1"
            strokeDasharray="4 12"
          />
        </svg>
      </div>

      {/* High-contrast isolated application content */}
      <div className="relative z-10">{children}</div>
    </div>
  );
};

export default DotGrid;
