"use client";

import { memo, useLayoutEffect, useState, type ReactNode } from "react";

import { cn } from "~/lib/utils";

const THREAD_CONTENT_TRANSITION_CLASS_NAME =
  "block min-w-0 transition-[opacity,filter] duration-180 ease-out will-change-[opacity,filter] motion-reduce:transition-none";

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export const ThreadContentTransition = memo(function ThreadContentTransition({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  const [isEntered, setIsEntered] = useState(() => prefersReducedMotion());

  useLayoutEffect(() => {
    if (prefersReducedMotion()) {
      setIsEntered(true);
      return;
    }

    setIsEntered(false);
    const frameId = window.requestAnimationFrame(() => {
      setIsEntered(true);
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, []);

  return (
    <div
      className={cn(THREAD_CONTENT_TRANSITION_CLASS_NAME, className)}
      style={
        isEntered
          ? {
              filter: "blur(0px)",
              opacity: 1,
            }
          : {
              filter: "blur(2px)",
              opacity: 0.84,
            }
      }
    >
      {children}
    </div>
  );
});
