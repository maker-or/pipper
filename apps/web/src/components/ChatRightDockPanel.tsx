import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type TransitionEvent,
} from "react";
import { cn } from "~/lib/utils";

const DOCK_CLOSE_FALLBACK_MS = 380;

/**
 * Right column shell for inline diff / terminal: animates width + slide + fade so the main chat
 * column eases smoothly. Uses delayed unmount so close transitions can finish.
 */
export function ChatRightDockPanel(props: {
  active: boolean;
  children: ReactNode;
  className?: string;
}) {
  const { active, children, className } = props;
  const [mounted, setMounted] = useState(active);
  const [visualOpen, setVisualOpen] = useState(false);
  const closeFallbackRef = useRef<number | null>(null);

  useEffect(() => {
    if (closeFallbackRef.current !== null) {
      window.clearTimeout(closeFallbackRef.current);
      closeFallbackRef.current = null;
    }

    if (active) {
      setMounted(true);
      const rafId = requestAnimationFrame(() => {
        setVisualOpen(true);
      });
      return () => cancelAnimationFrame(rafId);
    }

    setVisualOpen(false);
    return undefined;
  }, [active]);

  useEffect(() => {
    if (active || visualOpen || !mounted) {
      return;
    }
    closeFallbackRef.current = window.setTimeout(() => {
      closeFallbackRef.current = null;
      setMounted(false);
    }, DOCK_CLOSE_FALLBACK_MS);
    return () => {
      if (closeFallbackRef.current !== null) {
        window.clearTimeout(closeFallbackRef.current);
        closeFallbackRef.current = null;
      }
    };
  }, [active, mounted, visualOpen]);

  const onTransitionEnd = useCallback(
    (event: TransitionEvent<HTMLDivElement>) => {
      if (event.target !== event.currentTarget) {
        return;
      }
      if (event.propertyName !== "width") {
        return;
      }
      if (active || visualOpen) {
        return;
      }
      if (closeFallbackRef.current !== null) {
        window.clearTimeout(closeFallbackRef.current);
        closeFallbackRef.current = null;
      }
      setMounted(false);
    },
    [active, visualOpen],
  );

  if (!mounted) {
    return null;
  }

  return (
    <div
      data-pipper-id="chat-right-dock-panel"
      className={cn(
        "chat-right-dock-shell flex min-h-0 shrink-0 flex-col self-stretch overflow-hidden",
        className,
      )}
      data-open={visualOpen ? "true" : "false"}
      onTransitionEnd={onTransitionEnd}
    >
      <div
        data-pipper-id="chat-right-dock-surface"
        className="chat-right-dock-surface flex min-h-0 flex-1 flex-col"
      >
        {children}
      </div>
    </div>
  );
}
