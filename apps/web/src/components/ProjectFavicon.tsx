import { useEffect, useMemo, useRef, memo } from "react";
import { gsap } from "gsap";
import type { EnvironmentId } from "@t3tools/contracts";
import type { CSSProperties } from "react";
import { useTheme } from "../hooks/useTheme";

function initialsForProject(value: string): string {
  const parts = value
    .trim()
    .split(/[\s._/-]+/)
    .filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase();
  }

  return (parts[0] ?? value).slice(0, 2).toUpperCase();
}

function projectIconColorSetFromTheme(active: boolean): {
  primary: string;
  secondary: string;
  text: string;
  opacity: string;
} {
  if (typeof document === "undefined") {
    return {
      primary: active ? "rgb(28, 33, 41)" : "rgb(34, 37, 35)",
      secondary: active ? "rgb(78, 85, 94)" : "rgb(0, 0, 0)",
      text: active ? "rgb(255, 255, 255)" : "rgb(58, 58, 58)",
      opacity: active ? "1" : "0.48",
    };
  }

  const styles = getComputedStyle(document.documentElement);
  const primary = styles.getPropertyValue(active ? "--foreground" : "--surface-elevated").trim();
  const secondary = styles
    .getPropertyValue(active ? "--surface-strong" : "--surface-canvas")
    .trim();
  const text = styles.getPropertyValue(active ? "--background" : "--muted-foreground").trim();

  return {
    primary: primary || (active ? "rgb(28, 33, 41)" : "rgb(34, 37, 35)"),
    secondary: secondary || (active ? "rgb(78, 85, 94)" : "rgb(0, 0, 0)"),
    text: text || (active ? "rgb(255, 255, 255)" : "rgb(58, 58, 58)"),
    opacity: active ? "1" : "0.48",
  };
}

export const ProjectFavicon = memo(function ProjectFavicon(input: {
  environmentId: EnvironmentId;
  cwd: string;
  projectName?: string;
  active?: boolean;
  className?: string;
}) {
  const { theme } = useTheme();
  const label =
    input.projectName?.trim() || input.cwd.split(/[\\/]/).filter(Boolean).at(-1) || "PR";
  const colors = useMemo(
    () => projectIconColorSetFromTheme(Boolean(input.active)),
    [input.active, theme],
  );

  const spanRef = useRef<HTMLSpanElement>(null);
  const prevActiveRef = useRef(input.active);

  useEffect(() => {
    const span = spanRef.current;
    if (!span) return;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) {
      gsap.killTweensOf(span);
      span.style.setProperty("--project-icon-primary", colors.primary);
      span.style.setProperty("--project-icon-secondary", colors.secondary);
      span.style.setProperty("--project-icon-text", colors.text);
      span.style.setProperty("--project-icon-opacity", colors.opacity);
      prevActiveRef.current = input.active;
      return;
    }

    gsap.killTweensOf(span);

    if (prevActiveRef.current !== input.active) {
      if (input.active) {
        gsap.to(span, {
          "--project-icon-primary": colors.primary,
          "--project-icon-secondary": colors.secondary,
          "--project-icon-text": colors.text,
          "--project-icon-opacity": colors.opacity,
          duration: 0.25,
          ease: "power3.out",
        });
      } else {
        span.style.setProperty("--project-icon-primary", colors.primary);
        span.style.setProperty("--project-icon-secondary", colors.secondary);
        span.style.setProperty("--project-icon-text", colors.text);
        span.style.setProperty("--project-icon-opacity", colors.opacity);
      }
      prevActiveRef.current = input.active;
    } else {
      span.style.setProperty("--project-icon-primary", colors.primary);
      span.style.setProperty("--project-icon-secondary", colors.secondary);
      span.style.setProperty("--project-icon-text", colors.text);
      span.style.setProperty("--project-icon-opacity", colors.opacity);
    }
  }, [input.active, colors]);

  return (
    <span
      data-pipper-id="project-favicon"
      ref={spanRef}
      aria-hidden="true"
      style={
        {
          "--project-icon-primary": colors.primary,
          "--project-icon-secondary": colors.secondary,
          "--project-icon-text": colors.text,
          "--project-icon-opacity": colors.opacity,
        } as CSSProperties
      }
      className={`cursor-pointer inline-flex shrink-0 items-center justify-center rounded-sm bg-[linear-gradient(180deg,var(--project-icon-primary)_0%,var(--project-icon-secondary)_100%)] leading-none text-[var(--project-icon-text)] tracking-[-0.04em] opacity-[var(--project-icon-opacity)] transition-opacity duration-200 ${input.className ?? ""}`}
    >
      {initialsForProject(label)}
    </span>
  );
});
