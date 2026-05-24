import {
  type ScopedProjectRef,
  type ScopedThreadRef,
  type ResolvedKeybindingsConfig,
} from "@t3tools/contracts";
import { createProjectSelectorByRef } from "../storeSelectors";
import { projectScriptCwd, projectScriptRuntimeEnv } from "@t3tools/shared/projectScripts";
import { memo, useCallback, useMemo, useState } from "react";
import { useStore } from "../store";
import { useTerminalStateStore, selectThreadTerminalState } from "../terminalStateStore";
import { readEnvironmentApi } from "../environmentApi";
import ThreadTerminalDrawer from "./ThreadTerminalDrawer";
import { randomUUID } from "~/lib/utils";
import { type TerminalContextSelection } from "../lib/terminalContext";

export interface TerminalWorkspaceProps {
  workspaceRef: ScopedThreadRef;
  projectRef: ScopedProjectRef | null;
  visible: boolean;
  launchContext: { cwd: string; worktreePath: string | null } | null;
  focusRequestId: number;
  splitShortcutLabel?: string | undefined;
  newShortcutLabel?: string | undefined;
  closeShortcutLabel?: string | undefined;
  keybindings: ResolvedKeybindingsConfig;
  onAddTerminalContext: (selection: TerminalContextSelection) => void;
}

export const TerminalWorkspace = memo(function TerminalWorkspace({
  workspaceRef,
  projectRef,
  visible,
  launchContext,
  focusRequestId,
  splitShortcutLabel,
  newShortcutLabel,
  closeShortcutLabel,
  keybindings,
  onAddTerminalContext,
}: TerminalWorkspaceProps) {
  const project = useStore(useMemo(() => createProjectSelectorByRef(projectRef), [projectRef]));
  const terminalState = useTerminalStateStore((state) =>
    selectThreadTerminalState(state.terminalStateByThreadKey, workspaceRef),
  );
  const storeSetTerminalHeight = useTerminalStateStore((state) => state.setTerminalHeight);
  const storeSplitTerminal = useTerminalStateStore((state) => state.splitTerminal);
  const storeNewTerminal = useTerminalStateStore((state) => state.newTerminal);
  const storeSetActiveTerminal = useTerminalStateStore((state) => state.setActiveTerminal);
  const storeCloseTerminal = useTerminalStateStore((state) => state.closeTerminal);
  const [localFocusRequestId, setLocalFocusRequestId] = useState(0);

  const effectiveWorktreePath = useMemo(() => {
    if (launchContext !== null) {
      return launchContext.worktreePath;
    }
    return null;
  }, [launchContext]);
  const cwd = useMemo(
    () =>
      launchContext?.cwd ??
      (project
        ? projectScriptCwd({
            project: { cwd: project.cwd },
            worktreePath: effectiveWorktreePath,
          })
        : null),
    [effectiveWorktreePath, launchContext?.cwd, project],
  );
  const runtimeEnv = useMemo(
    () =>
      project
        ? projectScriptRuntimeEnv({
            project: { cwd: project.cwd },
            worktreePath: effectiveWorktreePath,
          })
        : {},
    [effectiveWorktreePath, project],
  );

  const bumpFocusRequestId = useCallback(() => {
    if (!visible) {
      return;
    }
    setLocalFocusRequestId((value) => value + 1);
  }, [visible]);

  const setTerminalHeight = useCallback(
    (height: number) => {
      storeSetTerminalHeight(workspaceRef, height);
    },
    [storeSetTerminalHeight, workspaceRef],
  );

  const splitTerminal = useCallback(() => {
    storeSplitTerminal(workspaceRef, `terminal-${randomUUID()}`);
    bumpFocusRequestId();
  }, [bumpFocusRequestId, storeSplitTerminal, workspaceRef]);

  const createNewTerminal = useCallback(() => {
    storeNewTerminal(workspaceRef, `terminal-${randomUUID()}`);
    bumpFocusRequestId();
  }, [bumpFocusRequestId, storeNewTerminal, workspaceRef]);

  const activateTerminal = useCallback(
    (terminalId: string) => {
      storeSetActiveTerminal(workspaceRef, terminalId);
      bumpFocusRequestId();
    },
    [bumpFocusRequestId, storeSetActiveTerminal, workspaceRef],
  );

  const closeTerminal = useCallback(
    (terminalId: string) => {
      const api = readEnvironmentApi(workspaceRef.environmentId);
      if (!api) return;
      const isFinalTerminal = terminalState.terminalIds.length <= 1;
      const fallbackExitWrite = () =>
        api.terminal
          .write({ threadId: workspaceRef.threadId, terminalId, data: "exit\n" })
          .catch(() => undefined);

      if ("close" in api.terminal && typeof api.terminal.close === "function") {
        void (async () => {
          if (isFinalTerminal) {
            await api.terminal
              .clear({ threadId: workspaceRef.threadId, terminalId })
              .catch(() => undefined);
          }
          await api.terminal.close({
            threadId: workspaceRef.threadId,
            terminalId,
            deleteHistory: true,
          });
        })().catch(() => fallbackExitWrite());
      } else {
        void fallbackExitWrite();
      }

      storeCloseTerminal(workspaceRef, terminalId);
      bumpFocusRequestId();
    },
    [bumpFocusRequestId, storeCloseTerminal, terminalState.terminalIds.length, workspaceRef],
  );

  const handleAddTerminalContext = useCallback(
    (selection: TerminalContextSelection) => {
      if (!visible) {
        return;
      }
      onAddTerminalContext(selection);
    },
    [onAddTerminalContext, visible],
  );

  if (!project || !terminalState.terminalOpen || !cwd) {
    return null;
  }

  return (
    <div className={visible ? "flex min-h-0 w-full flex-1 flex-col" : "hidden"}>
      <ThreadTerminalDrawer
        threadRef={workspaceRef}
        threadId={workspaceRef.threadId}
        cwd={cwd}
        worktreePath={effectiveWorktreePath}
        runtimeEnv={runtimeEnv}
        visible={visible}
        height={terminalState.terminalHeight}
        terminalIds={terminalState.terminalIds}
        terminalLabelsById={terminalState.terminalLabelsById}
        activeTerminalId={terminalState.activeTerminalId}
        terminalGroups={terminalState.terminalGroups}
        activeTerminalGroupId={terminalState.activeTerminalGroupId}
        focusRequestId={focusRequestId + localFocusRequestId + (visible ? 1 : 0)}
        onSplitTerminal={splitTerminal}
        onNewTerminal={createNewTerminal}
        splitShortcutLabel={visible ? splitShortcutLabel : undefined}
        newShortcutLabel={visible ? newShortcutLabel : undefined}
        closeShortcutLabel={visible ? closeShortcutLabel : undefined}
        keybindings={keybindings}
        onActiveTerminalChange={activateTerminal}
        onCloseTerminal={closeTerminal}
        onHeightChange={setTerminalHeight}
        onAddTerminalContext={handleAddTerminalContext}
        layout="panel"
      />
    </div>
  );
});
