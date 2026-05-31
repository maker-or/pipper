import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { useParams } from "@tanstack/react-router";
import {
  CheckCircleIcon,
  CheckIcon,
  CircleAlertIcon,
  Loader2Icon,
  PackageIcon,
  PlayIcon,
  SquareIcon,
} from "lucide-react";

import { useDevDesktopProcess } from "../hooks/useDevDesktopProcess";
import { IMPROVE_WORKSPACE_ROOT } from "../hooks/useOpenImproveSpace";
import { readEnvironmentApi } from "../environmentApi";
import { createThreadSelectorByRef } from "../storeSelectors";
import { useStore } from "../store";
import { resolveThreadRouteTarget } from "../threadRoutes";
import { cn, newCommandId, newMessageId } from "~/lib/utils";
import { Button } from "./ui/button";
import { stackedThreadToast, toastManager } from "./ui/toast";

type PortStatus = "idle" | "building" | "copying" | "opening" | "failed" | "done";
type ActionStatusTone = "loading" | "success" | "error";

const APPLY_CHANGE_INSTRUCTION = [
  "I am happy with the current implementation and the changes that have been made.",
  "",
  "Please commit the current changes to the local Git repository. Do not push the changes to any remote repository under any circumstances. Only create a local commit.",
  "",
  "After the commit is successfully created, update the `patch.md` file with a new entry using the following structure:",
  "",
  "```json",
  "{",
  '  "files_changed": [],',
  '  "git_hash": "",',
  '  "intent": "Explain the purpose of the change, why it was made, and what user need or workflow it improves."',
  "}",
  "```",
  "",
  "Rules for updating `patch.md`:",
  "",
  "* Only update `patch.md` after the commit has been successfully created.",
  "* Use the commit hash generated from the newly created commit.",
  "* `files_changed` should contain only the files related to this specific feature or change.",
  "* `intent` should clearly describe the reasoning behind the change, not the implementation details.",
  "* Each committed feature or change must have its own standalone JSON block in `patch.md`.",
  "* Do not nest JSON objects.",
  "* Do not create grouped entries covering multiple unrelated features.",
  "* Do not introduce any additional fields beyond:",
  "",
  "  * `files_changed`",
  "  * `git_hash`",
  "  * `intent`",
  "* Never modify previous entries unless explicitly instructed.",
  "* Never push the repository after committing.",
  "* Once the commit and `patch.md` update are complete, report the commit hash back to the user.",
].join("\n");

function readDesktopBridge() {
  if (typeof window === "undefined") {
    return undefined;
  }
  return window.desktopBridge;
}

export function ImproveEvolutionActions({ className }: { readonly className?: string }) {
  const bridge = readDesktopBridge();
  const routeTarget = useParams({
    strict: false,
    select: (params) => resolveThreadRouteTarget(params),
  });
  const activeThreadRef = routeTarget?.kind === "server" ? routeTarget.threadRef : null;
  const activeThreadSelector = useMemo(
    () => createThreadSelectorByRef(activeThreadRef),
    [activeThreadRef],
  );
  const activeThread = useStore(activeThreadSelector);
  const {
    state,
    hasApi: hasDevDesktopApi,
    isBusy: isDevDesktopBusy,
    toggle,
  } = useDevDesktopProcess();
  const hasApprovalApi = Boolean(bridge?.approveEvolutionChanges);
  const hasPortApi = Boolean(bridge?.portEvolutionRelease);
  const [isApproving, setIsApproving] = useState(false);
  const [portStatus, setPortStatus] = useState<PortStatus>("idle");
  const [actionStatus, setActionStatus] = useState<{
    readonly tone: ActionStatusTone;
    readonly text: string;
  } | null>(null);

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

  const applyChanges = async () => {
    if (!activeThreadRef || !activeThread) {
      setActionStatus({ tone: "error", text: "Open the Improve thread before applying changes." });
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: "No Improve thread selected",
          description: "Open the thread that made the change, then apply it.",
        }),
      );
      return;
    }

    if (activeThread.session?.status === "running") {
      setActionStatus({ tone: "error", text: "Wait for the current turn to finish." });
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: "Thread is busy",
          description: "The current Improve turn is still running.",
        }),
      );
      return;
    }

    const api = readEnvironmentApi(activeThreadRef.environmentId);
    if (!api) {
      setActionStatus({ tone: "error", text: "Improve environment is not connected." });
      return;
    }

    setIsApproving(true);
    setActionStatus({
      tone: "loading",
      text: "Continuing the thread to commit and update patch.md.",
    });
    try {
      await api.orchestration.dispatchCommand({
        type: "thread.turn.start",
        commandId: newCommandId(),
        threadId: activeThreadRef.threadId,
        message: {
          messageId: newMessageId(),
          role: "user",
          text: APPLY_CHANGE_INSTRUCTION,
          attachments: [],
        },
        modelSelection: activeThread.modelSelection,
        titleSeed: activeThread.title,
        runtimeMode: activeThread.runtimeMode,
        interactionMode: activeThread.interactionMode,
        createdAt: new Date().toISOString(),
      });
      setActionStatus(null);
      toastManager.add(
        stackedThreadToast({
          type: "loading",
          title: "Applying Improve change",
          description: "The thread is committing changes locally and updating patch.md.",
        }),
      );
    } catch (error) {
      setActionStatus({
        tone: "error",
        text: error instanceof Error ? error.message : "Apply change failed.",
      });
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: "Failed to apply change",
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
    setActionStatus({ tone: "loading", text: "Building the macOS DMG into the release folder." });
    try {
      const result = await bridge.portEvolutionRelease();
      setPortStatus("done");
      setActionStatus({
        tone: "success",
        text: `DMG copied to ${result.releaseDir} and opened in Finder.`,
      });
      toastManager.add(
        stackedThreadToast({
          type: "success",
          title: "DMG opened",
          description: `${result.manifest.releaseId} · ${result.manifest.commit.slice(0, 12)}`,
        }),
      );
    } catch (error) {
      setPortStatus("failed");
      setActionStatus({
        tone: "error",
        text: error instanceof Error ? error.message : "Port failed.",
      });
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: "Failed to port release",
          description: error instanceof Error ? error.message : "An unknown error occurred.",
        }),
      );
    }
  };

  const isPortBusy =
    portStatus === "building" || portStatus === "copying" || portStatus === "opening";
  const portIcon = isPortBusy ? (
    <Loader2Icon aria-hidden="true" className="size-4 animate-spin" />
  ) : (
    <PackageIcon aria-hidden="true" className="size-4" />
  );
  const statusIcon =
    actionStatus?.tone === "loading" ? (
      <Loader2Icon className="size-3.5 shrink-0 animate-spin" aria-hidden="true" />
    ) : actionStatus?.tone === "success" ? (
      <CheckCircleIcon className="size-3.5 shrink-0" aria-hidden="true" />
    ) : (
      <CircleAlertIcon className="size-3.5 shrink-0" aria-hidden="true" />
    );

  return (
    <div
      className={cn(
        "no-drag flex min-w-0 flex-col items-end justify-end gap-1.5 lg:flex-row lg:items-center lg:gap-2",
        className,
      )}
    >
      {actionStatus ? (
        <div
          className={cn(
            "hidden min-w-0 max-w-[24rem] items-center gap-1.5 truncate rounded-full border px-3 py-1.5 text-xs font-medium shadow-xs/5 lg:flex",
            actionStatus.tone === "loading"
              ? "border-sky-300/40 bg-sky-500/18 text-sky-50 shadow-sky-950/20"
              : actionStatus.tone === "success"
                ? "border-emerald-300/35 bg-emerald-500/14 text-emerald-50"
                : "border-red-300/35 bg-red-500/14 text-red-50",
          )}
          title={actionStatus.text}
        >
          {statusIcon}
          <span className="truncate">{actionStatus.text}</span>
        </div>
      ) : null}
      <div className="flex min-w-0 items-center gap-2">
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
            aria-busy={isApproving}
            className={cn(
              "rounded-full border px-3 font-medium text-sky-50 shadow-xs/5 transition-[background-color,border-color,box-shadow,transform]",
              isApproving
                ? "border-sky-200/60 bg-sky-500/25 shadow-[0_0_0_1px_rgb(125_211_252_/_0.18),0_0_22px_rgb(14_165_233_/_0.22)]"
                : "border-sky-300/30 bg-sky-500/12 hover:bg-sky-500/18",
            )}
            disabled={isApproving || isPortBusy}
            size="sm"
            title="Continue the Improve thread so the agent commits locally and updates patch.md"
            variant="outline"
            onClick={() => void applyChanges()}
          >
            {isApproving ? (
              <Loader2Icon aria-hidden="true" className="size-4 animate-spin" />
            ) : (
              <CheckIcon aria-hidden="true" className="size-4" />
            )}
            <span className="min-w-0 truncate">Apply Change</span>
          </Button>
        ) : null}
        {hasPortApi ? (
          <Button
            aria-busy={isPortBusy}
            className="rounded-full border border-violet-300/35 bg-violet-500/14 px-3 font-medium text-violet-50 shadow-xs/5 hover:bg-violet-500/20 disabled:opacity-45"
            disabled={isPortBusy || isApproving}
            size="sm"
            title="Run the macOS DMG build, copy it to the release folder, and open the installer"
            variant="outline"
            onClick={() => void portRelease()}
          >
            {portIcon}
            <span className="min-w-0 truncate">Port</span>
          </Button>
        ) : null}
      </div>
      {actionStatus ? (
        <div
          className={cn(
            "flex max-w-[calc(100vw-1.5rem)] items-center gap-1.5 truncate rounded-full border px-2.5 py-1 text-[11px] font-medium shadow-xs/5 lg:hidden",
            actionStatus.tone === "loading"
              ? "border-sky-300/40 bg-sky-500/18 text-sky-50"
              : actionStatus.tone === "success"
                ? "border-emerald-300/25 bg-emerald-500/10 text-emerald-50/85"
                : "border-red-300/25 bg-red-500/10 text-red-50/85",
          )}
          title={actionStatus.text}
        >
          {statusIcon}
          <span className="truncate">{actionStatus.text}</span>
        </div>
      ) : null}
    </div>
  );
}
