import React from "react";

export function TextAnimate({
  text,
  by = "word",
  as: Tag = "span",
  className = "",
  staggerMs = 38,
}: {
  text: string;
  animation?: "fadeIn" | "blurInUp";
  by?: "word" | "line";
  as?: "h1" | "h2" | "h3" | "p" | "span" | "div";
  className?: string;
  staggerMs?: number;
}) {
  const segments = by === "line" ? text.split("\n") : text.split(" ");

  return (
    <Tag className={className}>
      {segments.map((seg, idx) => (
        <React.Fragment key={`${seg}-${idx}`}>
          <span
            className="animate-ta-in"
            style={{ animationDelay: `${idx * staggerMs}ms` }}
          >
            {seg}
          </span>
          {by === "word" && idx < segments.length - 1 ? " " : null}
        </React.Fragment>
      ))}
    </Tag>
  );
}
export default TextAnimate;

