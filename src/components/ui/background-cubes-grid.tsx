import React, { useEffect, useRef } from "react";
import { useTheme } from "@/components/ui/theme-provider";

interface RippleWave {
  x: number;
  y: number;
  bornAt: number;
  speed: number;
  maxRadius: number;
  amplitude: number;
}

export function BackgroundCubesGrid({
  className = "fixed inset-0 w-screen h-screen pointer-events-none z-0",
}: {
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { resolvedTheme } = useTheme();
  const pointerRef = useRef<{ x: number; y: number; active: boolean }>({
    x: -9999,
    y: -9999,
    active: false,
  });
  const ripplesRef = useRef<RippleWave[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    const CW = 88;
    const CH = 44;
    const DEPTH = 28;
    const FRAME_INTERVAL_MS = 41; // 24fps throttled loop

    let rafId = 0;
    let lastFrameTime = 0;
    let width = Math.max(1, window.innerWidth);
    let height = Math.max(1, window.innerHeight);
    let isScrolling = false;
    let scrollTimer = 0;
    let needsBaseBlit = true;

    const offscreenCanvas = document.createElement("canvas");
    const offCtx = offscreenCanvas.getContext("2d", { alpha: false });

    const isLight = resolvedTheme === "light";
    const palette = isLight
      ? {
          bg: "#f4f7f4",
          top: "#eaf4ed",
          left: "#dcebe1",
          right: "#d0e3d6",
          stroke: "rgba(22, 163, 74, 0.14)",
          glowRgb: "22, 163, 74",
        }
      : {
          bg: "#05080f",
          top: "#0b1513",
          left: "#070d0f",
          right: "#091112",
          stroke: "rgba(34, 197, 94, 0.13)",
          glowRgb: "34, 197, 94",
        };

    const drawSingleCube = (
      targetCtx: CanvasRenderingContext2D,
      cx: number,
      y: number,
      glow: number
    ) => {
      const hw = CW * 0.5;
      const hh = CH * 0.5;

      // Top Isometric Rhombus Face
      targetCtx.beginPath();
      targetCtx.moveTo(cx, y - hh);
      targetCtx.lineTo(cx + hw, y);
      targetCtx.lineTo(cx, y + hh);
      targetCtx.lineTo(cx - hw, y);
      targetCtx.closePath();
      targetCtx.fillStyle = palette.top;
      targetCtx.fill();
      if (glow > 0.04) {
        targetCtx.fillStyle = `rgba(${palette.glowRgb}, ${glow.toFixed(2)})`;
        targetCtx.fill();
      }
      targetCtx.strokeStyle = palette.stroke;
      targetCtx.lineWidth = 0.75;
      targetCtx.stroke();

      // Left Shaded Face
      targetCtx.beginPath();
      targetCtx.moveTo(cx - hw, y);
      targetCtx.lineTo(cx, y + hh);
      targetCtx.lineTo(cx, y + hh + DEPTH);
      targetCtx.lineTo(cx - hw, y + DEPTH);
      targetCtx.closePath();
      targetCtx.fillStyle = palette.left;
      targetCtx.fill();
      targetCtx.stroke();

      // Right Shaded Face
      targetCtx.beginPath();
      targetCtx.moveTo(cx + hw, y);
      targetCtx.lineTo(cx, y + hh);
      targetCtx.lineTo(cx, y + hh + DEPTH);
      targetCtx.lineTo(cx + hw, y + DEPTH);
      targetCtx.closePath();
      targetCtx.fillStyle = palette.right;
      targetCtx.fill();
      targetCtx.stroke();
    };

    // Pre-render the entire static isometric grid ONCE onto offscreenCanvas
    const rebuildOffscreenGrid = () => {
      width = Math.max(1, window.innerWidth);
      height = Math.max(1, window.innerHeight);

      // Cap dpr = 1 for background canvas to save 75% fill-rate
      canvas.width = width;
      canvas.height = height;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      offscreenCanvas.width = width;
      offscreenCanvas.height = height;

      if (!offCtx) return;
      offCtx.fillStyle = palette.bg;
      offCtx.fillRect(0, 0, width, height);

      const cols = Math.ceil(width / CW) + 2;
      const rows = Math.ceil(height / (CH * 0.75)) + 3;

      for (let r = -1; r < rows; r++) {
        const rowOffset = (r & 1) * (CW * 0.5);
        const cy = r * (CH * 0.75);
        for (let c = -1; c < cols; c++) {
          const cx = c * CW + rowOffset;
          drawSingleCube(offCtx, cx, cy, 0);
        }
      }

      ctx.drawImage(offscreenCanvas, 0, 0);
      needsBaseBlit = false;
    };

    const onWindowPointerMove = (e: PointerEvent) => {
      pointerRef.current = {
        x: e.clientX,
        y: e.clientY,
        active: true,
      };
    };

    const onWindowPointerDown = (e: PointerEvent) => {
      ripplesRef.current.push({
        x: e.clientX,
        y: e.clientY,
        bornAt: performance.now(),
        speed: 0.32,
        maxRadius: 280,
        amplitude: 12,
      });
      if (ripplesRef.current.length > 3) {
        ripplesRef.current.shift();
      }
    };

    const onWindowBlur = () => {
      pointerRef.current.active = false;
      needsBaseBlit = true;
    };

    const onWindowScroll = () => {
      isScrolling = true;
      window.clearTimeout(scrollTimer);
      scrollTimer = window.setTimeout(() => {
        isScrolling = false;
      }, 150);
    };

    rebuildOffscreenGrid();
    window.addEventListener("resize", rebuildOffscreenGrid, { passive: true });
    window.addEventListener("pointermove", onWindowPointerMove, { passive: true });
    window.addEventListener("pointerdown", onWindowPointerDown, { passive: true });
    window.addEventListener("blur", onWindowBlur);
    window.addEventListener("scroll", onWindowScroll, { passive: true });

    const render = (now: number) => {
      rafId = requestAnimationFrame(render);

      // Pause rendering when tab is hidden or user is actively scrolling
      if (document.hidden || isScrolling) return;

      // Throttle to 24fps (41ms interval)
      if (now - lastFrameTime < FRAME_INTERVAL_MS) return;
      lastFrameTime = now;

      ripplesRef.current = ripplesRef.current.filter(
        (r) => (now - r.bornAt) * r.speed < r.maxRadius
      );

      const hasActivePointer = pointerRef.current.active;
      const hasActiveRipples = ripplesRef.current.length > 0;

      if (!hasActivePointer && !hasActiveRipples) {
        if (needsBaseBlit) {
          ctx.drawImage(offscreenCanvas, 0, 0);
          needsBaseBlit = false;
        }
        return;
      }

      // Single fast GPU blit of the pre-rendered static grid
      ctx.drawImage(offscreenCanvas, 0, 0);
      needsBaseBlit = true;

      const rowStep = CH * 0.75;
      const radius = 180;

      // Only draw dynamic cubes within 180px of pointer or active click ripples
      const minX = hasActivePointer ? pointerRef.current.x - radius : 0;
      const maxX = hasActivePointer ? pointerRef.current.x + radius : width;
      const minY = hasActivePointer ? pointerRef.current.y - radius : 0;
      const maxY = hasActivePointer ? pointerRef.current.y + radius : height;

      const startRow = Math.max(-1, Math.floor((hasActiveRipples ? 0 : minY) / rowStep) - 1);
      const endRow = Math.min(
        Math.ceil(height / rowStep) + 2,
        Math.ceil((hasActiveRipples ? height : maxY) / rowStep) + 1
      );
      const startCol = Math.max(-1, Math.floor((hasActiveRipples ? 0 : minX) / CW) - 1);
      const endCol = Math.min(
        Math.ceil(width / CW) + 2,
        Math.ceil((hasActiveRipples ? width : maxX) / CW) + 1
      );

      for (let r = startRow; r <= endRow; r++) {
        const rowOffset = (r & 1) * (CW * 0.5);
        const cy = r * rowStep;

        for (let c = startCol; c <= endCol; c++) {
          const cx = c * CW + rowOffset;
          let lift = 0;
          let glow = 0;

          if (hasActivePointer) {
            const dx = cx - pointerRef.current.x;
            const dy = cy - pointerRef.current.y;
            const dist = Math.hypot(dx, dy);
            if (dist < radius) {
              const factor = 1 - dist / radius;
              const smooth = factor * factor * (3 - 2 * factor);
              lift += smooth * 10;
              glow = Math.min(0.45, smooth * 0.42);
            }
          }

          for (const rip of ripplesRef.current) {
            const dist = Math.hypot(cx - rip.x, cy - rip.y);
            const waveRadius = (now - rip.bornAt) * rip.speed;
            const delta = Math.abs(dist - waveRadius);
            if (delta < 46) {
              const w = (1 - delta / 46) * (1 - waveRadius / rip.maxRadius);
              lift += Math.sin((1 - delta / 46) * Math.PI) * rip.amplitude * w;
              glow = Math.min(0.55, glow + w * 0.4);
            }
          }

          if (lift > 0.25 || glow > 0.03) {
            drawSingleCube(ctx, cx, cy - lift, glow);
          }
        }
      }
    };

    rafId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(rafId);
      window.clearTimeout(scrollTimer);
      window.removeEventListener("resize", rebuildOffscreenGrid);
      window.removeEventListener("pointermove", onWindowPointerMove);
      window.removeEventListener("pointerdown", onWindowPointerDown);
      window.removeEventListener("blur", onWindowBlur);
      window.removeEventListener("scroll", onWindowScroll);
    };
  }, [resolvedTheme]);

  const isLight = resolvedTheme === "light";

  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        width: "100vw",
        height: "100vh",
        pointerEvents: "none",
        zIndex: 0,
        overflow: "hidden",
      }}
      className={className}
    >
      <canvas ref={canvasRef} className="block h-full w-full" />
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background: isLight
            ? "radial-gradient(ellipse at 50% 35%, rgba(244, 247, 244, 0.72) 0%, rgba(244, 247, 244, 0.86) 100%)"
            : "radial-gradient(ellipse at 50% 35%, rgba(5, 8, 15, 0.68) 0%, rgba(5, 8, 15, 0.84) 100%)",
        }}
      />
    </div>
  );
}
export default BackgroundCubesGrid;
