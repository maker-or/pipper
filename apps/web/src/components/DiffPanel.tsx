import { parsePatchFiles } from "@pierre/diffs";
import { FileDiff, type FileDiffMetadata, Virtualizer } from "@pierre/diffs/react";
import { useQuery } from "@tanstack/react-query";
import { useParams, useSearch } from "@tanstack/react-router";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { ColumnsIcon, RowsIcon } from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { openInPreferredEditor } from "../editorPreferences";
import { useGitStatus } from "~/lib/gitStatusState";
import { checkpointDiffQueryOptions } from "~/lib/providerReactQuery";
import { cn } from "~/lib/utils";
import { readLocalApi } from "../localApi";
import { resolvePathLinkTarget } from "../terminal-links";
import { parseDiffRouteSearch } from "../diffRouteSearch";
import { useTheme } from "../hooks/useTheme";
import { buildPatchCacheKey } from "../lib/diffRendering";
import { resolveDiffThemeName } from "../lib/diffRendering";
import { useTurnDiffSummaries } from "../hooks/useTurnDiffSummaries";
import { selectProjectByRef, useStore } from "../store";
import { createThreadSelectorByRef } from "../storeSelectors";
import { resolveThreadRouteRef } from "../threadRoutes";
import { useSettings } from "../hooks/useSettings";
import GitActionsControl from "./GitActionsControl";
import { DiffPanelLoadingState, DiffPanelShell, type DiffPanelMode } from "./DiffPanelShell";

type DiffRenderMode = "stacked" | "split";
type DiffThemeType = "light" | "dark";

const DIFF_PANEL_UNSAFE_CSS = `
:host {
  --diffs-font-family: "Geist Mono", "SF Mono", "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
  --diffs-header-font-family: "Geist Mono", "SF Mono", "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
}

[data-diffs-header],
[data-diff],
[data-file],
[data-error-wrapper],
[data-virtualizer-buffer] {
  --diffs-bg: var(--surface-subtle) !important;
  --diffs-light-bg: var(--surface-subtle) !important;
  --diffs-dark-bg: var(--surface-subtle) !important;
  --diffs-token-light-bg: transparent;
  --diffs-token-dark-bg: transparent;
  --diffs-font-family: "Geist Mono", "SF Mono", "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
  --diffs-header-font-family: "Geist Mono", "SF Mono", "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;

  --diffs-bg-context-override: color-mix(in srgb, var(--background) 97%, var(--foreground));
  --diffs-bg-hover-override: color-mix(in srgb, var(--background) 94%, var(--foreground));
  --diffs-bg-separator-override: color-mix(in srgb, var(--background) 95%, var(--foreground));
  --diffs-bg-buffer-override: color-mix(in srgb, var(--background) 90%, var(--foreground));

  --diffs-bg-addition-override: color-mix(in srgb, var(--background) 92%, var(--success));
  --diffs-bg-addition-number-override: color-mix(in srgb, var(--background) 88%, var(--success));
  --diffs-bg-addition-hover-override: color-mix(in srgb, var(--background) 85%, var(--success));
  --diffs-bg-addition-emphasis-override: color-mix(in srgb, var(--background) 80%, var(--success));

  --diffs-bg-deletion-override: color-mix(in srgb, var(--background) 92%, var(--destructive));
  --diffs-bg-deletion-number-override: color-mix(in srgb, var(--background) 88%, var(--destructive));
  --diffs-bg-deletion-hover-override: color-mix(in srgb, var(--background) 85%, var(--destructive));
  --diffs-bg-deletion-emphasis-override: color-mix(
    in srgb,
    var(--background) 80%,
    var(--destructive)
  );

  background-color: var(--diffs-bg) !important;
}

[data-file-info] {
  background-color: var(--surface-subtle) !important;
  border-block-color: var(--border) !important;
  color: var(--foreground) !important;
}

[data-diffs-header] {
  position: sticky !important;
  top: 0;
  z-index: 4;
  background-color: var(--surface-subtle) !important;
  border-bottom: 1px solid var(--border) !important;
}

[data-title] {
  cursor: pointer;
  transition:
    color 120ms ease,
    text-decoration-color 120ms ease;
  text-decoration: underline;
  text-decoration-color: transparent;
  text-underline-offset: 2px;
}

[data-title]:hover {
  color: color-mix(in srgb, var(--foreground) 84%, var(--primary)) !important;
  text-decoration-color: currentColor;
}
`;

type RenderablePatch =
  | {
      kind: "files";
      files: FileDiffMetadata[];
    }
  | {
      kind: "raw";
      text: string;
      reason: string;
    };

function getRenderablePatch(
  patch: string | undefined,
  cacheScope = "diff-panel",
): RenderablePatch | null {
  if (!patch) return null;
  const normalizedPatch = patch.trim();
  if (normalizedPatch.length === 0) return null;

  try {
    const parsedPatches = parsePatchFiles(
      normalizedPatch,
      buildPatchCacheKey(normalizedPatch, cacheScope),
    );
    const files = parsedPatches.flatMap((parsedPatch) => parsedPatch.files);
    if (files.length > 0) {
      return { kind: "files", files };
    }

    return {
      kind: "raw",
      text: normalizedPatch,
      reason: "Unsupported diff format. Showing raw patch.",
    };
  } catch {
    return {
      kind: "raw",
      text: normalizedPatch,
      reason: "Failed to parse patch. Showing raw patch.",
    };
  }
}

function resolveFileDiffPath(fileDiff: FileDiffMetadata): string {
  const raw = fileDiff.name ?? fileDiff.prevName ?? "";
  if (raw.startsWith("a/") || raw.startsWith("b/")) {
    return raw.slice(2);
  }
  return raw;
}

function buildFileDiffRenderKey(fileDiff: FileDiffMetadata): string {
  return fileDiff.cacheKey ?? `${fileDiff.prevName ?? "none"}:${fileDiff.name}`;
}

function getFileDiffLineStats(fileDiff: FileDiffMetadata): {
  additions: number;
  deletions: number;
} {
  let additions = 0;
  let deletions = 0;
  for (const hunk of fileDiff.hunks) {
    additions += hunk.additionLines;
    deletions += hunk.deletionLines;
  }
  return { additions, deletions };
}

interface DiffPanelProps {
  mode?: DiffPanelMode;
}

export { DiffWorkerPoolProvider } from "./DiffWorkerPoolProvider";

export default function DiffPanel({ mode = "inline" }: DiffPanelProps) {
  const { resolvedTheme } = useTheme();
  const settings = useSettings();
  const [diffRenderMode, setDiffRenderMode] = useState<DiffRenderMode>("stacked");
  const [diffWordWrap, setDiffWordWrap] = useState(settings.diffWordWrap);
  const [diffIgnoreWhitespace, setDiffIgnoreWhitespace] = useState(settings.diffIgnoreWhitespace);
  const [collapsedDiffFileKeys, setCollapsedDiffFileKeys] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const patchViewportRef = useRef<HTMLDivElement>(null);
  const previousDiffOpenRef = useRef(false);

  const routeThreadRef = useParams({
    strict: false,
    select: (params) => resolveThreadRouteRef(params),
  });
  const diffSearch = useSearch({
    strict: false,
    select: (search) => parseDiffRouteSearch(search),
  });
  const diffOpen = diffSearch.diff === "1";
  const activeThreadId = routeThreadRef?.threadId ?? null;
  const activeThread = useStore(
    useMemo(() => createThreadSelectorByRef(routeThreadRef), [routeThreadRef]),
  );
  const activeProjectId = activeThread?.projectId ?? null;
  const activeProject = useStore((store) =>
    activeThread && activeProjectId
      ? selectProjectByRef(store, {
          environmentId: activeThread.environmentId,
          projectId: activeProjectId,
        })
      : undefined,
  );
  const activeCwd = activeThread?.worktreePath ?? activeProject?.cwd;
  const gitStatusQuery = useGitStatus({
    environmentId: activeThread?.environmentId ?? null,
    cwd: activeCwd ?? null,
  });
  const isGitRepo = gitStatusQuery.data?.isRepo ?? true;
  const { turnDiffSummaries, inferredCheckpointTurnCountByTurnId } =
    useTurnDiffSummaries(activeThread);
  const orderedTurnDiffSummaries = useMemo(
    () =>
      [...turnDiffSummaries].toSorted((left, right) => {
        const leftTurnCount =
          left.checkpointTurnCount ?? inferredCheckpointTurnCountByTurnId[left.turnId] ?? 0;
        const rightTurnCount =
          right.checkpointTurnCount ?? inferredCheckpointTurnCountByTurnId[right.turnId] ?? 0;
        if (leftTurnCount !== rightTurnCount) {
          return rightTurnCount - leftTurnCount;
        }
        return right.completedAt.localeCompare(left.completedAt);
      }),
    [inferredCheckpointTurnCountByTurnId, turnDiffSummaries],
  );

  const selectedTurnId = diffSearch.diffTurnId ?? null;
  const selectedFilePath = selectedTurnId !== null ? (diffSearch.diffFilePath ?? null) : null;
  const selectedTurn =
    selectedTurnId === null
      ? undefined
      : (orderedTurnDiffSummaries.find((summary) => summary.turnId === selectedTurnId) ??
        orderedTurnDiffSummaries[0]);
  const selectedCheckpointTurnCount =
    selectedTurn &&
    (selectedTurn.checkpointTurnCount ?? inferredCheckpointTurnCountByTurnId[selectedTurn.turnId]);
  const selectedCheckpointRange = useMemo(
    () =>
      typeof selectedCheckpointTurnCount === "number"
        ? {
            fromTurnCount: Math.max(0, selectedCheckpointTurnCount - 1),
            toTurnCount: selectedCheckpointTurnCount,
          }
        : null,
    [selectedCheckpointTurnCount],
  );
  const conversationCheckpointTurnCount = useMemo(() => {
    const turnCounts = orderedTurnDiffSummaries
      .map(
        (summary) =>
          summary.checkpointTurnCount ?? inferredCheckpointTurnCountByTurnId[summary.turnId],
      )
      .filter((value): value is number => typeof value === "number");
    if (turnCounts.length === 0) {
      return undefined;
    }
    const latest = Math.max(...turnCounts);
    return latest > 0 ? latest : undefined;
  }, [inferredCheckpointTurnCountByTurnId, orderedTurnDiffSummaries]);
  const conversationCheckpointRange = useMemo(
    () =>
      !selectedTurn && typeof conversationCheckpointTurnCount === "number"
        ? {
            fromTurnCount: 0,
            toTurnCount: conversationCheckpointTurnCount,
          }
        : null,
    [conversationCheckpointTurnCount, selectedTurn],
  );
  const activeCheckpointRange = selectedTurn
    ? selectedCheckpointRange
    : conversationCheckpointRange;
  const conversationCacheScope = useMemo(() => {
    if (selectedTurn || orderedTurnDiffSummaries.length === 0) {
      return null;
    }
    return `conversation:${orderedTurnDiffSummaries.map((summary) => summary.turnId).join(",")}`;
  }, [orderedTurnDiffSummaries, selectedTurn]);
  const activeCheckpointDiffQuery = useQuery(
    checkpointDiffQueryOptions({
      environmentId: activeThread?.environmentId ?? null,
      threadId: activeThreadId,
      fromTurnCount: activeCheckpointRange?.fromTurnCount ?? null,
      toTurnCount: activeCheckpointRange?.toTurnCount ?? null,
      ignoreWhitespace: diffIgnoreWhitespace,
      cacheScope: selectedTurn ? `turn:${selectedTurn.turnId}` : conversationCacheScope,
      enabled: isGitRepo,
    }),
  );
  const selectedTurnCheckpointDiff = selectedTurn
    ? activeCheckpointDiffQuery.data?.diff
    : undefined;
  const conversationCheckpointDiff = selectedTurn
    ? undefined
    : activeCheckpointDiffQuery.data?.diff;
  const isLoadingCheckpointDiff = activeCheckpointDiffQuery.isLoading;
  const checkpointDiffError =
    activeCheckpointDiffQuery.error instanceof Error
      ? activeCheckpointDiffQuery.error.message
      : activeCheckpointDiffQuery.error
        ? "Failed to load checkpoint diff."
        : null;

  const selectedPatch = selectedTurn ? selectedTurnCheckpointDiff : conversationCheckpointDiff;
  const hasResolvedPatch = typeof selectedPatch === "string";
  const hasNoNetChanges = hasResolvedPatch && selectedPatch.trim().length === 0;
  const renderablePatch = useMemo(
    () => getRenderablePatch(selectedPatch, `diff-panel:${resolvedTheme}`),
    [resolvedTheme, selectedPatch],
  );
  const renderableFiles = useMemo(() => {
    if (!renderablePatch || renderablePatch.kind !== "files") {
      return [];
    }
    return renderablePatch.files.toSorted((left, right) =>
      resolveFileDiffPath(left).localeCompare(resolveFileDiffPath(right), undefined, {
        numeric: true,
        sensitivity: "base",
      }),
    );
  }, [renderablePatch]);

  useEffect(() => {
    if (renderableFiles.length === 0) {
      setCollapsedDiffFileKeys((current) => (current.size === 0 ? current : new Set()));
      return;
    }

    const visibleFileKeys = new Set(renderableFiles.map(buildFileDiffRenderKey));
    setCollapsedDiffFileKeys((current) => {
      const next = new Set([...current].filter((fileKey) => visibleFileKeys.has(fileKey)));
      return next.size === current.size ? current : next;
    });
  }, [renderableFiles]);

  useEffect(() => {
    if (diffOpen && !previousDiffOpenRef.current) {
      setDiffWordWrap(settings.diffWordWrap);
      setDiffIgnoreWhitespace(settings.diffIgnoreWhitespace);
    }
    previousDiffOpenRef.current = diffOpen;
  }, [diffOpen, settings.diffIgnoreWhitespace, settings.diffWordWrap]);

  useEffect(() => {
    if (!selectedFilePath || !patchViewportRef.current) {
      return;
    }
    const target = Array.from(
      patchViewportRef.current.querySelectorAll<HTMLElement>("[data-diff-file-path]"),
    ).find((element) => element.dataset.diffFilePath === selectedFilePath);
    target?.scrollIntoView({ block: "nearest" });
  }, [selectedFilePath, renderableFiles]);

  const openDiffFileInEditor = useCallback(
    (filePath: string) => {
      const api = readLocalApi();
      if (!api) return;
      const targetPath = activeCwd ? resolvePathLinkTarget(filePath, activeCwd) : filePath;
      void openInPreferredEditor(api, targetPath).catch((error) => {
        console.warn("Failed to open diff file in editor.", error);
      });
    },
    [activeCwd],
  );
  const toggleDiffFileCollapsed = useCallback((fileKey: string) => {
    setCollapsedDiffFileKeys((current) => {
      const next = new Set(current);
      if (next.has(fileKey)) {
        next.delete(fileKey);
      } else {
        next.add(fileKey);
      }
      return next;
    });
  }, []);
  const allFilesCollapsed =
    renderableFiles.length > 0 &&
    renderableFiles.every((fileDiff) =>
      collapsedDiffFileKeys.has(buildFileDiffRenderKey(fileDiff)),
    );
  const setAllDiffFilesCollapsed = useCallback(
    (collapsed: boolean) => {
      setCollapsedDiffFileKeys(
        collapsed ? new Set(renderableFiles.map(buildFileDiffRenderKey)) : new Set(),
      );
    },
    [renderableFiles],
  );
  const totalRenderableStats = useMemo(
    () =>
      renderableFiles.reduce(
        (total, fileDiff) => {
          const stat = getFileDiffLineStats(fileDiff);
          return {
            additions: total.additions + stat.additions,
            deletions: total.deletions + stat.deletions,
          };
        },
        { additions: 0, deletions: 0 },
      ),
    [renderableFiles],
  );

  return (
    <DiffPanelShell mode={mode} header={null}>
      {!activeThread ? (
        <div className="flex flex-1 items-center justify-center px-5 text-center text-xs text-muted-foreground/70">
          Select a thread to inspect turn diffs.
        </div>
      ) : !isGitRepo ? (
        <div className="flex flex-1 items-center justify-center px-5 text-center text-xs text-muted-foreground/70">
          Turn diffs are unavailable because this project is not a git repository.
        </div>
      ) : orderedTurnDiffSummaries.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-5 text-center text-xs text-muted-foreground/70">
          No completed turns yet.
        </div>
      ) : (
        <div
          data-pipper-id="diff-panel-content"
          className="flex min-h-0 flex-1 flex-col rounded-t-md"
        >
          <div
            data-pipper-id="diff-panel-toolbar"
            className="flex min-h-12 shrink-0 items-center justify-between gap-3 border-b border-border/70 px-3 py-2"
          >
            <GitActionsControl
              activeThreadRef={routeThreadRef}
              gitCwd={activeCwd ?? null}
              dockIconOnly
              dockIconButtonClassName="inline-flex size-7 shrink-0 items-center justify-center rounded-md border border-border/70 bg-background/45 text-foreground/80 transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-45"
            />
            <div className="flex shrink-0 items-center gap-2">
              {renderableFiles.length > 0 ? (
                <div
                  data-pipper-id="diff-panel-stats"
                  className="hidden font-mono text-xs tabular-nums sm:block"
                >
                  <span className="text-[var(--diffs-addition-base)]">
                    +{totalRenderableStats.additions}
                  </span>{" "}
                  <span className="text-[var(--diffs-deletion-base)]">
                    -{totalRenderableStats.deletions}
                  </span>
                </div>
              ) : null}
              <div
                data-pipper-id="diff-panel-view-toggle"
                className="inline-flex overflow-hidden rounded-lg border border-border/70 bg-background/45 p-0.5"
              >
                <button
                  type="button"
                  className={cn(
                    "inline-flex items-center justify-center rounded-md px-2.5 py-1 text-xs transition-colors",
                    diffRenderMode === "stacked"
                      ? "bg-muted text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                  aria-label="Unified diff"
                  title="Unified diff"
                  onClick={() => setDiffRenderMode("stacked")}
                >
                  <RowsIcon size={14} />
                </button>
                <button
                  type="button"
                  className={cn(
                    "inline-flex items-center justify-center rounded-md px-2.5 py-1 text-xs transition-colors",
                    diffRenderMode === "split"
                      ? "bg-muted text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                  aria-label="Split diff"
                  title="Split diff"
                  onClick={() => setDiffRenderMode("split")}
                >
                  <ColumnsIcon size={14} />
                </button>
              </div>
              <button
                data-pipper-id="diff-panel-collapse-toggle"
                type="button"
                className="inline-flex items-center gap-1.5 rounded-lg border border-border/70 bg-background/45 px-2.5 py-1.5 text-xs text-foreground/80 transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-45"
                disabled={renderableFiles.length === 0}
                onClick={() => setAllDiffFilesCollapsed(!allFilesCollapsed)}
              >
                {allFilesCollapsed ? (
                  <ChevronRightIcon className="size-3.5" />
                ) : (
                  <ChevronDownIcon className="size-3.5" />
                )}
                {allFilesCollapsed ? "Expand all" : "Collapse all"}
              </button>
            </div>
          </div>
          <div
            data-pipper-id="diff-panel-viewport"
            ref={patchViewportRef}
            className="diff-panel-viewport min-h-0 min-w-0 flex-1 overflow-hidden"
          >
            {checkpointDiffError && !renderablePatch && (
              <div className="px-3">
                <p className="mb-2 text-[11px] text-red-500/80">{checkpointDiffError}</p>
              </div>
            )}
            {!renderablePatch ? (
              isLoadingCheckpointDiff ? (
                <DiffPanelLoadingState label="Loading checkpoint diff..." />
              ) : (
                <div className="flex h-full items-center justify-center px-3 py-2 text-xs text-muted-foreground/70">
                  <p>
                    {hasNoNetChanges
                      ? "No net changes in this selection."
                      : "No patch available for this selection."}
                  </p>
                </div>
              )
            ) : renderablePatch.kind === "files" ? (
              <Virtualizer
                data-pipper-id="diff-panel-file-list"
                className="diff-render-surface h-full min-h-0 overflow-auto px-2 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                config={{
                  overscrollSize: 600,
                  intersectionObserverMargin: 1200,
                }}
              >
                {renderableFiles.map((fileDiff) => {
                  const filePath = resolveFileDiffPath(fileDiff);
                  const fileKey = buildFileDiffRenderKey(fileDiff);
                  const themedFileKey = `${fileKey}:${resolvedTheme}`;
                  const collapsed = collapsedDiffFileKeys.has(fileKey);
                  const { additions, deletions } = getFileDiffLineStats(fileDiff);
                  return (
                    <div
                      data-pipper-id="diff-panel-file"
                      key={themedFileKey}
                      data-diff-file-path={filePath}
                      className="diff-render-file group/diff-file mb-2 rounded-md first:mt-2 last:mb-0"
                      onClickCapture={(event) => {
                        const nativeEvent = event.nativeEvent as MouseEvent;
                        const composedPath = nativeEvent.composedPath?.() ?? [];
                        const clickedHeader = composedPath.some((node) => {
                          if (!(node instanceof Element)) return false;
                          return node.hasAttribute("data-title");
                        });
                        if (!clickedHeader) return;
                        openDiffFileInEditor(filePath);
                      }}
                    >
                      <FileDiff
                        fileDiff={fileDiff}
                        renderCustomHeader={() => (
                          <div
                            data-pipper-id="diff-panel-file-header"
                            className="flex min-w-0 items-center gap-2 px-3 py-2"
                          >
                            <button
                              data-pipper-id="diff-panel-file-collapse-toggle"
                              type="button"
                              className="inline-flex size-5 shrink-0 items-center justify-center rounded-sm border-0 bg-transparent p-0 text-muted-foreground/80 transition-colors hover:bg-foreground/10 hover:text-foreground focus-visible:outline-hidden"
                              aria-label={collapsed ? `Expand ${filePath}` : `Minimize ${filePath}`}
                              aria-expanded={!collapsed}
                              title={collapsed ? "Expand file" : "Minimize file"}
                              onClick={(event) => {
                                event.stopPropagation();
                                toggleDiffFileCollapsed(fileKey);
                              }}
                            >
                              {collapsed ? (
                                <ChevronRightIcon className="size-3.5" />
                              ) : (
                                <ChevronDownIcon className="size-3.5" />
                              )}
                            </button>
                            <span
                              data-pipper-id="diff-panel-file-title"
                              className="min-w-0 truncate text-[12px] font-medium text-foreground"
                              data-title
                              title={filePath}
                            >
                              {filePath}
                            </span>
                            <span
                              data-pipper-id="diff-panel-file-stats"
                              className="ml-auto shrink-0 tabular-nums text-[11px]"
                            >
                              <span className="text-[var(--diffs-addition-base)]">
                                +{additions}
                              </span>{" "}
                              <span className="text-[var(--diffs-deletion-base)]">
                                -{deletions}
                              </span>
                            </span>
                          </div>
                        )}
                        options={{
                          collapsed,
                          diffStyle: diffRenderMode === "split" ? "split" : "unified",
                          lineDiffType: "none",
                          hunkSeparators: "simple",
                          overflow: diffWordWrap ? "wrap" : "scroll",
                          theme: resolveDiffThemeName(resolvedTheme),
                          themeType: resolvedTheme as DiffThemeType,
                          unsafeCSS: DIFF_PANEL_UNSAFE_CSS,
                        }}
                      />
                    </div>
                  );
                })}
              </Virtualizer>
            ) : (
              <div
                data-impeccable-variants="8e9cfefe"
                data-impeccable-variant-count="3"
                style={{ display: "contents" }}
              >
                {/* impeccable-variants-start 8e9cfefe */}
                {/* Original */}
                <div data-impeccable-variant="original">
                  <div className="h-full overflow-auto p-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    <div className="space-y-2">
                      <p
                        data-pipper-id="diff-panel-raw-reason"
                        className="text-[11px] text-muted-foreground/75"
                      >
                        {renderablePatch.reason}
                      </p>
                      <pre
                        data-pipper-id="diff-panel-raw-patch"
                        className={cn(
                          "max-h-[72vh] rounded-md border border-border/70 bg-[var(--surface-subtle)] p-3 font-mono text-[11px] leading-relaxed text-muted-foreground/90 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
                          diffWordWrap
                            ? "overflow-auto whitespace-pre-wrap wrap-break-word"
                            : "overflow-auto",
                        )}
                      >
                        {renderablePatch.text}
                      </pre>
                    </div>
                  </div>
                </div>
                {/* Variants: insert below this line */}
                <style data-impeccable-css="8e9cfefe">{`
                  @scope ([data-impeccable-variant="1"]) {
                    :scope > .impeccable-diff-scroll-v1 {
                      --radius-top: var(--p-top-radius, 16px);
                      height: 100%;
                      overflow: auto;
                      padding: 0 10px 10px;
                      scrollbar-width: none;
                      border-top-left-radius: var(--radius-top);
                      border-top-right-radius: var(--radius-top);
                      background: color-mix(in oklch, var(--surface-subtle) 72%, transparent);
                      border: 1px solid color-mix(in oklch, var(--border) 72%, transparent);
                      border-bottom-color: color-mix(in oklch, var(--border) 44%, transparent);
                      clip-path: inset(0 round var(--radius-top) var(--radius-top) 8px 8px);
                    }

                    :scope > .impeccable-diff-scroll-v1::-webkit-scrollbar {
                      display: none;
                    }

                    :scope > .impeccable-diff-scroll-v1 .impeccable-diff-scroll-v1__cap {
                      margin: 0 -10px 8px;
                      padding: 9px 12px 8px;
                      border-bottom: 1px solid color-mix(in oklch, var(--border) 58%, transparent);
                      background: color-mix(in oklch, var(--background) 64%, var(--surface-subtle));
                    }

                    :scope > .impeccable-diff-scroll-v1 .impeccable-diff-scroll-v1__reason {
                      margin: 0;
                      color: color-mix(in oklch, var(--muted-foreground) 86%, var(--foreground));
                      font-size: 11px;
                      line-height: 1.45;
                    }

                    :scope > .impeccable-diff-scroll-v1 .impeccable-diff-scroll-v1__pre {
                      max-height: 72vh;
                      margin: 0;
                      border-radius: 10px;
                      border: 1px solid color-mix(in oklch, var(--border) 70%, transparent);
                      background: color-mix(in oklch, var(--surface-subtle) 88%, var(--background));
                      padding: calc(10px + (var(--p-density, 0.5) * 6px));
                      color: color-mix(in oklch, var(--muted-foreground) 88%, var(--foreground));
                      font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
                      font-size: 11px;
                      line-height: 1.62;
                      scrollbar-width: none;
                    }

                    :scope > .impeccable-diff-scroll-v1 .impeccable-diff-scroll-v1__pre::-webkit-scrollbar {
                      display: none;
                    }
                  }

                  @scope ([data-impeccable-variant="2"]) {
                    :scope > .impeccable-diff-scroll-v2 {
                      --radius-top: var(--p-top-radius, 20px);
                      height: 100%;
                      overflow: auto;
                      padding: 8px;
                      scrollbar-width: none;
                      border-top-left-radius: var(--radius-top);
                      border-top-right-radius: var(--radius-top);
                      background: linear-gradient(
                        to bottom,
                        color-mix(in oklch, var(--foreground) 6%, transparent),
                        color-mix(in oklch, var(--surface-subtle) 76%, transparent) 42px,
                        transparent 100%
                      );
                      border-top: 1px solid color-mix(in oklch, var(--foreground) 13%, transparent);
                      clip-path: inset(0 round var(--radius-top) var(--radius-top) 9px 9px);
                    }

                    :scope > .impeccable-diff-scroll-v2::-webkit-scrollbar {
                      display: none;
                    }

                    :scope > .impeccable-diff-scroll-v2 .impeccable-diff-scroll-v2__reason {
                      margin: 0 2px 7px;
                      color: color-mix(in oklch, var(--muted-foreground) 80%, var(--foreground));
                      font-size: 11px;
                      line-height: 1.4;
                    }

                    :scope > .impeccable-diff-scroll-v2 .impeccable-diff-scroll-v2__pre {
                      max-height: 72vh;
                      margin: 0;
                      border-radius: calc(var(--radius-top) - 6px) calc(var(--radius-top) - 6px) 8px 8px;
                      border: 1px solid color-mix(in oklch, var(--border) 76%, transparent);
                      background: color-mix(in oklch, var(--surface-subtle) 92%, var(--background));
                      padding: calc(11px + (var(--p-padding, 0.45) * 8px));
                      color: color-mix(in oklch, var(--muted-foreground) 90%, var(--foreground));
                      font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
                      font-size: 11px;
                      line-height: 1.62;
                      box-shadow: inset 0 1px 0 color-mix(in oklch, var(--foreground) 5%, transparent);
                      scrollbar-width: none;
                    }

                    :scope > .impeccable-diff-scroll-v2 .impeccable-diff-scroll-v2__pre::-webkit-scrollbar {
                      display: none;
                    }
                  }

                  @scope ([data-impeccable-variant="3"]) {
                    :scope > .impeccable-diff-scroll-v3 {
                      --radius-top: var(--p-top-radius, 14px);
                      height: 100%;
                      overflow: auto;
                      padding: 0 8px 8px;
                      scrollbar-width: none;
                      border-top-left-radius: var(--radius-top);
                      border-top-right-radius: var(--radius-top);
                      clip-path: inset(0 round var(--radius-top) var(--radius-top) 6px 6px);
                    }

                    :scope > .impeccable-diff-scroll-v3::-webkit-scrollbar {
                      display: none;
                    }

                    :scope > .impeccable-diff-scroll-v3 .impeccable-diff-scroll-v3__reason {
                      margin: 0;
                      padding: 8px 10px;
                      border: 1px solid color-mix(in oklch, var(--border) 64%, transparent);
                      border-bottom: 0;
                      border-top-left-radius: var(--radius-top);
                      border-top-right-radius: var(--radius-top);
                      background: color-mix(in oklch, var(--surface-subtle) 84%, transparent);
                      color: color-mix(in oklch, var(--muted-foreground) 78%, var(--foreground));
                      font-size: 11px;
                      line-height: 1.4;
                    }

                    :scope > .impeccable-diff-scroll-v3 .impeccable-diff-scroll-v3__pre {
                      max-height: 72vh;
                      margin: 0;
                      border: 1px solid color-mix(in oklch, var(--border) 64%, transparent);
                      border-radius: 0 0 8px 8px;
                      background: color-mix(in oklch, var(--surface-subtle) 86%, var(--background));
                      padding: calc(10px + (var(--p-density, 0.45) * 7px));
                      color: color-mix(in oklch, var(--muted-foreground) 90%, var(--foreground));
                      font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
                      font-size: 11px;
                      line-height: 1.62;
                      scrollbar-width: none;
                    }

                    :scope > .impeccable-diff-scroll-v3 .impeccable-diff-scroll-v3__pre::-webkit-scrollbar {
                      display: none;
                    }
                  }
                `}</style>
                <div
                  data-impeccable-variant="1"
                  data-impeccable-params='[{"id":"top-radius","kind":"range","min":10,"max":26,"step":1,"default":16,"label":"Top radius"},{"id":"density","kind":"range","min":0,"max":1,"step":0.05,"default":0.5,"label":"Padding"}]'
                >
                  <div className="impeccable-diff-scroll-v1">
                    <div className="impeccable-diff-scroll-v1__cap">
                      <p className="impeccable-diff-scroll-v1__reason">{renderablePatch.reason}</p>
                    </div>
                    <pre
                      className={cn(
                        "impeccable-diff-scroll-v1__pre",
                        diffWordWrap
                          ? "overflow-auto whitespace-pre-wrap wrap-break-word"
                          : "overflow-auto",
                      )}
                    >
                      {renderablePatch.text}
                    </pre>
                  </div>
                </div>
                <div
                  data-impeccable-variant="2"
                  data-impeccable-params='[{"id":"top-radius","kind":"range","min":12,"max":30,"step":1,"default":20,"label":"Top radius"},{"id":"padding","kind":"range","min":0,"max":1,"step":0.05,"default":0.45,"label":"Inset"}]'
                  style={{ display: "none" }}
                >
                  <div className="impeccable-diff-scroll-v2">
                    <p className="impeccable-diff-scroll-v2__reason">{renderablePatch.reason}</p>
                    <pre
                      className={cn(
                        "impeccable-diff-scroll-v2__pre",
                        diffWordWrap
                          ? "overflow-auto whitespace-pre-wrap wrap-break-word"
                          : "overflow-auto",
                      )}
                    >
                      {renderablePatch.text}
                    </pre>
                  </div>
                </div>
                <div
                  data-impeccable-variant="3"
                  data-impeccable-params='[{"id":"top-radius","kind":"range","min":8,"max":24,"step":1,"default":14,"label":"Top radius"},{"id":"density","kind":"range","min":0,"max":1,"step":0.05,"default":0.45,"label":"Padding"}]'
                  style={{ display: "none" }}
                >
                  <div className="impeccable-diff-scroll-v3">
                    <p className="impeccable-diff-scroll-v3__reason">{renderablePatch.reason}</p>
                    <pre
                      className={cn(
                        "impeccable-diff-scroll-v3__pre",
                        diffWordWrap
                          ? "overflow-auto whitespace-pre-wrap wrap-break-word"
                          : "overflow-auto",
                      )}
                    >
                      {renderablePatch.text}
                    </pre>
                  </div>
                </div>
                {/* impeccable-variants-end 8e9cfefe */}
              </div>
            )}
          </div>
        </div>
      )}
    </DiffPanelShell>
  );
}
