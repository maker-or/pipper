import { useCallback, useEffect, useMemo, useRef, type CSSProperties, type ReactNode } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";

import ThreadSidebar from "./Sidebar";
import { Sidebar, SidebarProvider, SidebarRail, useSidebar } from "./ui/sidebar";
import { useAppSpaceStore } from "../appSpaceStore";
import { isElectron } from "../env";
import {
  clearShortcutModifierState,
  syncShortcutModifierStateFromKeyboardEvent,
} from "../shortcutModifierState";

const THREAD_SIDEBAR_WIDTH_STORAGE_KEY = "chat_thread_sidebar_width";
const THREAD_SIDEBAR_WIDTH = 5 * 16;
const THREAD_MAIN_CONTENT_MIN_WIDTH = 40 * 16;
const SETTINGS_SIDEBAR_WIDTH = 13 * 16;
const SIDEBAR_CLOSE_DELAY_MS = 200;

export function AppSidebarLayout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const isOnSettings = location.pathname.startsWith("/settings");
  const activeSpace = useAppSpaceStore((store) => store.activeSpace);
  const isImproveSpace = activeSpace === "improve";

  const { sidebarWidth, sidebarMaxWidth, sidebarMinWidth } = useMemo(() => {
    if (isOnSettings) {
      return {
        sidebarWidth: SETTINGS_SIDEBAR_WIDTH,
        sidebarMaxWidth: SETTINGS_SIDEBAR_WIDTH,
        sidebarMinWidth: SETTINGS_SIDEBAR_WIDTH,
      };
    }
    return {
      sidebarWidth: THREAD_SIDEBAR_WIDTH,
      sidebarMaxWidth: THREAD_SIDEBAR_WIDTH,
      sidebarMinWidth: THREAD_SIDEBAR_WIDTH,
    };
  }, [isOnSettings]);

  useEffect(() => {
    const onWindowKeyDown = (event: KeyboardEvent) => {
      syncShortcutModifierStateFromKeyboardEvent(event);
    };
    const onWindowKeyUp = (event: KeyboardEvent) => {
      syncShortcutModifierStateFromKeyboardEvent(event);
    };
    const onWindowBlur = () => {
      clearShortcutModifierState();
    };

    window.addEventListener("keydown", onWindowKeyDown, true);
    window.addEventListener("keyup", onWindowKeyUp, true);
    window.addEventListener("blur", onWindowBlur);

    return () => {
      window.removeEventListener("keydown", onWindowKeyDown, true);
      window.removeEventListener("keyup", onWindowKeyUp, true);
      window.removeEventListener("blur", onWindowBlur);
    };
  }, []);

  useEffect(() => {
    const onMenuAction = window.desktopBridge?.onMenuAction;
    if (typeof onMenuAction !== "function") {
      return;
    }

    const unsubscribe = onMenuAction((action) => {
      if (action === "open-settings") {
        void navigate({ to: "/settings" });
      }
    });

    return () => {
      unsubscribe?.();
    };
  }, [navigate]);

  return (
    <SidebarProvider
      data-pipper-id="app-sidebar-layout"
      className="h-dvh! min-h-0!"
      data-active-space={activeSpace}
      defaultOpen={false}
      style={
        isElectron
          ? ({
              "--sidebar-width": `${sidebarWidth}px`,
              "--sidebar-floating-top-offset": "2.5rem",
            } as CSSProperties)
          : ({ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties)
      }
    >
      <SidebarLayoutInner
        isImproveSpace={isImproveSpace}
        isOnSettings={isOnSettings}
        sidebarMaxWidth={sidebarMaxWidth}
        sidebarMinWidth={sidebarMinWidth}
        sidebarWidth={sidebarWidth}
      >
        {children}
      </SidebarLayoutInner>
    </SidebarProvider>
  );
}

function SidebarLayoutInner({
  children,
  isImproveSpace,
  isOnSettings,
  sidebarMaxWidth,
  sidebarMinWidth,
  sidebarWidth,
}: {
  children: ReactNode;
  isImproveSpace: boolean;
  isOnSettings: boolean;
  sidebarMaxWidth: number;
  sidebarMinWidth: number;
  sidebarWidth: number;
}) {
  const { setOpen, isMobile } = useSidebar();
  const closeTimerRef = useRef<number | null>(null);

  const cancelClose = useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      void setOpen(false);
    }, SIDEBAR_CLOSE_DELAY_MS);
  }, [cancelClose, setOpen]);

  const handleHoverZoneEnter = useCallback(() => {
    cancelClose();
    void setOpen(true);
  }, [cancelClose, setOpen]);

  useEffect(() => {
    return () => {
      cancelClose();
    };
  }, [cancelClose]);

  const sidebarMouseHandlers = isMobile
    ? {}
    : {
        onMouseEnter: cancelClose,
        onMouseLeave: scheduleClose,
      };

  return (
    <>
      {isImproveSpace ? null : (
        <Sidebar
          data-pipper-id="app-sidebar-shell"
          side="left"
          variant="floating"
          collapsible="offcanvas"
          className={
            isOnSettings
              ? "relative z-10 h-dvh bg-card text-foreground"
              : "h-dvh bg-card text-foreground"
          }
          style={
            {
              "--sidebar-width": `${sidebarWidth}px`,
            } as CSSProperties
          }
          resizable={
            isOnSettings
              ? false
              : {
                  maxWidth: sidebarMaxWidth,
                  minWidth: sidebarMinWidth,
                  shouldAcceptWidth: ({ nextWidth, wrapper }) =>
                    wrapper.clientWidth - nextWidth >= THREAD_MAIN_CONTENT_MIN_WIDTH,
                  storageKey: THREAD_SIDEBAR_WIDTH_STORAGE_KEY,
                }
          }
          {...sidebarMouseHandlers}
        >
          <ThreadSidebar />
          <SidebarRail />
        </Sidebar>
      )}
      {isElectron && !isImproveSpace ? <SidebarKeyboardShortcutListener /> : null}
      {!isImproveSpace ? <SidebarHoverZone onOpenSidebar={handleHoverZoneEnter} /> : null}
      <div data-pipper-id="app-main-shell" className="flex min-h-0 min-w-0 flex-1">
        {children}
      </div>
    </>
  );
}

function SidebarHoverZone({ onOpenSidebar }: { onOpenSidebar: () => void }) {
  const { state, isMobile } = useSidebar();

  if (isMobile || state === "expanded") {
    return null;
  }

  return (
    <button
      aria-label="Open sidebar"
      className="fixed bottom-0 left-0 top-[var(--sidebar-floating-top-offset,0.5rem)] z-30 w-2 cursor-e-resize bg-primary/25 transition-colors hover:bg-primary/45"
      onMouseEnter={onOpenSidebar}
      tabIndex={-1}
      title="Open sidebar"
      type="button"
    />
  );
}

function SidebarKeyboardShortcutListener() {
  const { toggleSidebar } = useSidebar();

  useEffect(() => {
    const onWindowKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat) {
        return;
      }
      if (event.key.toLowerCase() !== "b") {
        return;
      }
      if (!event.ctrlKey && !event.metaKey) {
        return;
      }
      if (event.altKey || event.shiftKey) {
        return;
      }

      const target = event.target instanceof HTMLElement ? event.target : null;
      const tagName = target?.tagName;
      if (
        target?.isContentEditable ||
        tagName === "INPUT" ||
        tagName === "TEXTAREA" ||
        tagName === "SELECT"
      ) {
        return;
      }

      event.preventDefault();
      toggleSidebar();
    };

    window.addEventListener("keydown", onWindowKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onWindowKeyDown, true);
    };
  }, [toggleSidebar]);

  return null;
}
