import { type EnvironmentId, type ProjectId, type ThreadId } from "@t3tools/contracts";
import { scopeProjectRef, scopeThreadRef, scopedThreadKey } from "@t3tools/client-runtime";
import { Link, useNavigate } from "@tanstack/react-router";
import { memo, useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { ShoppingBagIcon } from "lucide-react";
import { /* PlusMinusIcon, */ TerminalIcon, XIcon } from "@phosphor-icons/react";
import { useAppSpaceStore } from "../../appSpaceStore";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
// import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { SidebarTrigger } from "../ui/sidebar";
import { selectSidebarThreadsForProjectRefs, useStore } from "../../store";
import { buildThreadRouteParams } from "../../threadRoutes";
import { useUiStateStore } from "../../uiStateStore";
import { hasUnseenCompletion, isThreadTabRunning } from "../Sidebar.logic";
import { useNewThreadHandler } from "../../hooks/useHandleNewThread";
import type { SidebarThreadSummary } from "../../types";
import { ThreadRunningIndicator } from "./ThreadRunningIndicator";
import { ImproveEvolutionActions } from "../ImproveEvolutionActions";

const EMPTY_THREAD_SUMMARIES: readonly SidebarThreadSummary[] = [];
const DOCK_ICON_BUTTON_CLASS_NAME =
  "inline-flex size-9 items-center justify-center text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-40";
const TAB_INDICATOR_CLASS_NAME =
  "pointer-events-none absolute inset-0 left-0 z-0 rounded-t-sm bg-[var(--surface-subtle)] transition-[width,transform,opacity] duration-180 ease-out motion-reduce:transition-none";

interface ChatHeaderProps {
  activeThreadEnvironmentId: EnvironmentId;
  activeThreadId: ThreadId;
  activeProjectId: ProjectId | undefined;
  isGitRepo: boolean;
  terminalAvailable: boolean;
  terminalTabsVisible: boolean;
  terminalOpen: boolean;
  terminalIds: string[];
  terminalLabelsById: Record<string, string>;
  activeTerminalId: string;
  terminalToggleShortcutLabel: string | null;
  diffToggleShortcutLabel: string | null;
  diffOpen: boolean;
  onToggleTerminal: () => void;
  onOpenTerminal: () => void;
  onCreateTerminal: () => void;
  onSelectThreadTab: () => void;
  onSelectTerminalTab: (terminalId: string) => void;
  onRenameTerminalTab: (terminalId: string, label: string) => void;
  onCloseTerminalTab: (terminalId: string) => void;
  onToggleDiff: () => void;
}

export function shouldShowOpenInPicker(input: {
  readonly activeProjectName: string | undefined;
  readonly activeThreadEnvironmentId: EnvironmentId;
  readonly primaryEnvironmentId: EnvironmentId | null;
}): boolean {
  return (
    Boolean(input.activeProjectName) &&
    input.primaryEnvironmentId !== null &&
    input.activeThreadEnvironmentId === input.primaryEnvironmentId
  );
}

export const ChatHeader = memo(function ChatHeader({
  activeThreadEnvironmentId,
  activeThreadId,
  activeProjectId,
  isGitRepo,
  terminalAvailable,
  terminalTabsVisible,
  terminalOpen,
  terminalIds,
  terminalLabelsById,
  activeTerminalId,
  terminalToggleShortcutLabel,
  diffToggleShortcutLabel,
  diffOpen,
  onToggleTerminal,
  onOpenTerminal,
  onCreateTerminal,
  onSelectThreadTab,
  onSelectTerminalTab,
  onRenameTerminalTab,
  onCloseTerminalTab,
  onToggleDiff,
}: ChatHeaderProps) {
  const { handleNewThread } = useNewThreadHandler();
  const activeSpace = useAppSpaceStore((store) => store.activeSpace);
  const isImproveSpace = activeSpace === "improve";
  // Keep props and constants referenced to avoid unused variable warnings
  void onToggleTerminal;
  void onToggleDiff;
  void isGitRepo;
  void terminalToggleShortcutLabel;
  void diffToggleShortcutLabel;
  void diffOpen;
  void DOCK_ICON_BUTTON_CLASS_NAME;
  const activeProjectRef = useMemo(
    () => (activeProjectId ? scopeProjectRef(activeThreadEnvironmentId, activeProjectId) : null),
    [activeProjectId, activeThreadEnvironmentId],
  );
  const projectThreads = useStore(
    useShallow((store) =>
      activeProjectRef
        ? selectSidebarThreadsForProjectRefs(store, [activeProjectRef])
        : EMPTY_THREAD_SUMMARIES,
    ),
  );
  const dismissedHeaderThreadKeys = useUiStateStore(
    useShallow((state) => state.dismissedHeaderThreadKeys),
  );
  const dismissHeaderThread = useUiStateStore((state) => state.dismissHeaderThread);
  const navigate = useNavigate();
  const tabRailRef = useRef<HTMLDivElement | null>(null);
  const tabRefs = useRef(new Map<string, HTMLDivElement | null>());
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [renamingTerminalId, setRenamingTerminalId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [activeTabIndicator, setActiveTabIndicator] = useState<{
    opacity: number;
    translateX: number;
    width: number;
  } | null>(null);

  const visibleThreads = useMemo(() => {
    return projectThreads.filter((thread) => {
      const key = scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id));
      const isActive =
        thread.environmentId === activeThreadEnvironmentId && thread.id === activeThreadId;
      return isActive || !dismissedHeaderThreadKeys[key];
    });
  }, [projectThreads, dismissedHeaderThreadKeys, activeThreadEnvironmentId, activeThreadId]);

  const visibleThreadsInDisplayOrder = useMemo(() => visibleThreads.toReversed(), [visibleThreads]);
  const activeThreadKey = useMemo(
    () => scopedThreadKey(scopeThreadRef(activeThreadEnvironmentId, activeThreadId)),
    [activeThreadEnvironmentId, activeThreadId],
  );
  const activeRailTabKey = terminalOpen
    ? `terminal:${activeTerminalId}`
    : `thread:${activeThreadKey}`;

  const visibleThreadLastVisitedAts = useUiStateStore(
    useShallow((state) =>
      visibleThreadsInDisplayOrder.map(
        (thread) =>
          state.threadLastVisitedAtById[
            scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id))
          ] ?? null,
      ),
    ),
  );

  const handleCreateAgentThread = useCallback(() => {
    setCreateMenuOpen(false);
    if (activeProjectRef) {
      void handleNewThread(activeProjectRef);
      onSelectThreadTab();
    }
  }, [activeProjectRef, handleNewThread, onSelectThreadTab]);

  const handleCreateTerminal = useCallback(() => {
    setCreateMenuOpen(false);
    if (terminalTabsVisible) {
      onCreateTerminal();
      return;
    }
    onOpenTerminal();
  }, [onCreateTerminal, onOpenTerminal, terminalTabsVisible]);

  const handleSelectTerminalTab = useCallback(
    (terminalId: string) => {
      onSelectTerminalTab(terminalId);
    },
    [onSelectTerminalTab],
  );

  const handleRenameTerminalTab = useCallback(
    (terminalId: string) => {
      const currentLabel = terminalLabelsById[terminalId]?.trim() || "Terminal";
      setRenamingTerminalId(terminalId);
      setRenameValue(currentLabel);
    },
    [terminalLabelsById],
  );

  const handleCloseTerminalTab = useCallback(
    (terminalId: string, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onCloseTerminalTab(terminalId);
    },
    [onCloseTerminalTab],
  );

  const handleDismissThread = useCallback(
    (thread: SidebarThreadSummary, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const key = scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id));
      const isActive =
        thread.environmentId === activeThreadEnvironmentId && thread.id === activeThreadId;

      if (isActive && visibleThreadsInDisplayOrder.length > 1) {
        const currentIndex = visibleThreadsInDisplayOrder.findIndex(
          (t) => t.environmentId === thread.environmentId && t.id === thread.id,
        );
        const nextThread =
          visibleThreadsInDisplayOrder[currentIndex + 1] ??
          visibleThreadsInDisplayOrder[currentIndex - 1];
        if (nextThread) {
          void navigate({
            to: "/$environmentId/$threadId",
            params: buildThreadRouteParams({
              environmentId: nextThread.environmentId,
              threadId: nextThread.id,
            }),
          });
        }
      }

      dismissHeaderThread(key);
    },
    [
      activeThreadEnvironmentId,
      activeThreadId,
      visibleThreadsInDisplayOrder,
      navigate,
      dismissHeaderThread,
    ],
  );

  useLayoutEffect(() => {
    const rail = tabRailRef.current;
    const activeTab = tabRefs.current.get(activeRailTabKey);

    if (!rail || !activeTab) {
      setActiveTabIndicator((current) =>
        current === null || current.opacity === 0
          ? current
          : {
              ...current,
              opacity: 0,
            },
      );
      return;
    }

    const updateIndicator = () => {
      setActiveTabIndicator((current) => {
        const next = {
          opacity: 1,
          translateX: activeTab.offsetLeft,
          width: activeTab.offsetWidth,
        };

        if (
          current !== null &&
          current.opacity === next.opacity &&
          current.translateX === next.translateX &&
          current.width === next.width
        ) {
          return current;
        }

        return next;
      });
    };

    updateIndicator();

    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(updateIndicator);
    observer.observe(rail);
    observer.observe(activeTab);

    return () => {
      observer.disconnect();
    };
  }, [activeRailTabKey, terminalOpen, visibleThreadsInDisplayOrder]);

  return (
    <div className="@container/header-actions mt-1.5 flex h-full min-w-0 flex-1 items-center gap-2">
      <div className="flex h-full min-w-0 flex-1 items-center gap-0 overflow-hidden">
        <Popover open={createMenuOpen} onOpenChange={setCreateMenuOpen}>
          <PopoverTrigger
            render={
              <button
                type="button"
                aria-label="Create agent or open terminal tab"
                className="inline-flex h-full w-10 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:bg-accent/45 hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                disabled={!activeProjectRef && !terminalAvailable}
              />
            }
          >
            <ShoppingBagIcon className="size-4" />
          </PopoverTrigger>
          <PopoverPopup
            side="bottom"
            align="start"
            sideOffset={6}
            className="w-56 overflow-hidden p-1"
          >
            <button
              type="button"
              className="flex w-full items-start gap-2 rounded-md px-2.5 py-2 text-left text-sm text-foreground transition-colors hover:bg-accent/70 hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
              disabled={!activeProjectRef}
              onClick={handleCreateAgentThread}
            >
              <span className="min-w-0 flex-1">
                <span className="block font-medium">Agent</span>
              </span>
            </button>
            <button
              type="button"
              className="flex w-full items-start gap-2 rounded-md px-2.5 py-2 text-left text-sm text-foreground transition-colors hover:bg-accent/70 hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
              disabled={!terminalAvailable}
              onClick={handleCreateTerminal}
            >
              <span className="min-w-0 flex-1">
                <span className="block font-medium">Terminal</span>
              </span>
            </button>
          </PopoverPopup>
        </Popover>
        <SidebarTrigger className="size-7 shrink-0 md:hidden" />
        <div className="flex h-full min-w-0 flex-1 items-stretch overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div ref={tabRailRef} className="relative flex h-full min-w-max items-stretch">
            {activeTabIndicator ? (
              <div
                aria-hidden="true"
                className={TAB_INDICATOR_CLASS_NAME}
                style={{
                  opacity: activeTabIndicator.opacity,
                  transform: `translateX(${activeTabIndicator.translateX}px)`,
                  width: `${activeTabIndicator.width}px`,
                }}
              />
            ) : null}
            {visibleThreadsInDisplayOrder.map((thread, threadIndex) => {
              const selected =
                !terminalOpen &&
                thread.environmentId === activeThreadEnvironmentId &&
                thread.id === activeThreadId;
              const runningTab = isThreadTabRunning(thread);
              const unseenCompletion =
                !selected &&
                !runningTab &&
                hasUnseenCompletion({
                  hasActionableProposedPlan: thread.hasActionableProposedPlan,
                  hasPendingApprovals: thread.hasPendingApprovals,
                  hasPendingUserInput: thread.hasPendingUserInput,
                  interactionMode: thread.interactionMode,
                  latestTurn: thread.latestTurn,
                  session: thread.session,
                  lastVisitedAt: visibleThreadLastVisitedAts[threadIndex] ?? undefined,
                });
              const canDismiss = visibleThreadsInDisplayOrder.length > 1;
              const threadKey = `${thread.environmentId}:${thread.id}`;
              const railKey = `thread:${threadKey}`;
              return (
                <div
                  key={threadKey}
                  ref={(node) => {
                    if (node === null) {
                      tabRefs.current.delete(railKey);
                      return;
                    }

                    tabRefs.current.set(railKey, node);
                  }}
                  className="group/tab relative z-10 flex shrink-0 items-center"
                >
                  <Link
                    to="/$environmentId/$threadId"
                    params={buildThreadRouteParams({
                      environmentId: thread.environmentId,
                      threadId: thread.id,
                    })}
                    className={`relative flex h-full max-w-56 shrink-0 items-center gap-1.5 rounded-t-sm px-4 pr-7 text-sm transition-[color,background-color,transform] duration-150 ease-out active:scale-[0.96] ${
                      selected
                        ? "bg-[var(--surface-subtle)] text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                    title={thread.title}
                    onClick={onSelectThreadTab}
                  >
                    {unseenCompletion ? (
                      <span
                        aria-hidden
                        className="pointer-events-none absolute left-1 top-1 size-1.5 rounded-full bg-emerald-500 shadow-sm ring-1 ring-background dark:bg-emerald-400"
                      />
                    ) : null}
                    {runningTab ? <ThreadRunningIndicator active /> : null}
                    <span className="truncate">{thread.title}</span>
                  </Link>
                  {canDismiss ? (
                    <button
                      type="button"
                      aria-label={`Close ${thread.title} tab`}
                      className="absolute right-1.5 top-1/2 flex size-4 -translate-y-1/2 items-center justify-center rounded opacity-0 transition-[background-color,opacity,transform] duration-150 ease-out hover:bg-accent group-hover/tab:opacity-100 active:scale-[0.96]"
                      onClick={(e) => handleDismissThread(thread, e)}
                    >
                      <XIcon size={10} weight="bold" />
                    </button>
                  ) : null}
                </div>
              );
            })}
            {terminalTabsVisible
              ? terminalIds.map((terminalId, terminalIndex) => {
                  const selected = terminalOpen && terminalId === activeTerminalId;
                  const label =
                    terminalLabelsById[terminalId]?.trim() || `Terminal ${terminalIndex + 1}`;
                  const railKey = `terminal:${terminalId}`;
                  const canDismiss = true;
                  return (
                    <div
                      key={railKey}
                      ref={(node) => {
                        if (node === null) {
                          tabRefs.current.delete(railKey);
                          return;
                        }

                        tabRefs.current.set(railKey, node);
                      }}
                      className="group/tab relative z-10 flex shrink-0 items-center"
                    >
                      <button
                        type="button"
                        className={`relative flex h-full max-w-56 shrink-0 items-center gap-1.5 rounded-t-sm px-4 pr-7 text-sm transition-[color,background-color,transform] duration-150 ease-out active:scale-[0.96] ${
                          selected
                            ? "bg-[var(--surface-subtle)] text-foreground"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                        title={label}
                        onClick={() => handleSelectTerminalTab(terminalId)}
                        onDoubleClick={() => handleRenameTerminalTab(terminalId)}
                      >
                        <TerminalIcon
                          aria-hidden="true"
                          size={14}
                          weight={selected ? "fill" : "regular"}
                        />
                        {renamingTerminalId === terminalId ? (
                          <input
                            type="text"
                            value={renameValue}
                            className="bg-transparent outline-none border-b border-foreground/30 px-0.5 text-sm w-24 text-current"
                            onChange={(e) => setRenameValue(e.target.value)}
                            onBlur={() => {
                              if (renameValue.trim()) {
                                onRenameTerminalTab(terminalId, renameValue.trim());
                              }
                              setRenamingTerminalId(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                if (renameValue.trim()) {
                                  onRenameTerminalTab(terminalId, renameValue.trim());
                                }
                                setRenamingTerminalId(null);
                              } else if (e.key === "Escape") {
                                setRenamingTerminalId(null);
                              }
                            }}
                            autoFocus
                            onClick={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                            }}
                            onDoubleClick={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                            }}
                          />
                        ) : (
                          <span className="truncate">{label}</span>
                        )}
                      </button>
                      {canDismiss ? (
                        <button
                          type="button"
                          aria-label={`Close ${label} tab`}
                          className="absolute right-1.5 top-1/2 flex size-4 -translate-y-1/2 items-center justify-center rounded opacity-0 transition-[background-color,opacity,transform] duration-150 ease-out hover:bg-accent group-hover/tab:opacity-100 active:scale-[0.96]"
                          onClick={(e) => handleCloseTerminalTab(terminalId, e)}
                        >
                          <XIcon size={10} weight="bold" />
                        </button>
                      ) : null}
                    </div>
                  );
                })
              : null}
          </div>
        </div>
      </div>
      {isImproveSpace ? <ImproveEvolutionActions className="shrink-0" /> : null}
      {/* <div className="fixed right-3 bottom-[var(--chat-bottom-controls-inset)] z-40 flex h-10 shrink-0 items-center justify-end gap-2 rounded-full bg-background/60 dark:bg-zinc-900/60 backdrop-blur-md border border-border/40 px-3 shadow-md shadow-black/5 hover:border-border/60 dark:hover:border-border/30 transition-all duration-200">
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                className={DOCK_ICON_BUTTON_CLASS_NAME}
                aria-pressed={terminalOpen}
                aria-label="Toggle terminal drawer"
                disabled={!terminalAvailable}
                onClick={onToggleTerminal}
              />
            }
          >
            <TerminalIcon
              aria-hidden="true"
              size={22}
              weight={terminalOpen ? "fill" : "regular"}
            />
          </TooltipTrigger>
          <TooltipPopup side="top">
            {!terminalAvailable
              ? "Terminal is unavailable until this thread has an active project."
              : terminalToggleShortcutLabel
                ? `Toggle terminal drawer (${terminalToggleShortcutLabel})`
                : "Toggle terminal drawer"}
          </TooltipPopup>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                className={DOCK_ICON_BUTTON_CLASS_NAME}
                aria-pressed={diffOpen}
                aria-label="Toggle diff panel"
                disabled={!isGitRepo && !diffOpen}
                onClick={onToggleDiff}
              />
            }
          >
            <PlusMinusIcon aria-hidden="true" size={22} weight={diffOpen ? "fill" : "regular"} />
          </TooltipTrigger>
          <TooltipPopup side="top">
            {!isGitRepo && !diffOpen
              ? "Diff panel is unavailable because this project is not a git repository."
              : diffToggleShortcutLabel
                ? `Toggle diff panel (${diffToggleShortcutLabel})`
                : "Toggle diff panel"}
          </TooltipPopup>
        </Tooltip>
      </div> */}
    </div>
  );
});
