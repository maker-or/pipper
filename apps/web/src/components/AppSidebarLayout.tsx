import { useEffect, useMemo, type CSSProperties, type ReactNode } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";

import ThreadSidebar from "./Sidebar";
import { Sidebar, SidebarProvider, SidebarRail } from "./ui/sidebar";
import {
  clearShortcutModifierState,
  syncShortcutModifierStateFromKeyboardEvent,
} from "../shortcutModifierState";

const THREAD_SIDEBAR_WIDTH_STORAGE_KEY = "chat_thread_sidebar_width";
const THREAD_SIDEBAR_WIDTH = 5 * 16;
const THREAD_MAIN_CONTENT_MIN_WIDTH = 40 * 16;
const SETTINGS_SIDEBAR_WIDTH = 13 * 16;
export function AppSidebarLayout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const isOnSettings = location.pathname.startsWith("/settings");

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
      className="h-dvh! min-h-0!"
      defaultOpen
      style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}
    >
      <Sidebar
        side="left"
        collapsible="none"
        className={
          isOnSettings
            ? "relative z-10 h-dvh border-r border-border bg-card text-foreground"
            : "h-dvh border-r border-border bg-card text-foreground"
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
      >
        <ThreadSidebar />
        <SidebarRail />
      </Sidebar>
      {children}
    </SidebarProvider>
  );
}
