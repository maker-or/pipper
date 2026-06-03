import { useCallback, useEffect, useState } from "react";

import { IMPROVE_WORKSPACE_ROOT } from "../hooks/useOpenImproveSpace";
import { useEvolutionStore } from "../evolutionStore";
import { useEvolutionUpdateCheck } from "../hooks/useEvolutionUpdateCheck";
import { useAppSpaceStore } from "../appSpaceStore";
import { isElectron } from "../env";
import { cn } from "~/lib/utils";
import { EvolutionOnboarding } from "./EvolutionOnboarding";
import { EvolutionUpdateBanner } from "./EvolutionUpdateBanner";
import { ImproveEvolutionActions } from "./ImproveEvolutionActions";
import { SidebarInset, SidebarTrigger } from "./ui/sidebar";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "./ui/empty";
import { Button } from "./ui/button";

function readDesktopBridge() {
  if (typeof window === "undefined") {
    return undefined;
  }
  return window.desktopBridge;
}

/**
 * Check whether the evolution workspace exists by calling the desktop bridge
 * or by checking workspace status on the server.
 */
async function checkWorkspaceExists(): Promise<boolean> {
  const bridge = readDesktopBridge();
  if (bridge && "getEvolutionWorkspaceStatus" in bridge && bridge.getEvolutionWorkspaceStatus) {
    const status = await bridge.getEvolutionWorkspaceStatus();
    return status.exists;
  }

  // Fallback: try ensureEvolutionWorkspace to see if it exists
  if (bridge?.ensureEvolutionWorkspace) {
    const result = await bridge.ensureEvolutionWorkspace();
    return result.existed;
  }

  return false;
}

/**
 * EvolutionSpace — the main view for the Evolution Space.
 *
 * The Evolution Space is where autonomous software evolution occurs.
 * It provides a dedicated environment with:
 * - No project sidebar (handled by AppSidebarLayout when activeSpace === "improve")
 * - Onboarding flow for first-time setup
 * - Agent-focused chat interface
 * - Run, Approve, Port action buttons
 * - Update notification system
 */
export function EvolutionSpace() {
  const workspaceStatus = useEvolutionStore((s) => s.workspaceStatus);
  const setWorkspaceStatus = useEvolutionStore((s) => s.setWorkspaceStatus);
  const activeSpace = useAppSpaceStore((s) => s.activeSpace);
  const setActiveSpace = useAppSpaceStore((s) => s.setActiveSpace);
  const [isChecking, setIsChecking] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Check for updates when workspace exists and has a version
  useEvolutionUpdateCheck({
    localVersion: workspaceStatus?.localVersion ?? null,
    enabled: workspaceStatus?.exists === true,
  });

  // Check workspace status on mount
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const exists = await checkWorkspaceExists();
        if (cancelled) return;

        if (exists) {
          setWorkspaceStatus({
            exists: true,
            hasGit: true,
            hasDependencies: true,
            localVersion: null, // Will be populated from server
            workspaceRoot: IMPROVE_WORKSPACE_ROOT,
          });
          setShowOnboarding(false);
        } else {
          setWorkspaceStatus({
            exists: false,
            hasGit: false,
            hasDependencies: false,
            localVersion: null,
            workspaceRoot: IMPROVE_WORKSPACE_ROOT,
          });
          setShowOnboarding(true);
        }
      } catch {
        setShowOnboarding(true);
      } finally {
        if (!cancelled) {
          setIsChecking(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [setWorkspaceStatus]);

  const handleSetupComplete = useCallback(() => {
    setShowOnboarding(false);
    setWorkspaceStatus({
      exists: true,
      hasGit: true,
      hasDependencies: true,
      localVersion: null,
      workspaceRoot: IMPROVE_WORKSPACE_ROOT,
    });
  }, [setWorkspaceStatus]);

  const handleReturnToMain = useCallback(() => {
    setActiveSpace("main");
  }, [setActiveSpace]);

  // Only render when in evolution space
  if (activeSpace !== "improve") {
    return null;
  }

  // Loading state
  if (isChecking) {
    return (
      <SidebarInset
        data-pipper-id="evolution-space"
        className="h-dvh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground"
      >
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden bg-background">
          <EvolutionSpaceHeader />
          <div className="flex flex-1 items-center justify-center">
            <div className="text-sm text-muted-foreground/60">Checking evolution workspace…</div>
          </div>
        </div>
      </SidebarInset>
    );
  }

  // First-time onboarding
  if (showOnboarding) {
    return (
      <SidebarInset
        data-pipper-id="evolution-space"
        className="h-dvh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground"
      >
        <EvolutionOnboarding
          onSetupComplete={handleSetupComplete}
          onRetry={() => setShowOnboarding(true)}
        />
      </SidebarInset>
    );
  }

  // Main evolution space — the agent-focused workspace view
  return (
    <SidebarInset
      data-pipper-id="evolution-space"
      className="h-dvh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground"
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden bg-background">
        <EvolutionSpaceHeader />

        <div className="flex flex-1 flex-col overflow-y-auto px-4 py-4 sm:px-6">
          <EvolutionUpdateBanner />

          <Empty className="flex-1">
            <div className="w-full max-w-xl rounded-3xl border border-border/55 bg-card/20 px-8 py-12 shadow-sm/5">
              <EmptyHeader className="max-w-none">
                <div className="mb-4 inline-flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500/15 to-amber-500/10 text-orange-300 ring-1 ring-orange-400/20">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="size-7"
                  >
                    <path d="M12 2L2 7l10 5 10-5-10-5z" />
                    <path d="M2 17l10 5 10-5" />
                    <path d="M2 12l10 5 10-5" />
                  </svg>
                </div>
                <EmptyTitle className="text-foreground text-xl">Evolution Space</EmptyTitle>
                <EmptyDescription className="mt-2 max-w-sm text-sm text-muted-foreground/78">
                  This is where agents modify Pipper's source code. Start a thread to request
                  changes, fix bugs, add features, or evolve the product.
                </EmptyDescription>
              </EmptyHeader>

              <div className="mt-6 flex flex-col gap-3">
                <div className="flex items-center gap-3 rounded-lg border border-border/40 bg-background/40 px-4 py-3">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-orange-500/10 text-orange-300">
                    <span className="text-sm">📁</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-foreground/80">Workspace</p>
                    <p
                      className="truncate text-[11px] text-muted-foreground/50"
                      title={IMPROVE_WORKSPACE_ROOT}
                    >
                      {IMPROVE_WORKSPACE_ROOT}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 rounded-lg border border-border/40 bg-background/40 px-4 py-3">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sky-500/10 text-sky-300">
                    <span className="text-sm">🎨</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-foreground/80">Design Language</p>
                    <p className="text-[11px] text-muted-foreground/50">
                      Governed by DESIGN.md in your workspace
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 rounded-lg border border-border/40 bg-background/40 px-4 py-3">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-300">
                    <span className="text-sm">📝</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-foreground/80">Intent Memory</p>
                    <p className="text-[11px] text-muted-foreground/50">
                      patch.md records why changes are made
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-6 flex justify-center">
                <Button
                  className="rounded-full"
                  size="sm"
                  variant="outline"
                  onClick={handleReturnToMain}
                >
                  Return to main
                </Button>
              </div>
            </div>
          </Empty>
        </div>
      </div>
    </SidebarInset>
  );
}

function EvolutionSpaceHeader() {
  const activeSpace = useAppSpaceStore((s) => s.activeSpace);
  const isImproveSpace = activeSpace === "improve";

  return (
    <header
      className={cn(
        "border-b border-border px-3 sm:px-5",
        isElectron
          ? "drag-region flex h-[52px] items-center wco:h-[env(titlebar-area-height)]"
          : "py-2 sm:py-3",
      )}
    >
      {isElectron ? (
        <div className="flex w-full items-center justify-between gap-3 wco:pr-[calc(100vw-env(titlebar-area-width)-env(titlebar-area-x)+1em)]">
          <span className="text-xs font-medium text-orange-400/70">Evolution Space</span>
          {isImproveSpace ? <ImproveEvolutionActions /> : null}
        </div>
      ) : (
        <div className="flex items-center gap-2">
          {isImproveSpace ? null : <SidebarTrigger className="size-7 shrink-0 md:hidden" />}
          <span className="text-sm font-medium text-orange-400/70">Evolution Space</span>
          <div className="ml-auto">
            <ImproveEvolutionActions />
          </div>
        </div>
      )}
    </header>
  );
}
