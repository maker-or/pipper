import {
  type EnvironmentId,
  type MessageId,
  type ServerProviderSkill,
  type TurnId,
} from "@t3tools/contracts";
import {
  createContext,
  memo,
  use,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { gsap } from "gsap";
import { LegendList, type LegendListRef } from "@legendapp/list/react";
import { deriveTimelineEntries } from "../../session-logic";
import { type TurnDiffSummary } from "../../types";

import ChatMarkdown from "../ChatMarkdown";
import {
  BotIcon,
  CheckIcon,
  ChevronDownIcon,
  CircleAlertIcon,
  EyeIcon,
  FileIcon,
  GlobeIcon,
  HammerIcon,
  type LucideIcon,
  SquarePenIcon,
  TerminalIcon,
  Undo2Icon,
  WrenchIcon,
  ZapIcon,
} from "lucide-react";
import { Button } from "../ui/button";
import { buildExpandedImagePreview, ExpandedImagePreview } from "./ExpandedImagePreview";
import { ProposedPlanCard } from "./ProposedPlanCard";
import { SkillInlineText } from "./SkillInlineText";

import { MessageCopyButton } from "./MessageCopyButton";
import {
  computeStableMessagesTimelineRows,
  MAX_VISIBLE_WORK_LOG_ENTRIES,
  deriveMessagesTimelineRows,
  normalizeCompactToolLabel,
  resolveAssistantMessageCopyState,
  type StableMessagesTimelineRowsState,
  type MessagesTimelineRow,
} from "./MessagesTimeline.logic";
import { TerminalContextInlineChip } from "./TerminalContextInlineChip";
import { ThreadContentTransition } from "./ThreadContentTransition";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import {
  deriveDisplayedUserMessageState,
  type ParsedTerminalContextEntry,
} from "~/lib/terminalContext";
import { cn } from "~/lib/utils";

import { type TimestampFormat } from "@t3tools/contracts/settings";

import {
  buildInlineTerminalContextText,
  formatInlineTerminalContextLabel,
  textContainsInlineTerminalContextLabels,
} from "./userMessageTerminalContexts";
import { formatWorkspaceRelativePath } from "../../filePathDisplay";

// ---------------------------------------------------------------------------
// Context — shared state consumed by every row component via useContext.
// Propagates through LegendList's memo boundaries for shared callbacks and
// non-row-scoped state. `nowIso` is intentionally excluded — self-ticking
// components (WorkingTimer, LiveElapsed) handle it.
// ---------------------------------------------------------------------------

interface TimelineRowSharedState {
  timestampFormat: TimestampFormat;
  routeThreadKey: string;
  markdownCwd: string | undefined;
  resolvedTheme: "light" | "dark";
  workspaceRoot: string | undefined;
  skills: ReadonlyArray<Pick<ServerProviderSkill, "name" | "displayName">>;
  activeThreadEnvironmentId: EnvironmentId;
  onRevertUserMessage: (messageId: MessageId) => void;
  onImageExpand: (preview: ExpandedImagePreview) => void;
  onOpenTurnDiff: (turnId: TurnId, filePath?: string) => void;
}

interface TimelineRowActivityState {
  isWorking: boolean;
  isRevertingCheckpoint: boolean;
  /** When true, newly mounted rows play a soft-blur-in enter animation.
   *  False during the initial render batch so historical rows don't animate. */
  allowRowEnterAnimation: boolean;
}

const TimelineRowCtx = createContext<TimelineRowSharedState>(null!);
const TimelineRowActivityCtx = createContext<TimelineRowActivityState>(null!);
const TIMELINE_LIST_HEADER = <div className="h-3 sm:h-4" />;
const TIMELINE_LIST_FOOTER = <div className="h-3 sm:h-4" />;
const HIDE_SCROLLBAR_CLASS_NAME =
  "[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&::-webkit-scrollbar]:w-0 [&::-webkit-scrollbar]:h-0";
const EMPTY_TIMELINE_SKILLS: ReadonlyArray<Pick<ServerProviderSkill, "name" | "displayName">> = [];

// ---------------------------------------------------------------------------
// Props (public API)
// ---------------------------------------------------------------------------

interface MessagesTimelineProps {
  isWorking: boolean;
  activeTurnInProgress: boolean;
  activeTurnId?: TurnId | null;
  activeTurnStartedAt: string | null;
  listRef: React.RefObject<LegendListRef | null>;
  timelineEntries: ReturnType<typeof deriveTimelineEntries>;
  completionDividerBeforeEntryId: string | null;
  completionSummary: string | null;
  turnDiffSummaryByAssistantMessageId: Map<MessageId, TurnDiffSummary>;
  routeThreadKey: string;
  onOpenTurnDiff: (turnId: TurnId, filePath?: string) => void;
  revertTurnCountByUserMessageId: Map<MessageId, number>;
  onRevertUserMessage: (messageId: MessageId) => void;
  isRevertingCheckpoint: boolean;
  onImageExpand: (preview: ExpandedImagePreview) => void;
  activeThreadEnvironmentId: EnvironmentId;
  markdownCwd: string | undefined;
  resolvedTheme: "light" | "dark";
  timestampFormat: TimestampFormat;
  workspaceRoot: string | undefined;
  skills?: ReadonlyArray<Pick<ServerProviderSkill, "name" | "displayName">>;
  onIsAtEndChange: (isAtEnd: boolean) => void;
  composer?: ReactNode;
}

// ---------------------------------------------------------------------------
// MessagesTimeline — list owner
// ---------------------------------------------------------------------------

export const MessagesTimeline = memo(function MessagesTimeline({
  isWorking,
  activeTurnInProgress,
  activeTurnId,
  activeTurnStartedAt,
  listRef,
  timelineEntries,
  completionDividerBeforeEntryId,
  completionSummary,
  turnDiffSummaryByAssistantMessageId,
  routeThreadKey,
  onOpenTurnDiff,
  revertTurnCountByUserMessageId,
  onRevertUserMessage,
  isRevertingCheckpoint,
  onImageExpand,
  activeThreadEnvironmentId,
  markdownCwd,
  resolvedTheme,
  timestampFormat,
  workspaceRoot,
  skills = EMPTY_TIMELINE_SKILLS,
  onIsAtEndChange,
  composer,
}: MessagesTimelineProps) {
  // Suppress row enter animations for the initial render batch.
  // Historical rows that exist on page open should appear instantly.
  const [allowRowEnterAnimation, setAllowRowEnterAnimation] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setAllowRowEnterAnimation(true), 600);
    return () => clearTimeout(timer);
  }, []);
  const rawRows = useMemo(
    () =>
      deriveMessagesTimelineRows({
        timelineEntries,
        completionDividerBeforeEntryId,
        completionSummary,
        isWorking,
        activeTurnInProgress,
        activeTurnId: activeTurnId ?? null,
        activeTurnStartedAt,
        turnDiffSummaryByAssistantMessageId,
        revertTurnCountByUserMessageId,
      }),
    [
      timelineEntries,
      completionDividerBeforeEntryId,
      completionSummary,
      isWorking,
      activeTurnInProgress,
      activeTurnId,
      activeTurnStartedAt,
      turnDiffSummaryByAssistantMessageId,
      revertTurnCountByUserMessageId,
    ],
  );
  const rows = useStableRows(rawRows);

  const handleScroll = useCallback(() => {
    const state = listRef.current?.getState?.();
    if (state) {
      onIsAtEndChange(state.isAtEnd);
    }
  }, [listRef, onIsAtEndChange]);

  const previousRowCountRef = useRef(rows.length);
  useEffect(() => {
    const previousRowCount = previousRowCountRef.current;
    previousRowCountRef.current = rows.length;

    if (previousRowCount > 0 || rows.length === 0) {
      return;
    }

    onIsAtEndChange(true);
    const frameId = window.requestAnimationFrame(() => {
      void listRef.current?.scrollToEnd?.({ animated: false });
    });
    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [listRef, onIsAtEndChange, rows.length]);

  const sharedState = useMemo<TimelineRowSharedState>(
    () => ({
      timestampFormat,
      routeThreadKey,
      markdownCwd,
      resolvedTheme,
      workspaceRoot,
      skills,
      activeThreadEnvironmentId,
      onRevertUserMessage,
      onImageExpand,
      onOpenTurnDiff,
    }),
    [
      timestampFormat,
      routeThreadKey,
      markdownCwd,
      resolvedTheme,
      workspaceRoot,
      skills,
      activeThreadEnvironmentId,
      onRevertUserMessage,
      onImageExpand,
      onOpenTurnDiff,
    ],
  );
  const activityState = useMemo<TimelineRowActivityState>(
    () => ({
      isWorking,
      isRevertingCheckpoint,
      allowRowEnterAnimation,
    }),
    [isRevertingCheckpoint, isWorking, allowRowEnterAnimation],
  );

  // Stable renderItem — no closure deps. Row components read shared state
  // from TimelineRowCtx, which propagates through LegendList's memo.
  const renderItem = useCallback(
    ({ item }: { item: MessagesTimelineRow }) => (
      <ThreadContentTransition className="block w-full min-w-0">
        <div
          data-pipper-id="messages-timeline-row-shell"
          className="mx-auto w-full min-w-0 max-w-6xl overflow-x-hidden"
          data-timeline-root="true"
        >
          <TimelineRowContent row={item} />
        </div>
      </ThreadContentTransition>
    ),
    [],
  );

  const listFooter = useMemo(
    () => (
      <>
        <div className="mx-auto w-full min-w-0 max-w-6xl">{composer}</div>
        {TIMELINE_LIST_FOOTER}
      </>
    ),
    [composer],
  );

  if (rows.length === 0 && !isWorking) {
    return (
      <div
        data-pipper-id="messages-timeline"
        className={cn("h-full overflow-y-auto px-3 sm:px-5", HIDE_SCROLLBAR_CLASS_NAME)}
      >
        <div
          data-pipper-id="messages-timeline-empty-state"
          className="mx-auto flex min-h-full w-full max-w-6xl flex-col pt-4 pb-8"
        >
          {composer}
        </div>
      </div>
    );
  }

  return (
    <TimelineRowCtx.Provider data-pipper-id="messages-timeline" value={sharedState}>
      <TimelineRowActivityCtx.Provider value={activityState}>
        <LegendList<MessagesTimelineRow>
          ref={listRef}
          data={rows}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          estimatedItemSize={90}
          initialScrollAtEnd
          maintainScrollAtEnd
          maintainScrollAtEndThreshold={0.1}
          maintainVisibleContentPosition
          onScroll={handleScroll}
          className={cn(
            "h-full overflow-x-hidden overscroll-y-contain px-3 sm:px-5",
            HIDE_SCROLLBAR_CLASS_NAME,
          )}
          ListHeaderComponent={TIMELINE_LIST_HEADER}
          ListFooterComponent={listFooter}
        />
      </TimelineRowActivityCtx.Provider>
    </TimelineRowCtx.Provider>
  );
});

function keyExtractor(item: MessagesTimelineRow) {
  return item.id;
}

// ---------------------------------------------------------------------------
// TimelineRowContent — the actual row component
// ---------------------------------------------------------------------------

type TimelineEntry = ReturnType<typeof deriveTimelineEntries>[number];
type TimelineMessage = Extract<TimelineEntry, { kind: "message" }>["message"];
type TimelineWorkEntry = Extract<MessagesTimelineRow, { kind: "work" }>["groupedEntries"][number];
type TimelineRow = MessagesTimelineRow;

/** Whether this row kind should receive a soft-blur-in enter animation. */
function shouldAnimateRowEnter(row: TimelineRow): boolean {
  if (row.kind === "work") return true;
  if (row.kind === "working") return true;
  if (row.kind === "proposed-plan") return true;
  if (row.kind === "message" && row.message.role === "assistant") return true;
  return false;
}

const TimelineRowContent = memo(function TimelineRowContent({ row }: { row: TimelineRow }) {
  const activity = use(TimelineRowActivityCtx);
  const rowRef = useRef<HTMLDivElement>(null);

  // Soft-blur-in enter animation for rows that appear during streaming.
  // Skipped for historical rows (allowRowEnterAnimation is false during
  // the initial render batch) and for user messages (they're the user's
  // own input — animating them feels wrong).
  useLayoutEffect(() => {
    const el = rowRef.current;
    if (!el || !activity.allowRowEnterAnimation || !shouldAnimateRowEnter(row)) {
      return;
    }

    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    gsap.fromTo(
      el,
      { opacity: 0, y: 10, filter: "blur(6px)" },
      {
        opacity: 1,
        y: 0,
        filter: "blur(0px)",
        duration: 0.5,
        ease: "expo.out",
        overwrite: true,
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only
  }, []);

  return (
    <div
      data-pipper-id="messages-timeline-row"
      ref={rowRef}
      className={cn(
        "pb-4",
        row.kind === "message" && row.message.role === "assistant" ? "group/assistant" : null,
      )}
      data-timeline-row-id={row.id}
      data-timeline-row-kind={row.kind}
      data-message-id={row.kind === "message" ? row.message.id : undefined}
      data-message-role={row.kind === "message" ? row.message.role : undefined}
    >
      {row.kind === "work" ? <WorkGroupSection groupedEntries={row.groupedEntries} /> : null}
      {row.kind === "message" && row.message.role === "user" ? <UserTimelineRow row={row} /> : null}
      {row.kind === "message" && row.message.role === "assistant" ? (
        <AssistantTimelineRow row={row} />
      ) : null}
      {row.kind === "proposed-plan" ? <ProposedPlanTimelineRow row={row} /> : null}
      {row.kind === "working" ? <WorkingTimelineRow row={row} /> : null}
    </div>
  );
});

function UserTimelineRow({ row }: { row: Extract<TimelineRow, { kind: "message" }> }) {
  const ctx = use(TimelineRowCtx);
  const userImages = row.message.attachments ?? [];
  const displayedUserMessage = deriveDisplayedUserMessageState(row.message.text);
  const terminalContexts = displayedUserMessage.contexts;
  const canRevertAgentWork = typeof row.revertTurnCount === "number";

  return (
    <div data-pipper-id="messages-timeline-user-message" className="flex justify-start">
      <div
        data-pipper-id="messages-timeline-user-message-container"
        className="group relative max-w-[min(42rem,calc(100%-0.5rem))] px-1 py-1"
      >
        <div
          data-pipper-id="messages-timeline-user-message-bubble"
          className="inline-block max-w-full rounded-xl border-2 border-border/80 bg-[var(--surface-elevated)] px-3 py-3 align-top"
        >
          <div className="opacity-60">
            {userImages.length > 0 && (
              <div
                data-pipper-id="messages-timeline-user-attachments"
                className="mb-2 grid max-w-[420px] grid-cols-2 gap-2"
              >
                {userImages.map((image: NonNullable<TimelineMessage["attachments"]>[number]) => (
                  <div
                    data-pipper-id="messages-timeline-user-attachment"
                    key={image.id}
                    className="overflow-hidden rounded-lg border border-border/80 bg-background/70"
                  >
                    {image.previewUrl ? (
                      <button
                        type="button"
                        className="h-full w-full cursor-zoom-in"
                        aria-label={`Preview ${image.name}`}
                        onClick={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          const preview = buildExpandedImagePreview(userImages, image.id, rect);
                          if (!preview) return;
                          ctx.onImageExpand(preview);
                        }}
                      >
                        <img
                          src={image.previewUrl}
                          alt={image.name}
                          className="block h-auto max-h-[220px] w-full object-cover"
                        />
                      </button>
                    ) : (
                      <div className="flex min-h-[72px] items-center justify-center px-2 py-3 text-center text-[11px] text-muted-foreground/70">
                        {image.name}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            {(displayedUserMessage.visibleText.trim().length > 0 ||
              terminalContexts.length > 0) && (
              <UserMessageBody
                text={displayedUserMessage.visibleText}
                terminalContexts={terminalContexts}
                skills={ctx.skills}
              />
            )}
          </div>
        </div>
        <div
          data-pipper-id="messages-timeline-user-message-actions"
          className="mt-1.5 flex items-center justify-end gap-2"
        >
          <div className="flex items-center gap-1.5 opacity-0 transition-opacity duration-200 focus-within:opacity-100 group-hover:opacity-100">
            {displayedUserMessage.copyText && (
              <MessageCopyButton text={displayedUserMessage.copyText} />
            )}
            {canRevertAgentWork && <RevertUserMessageButton messageId={row.message.id} />}
          </div>
        </div>
      </div>
    </div>
  );
}

function RevertUserMessageButton({ messageId }: { messageId: MessageId }) {
  const ctx = use(TimelineRowCtx);
  const activity = use(TimelineRowActivityCtx);

  return (
    <Button
      data-pipper-id="messages-timeline-revert-button"
      type="button"
      size="xs"
      variant="outline"
      disabled={activity.isRevertingCheckpoint || activity.isWorking}
      onClick={() => ctx.onRevertUserMessage(messageId)}
      title="Revert to this message"
    >
      <Undo2Icon className="size-3" />
    </Button>
  );
}

function AssistantTimelineRow({ row }: { row: Extract<TimelineRow, { kind: "message" }> }) {
  const ctx = use(TimelineRowCtx);
  const messageText = row.message.text || (row.message.streaming ? "" : "(empty response)");

  return (
    <>
      {row.showCompletionDivider && (
        <CompletionAccordion
          turnRows={row.completionTurnRows}
          completionSummary={row.completionSummary}
        />
      )}
      <div data-pipper-id="messages-timeline-assistant-message" className="min-w-0 px-1 py-0.5">
        <ChatMarkdown
          text={messageText}
          cwd={ctx.markdownCwd}
          isStreaming={Boolean(row.message.streaming)}
          skills={ctx.skills}
        />
        <div
          data-pipper-id="messages-timeline-assistant-message-actions"
          className="mt-1.5 flex items-center gap-2"
        >
          <AssistantCopyButton row={row} />
        </div>
      </div>
    </>
  );
}

/** Collapsible accordion that replaces the old horizontal-line completion
 *  divider. Shows "Worked for X" as a light-text trigger; when expanded,
 *  reveals all intermediate turn content (assistant messages, work groups,
 *  proposed plans) that preceded the final response. Defaults to collapsed. */
function CompletionAccordion({
  turnRows,
  completionSummary,
}: {
  turnRows: Extract<TimelineRow, { kind: "message" }>["completionTurnRows"];
  completionSummary: string | null;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasTurnRows = turnRows != null && turnRows.length > 0;
  const summaryText = completionSummary ?? "Completed";

  if (!hasTurnRows) {
    return (
      <div
        data-pipper-id="messages-timeline-completion-summary"
        className="my-2 px-1 py-1 text-xs text-muted-foreground/50"
      >
        {summaryText}
      </div>
    );
  }

  return (
    <div data-pipper-id="messages-timeline-completion-accordion" className="my-2">
      <button
        data-pipper-id="messages-timeline-completion-toggle"
        type="button"
        className="flex items-center gap-1.5 rounded-md px-1 py-1 text-xs text-muted-foreground/55 transition-colors duration-150 hover:text-muted-foreground/80"
        onClick={() => setIsExpanded((v) => !v)}
        aria-expanded={isExpanded}
      >
        <ChevronDownIcon
          className={cn(
            "size-3 shrink-0 text-muted-foreground/40 transition-transform duration-200",
            isExpanded ? "rotate-0" : "-rotate-90",
          )}
        />
        <span>{summaryText}</span>
      </button>
      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-out",
          isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          <div className="space-y-3 pt-2 pb-1">
            {turnRows.map((turnRow) => (
              <CompletionAccordionRow key={turnRow.id} row={turnRow} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Renders a single absorbed turn row inside the completion accordion. */
function CompletionAccordionRow({ row }: { row: MessagesTimelineRow }) {
  const ctx = use(TimelineRowCtx);

  if (row.kind === "work") {
    return <WorkGroupSection groupedEntries={row.groupedEntries} />;
  }

  if (row.kind === "message" && row.message.role === "assistant") {
    const text = row.message.text || "";
    if (text.trim().length === 0) return null;
    return (
      <div data-pipper-id="messages-timeline-completion-row" className="min-w-0 px-1 py-0.5">
        <ChatMarkdown text={text} cwd={ctx.markdownCwd} skills={ctx.skills} />
      </div>
    );
  }

  if (row.kind === "proposed-plan") {
    return (
      <div data-pipper-id="messages-timeline-completion-row" className="min-w-0 px-1 py-0.5">
        <ProposedPlanCard
          planMarkdown={row.proposedPlan.planMarkdown}
          environmentId={ctx.activeThreadEnvironmentId}
          cwd={ctx.markdownCwd}
          workspaceRoot={ctx.workspaceRoot}
          skills={ctx.skills}
        />
      </div>
    );
  }

  return null;
}

function AssistantCopyButton({ row }: { row: Extract<TimelineRow, { kind: "message" }> }) {
  const assistantCopyState = resolveAssistantMessageCopyState({
    text: row.message.text ?? null,
    showCopyButton: row.showAssistantCopyButton,
    streaming: row.assistantCopyStreaming,
  });

  if (!assistantCopyState.visible) {
    return null;
  }

  return (
    <div
      data-pipper-id="messages-timeline-assistant-copy-action"
      className="flex items-center opacity-0 transition-opacity duration-200  group-hover/assistant:opacity-100"
    >
      <MessageCopyButton
        text={assistantCopyState.text ?? ""}
        size="icon-xs"
        variant="outline"
        className="border-border/50 bg-background/35 text-muted-foreground/45 shadow-none hover:border-border/70 hover:bg-background/55 hover:text-muted-foreground/70"
      />
    </div>
  );
}

function ProposedPlanTimelineRow({
  row,
}: {
  row: Extract<TimelineRow, { kind: "proposed-plan" }>;
}) {
  const ctx = use(TimelineRowCtx);

  return (
    <div data-pipper-id="messages-timeline-proposed-plan-row" className="min-w-0 px-1 py-0.5">
      <ProposedPlanCard
        planMarkdown={row.proposedPlan.planMarkdown}
        environmentId={ctx.activeThreadEnvironmentId}
        cwd={ctx.markdownCwd}
        workspaceRoot={ctx.workspaceRoot}
        skills={ctx.skills}
      />
    </div>
  );
}

function WorkingTimelineRow({ row }: { row: Extract<TimelineRow, { kind: "working" }> }) {
  return (
    <div data-pipper-id="messages-timeline-working-row" className="py-1 pl-1.5 flex justify-start">
      <span className="text-shimmer font-sans text-xs font-semibold uppercase tracking-wider">
        Working
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Self-ticking components — bypass LegendList memoisation entirely.
// Each owns a `nowMs` state value consumed in the render output so the
// React Compiler cannot elide the re-render as a no-op.
// ---------------------------------------------------------------------------

/** Live "Working for Xs" label. */
function WorkingTimer({ createdAt }: { createdAt: string }) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [createdAt]);
  return <>{formatWorkingTimer(createdAt, new Date(nowMs).toISOString()) ?? "0s"}</>;
}

// ---------------------------------------------------------------------------
// Extracted row sections — own their state / store subscriptions so changes
// re-render only the affected row, not the entire list.
// ---------------------------------------------------------------------------

/** Owns its own expand/collapse state so toggling re-renders only this row.
 *  State resets on unmount which is fine — work groups start collapsed. */
const WorkGroupSection = memo(function WorkGroupSection({
  groupedEntries,
}: {
  groupedEntries: Extract<MessagesTimelineRow, { kind: "work" }>["groupedEntries"];
}) {
  const { workspaceRoot } = use(TimelineRowCtx);
  const [isExpanded, setIsExpanded] = useState(false);
  const onlyToolEntries = groupedEntries.every((entry) => entry.tone === "tool");
  const isCollapsibleToolGroup = onlyToolEntries && groupedEntries.length > 1;
  const hasOverflow = groupedEntries.length > MAX_VISIBLE_WORK_LOG_ENTRIES;
  const visibleEntries = isCollapsibleToolGroup
    ? groupedEntries
    : hasOverflow && !isExpanded
      ? groupedEntries.slice(-MAX_VISIBLE_WORK_LOG_ENTRIES)
      : groupedEntries;
  const hiddenCount = groupedEntries.length - visibleEntries.length;
  const showHeader = isCollapsibleToolGroup || hasOverflow || !onlyToolEntries;
  const groupLabel = onlyToolEntries ? toolGroupLabel(groupedEntries) : "Work log";

  const containerClassName = cn(
    "rounded-xl border border-border/30 dark:border-border-variant/60 bg-muted/10 dark:bg-card/15 p-3 shadow-sm shadow-black/5 backdrop-blur-sm",
    onlyToolEntries
      ? "border-border/20 dark:border-border-variant/40 bg-muted/5 dark:bg-card/5"
      : "",
  );

  return (
    <div data-pipper-id="messages-timeline-work-group" className={containerClassName}>
      {showHeader && (
        <div
          data-pipper-id="messages-timeline-work-group-header"
          className="flex items-center justify-between gap-2 px-0.5"
        >
          {onlyToolEntries ? (
            <button
              type="button"
              className="group/btn flex items-center justify-between w-full min-w-0 rounded-lg p-1.5 -m-1.5 text-left transition-all duration-200 hover:bg-muted-foreground/5 active:scale-[0.98]"
              aria-expanded={isExpanded}
              onClick={() => setIsExpanded((value) => !value)}
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="font-sans text-[13px] font-semibold tracking-wide text-foreground/90">
                  Exploring
                </span>
                <span className="truncate font-sans text-xs text-muted-foreground/50">
                  &mdash; {groupLabel}
                </span>
              </div>
              <ChevronDownIcon
                className={cn(
                  "size-3.5 shrink-0 text-muted-foreground/50 transition-transform duration-200 ease-[cubic-bezier(0.2,1,0.3,1)]",
                  isExpanded ? "rotate-180" : "",
                )}
              />
            </button>
          ) : (
            <div className="flex min-w-0 items-center gap-2">
              <span className="font-sans text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/65">
                {groupLabel} ({groupedEntries.length})
              </span>
            </div>
          )}
          {hasOverflow && !onlyToolEntries && (
            <button
              type="button"
              className="rounded px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/60 transition-all duration-150 hover:text-foreground/85 hover:bg-muted-foreground/5 active:scale-[0.96]"
              onClick={() => setIsExpanded((v) => !v)}
            >
              {isExpanded ? "Show less" : `Show ${hiddenCount} more`}
            </button>
          )}
        </div>
      )}
      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-out",
          isExpanded || !isCollapsibleToolGroup ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
          showHeader ? "mt-2" : "",
        )}
      >
        <div className="overflow-hidden">
          <div className="space-y-1.5 pt-0.5">
            {visibleEntries.map((workEntry) => (
              <SimpleWorkEntryRow
                key={`work-row:${workEntry.id}`}
                workEntry={workEntry}
                workspaceRoot={workspaceRoot}
                inlineToolStyle={onlyToolEntries}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
});

// ---------------------------------------------------------------------------
// Leaf components
// ---------------------------------------------------------------------------

const UserMessageTerminalContextInlineLabel = memo(
  function UserMessageTerminalContextInlineLabel(props: { context: ParsedTerminalContextEntry }) {
    const tooltipText =
      props.context.body.length > 0
        ? `${props.context.header}\n${props.context.body}`
        : props.context.header;

    return <TerminalContextInlineChip label={props.context.header} tooltipText={tooltipText} />;
  },
);

const UserMessageBody = memo(function UserMessageBody(props: {
  text: string;
  terminalContexts: ParsedTerminalContextEntry[];
  skills: ReadonlyArray<Pick<ServerProviderSkill, "name" | "displayName">>;
}) {
  if (props.terminalContexts.length > 0) {
    const hasEmbeddedInlineLabels = textContainsInlineTerminalContextLabels(
      props.text,
      props.terminalContexts,
    );
    const inlinePrefix = buildInlineTerminalContextText(props.terminalContexts);
    const inlineNodes: ReactNode[] = [];

    if (hasEmbeddedInlineLabels) {
      let cursor = 0;

      for (const context of props.terminalContexts) {
        const label = formatInlineTerminalContextLabel(context.header);
        const matchIndex = props.text.indexOf(label, cursor);
        if (matchIndex === -1) {
          inlineNodes.length = 0;
          break;
        }
        if (matchIndex > cursor) {
          inlineNodes.push(
            <span key={`user-terminal-context-inline-before:${context.header}:${cursor}`}>
              <SkillInlineText text={props.text.slice(cursor, matchIndex)} skills={props.skills} />
            </span>,
          );
        }
        inlineNodes.push(
          <UserMessageTerminalContextInlineLabel
            key={`user-terminal-context-inline:${context.header}`}
            context={context}
          />,
        );
        cursor = matchIndex + label.length;
      }

      if (inlineNodes.length > 0) {
        if (cursor < props.text.length) {
          inlineNodes.push(
            <span key={`user-message-terminal-context-inline-rest:${cursor}`}>
              <SkillInlineText text={props.text.slice(cursor)} skills={props.skills} />
            </span>,
          );
        }

        return (
          <div
            data-pipper-id="messages-timeline-user-message-body"
            className="whitespace-pre-wrap wrap-break-word text-sm leading-relaxed text-foreground"
          >
            {inlineNodes}
          </div>
        );
      }
    }

    for (const context of props.terminalContexts) {
      inlineNodes.push(
        <UserMessageTerminalContextInlineLabel
          key={`user-terminal-context-inline:${context.header}`}
          context={context}
        />,
      );
      inlineNodes.push(
        <span key={`user-terminal-context-inline-space:${context.header}`} aria-hidden="true">
          {" "}
        </span>,
      );
    }

    if (props.text.length > 0) {
      inlineNodes.push(
        <span key="user-message-terminal-context-inline-text">
          <SkillInlineText text={props.text} skills={props.skills} />
        </span>,
      );
    } else if (inlinePrefix.length === 0) {
      return null;
    }

    return (
      <div
        data-pipper-id="messages-timeline-user-message-body"
        className="whitespace-pre-wrap wrap-break-word text-sm leading-relaxed text-foreground"
      >
        {inlineNodes}
      </div>
    );
  }

  if (props.text.length === 0) {
    return null;
  }

  return (
    <div
      data-pipper-id="messages-timeline-user-message-body"
      className="whitespace-pre-wrap wrap-break-word text-sm leading-relaxed text-foreground"
    >
      <SkillInlineText text={props.text} skills={props.skills} />
    </div>
  );
});

// ---------------------------------------------------------------------------
// Structural sharing — reuse old row references when data hasn't changed
// so LegendList (and React) can skip re-rendering unchanged items.
// ---------------------------------------------------------------------------

/** Returns a structurally-shared copy of `rows`: for each row whose content
 *  hasn't changed since last call, the previous object reference is reused. */
function useStableRows(rows: MessagesTimelineRow[]): MessagesTimelineRow[] {
  const prevState = useRef<StableMessagesTimelineRowsState>({
    byId: new Map<string, MessagesTimelineRow>(),
    result: [],
  });

  return useMemo(() => {
    const nextState = computeStableMessagesTimelineRows(rows, prevState.current);
    prevState.current = nextState;
    return nextState.result;
  }, [rows]);
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function formatWorkingTimer(startIso: string, endIso: string): string | null {
  const startedAtMs = Date.parse(startIso);
  const endedAtMs = Date.parse(endIso);
  if (!Number.isFinite(startedAtMs) || !Number.isFinite(endedAtMs)) {
    return null;
  }

  const elapsedSeconds = Math.max(0, Math.floor((endedAtMs - startedAtMs) / 1000));
  if (elapsedSeconds < 60) {
    return `${elapsedSeconds}s`;
  }

  const hours = Math.floor(elapsedSeconds / 3600);
  const minutes = Math.floor((elapsedSeconds % 3600) / 60);
  const seconds = elapsedSeconds % 60;

  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }

  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

function workToneIcon(tone: TimelineWorkEntry["tone"]): {
  icon: LucideIcon;
  className: string;
} {
  if (tone === "error") {
    return {
      icon: CircleAlertIcon,
      className: "text-foreground/92",
    };
  }
  if (tone === "thinking") {
    return {
      icon: BotIcon,
      className: "text-foreground/92",
    };
  }
  if (tone === "info") {
    return {
      icon: CheckIcon,
      className: "text-foreground/92",
    };
  }
  return {
    icon: ZapIcon,
    className: "text-foreground/92",
  };
}

function workToneClass(tone: "thinking" | "tool" | "info" | "error"): string {
  if (tone === "error") return "text-rose-300/50 dark:text-rose-300/50";
  if (tone === "tool") return "text-muted-foreground/70";
  if (tone === "thinking") return "text-muted-foreground/50";
  return "text-muted-foreground/40";
}

function workEntryPreview(
  workEntry: Pick<TimelineWorkEntry, "detail" | "command" | "changedFiles">,
  workspaceRoot: string | undefined,
) {
  if (workEntry.command) return workEntry.command;
  if (workEntry.detail) return workEntry.detail;
  if ((workEntry.changedFiles?.length ?? 0) === 0) return null;
  const [firstPath] = workEntry.changedFiles ?? [];
  if (!firstPath) return null;
  const displayPath = formatWorkspaceRelativePath(firstPath, workspaceRoot);
  return workEntry.changedFiles!.length === 1
    ? displayPath
    : `${displayPath} +${workEntry.changedFiles!.length - 1} more`;
}

function workEntryRawCommand(
  workEntry: Pick<TimelineWorkEntry, "command" | "rawCommand">,
): string | null {
  const rawCommand = workEntry.rawCommand?.trim();
  if (!rawCommand || !workEntry.command) {
    return null;
  }
  return rawCommand === workEntry.command.trim() ? null : rawCommand;
}

function workEntryIcon(workEntry: TimelineWorkEntry): LucideIcon {
  if (workEntry.requestKind === "command") return TerminalIcon;
  if (workEntry.requestKind === "file-read") return EyeIcon;
  if (workEntry.requestKind === "file-change") return SquarePenIcon;

  if (workEntry.itemType === "command_execution" || workEntry.command) {
    return TerminalIcon;
  }
  if (workEntry.itemType === "file_change" || (workEntry.changedFiles?.length ?? 0) > 0) {
    return SquarePenIcon;
  }
  if (workEntry.itemType === "web_search") return GlobeIcon;
  if (workEntry.itemType === "image_view") return EyeIcon;

  switch (workEntry.itemType) {
    case "mcp_tool_call":
      return WrenchIcon;
    case "dynamic_tool_call":
    case "collab_agent_tool_call":
      return HammerIcon;
  }

  return workToneIcon(workEntry.tone).icon;
}

function toolGroupLabel(entries: ReadonlyArray<TimelineWorkEntry>): string {
  const readCount = entries.filter((entry) => entry.requestKind === "file-read").length;
  if (readCount > 0) {
    return `${readCount} read`;
  }

  const commandCount = entries.filter(
    (entry) => entry.requestKind === "command" || entry.itemType === "command_execution",
  ).length;
  if (commandCount > 0) {
    return `${commandCount} command${commandCount === 1 ? "" : "s"}`;
  }

  return `${entries.length} tool${entries.length === 1 ? "" : "s"}`;
}

function capitalizePhrase(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return value;
  }
  return `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}`;
}

function toolWorkEntryHeading(workEntry: TimelineWorkEntry): string {
  if (!workEntry.toolTitle) {
    return capitalizePhrase(normalizeCompactToolLabel(workEntry.label));
  }
  return capitalizePhrase(normalizeCompactToolLabel(workEntry.toolTitle));
}

function inlineToolEntryHeading(workEntry: TimelineWorkEntry): string {
  if (workEntry.requestKind === "command" || workEntry.itemType === "command_execution") {
    return "Ran";
  }
  if (workEntry.requestKind === "file-read") {
    return "Read";
  }
  if (workEntry.requestKind === "file-change" || workEntry.itemType === "file_change") {
    return "Edited";
  }
  if (workEntry.tone === "thinking") {
    return "Thinking";
  }
  return toolWorkEntryHeading(workEntry);
}

const SimpleWorkEntryRow = memo(function SimpleWorkEntryRow(props: {
  workEntry: TimelineWorkEntry;
  workspaceRoot: string | undefined;
  inlineToolStyle?: boolean;
}) {
  const { workEntry, workspaceRoot, inlineToolStyle = false } = props;
  const heading = inlineToolStyle
    ? inlineToolEntryHeading(workEntry)
    : toolWorkEntryHeading(workEntry);
  const rawPreview = workEntryPreview(workEntry, workspaceRoot);
  const preview =
    rawPreview &&
    normalizeCompactToolLabel(rawPreview).toLowerCase() ===
      normalizeCompactToolLabel(heading).toLowerCase()
      ? null
      : rawPreview;
  const rawCommand = workEntryRawCommand(workEntry);
  const separator = inlineToolStyle ? " " : " - ";
  const displayText = preview ? `${heading}${separator}${preview}` : heading;
  const hasChangedFiles = (workEntry.changedFiles?.length ?? 0) > 0;
  const previewIsChangedFiles = hasChangedFiles && !workEntry.command && !workEntry.detail;
  const isRunning = workEntry.status === "running";

  const inlineMutedTextClassName = inlineToolStyle
    ? isRunning
      ? "text-muted-foreground/72"
      : "text-muted-foreground/48"
    : workToneClass(workEntry.tone);

  const textClassName = cn(
    "font-sans text-[13px] leading-relaxed",
    inlineMutedTextClassName,
    preview ? "text-muted-foreground/70" : "text-foreground/80",
    inlineToolStyle && isRunning ? "tool-call-shimmer" : "",
  );

  return (
    <div
      data-pipper-id="messages-timeline-work-entry"
      className="group/row flex flex-col gap-1 px-2.5 py-1.5 rounded-lg border border-transparent hover:border-border/5 hover:bg-muted-foreground/5 dark:hover:bg-white/5 transition-all duration-150 ease-out"
    >
      <div
        className={cn(
          "flex items-center transition-[opacity,translate] duration-200",
          inlineToolStyle ? "min-h-6" : "",
        )}
      >
        <div
          data-pipper-id="messages-timeline-work-entry-body"
          className="min-w-0 flex-1 overflow-hidden"
        >
          {rawCommand ? (
            <div className="max-w-full">
              <p className={cn("truncate", textClassName)} title={displayText}>
                <span className={cn("font-semibold text-foreground/90", inlineMutedTextClassName)}>
                  {heading}
                </span>
                {preview && (
                  <Tooltip>
                    <TooltipTrigger
                      closeDelay={0}
                      delay={75}
                      render={
                        <span className="inline-block max-w-full font-mono text-[11px] text-muted-foreground/60 dark:text-muted-foreground/50 bg-muted-foreground/5 dark:bg-white/5 px-1.5 py-0.5 rounded border border-border/40 font-medium cursor-pointer transition-colors hover:text-foreground/80 hover:bg-muted-foreground/10 ml-2">
                          {preview}
                        </span>
                      }
                    />
                    <TooltipPopup
                      align="start"
                      className="max-w-[min(56rem,calc(100vw-2rem))] px-0 py-0"
                      side="top"
                    >
                      <div className="max-w-[min(56rem,calc(100vw-2rem))] overflow-x-auto px-2 py-1.5 font-mono text-[11px] leading-4 whitespace-nowrap bg-card border border-border/55 rounded-md shadow-md">
                        {rawCommand}
                      </div>
                    </TooltipPopup>
                  </Tooltip>
                )}
              </p>
            </div>
          ) : (
            <Tooltip>
              <TooltipTrigger
                className="block min-w-0 w-full text-left"
                title={displayText}
                aria-label={displayText}
              >
                <p className={cn("truncate", textClassName)}>
                  <span
                    className={cn("font-semibold text-foreground/90", inlineMutedTextClassName)}
                  >
                    {heading}
                  </span>
                  {preview && (
                    <span className="font-mono text-[11.5px] text-muted-foreground/60 dark:text-muted-foreground/50 ml-2">
                      {preview}
                    </span>
                  )}
                </p>
              </TooltipTrigger>
              <TooltipPopup className="max-w-[min-content]">
                <p className="whitespace-pre-wrap wrap-break-word text-xs leading-5">
                  {displayText}
                </p>
              </TooltipPopup>
            </Tooltip>
          )}
        </div>
      </div>
      {hasChangedFiles && !previewIsChangedFiles && (
        <div
          data-pipper-id="messages-timeline-work-entry-files"
          className="mt-1 flex flex-wrap gap-1.5 pl-0"
        >
          {workEntry.changedFiles?.slice(0, 4).map((filePath) => {
            const displayPath = formatWorkspaceRelativePath(filePath, workspaceRoot);
            return (
              <span
                data-pipper-id="messages-timeline-work-entry-file-chip"
                key={`${workEntry.id}:${filePath}`}
                className="inline-flex items-center rounded-md border border-border/30 dark:border-border-variant/60 bg-muted/30 dark:bg-card/20 hover:bg-muted/50 dark:hover:bg-card/35 px-2 py-0.5 font-mono text-[10px] text-muted-foreground/85 transition-colors"
                title={displayPath}
              >
                {displayPath}
              </span>
            );
          })}
          {(workEntry.changedFiles?.length ?? 0) > 4 && (
            <span className="px-1 text-[10px] text-muted-foreground/55 flex items-center">
              +{(workEntry.changedFiles?.length ?? 0) - 4}
            </span>
          )}
        </div>
      )}
    </div>
  );
});
