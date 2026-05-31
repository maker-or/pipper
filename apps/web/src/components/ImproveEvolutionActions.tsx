import type { ReactNode } from "react";
import { useState } from "react";
import {
  CheckCircleIcon,
  CheckIcon,
  Loader2Icon,
  PackageIcon,
  PlayIcon,
  SquareIcon,
} from "lucide-react";

import { useDevDesktopProcess } from "../hooks/useDevDesktopProcess";
import { IMPROVE_WORKSPACE_ROOT } from "../hooks/useOpenImproveSpace";
import { cn } from "~/lib/utils";
import { Button } from "./ui/button";
import { stackedThreadToast, toastManager } from "./ui/toast";

type PortStatus = "idle" | "building" | "copying" | "opening" | "failed" | "done";

function readDesktopBridge() {
  if (typeof window === "undefined") {
    return undefined;
  }
  return window.desktopBridge;
}

export function ImproveEvolutionActions({ className }: { readonly className?: string }) {
  const bridge = readDesktopBridge();
  const {
    state,
    hasApi: hasDevDesktopApi,
    isBusy: isDevDesktopBusy,
    toggle,
  } = useDevDesktopProcess();
  const hasApprovalApi = Boolean(bridge?.approveEvolutionChanges);
  const hasPortApi = Boolean(bridge?.portEvolutionRelease);
  const [approvedCommit, setApprovedCommit] = useState<string | null>(null);
  const [isApproving, setIsApproving] = useState(false);
  const [portStatus, setPortStatus] = useState<PortStatus>("idle");

  if (!hasDevDesktopApi && !hasApprovalApi && !hasPortApi) {
    return null;
  }

  const running = state?.running ?? false;
  const cwd = running ? (state?.cwd ?? IMPROVE_WORKSPACE_ROOT) : IMPROVE_WORKSPACE_ROOT;
  const runTitle = running
    ? `Stop bun run dev:desktop in ${cwd}`
    : `Run bun run dev:desktop in ${cwd}`;
  const runLabel = running ? "Running" : "Run preview";
  const runIcon: ReactNode = running ? (
    <SquareIcon aria-hidden="true" className="size-4" />
  ) : (
    <PlayIcon aria-hidden="true" className="size-4" fill="currentColor" />
  );

  const approveChanges = async () => {
    if (!bridge?.approveEvolutionChanges) return;
    setApprovedCommit(null);
    setIsApproving(true);
    try {
      const result = await bridge.approveEvolutionChanges({ summary: "Approve Improve changes" });
      setApprovedCommit(result.commit);
      toastManager.add(
        stackedThreadToast({
          type: "success",
          title: "Evolution changes approved",
          description: `${result.commit.slice(0, 12)} · ${result.filesChanged.length} files changed`,
        }),
      );
    } catch (error) {
      setApprovedCommit(null);
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: "Failed to approve changes",
          description: error instanceof Error ? error.message : "An unknown error occurred.",
        }),
      );
    } finally {
      setIsApproving(false);
    }
  };

  const portRelease = async () => {
    if (!bridge?.portEvolutionRelease) return;
    setPortStatus("building");
    try {
      const result = await bridge.portEvolutionRelease();
      setPortStatus("done");
      toastManager.add(
        stackedThreadToast({
          type: "success",
          title: "DMG opened",
          description: `${result.manifest.releaseId} · ${result.manifest.commit.slice(0, 12)}`,
        }),
      );
    } catch (error) {
      setPortStatus("failed");
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: "Failed to port release",
          description: error instanceof Error ? error.message : "An unknown error occurred.",
        }),
      );
    }
  };

  const portLabel =
    portStatus === "building"
      ? "Building"
      : portStatus === "copying"
        ? "Copying DMG"
        : portStatus === "opening"
          ? "Opening"
          : portStatus === "done"
            ? "DMG opened"
            : "Port";
  const isPortBusy =
    portStatus === "building" || portStatus === "copying" || portStatus === "opening";
  const portIcon =
    portStatus === "done" ? (
      <CheckCircleIcon aria-hidden="true" className="size-4" />
    ) : isPortBusy ? (
      <Loader2Icon aria-hidden="true" className="size-4 animate-spin" />
    ) : (
      <PackageIcon aria-hidden="true" className="size-4" />
    );

  return (
    <div className={cn("no-drag flex min-w-0 items-center gap-2", className)}>
      <span
        className="hidden max-w-[18rem] truncate rounded-full border border-orange-300/20 bg-orange-500/10 px-2.5 py-1 text-xs font-medium text-orange-50/80 xl:inline"
        title={IMPROVE_WORKSPACE_ROOT}
      >
        {IMPROVE_WORKSPACE_ROOT}
      </span>
      {hasDevDesktopApi ? (
        <Button
          aria-label={runTitle}
          aria-pressed={running}
          className={cn(
            "rounded-full border px-3 font-medium shadow-xs/5",
            running
              ? "border-emerald-300/35 bg-emerald-500/15 text-emerald-50 hover:bg-emerald-500/20"
              : "border-orange-300/35 bg-orange-500/12 text-orange-50 hover:bg-orange-500/18",
          )}
          disabled={isDevDesktopBusy}
          size="sm"
          title={runTitle}
          variant="outline"
          onClick={() => {
            void (async () => {
              try {
                await toggle(cwd);
              } catch (error) {
                toastManager.add(
                  stackedThreadToast({
                    type: "error",
                    title: running ? "Failed to stop preview" : "Failed to start preview",
                    description:
                      error instanceof Error ? error.message : "An unknown error occurred.",
                  }),
                );
              }
            })();
          }}
        >
          {runIcon}
          <span className="min-w-0 truncate">{runLabel}</span>
        </Button>
      ) : null}
      {hasApprovalApi ? (
        <Button
          className="rounded-full border border-sky-300/30 bg-sky-500/12 px-3 font-medium text-sky-50 shadow-xs/5 hover:bg-sky-500/18"
          disabled={isApproving || portStatus === "building"}
          size="sm"
          title="Run checks and commit Improve workspace changes"
          variant="outline"
          onClick={() => void approveChanges()}
        >
          <CheckIcon aria-hidden="true" className="size-4" />
          <span className="min-w-0 truncate">{isApproving ? "Approving" : "Approve Changes"}</span>
        </Button>
      ) : null}
      {hasPortApi ? (
        <Button
          aria-busy={isPortBusy}
          className={cn(
            "rounded-full border px-3 font-medium shadow-xs/5 disabled:opacity-45",
            portStatus === "done"
              ? "border-emerald-300/35 bg-emerald-500/15 text-emerald-50 hover:bg-emerald-500/20"
              : "border-violet-300/35 bg-violet-500/14 text-violet-50 hover:bg-violet-500/20",
          )}
          disabled={isPortBusy || isApproving}
          size="sm"
          title={
            approvedCommit
              ? `Build a DMG from ${approvedCommit.slice(0, 12)} and open it`
              : "Build a DMG from the current Improve workspace and open it"
          }
          variant="outline"
          onClick={() => void portRelease()}
        >
          {portIcon}
          <span className="min-w-0 truncate">{portLabel}</span>
        </Button>
      ) : null}
    </div>
  );
}
