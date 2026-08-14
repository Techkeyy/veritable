"use client";

import { useEffect, useRef, type ElementType } from "react";

interface ScrollRevealProps {
  children: string;
  as?: "p" | "h2" | "h3";
  className?: string;
  enableBlur?: boolean;
  baseOpacity?: number;
  baseRotation?: number;
  blurStrength?: number;
}

function clamp(value: number) {
  return Math.min(1, Math.max(0, value));
}

export function ScrollReveal({
  children,
  as = "p",
  className = "",
  enableBlur = true,
  baseOpacity = 0.12,
  baseRotation = 3,
  blurStrength = 4,
}: ScrollRevealProps) {
  const containerRef = useRef<HTMLElement | null>(null);
  const wordRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const words = children.split(/\s+/);
  const Tag = as as ElementType;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let frame = 0;

    const render = () => {
      frame = 0;
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const rect = container.getBoundingClientRect();
      const start = window.innerHeight * 0.9;
      const distance = Math.max(window.innerHeight * 0.58, rect.height * 1.25);
      const progress = reducedMotion ? 1 : clamp((start - rect.top) / distance);
      container.style.transform = `rotate(${baseRotation * (1 - progress)}deg)`;

      wordRefs.current.forEach((word, index) => {
        if (!word) return;
        const delay = words.length > 1 ? (index / (words.length - 1)) * 0.42 : 0;
        const localProgress = reducedMotion ? 1 : clamp((progress - delay) / 0.58);
        word.style.opacity = String(baseOpacity + (1 - baseOpacity) * localProgress);
        word.style.filter = enableBlur ? `blur(${blurStrength * (1 - localProgress)}px)` : "none";
        word.style.transform = `translateY(${0.22 * (1 - localProgress)}em)`;
      });
    };

    const requestRender = () => {
      if (!frame) frame = window.requestAnimationFrame(render);
    };
    render();
    window.addEventListener("scroll", requestRender, { passive: true });
    window.addEventListener("resize", requestRender);
    return () => {
      window.removeEventListener("scroll", requestRender);
      window.removeEventListener("resize", requestRender);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [baseOpacity, baseRotation, blurStrength, enableBlur, words.length]);

  return (
    <Tag className={`scroll-reveal ${className}`.trim()} ref={(node: HTMLElement | null) => { containerRef.current = node; }} aria-label={children}>
      {words.map((word, index) => (
        <span className="scroll-reveal-word" aria-hidden="true" key={`${word}-${index}`} ref={(node) => { wordRefs.current[index] = node; }}>
          {word}{index < words.length - 1 ? "\u00a0" : ""}
        </span>
      ))}
    </Tag>
  );
}
